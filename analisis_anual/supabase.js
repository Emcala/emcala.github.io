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
const TABLE_META   = 'analisis_anual_meta';

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
        } catch (e) {}
      }
    }
  } catch (e) {}
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
    try { msg = (await res.text()).slice(0, 300); } catch (e) {}
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.indexOf('json') >= 0) return res.json();
  return res.text();
}

// ── Mapeo columna DB → campo interno (parseCSV usa camelCase) ─
function rowToCSV(r) {
  return {
    sdv: r.sdv ?? '', cod_s: r.codS ?? '', sdv2: r.sdv2 ?? '', cod_s2: r.codS2 ?? '',
    un: r.un ?? '', yr: r.yr ?? '', mes: r.mes ?? '',
    hl: Number(r.hl) || 0, bul: Number(r.bul) || 0,
    cli: r.cli ?? '', prod: r.prod ?? '', dias: r.dias ?? '', canal: r.canal ?? '',
    calibre: r.calibre ?? '', prod2: r.prod2 ?? '', marca: r.marca ?? '',
    cli_n: r.cliN ?? '', fecha: r.fecha || null, retornable: r.retornable ?? '',
    importe_neto: Number(r.importeNeto) || 0
  };
}

function dbRowToCSV(r) {
  return {
    sdv: r.sdv, codS: r.cod_s, sdv2: r.sdv2, codS2: r.cod_s2,
    un: r.un, yr: r.yr, mes: r.mes,
    hl: Number(r.hl) || 0, bul: Number(r.bul) || 0,
    cli: r.cli, prod: r.prod, dias: r.dias, canal: r.canal,
    calibre: r.calibre, prod2: r.prod2, marca: r.marca,
    cliN: r.cli_n, fecha: r.fecha || '', retornable: r.retornable,
    importeNeto: Number(r.importe_neto) || 0
  };
}

// ── Lectura paginada (PostgREST corta cada respuesta en 1000 filas) ──
async function sbFetchPage(path, from, to) {
  const token = await getToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY),
      'Range-Unit': 'items',
      'Range': `${from}-${to}`,
      'Prefer': 'count=exact'
    }
  });
  // 416 = pedimos una página más allá del final (la tabla cambió o tiene menos filas): no es un error, es "no hay más"
  if (res.status === 416) return { rows: [], total: null };
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.text()).slice(0, 300); } catch (e) {}
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10);
  return { rows: await res.json(), total: isNaN(total) ? null : total };
}

// ── Lectura: trae TODOS los datos y reconstruye DATA ──────────
async function loadDatosDesdeSupabase() {
  try {
    const token = await getToken();
    if (!token) return { ok: false, error: 'No hay sesión activa (sin token)' };

    const q = `${TABLE_VENTAS}?select=*&order=id`;
    const first = await sbFetchPage(q, 0, 999);
    if (!first.rows.length) return { ok: true, rows: 0, empty: true };

    const pageSize = first.rows.length;       // el servidor puede devolver menos de 1000
    const total = first.total || pageSize;
    let all = first.rows.slice();

    if (total > pageSize) {
      const offsets = [];
      for (let o = pageSize; o < total; o += pageSize) offsets.push(o);
      const results = new Array(offsets.length);
      let next = 0;
      const worker = async () => {
        while (next < offsets.length) {
          const i = next++;
          const r = await sbFetchPage(q, offsets[i], offsets[i] + pageSize - 1);
          results[i] = r.rows;
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));   // 6 pedidos en paralelo
      results.forEach(r => { all = all.concat(r); });
    }

    const rows = all.map(dbRowToCSV);
    const years = new Set(rows.map(r => r.yr));
    DATA = DATA.filter(r => !years.has(r.yr)).concat(rows);
    return { ok: true, rows: rows.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

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

// ── Escritura: reemplaza un año completo ──────────────────────
// Orden seguro: 1) inserta lo nuevo, 2) recién ahí borra la carga vieja.
// Si algo falla antes del paso 2, se deshace lo nuevo y la carga anterior queda intacta.
// onProgress({ yr, done, total, fase }) se llama durante la inserción.
async function guardarAnioEnSupabase(yr, rows, onProgress) {
  let maxIdBefore = null;
  let viejoBorrado = false;
  const yrQ = encodeURIComponent(String(yr));
  try {
    const token = await getToken();
    if (!token) return { ok: false, error: 'No hay sesión activa (sin token). Volvé a iniciar sesión.' };

    if (!yr || !rows || !rows.length) {
      return { ok: false, error: 'No hay filas para guardar el año ' + yr };
    }

    // 1) Marca: todo lo que tenga id <= maxIdBefore es la carga vieja
    const last = await sbFetch(`${TABLE_VENTAS}?select=id&order=id.desc&limit=1`);
    maxIdBefore = (Array.isArray(last) && last.length) ? Number(last[0].id) : 0;

    // 2) Insertar lo nuevo en lotes
    const CHUNK = 1000;
    const payload = rows.map(rowToCSV);
    let inserted = 0;
    if (onProgress) onProgress({ yr, done: 0, total: payload.length, fase: 'insertando' });
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      await sbFetch(TABLE_VENTAS, { method: 'POST', body: chunk, prefer: 'return=minimal' });
      inserted += chunk.length;
      if (onProgress) onProgress({ yr, done: inserted, total: payload.length, fase: 'insertando' });
    }

    // 3) Borrar la carga vieja del mismo año
    if (onProgress) onProgress({ yr, done: inserted, total: payload.length, fase: 'reemplazando' });
    await sbFetch(`${TABLE_VENTAS}?yr=eq.${yrQ}&id=lte.${maxIdBefore}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });
    viejoBorrado = true;

    // 4) Actualizar metadato
    const nombre = ((typeof EmcalaAuth !== 'undefined') && EmcalaAuth.getSession)
      ? (EmcalaAuth.getSession().nombre || EmcalaAuth.getSession().usuario || '')
      : '';
    await sbFetch(TABLE_META, {
      method: 'POST',
      body: {
        yr: String(yr),
        actualizado_en: new Date().toISOString(),
        filas: inserted,
        actualizado_por: nombre
      },
      prefer: 'resolution=merge-duplicates,return=minimal'
    });

    return { ok: true, inserted };
  } catch (e) {
    if (!viejoBorrado && maxIdBefore !== null) {
      // Deshacer lo recién insertado; la carga anterior sigue intacta
      try {
        await sbFetch(`${TABLE_VENTAS}?yr=eq.${yrQ}&id=gt.${maxIdBefore}`, {
          method: 'DELETE',
          prefer: 'return=minimal'
        });
        return { ok: false, error: e.message + ' (se conservó la carga anterior)' };
      } catch (e2) {
        return { ok: false, error: e.message + ' (no se pudo deshacer: puede haber filas duplicadas de ' + yr + ')' };
      }
    }
    if (viejoBorrado) {
      return { ok: false, error: 'Las filas se guardaron, pero falló la metadata: ' + e.message };
    }
    return { ok: false, error: e.message };
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
