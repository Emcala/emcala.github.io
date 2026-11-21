// ═══════════════════════════════════════════════════════════════
// Módulo Supabase — persistencia de los datos anuales de ventas
// Lee y escribe en la tabla public.analisis_anual_ventas.
// Usa el access_token de la sesión (EmcalaAuth) para autorizar
// contra las políticas RLS. No depende del estado interno de
// supabase-js; hace las peticiones con fetch a PostgREST.
// ═══════════════════════════════════════════════════════════════

'use strict';

const SUPABASE_URL = 'https://tdwdqgtnyqnsigzhhxsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2RxZ3RueXFuc2lnemhoeHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwOTE3NDcsImV4cCI6MjA5ODY2Nzc0N30.aiYnQ3g1HIk1e4G89sODitBqtPlzva_akCz5ruvLw-8';

const TABLE_VENTAS = 'analisis_anual_ventas';
const TABLE_META = 'analisis_anual_meta';

// ── Obtener access_token vigente ──────────────────────────────
// 1) EmcalaAuth.getAccessToken() (usa supabase-js que ya renueva JWT)
// 2) Fallback: accessToken guardado en la sesión legacy
async function getToken() {
  try {
    if ((typeof EmcalaAuth !== 'undefined') && typeof EmcalaAuth.getAccessToken === 'function') {
      const t = await EmcalaAuth.getAccessToken();
      if (t) return t;
    }
    if ((typeof EmcalaAuth !== 'undefined') && EmcalaAuth.getSession) {
      const s = EmcalaAuth.getSession();
      if (s && s.accessToken) return s.accessToken;
    }
    // Último recurso: leer la sesión de supabase-js persistida en localStorage
    if (window.supabase && window.localStorage) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      for (const k of keys) {
        try {
          const obj = JSON.parse(localStorage.getItem(k));
          const token = obj && obj.access_token;
          if (token) return token;
        } catch (e) { }
      }
    }
  } catch (e) { }
  return '';
}

// ── Petición genérica a PostgREST ─────────────────────────────
async function sbFetch(path, opts) {
  opts = opts || {};
  const token = await getToken();
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY),
    'Content-Type': 'application/json'
  };
  if (opts.prefer) headers['Prefer'] = opts.prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });

  if (!res.ok) {
    let msg = '';
    try { msg = (await res.text()).slice(0, 300); } catch (e) { }
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.indexOf('json') >= 0) return res.json();
  return res.text();
}

// ── Mapeo columna DB → campo interno (parseCSV usa camelCase) ─
function rowToCSV(r) {
  const f = r.fecha || '';
  const yNum = Number(r.yr) || (f.length >= 4 ? parseInt(f.slice(0, 4), 10) : null);
  const mStr = r.mes || (f.length >= 7 && typeof MESES !== 'undefined' ? MESES[parseInt(f.slice(5, 7), 10) - 1] || null : null);
  return {
    cod_s: r.codS ?? '', cod_s2: r.codS2 ?? '',
    un: r.un ?? '',
    hl: Number(r.hl) || 0, bul: Number(r.bul) || 0,
    cli: r.cli ?? '', prod: r.prod ?? '', dias: r.dias ?? '', canal: r.canal ?? '',
    calibre: r.calibre ?? '', prod2: r.prod2 ?? '', marca: r.marca ?? '',
    fecha: r.fecha || null,
    yr: yNum,
    mes: mStr
  };
}

// Nombres desde las tablas de búsqueda (código → nombre). Se traen una vez por carga.
async function cargarNombres() {
  const tomarTodo = async (path) => {
    let out = [];
    for (let off = 0; ; off += 1000) {
      const pag = await sbGetConReintentos(`${path}&limit=1000&offset=${off}`);
      out = out.concat(pag);
      if (pag.length < 1000) break;
    }
    return out;
  };
  const [sup, vend, cli] = await Promise.all([
    tomarTodo('supervisores_ventas?select=cod_s,nombre&order=cod_s'),
    tomarTodo('vendedores_ventas?select=cod_s2,nombre&order=cod_s2'),
    tomarTodo('clientes_ventas?select=cli,nombre&order=cli')
  ]);
  const mapa = (arr, k) => { const m = {}; arr.forEach(x => { m[x[k]] = x.nombre; }); return m; };
  return { sup: mapa(sup, 'cod_s'), vend: mapa(vend, 'cod_s2'), cli: mapa(cli, 'cli') };
}

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function dbRowToCSV(r, nombres) {
  const n = nombres || { sup: {}, vend: {}, cli: {} };
  const f = r.fecha ? String(r.fecha) : '';
  // yr/mes son columnas propias; la fecha queda sólo como respaldo para filas viejas
  const yrD = r.yr ? String(r.yr) : f.slice(0, 4);
  const mesD = r.mes || (f.length >= 7 ? MESES_ES[parseInt(f.slice(5, 7), 10) - 1] || '' : '');
  return {
    sdv: n.sup[r.cod_s] || '', codS: r.cod_s, sdv2: n.vend[r.cod_s2] || '', codS2: r.cod_s2,
    un: r.un, yr: yrD, mes: mesD,
    hl: Number(r.hl) || 0, bul: Number(r.bul) || 0,
    cli: r.cli, prod: r.prod, dias: r.dias, canal: r.canal,
    calibre: r.calibre, prod2: r.prod2, marca: r.marca,
    cliN: n.cli[r.cli] || '', fecha: r.fecha || ''
  };
}

// ── Lectura por rangos de id + keyset ─────────────────────────
// La tabla tiene más de 1 millón de filas: OFFSET es lento y supera el timeout
// de Supabase, así que se pagina por id (usa el índice de la clave primaria).
const LECTURA_COLS = 'id,cod_s,cod_s2,un,hl,cli,prod,dias,canal,calibre,prod2,marca,fecha,yr,mes';
const LECTURA_LOTE = 10000;     // filas pedidas por página (acompañar con Max Rows = 10000 en Supabase)
const LECTURA_PARALELO = 6;     // sub-rangos leídos a la vez
const LECTURA_SUBRANGOS = 12;   // en cuántas partes contiguas se divide el rango de ids

async function sbGetConReintentos(path, intentos) {
  intentos = intentos || 3;
  let ultimoError;
  for (let n = 1; n <= intentos; n++) {
    try {
      const token = await getToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY)
        }
      });
      if (!res.ok) {
        let msg = '';
        try { msg = (await res.text()).slice(0, 200); } catch (e) { }
        throw new Error(`Supabase ${res.status}: ${msg}`);
      }
      return await res.json();
    } catch (e) {
      ultimoError = e;
      if (n < intentos) await new Promise(r => setTimeout(r, 400 * n));
    }
  }
  throw ultimoError;
}

// ── Pantalla de carga con barra de progreso (lectura y escritura) ──
function mostrarCarga(titulo, detalle, pct, nota) {
  let ov = document.getElementById('load-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'load-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(11,37,89,.78);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:inherit;';
    ov.innerHTML =
      '<div style="width:min(460px,90vw);background:rgba(15,23,42,.96);border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:26px 28px;color:#fff;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5);">' +
      '<div id="load-ov-title" style="font-size:20px;font-weight:800;margin-bottom:6px;"></div>' +
      '<div id="load-ov-detail" style="font-size:13px;opacity:.75;margin-bottom:16px;"></div>' +
      '<div style="height:12px;background:rgba(255,255,255,.15);border-radius:8px;overflow:hidden;"><div id="load-ov-bar" style="height:100%;width:0%;background:#4ade80;border-radius:8px;transition:width .3s;"></div></div>' +
      '<div id="load-ov-pct" style="font-size:22px;font-weight:800;margin-top:12px;"></div>' +
      '<div id="load-ov-note" style="font-size:12px;opacity:.7;margin-top:10px;"></div>' +
      '</div>';
    document.body.appendChild(ov);
  }
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  document.getElementById('load-ov-title').textContent = titulo || '';
  document.getElementById('load-ov-detail').textContent = detalle || '';
  document.getElementById('load-ov-bar').style.width = p + '%';
  document.getElementById('load-ov-pct').textContent = p + '%';
  document.getElementById('load-ov-note').textContent = nota || '';
}
function ocultarCarga() {
  const ov = document.getElementById('load-overlay');
  if (ov) ov.remove();
}

// Lectura: reserva 0-5% para conectar y nombres, 5-100% para los sub-rangos
function mostrarProgresoLectura(pct) {
  mostrarCarga('Cargando datos', 'Descargando ventas desde Supabase…', 5 + pct * 0.95);
}

// ── Lectura: trae los datos de los años guardados y reconstruye DATA ──
// Sólo lee los años que figuran en analisis_anual_meta (si la meta está vacía,
// lee todo). Cada sub-rango de ids se recorre con keyset (id > último recibido),
// así funciona aunque Supabase limite cada respuesta; sólo cambia la cantidad de pedidos.
async function leerSubrango(rango, filtroYr) {
  const filas = [];
  let cursor = rango.lo - 1;
  while (true) {
    const lote = await sbGetConReintentos(
      `${TABLE_VENTAS}?select=${LECTURA_COLS}&id=gt.${cursor}&id=lte.${rango.hi}${filtroYr}&order=id.asc&limit=${LECTURA_LOTE}`
    );
    if (!Array.isArray(lote) || !lote.length) break;
    for (const r of lote) filas.push(r);
    cursor = Number(lote[lote.length - 1].id);
    if (cursor >= rango.hi) break;
  }
  return filas;
}

// ── Caché local persistente (IndexedDB) ───────────────────────
// Evita descargar cientos de megabytes de ventas en cada F5 (ahorro crítico de Egress).
const IDB_NAME = 'emcala_analisis_anual_db';
const IDB_VERSION = 1;
const IDB_STORE = 'ventas_cache';

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB no soportado'));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'yr' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbObtenerAnio(yr) {
  try {
    const db = await abrirDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(String(yr));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function idbGuardarAnio(yr, actualizado_en, rows) {
  try {
    const db = await abrirDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ yr: String(yr), actualizado_en: actualizado_en || '', rows: rows });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function idbLimpiarAnio(yr) {
  try {
    const db = await abrirDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(String(yr));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function idbLimpiarNoListados(aniosActivos) {
  try {
    const db = await abrirDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = req.result || [];
        keys.forEach(k => {
          if (!aniosActivos.has(String(k))) store.delete(k);
        });
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function loadDatosDesdeSupabase(forzarSinCache) {
  try {
    const token = await getToken();
    if (!token) return { ok: false, error: 'No hay sesión activa (sin token)' };

    // 1) Leer metadatos: < 1 KB de transferencia.
    const meta = await sbGetConReintentos(`${TABLE_META}?select=yr,actualizado_en`);
    const aniosMeta = (Array.isArray(meta) ? meta : []).filter(m => /^\d{4}$/.test(String(m.yr)));
    if (!aniosMeta.length) {
      await idbLimpiarNoListados(new Set());
      return { ok: true, rows: 0, empty: true };
    }

    const setAniosMeta = new Set(aniosMeta.map(m => String(m.yr)));
    await idbLimpiarNoListados(setAniosMeta);

    // 2) Revisar qué años ya tenemos válidos en la caché IndexedDB
    const filasPorAnio = {};
    const aniosFaltantes = [];

    for (const m of aniosMeta) {
      const yStr = String(m.yr);
      if (!forzarSinCache) {
        const cached = await idbObtenerAnio(yStr);
        if (cached && cached.actualizado_en === m.actualizado_en && Array.isArray(cached.rows) && cached.rows.length > 0) {
          filasPorAnio[yStr] = cached.rows;
          continue;
        }
      }
      aniosFaltantes.push(yStr);
    }

    // 3) Si todo estaba en caché local: 0 MB de Egress consumidos.
    if (aniosFaltantes.length === 0) {
      mostrarCarga('Cargando datos', 'Recuperando ventas desde almacenamiento local…', 100);
      const rows = [];
      aniosMeta.forEach(m => {
        const arr = filasPorAnio[String(m.yr)] || [];
        for (let i = 0; i < arr.length; i++) rows.push(arr[i]);
      });
      const years = new Set(rows.map(r => r.yr));
      DATA = DATA.filter(r => !years.has(r.yr)).concat(rows);
      console.log(`[Análisis Anual] ${rows.length} filas cargadas desde IndexedDB (0 KB de egress de ventas).`);
      return { ok: true, rows: rows.length, desdeCache: true };
    }

    // 4) Si hay años nuevos o desactualizados, se descargan solo esos años
    const filtroYr = `&yr=in.(${aniosFaltantes.join(',')})`;
    const primero = await sbGetConReintentos(`${TABLE_VENTAS}?select=id&order=id.asc&limit=1${filtroYr}`);
    if (!Array.isArray(primero) || !primero.length) {
      // No hay filas nuevas para los años faltantes
      const rows = [];
      Object.keys(filasPorAnio).forEach(y => rows.push(...filasPorAnio[y]));
      const years = new Set(rows.map(r => r.yr));
      DATA = DATA.filter(r => !years.has(r.yr)).concat(rows);
      return { ok: true, rows: rows.length };
    }

    const ultimo = await sbGetConReintentos(`${TABLE_VENTAS}?select=id&order=id.desc&limit=1${filtroYr}`);
    const minId = Number(primero[0].id);
    const maxId = Number(ultimo[0].id);

    const paso = Math.ceil((maxId - minId + 1) / LECTURA_SUBRANGOS);
    const rangos = [];
    for (let lo = minId; lo <= maxId; lo += paso) {
      rangos.push({ lo: lo, hi: Math.min(lo + paso - 1, maxId) });
    }

    const nombres = await cargarNombres();
    mostrarProgresoLectura(0);
    const resultados = new Array(rangos.length);
    let siguiente = 0, hechos = 0;
    const worker = async () => {
      while (true) {
        const i = siguiente++;
        if (i >= rangos.length) return;
        const filas = await leerSubrango(rangos[i], filtroYr);
        resultados[i] = filas.map(r => dbRowToCSV(r, nombres));
        hechos++;
        mostrarProgresoLectura(Math.round(hechos / rangos.length * 100));
      }
    };
    await Promise.all(Array.from({ length: Math.min(LECTURA_PARALELO, rangos.length) }, worker));

    const rowsNuevas = [];
    for (const r of resultados) for (let k = 0; k < r.length; k++) rowsNuevas.push(r[k]);

    // Guardar en IndexedDB los años recién descargados
    for (const yStr of aniosFaltantes) {
      const filasDeEsteAnio = rowsNuevas.filter(r => String(r.yr) === yStr);
      const metaAnio = aniosMeta.find(m => String(m.yr) === yStr);
      await idbGuardarAnio(yStr, metaAnio ? metaAnio.actualizado_en : '', filasDeEsteAnio);
      filasPorAnio[yStr] = filasDeEsteAnio;
    }

    const rowsTotales = [];
    aniosMeta.forEach(m => {
      const arr = filasPorAnio[String(m.yr)] || [];
      for (let i = 0; i < arr.length; i++) rowsTotales.push(arr[i]);
    });

    const years = new Set(rowsTotales.map(r => r.yr));
    DATA = DATA.filter(r => !years.has(r.yr)).concat(rowsTotales);
    return { ok: true, rows: rowsTotales.length, desdeCache: false };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Función global disponible en consola para forzar re-descarga completa
window.forzarRecargaSupabase = async function () {
  mostrarCarga('Cargando datos', 'Descargando todo desde Supabase (sin caché local)…', 2);
  try {
    const res = await loadDatosDesdeSupabase(true);
    if (res.ok && res.rows > 0) {
      if (typeof renderAll === 'function') renderAll();
      if (typeof refreshLastUpdate === 'function') await refreshLastUpdate();
    }
    return res;
  } finally {
    ocultarCarga();
  }
};

// ── Metadatos: "última actualización" por año ─────────────────
async function loadMetaSupabase() {
  try {
    const token = await getToken();
    if (!token) return {};
    const data = await sbFetch(`${TABLE_META}?select=*`);
    if (!Array.isArray(data)) return {};
    const out = {};
    data.forEach(m => { out[m.yr] = m; });
    return out;
  } catch (e) { return {}; }
}

// ── Nombres: actualiza las tablas de búsqueda (código → nombre) ──
// Las filas de ventas guardan solo códigos; los nombres viven en estas tablas.
// Sin esto, un cliente/vendedor/supervisor nuevo aparecería sin nombre.
async function upsertarNombres(rows) {
  const unicos = (kCod, kNom) => {
    const m = new Map();
    rows.forEach(r => {
      const c = String(r[kCod] ?? '').trim();
      const n = String(r[kNom] ?? '').trim();
      if (c && n && !m.has(c)) m.set(c, n);
    });
    return Array.from(m, ([c, n]) => ({ c, n }));
  };
  const sets = [
    ['supervisores_ventas', 'cod_s', unicos('codS', 'sdv')],
    ['vendedores_ventas', 'cod_s2', unicos('codS2', 'sdv2')],
    ['clientes_ventas', 'cli', unicos('cli', 'cliN')]
  ];
  for (const [tabla, col, items] of sets) {
    const payload = items.map(x => ({ [col]: x.c, nombre: x.n }));
    for (let i = 0; i < payload.length; i += 1000) {
      await sbFetch(`${tabla}?on_conflict=${col}`, {
        method: 'POST',
        body: payload.slice(i, i + 1000),
        prefer: 'resolution=merge-duplicates,return=minimal'
      });
    }
  }
}

const BORRADO_RANGO = 25000;
const INSERT_LOTE = 1500;      // filas por POST (con 5000 se pasaba del statement_timeout)
const INSERT_PARALELO = 2;     // POST en paralelo (antes 4: competían entre sí por el timeout)
const BORRADO_RPC_LOTE = 50000;
let _rpcBorradoOk = null; // null = sin probar, true = RPC disponible, false = usar respaldo por bloques

function esTimeout(e) {
  const m = String((e && e.message) || '');
  return m.indexOf('57014') >= 0 || /statement timeout/i.test(m);
}

function rpcNoExiste(e) {
  const m = String((e && e.message) || '');
  return (!!e && e.status === 404) || m.indexOf('PGRST202') >= 0 || /Could not find the function/i.test(m);
}

// ── Inserción de un lote con reintentos ───────────────────────
// Un INSERT cancelado por statement_timeout (57014) hace rollback completo de su
// transacción: no deja filas a medias, así que reintentarlo (o partirlo) no duplica.
async function insertarLoteConReintentos(lote, profundidad, onInsertado) {
  profundidad = profundidad || 0;
  for (let intento = 0; intento < 3; intento++) {
    try {
      await sbFetch(TABLE_VENTAS, { method: 'POST', body: lote, prefer: 'return=minimal' });
      if (onInsertado) onInsertado(lote.length);
      return;
    } catch (e) {
      if (!esTimeout(e)) throw e;
      if (lote.length > 250 && profundidad < 3) {
        const mid = lote.length >> 1;
        await insertarLoteConReintentos(lote.slice(0, mid), profundidad + 1, onInsertado);
        await insertarLoteConReintentos(lote.slice(mid), profundidad + 1, onInsertado);
        return;
      }
      if (intento < 2) await new Promise(r => setTimeout(r, 1500 * (intento + 1)));
    }
  }
  throw new Error('Supabase 500: statement timeout repetido al insertar');
}

// ── Llamada a una función RPC de Postgres (POST /rest/v1/rpc/<fn>) ──
async function sbRpc(fn, args) {
  const token = await getToken();
  if (!token) throw new Error('No hay sesión activa (sin token). Volvé a iniciar sesión.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args || {})
  });
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.text()).slice(0, 300); } catch (e) { }
    const err = new Error(`Supabase ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.indexOf('json') >= 0) return res.json();
  return res.text();
}

async function limpiarMetaSeguro(yr) {
  try {
    await sbFetch(`${TABLE_META}?yr=eq.${yr}`, { method: 'DELETE', prefer: 'return=minimal' });
    await idbLimpiarAnio(yr);
  } catch (e) { console.warn('No se pudo limpiar la fecha de actualización de ' + yr, e); }
}

// ── Borrado con RPC (analisis_anual_borrar_bloque, requiere supabase_setup_v3.sql) ──
// Cada llamada borra hasta BORRADO_RPC_LOTE filas del año. Se repite hasta que
// la función devuelve 0: ese cero es la verificación (no hace falta un SELECT extra).
async function borrarAnioConRpc(yr, onProgress) {
  let borradas = 0;
  while (true) {
    let n = 0;
    let intentos = 0;
    while (true) {
      try {
        n = Number(await sbRpc('analisis_anual_borrar_bloque', { p_yr: Number(yr), p_limite: BORRADO_RPC_LOTE }));
        break;
      } catch (e) {
        intentos++;
        if (!esTimeout(e) || intentos >= 3) { e.borrado = borradas > 0; throw e; }
        await new Promise(r => setTimeout(r, 1000 * intentos));
      }
    }
    if (!n) break;
    borradas += n;
    if (onProgress) onProgress({ yr, done: borradas, total: 0, fase: 'borrando' });
  }
  return { borradas, verificado: true, modo: 'rpc' };
}

// ── Borrado de respaldo: bloques de id (usa la clave primaria) ──
async function borrarAnioPorBloques(yr, onProgress) {
  // Máximo id global una sola vez (índice de la PK, rápido).
  const ultimoGlobal = await sbFetch(`${TABLE_VENTAS}?select=id&order=id.desc&limit=1`);
  if (!Array.isArray(ultimoGlobal) || !ultimoGlobal.length) return { borradas: 0, verificado: true, modo: 'bloques' };
  const maxIdGlobal = Number(ultimoGlobal[0].id);

  const bloques = [];
  for (let lo = 1; lo <= maxIdGlobal; lo += BORRADO_RANGO) bloques.push(lo);

  for (let i = 0; i < bloques.length; i++) {
    const lo = bloques[i];
    try {
      await sbFetch(`${TABLE_VENTAS}?yr=eq.${yr}&id=gte.${lo}&id=lt.${lo + BORRADO_RANGO}`, {
        method: 'DELETE',
        prefer: 'return=minimal'
      });
    } catch (e) {
      e.borrado = i > 0; // Si es el primer bloque, todavía no se borró nada
      throw e;
    }
    if (onProgress) onProgress({ yr, done: 0, total: 0, fase: 'borrando', rango: i + 1, rangos: bloques.length });
  }

  // Verificación: si el servidor corta por tiempo, no se frena la carga; se informa.
  let quedan;
  try {
    quedan = await sbFetch(`${TABLE_VENTAS}?select=id&yr=eq.${yr}&limit=1`);
  } catch (e) {
    if (esTimeout(e)) return { borradas: null, verificado: false, modo: 'bloques' };
    throw e;
  }
  if (Array.isArray(quedan) && quedan.length) {
    const e = new Error('El servidor no confirmó el borrado de ' + yr + ' (revisá que tu usuario tenga rol auditor activo).');
    e.borrado = true;
    throw e;
  }
  return { borradas: null, verificado: true, modo: 'bloques' };
}

// Usa el RPC si existe; si todavía no se ejecutó supabase_setup_v3.sql, usa el respaldo.
async function borrarAnioEnSupabase(yr, onProgress) {
  if (_rpcBorradoOk !== false) {
    try {
      const r = await borrarAnioConRpc(yr, onProgress);
      _rpcBorradoOk = true;
      return r;
    } catch (e) {
      if (e.borrado || !rpcNoExiste(e)) throw e;
      _rpcBorradoOk = false;
      console.warn('La función analisis_anual_borrar_bloque no existe; se usa borrado por bloques. Ejecutá supabase_setup_v3.sql.');
    }
  }
  return borrarAnioPorBloques(yr, onProgress);
}

// ── Escritura: reemplaza un año completo ──────────────────────
// Orden:
//   1) Valida año y filas ANTES de tocar nada.
//   2) Quita la carga anterior del año (RPC o respaldo).
//   3) Inserta la carga nueva en lotes chicos, con reintento y partición ante timeout.
//   4) Actualiza nombres y metadato.
// Devuelve { ok, inserted?, borradas?, warning?, error?, estado? }
// estado: 'sin_cambios' (año intacto) | 'anio_vacio' (se quitó y no se subió nada)
//         | 'incompleto' (se quitó y la subida quedó a medias)
async function guardarAnioEnSupabase(yr, rows, onProgress) {
  let despuesDeBorrar = false;
  try {
    const token = await getToken();
    if (!token) return { ok: false, estado: 'sin_cambios', error: 'No hay sesión activa (sin token). Volvé a iniciar sesión.' };

    // Validación previa: si algo no cierra, no se borra nada.
    const yrNum = Number(yr);
    if (!Number.isInteger(yrNum) || yrNum < 2000 || yrNum > 2100) {
      return { ok: false, estado: 'sin_cambios', error: 'Año inválido: "' + yr + '". El CSV debe tener la columna Año.' };
    }
    if (!rows || !rows.length) {
      return { ok: false, estado: 'sin_cambios', error: 'No hay filas para guardar el año ' + yr };
    }
    if (rows.some(r => String(r.yr) !== String(yr))) {
      return { ok: false, estado: 'sin_cambios', error: 'Hay filas de otro año mezcladas en la carga de ' + yr + '. No se guardó nada.' };
    }

    // 1) Quitar la carga anterior del mismo año
    let borrado;
    try {
      borrado = await borrarAnioEnSupabase(yr, onProgress);
    } catch (eB) {
      if (eB.borrado) {
        await limpiarMetaSeguro(yr);
        return {
          ok: false, estado: 'incompleto',
          error: eB.message + ' Pudo quedar parte de la carga anterior de ' + yr + ' borrada: el año quedó INCOMPLETO, volvé a subir el archivo de ' + yr + '.'
        };
      }
      return {
        ok: false, estado: 'sin_cambios',
        error: eB.message + ' No se borró nada: la carga anterior de ' + yr + ' sigue intacta. Podés volver a intentarlo.'
      };
    }
    despuesDeBorrar = true; // desde acá, si algo falla el año queda sin datos

    // 2) Insertar la carga nueva en lotes, en paralelo
    const payload = rows.map(rowToCSV);
    const lotes = [];
    for (let i = 0; i < payload.length; i += INSERT_LOTE) lotes.push(payload.slice(i, i + INSERT_LOTE));
    let inserted = 0;
    let siguiente = 0;
    let fallo = null;
    if (onProgress) onProgress({ yr, done: 0, total: payload.length, fase: 'insertando' });
    const worker = async () => {
      while (!fallo) {
        const i = siguiente++;
        if (i >= lotes.length) return;
        try {
          await insertarLoteConReintentos(lotes[i], 0, n => {
            inserted += n;
            if (onProgress) onProgress({ yr, done: inserted, total: payload.length, fase: 'insertando' });
          });
        } catch (e) {
          fallo = fallo || e;
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(INSERT_PARALELO, lotes.length) }, worker));
    if (fallo) {
      const estado = inserted > 0 ? 'incompleto' : 'anio_vacio';
      await limpiarMetaSeguro(yr);
      const situacion = estado === 'anio_vacio' ? 'quedó SIN datos en Supabase' : 'quedó INCOMPLETO en Supabase';
      return {
        ok: false, estado,
        error: 'Se quitó la carga anterior de ' + yr + ' y la subida se cortó (' + fallo.message + '): ' + yr + ' ' + situacion + '. Volvé a subir el archivo de ' + yr + '.'
      };
    }

    const warnings = [];
    if (borrado.verificado === false) {
      warnings.push('No se pudo confirmar que la carga anterior de ' + yr + ' se borró por completo (tiempo de espera del servidor). Si ves filas duplicadas, ejecutá supabase_setup_v3.sql y volvé a subir el archivo.');
    }

    // 3) Nombres nuevos en las tablas de búsqueda (si falla, no se pierde la carga)
    try { await upsertarNombres(rows); }
    catch (eN) {
      const w = 'No se pudieron actualizar los nombres (clientes/vendedores/supervisores nuevos quedarán sin nombre): ' + eN.message;
      console.warn(w);
      warnings.push(w);
    }

    // 4) Metadato de "última actualización" (si falla, los datos igual quedaron guardados)
    const nombre = ((typeof EmcalaAuth !== 'undefined') && EmcalaAuth.getSession)
      ? (EmcalaAuth.getSession().nombre || EmcalaAuth.getSession().usuario || '')
      : '';
    const fechaISO = new Date().toISOString();
    try {
      await sbFetch(TABLE_META, {
        method: 'POST',
        body: { yr: String(yr), actualizado_en: fechaISO, filas: inserted, actualizado_por: nombre },
        prefer: 'resolution=merge-duplicates,return=minimal'
      });
      // Guardar de inmediato en el IndexedDB local del auditor que subió el archivo
      await idbGuardarAnio(String(yr), fechaISO, rows);
    } catch (eM) {
      warnings.push('Los datos se guardaron, pero no se pudo registrar la fecha de actualización: ' + eM.message);
    }

    return { ok: true, inserted, borradas: borrado.borradas, warning: warnings.join(' ') };
  } catch (e) {
    return { ok: false, estado: despuesDeBorrar ? 'anio_vacio' : 'sin_cambios', error: e.message };
  }
}

// ── Indica si el usuario actual puede escribir (rol auditor) ──
function puedeEscribir() {
  try {
    const s = (typeof EmcalaAuth !== 'undefined') && EmcalaAuth.getSession
      ? EmcalaAuth.getSession()
      : null;
    return !!s && String(s.rol || '').toLowerCase() === 'auditor';
  } catch (e) {
    // Fallback: si no hay EmcalaAuth, permitir (modo sin login).
    return true;
  }
}
