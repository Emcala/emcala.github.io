// =====================================================================
// Carga de SKUs y Plana de Tareas a Supabase (desde el botón del Planificador).
// Solo el auditor puede escribir: lo valida RLS en la base, no este archivo.
//
// SKUs: columnas sku_id, short_description, full_description.
//   Clave (id_sku, desc_larga). Pares repetidos: se queda el primero.
//   short_description es opcional y no se guarda (desc_corta se eliminó de la tabla).
//   Al terminar bien, borra los SKUs que no vinieron en el archivo.
// Tareas: columnas cliente_id, tarea, business, dia (AAAAMMDD).
//   El mes sale de DIA (AAAA-MM). Si el archivo trae dos meses, se rechaza.
//   Al terminar bien, borra del mes las tareas que no vinieron en el archivo.
//
// Si una carga falla a la mitad, no se borra nada: se puede repetir.
// =====================================================================
(function () {
  const BATCH = 2000;
  const PARALELO = 2;
  const REINTENTOS = 4;

  // Misma regla que api.js: comillas, prefijo 18 de 14 dígitos, ceros a la izquierda.
  function normalizarCliente(raw) {
    let s = String(raw || '').replace(/"/g, '').trim();
    if (/^\d{14}$/.test(s) && s.indexOf('18') === 0) s = s.slice(8);
    return s.replace(/^0+/, '');
  }

  // Parser CSV con soporte de comillas (sin saltos de línea dentro de un campo).
  function parsearLinea(linea, sep) {
    const out = [];
    let cur = '';
    let entreComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (entreComillas) {
        if (c === '"') {
          if (linea[i + 1] === '"') { cur += '"'; i++; }
          else entreComillas = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        entreComillas = true;
      } else if (c === sep) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parsearCSV(texto) {
    const limpio = String(texto || '').replace(/^﻿/, '');
    const lineas = limpio.split(/\r?\n/);
    const primera = lineas[0] || '';
    const sep = primera.indexOf(';') >= 0 ? ';' : ',';
    const headers = parsearLinea(primera, sep).map(h => h.trim().toLowerCase());
    const filas = [];
    for (let i = 1; i < lineas.length; i++) {
      const l = lineas[i];
      if (!l || !l.trim()) continue;
      filas.push(parsearLinea(l, sep));
    }
    return { headers: headers, filas: filas };
  }

  function columna(headers, nombre) {
    const i = headers.indexOf(nombre);
    if (i < 0) throw new Error('Falta la columna "' + nombre + '" en el archivo.');
    return i;
  }

  // Reintenta un lote si Supabase corta por timeout (57014) o cae un 5xx.
  async function conReintentos(fn) {
    let ultimo = null;
    for (let i = 0; i < REINTENTOS; i++) {
      try {
        return await fn();
      } catch (e) {
        ultimo = e;
        if (!/57014|timeout|Supabase 5\d\d/i.test(e.message)) throw e;
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
    }
    throw ultimo;
  }

  // Manda los datos en lotes, de a PARALELO lotes a la vez.
  async function enLotes(filas, enviar, onProgress, etiqueta) {
    const lotes = [];
    for (let i = 0; i < filas.length; i += BATCH) lotes.push(filas.slice(i, i + BATCH));
    let hechos = 0;
    let siguiente = 0;
    async function worker() {
      while (siguiente < lotes.length) {
        const lote = lotes[siguiente++];
        await conReintentos(() => enviar(lote));
        hechos += lote.length;
        if (onProgress) onProgress(etiqueta + ' ' + hechos.toLocaleString('es-AR') + ' de ' + filas.length.toLocaleString('es-AR'));
      }
    }
    const workers = [];
    for (let w = 0; w < Math.min(PARALELO, lotes.length); w++) workers.push(worker());
    await Promise.all(workers);
  }

  async function cargarSkus(texto, inicio, onProgress) {
    const { headers, filas } = parsearCSV(texto);
    const iId = columna(headers, 'sku_id');
    const iLarga = columna(headers, 'full_description');

    const vistos = new Set();
    const datos = [];
    for (const f of filas) {
      const id = (f[iId] || '').trim();
      if (!id) continue;
      const larga = (f[iLarga] || '').trim();
      const clave = id + '\u0001' + larga;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      datos.push({
        id_sku: id,
        desc_larga: larga,
        updated_at: inicio
      });
    }
    if (datos.length === 0) throw new Error('No hay SKUs válidos en el archivo.');

    await enLotes(datos, function (lote) {
      return EmcalaAuth.sbRest('planificador_skus?on_conflict=id_sku,desc_larga', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: lote
      });
    }, onProgress, 'SKUs:');

    // Solo después de que todos los lotes salieron bien
    await EmcalaAuth.sbRest('planificador_skus?updated_at=lt.' + encodeURIComponent(inicio), {
      method: 'DELETE',
      prefer: 'return=minimal'
    });

    return { skus: datos.length };
  }

  async function cargarTareas(texto, inicio, onProgress) {
    const { headers, filas } = parsearCSV(texto);
    const iCli = columna(headers, 'cliente_id');
    const iTarea = columna(headers, 'tarea');
    const iBiz = columna(headers, 'business');
    const iDia = columna(headers, 'dia');

    const meses = new Set();
    const vistos = new Set();
    const datos = [];
    for (const f of filas) {
      const dia = (f[iDia] || '').trim();
      if (!/^\d{8}$/.test(dia)) throw new Error('Fecha inválida en la columna DIA: "' + dia + '"');
      const mes = dia.slice(0, 4) + '-' + dia.slice(4, 6);
      const cli = normalizarCliente(f[iCli]);
      const tarea = (f[iTarea] || '').trim();
      if (!cli || !tarea) continue;
      meses.add(mes);
      const clave = mes + '\u0001' + cli + '\u0001' + tarea;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      datos.push({
        mes: mes,
        cliente_id: cli,
        unidad_negocio: (f[iBiz] || '').trim() || 'NA',
        tarea: tarea,
        updated_at: inicio
      });
    }
    if (datos.length === 0) throw new Error('No hay tareas válidas en el archivo.');
    if (meses.size > 1) {
      throw new Error('El archivo tiene fechas de más de un mes (' + Array.from(meses).join(', ') + '). Separalo por mes y subilo de a uno.');
    }
    const mes = Array.from(meses)[0];

    await enLotes(datos, function (lote) {
      return EmcalaAuth.sbRest('planificador_tareas?on_conflict=mes,cliente_id,tarea', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: lote
      });
    }, onProgress, 'Tareas:');

    // Solo después de que todos los lotes salieron bien: borra del mes lo que no vino
    await EmcalaAuth.sbRest(
      'planificador_tareas?mes=eq.' + encodeURIComponent(mes) + '&updated_at=lt.' + encodeURIComponent(inicio),
      { method: 'DELETE', prefer: 'return=minimal' }
    );

    return { mes: mes, tareas: datos.length };
  }

  // Punto de entrada. opts: { skus, tareas, onProgress }
  async function cargarArchivo(texto, opts) {
    opts = opts || {};
    const inicio = new Date().toISOString();
    const resumen = {};
    if (opts.skus) Object.assign(resumen, await cargarSkus(texto, inicio, opts.onProgress));
    if (opts.tareas) Object.assign(resumen, await cargarTareas(texto, inicio, opts.onProgress));
    return resumen;
  }

  window.CargaSupabase = {
    cargarArchivo: cargarArchivo,
    normalizarCliente: normalizarCliente,
    parsearCSV: parsearCSV
  };
})();
