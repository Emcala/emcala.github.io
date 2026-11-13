// ═══════════════════════════════════════════════════════════════
// Módulo Supabase — persistencia de los datos anuales de ventas
// Lee y escribe en la tabla public.analisis_anual_ventas.
// Requiere que en el HTML se cargue @supabase/supabase-js (window.supabase).
// ═══════════════════════════════════════════════════════════════

'use strict';

const SUPABASE_URL = 'https://tdwdqgtnyqnsigzhhxsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2RxZ3RueXFuc2lnemhoeHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwOTE3NDcsImV4cCI6MjA5ODY2Nzc0N30.aiYnQ3g1HIk1e4G89sODitBqtPlzva_akCz5ruvLw-8';

const TABLE_VENTAS = 'analisis_anual_ventas';
const TABLE_META   = 'analisis_anual_meta';

// Cliente Supabase (requiere window.supabase cargado previamente)
let _sb = null;
function supabaseClient() {
  if (_sb) return _sb;
  if (typeof window === 'undefined' || !window.supabase) return null;
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    persistSession: true,
    autoRefreshToken: true
  });
  return _sb;
}

// Mapeo columna DB → campo interno (los campos de parseCSV usan camelCase).
function rowToCSV(r) {
  return {
    sdv: r.sdv ?? '',
    cod_s: r.codS ?? '',
    sdv2: r.sdv2 ?? '',
    cod_s2: r.codS2 ?? '',
    un: r.un ?? '',
    yr: r.yr ?? '',
    mes: r.mes ?? '',
    hl: Number(r.hl) || 0,
    bul: Number(r.bul) || 0,
    cli: r.cli ?? '',
    prod: r.prod ?? '',
    dias: r.dias ?? '',
    canal: r.canal ?? '',
    calibre: r.calibre ?? '',
    prod2: r.prod2 ?? '',
    marca: r.marca ?? '',
    cli_n: r.cliN ?? '',
    fecha: r.fecha || null,
    retornable: r.retornable ?? '',
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

// ── Lectura: trae TODOS los datos y reconstruye DATA ──────────
async function loadDatosDesdeSupabase() {
  const sb = supabaseClient();
  if (!sb) return { ok: false, error: 'Supabase no disponible' };

  const { data, error } = await sb
    .from(TABLE_VENTAS)
    .select('*')
    .order('id', { ascending: true });

  if (error) return { ok: false, error: error.message };
  if (!data || !data.length) return { ok: true, rows: 0, empty: true };

  const rows = data.map(dbRowToCSV);

  // Reemplazar los años que vienen de Supabase en DATA, sin duplicar.
  const years = new Set(rows.map(r => r.yr));
  DATA = DATA.filter(r => !years.has(r.yr)).concat(rows);

  return { ok: true, rows: rows.length };
}

// ── Metadatos: "última actualización" por año ─────────────────
async function loadMetaSupabase() {
  const sb = supabaseClient();
  if (!sb) return {};
  try {
    const { data, error } = await sb.from(TABLE_META).select('*');
    if (error || !data) return {};
    const out = {};
    data.forEach(m => { out[m.yr] = m; });
    return out;
  } catch (e) { return {}; }
}

// ── Escritura: reemplaza un año completo (borra + inserta en lotes) ──
async function guardarAnioEnSupabase(yr, rows) {
  const sb = supabaseClient();
  if (!sb) return { ok: false, error: 'Supabase no disponible' };

  if (!yr || !rows || !rows.length) {
    return { ok: false, error: 'No hay filas para guardar' };
  }

  // 1) Borrar el año existente
  const { error: delErr } = await sb
    .from(TABLE_VENTAS)
    .delete()
    .eq('yr', String(yr));

  if (delErr) return { ok: false, error: 'Error borrando año: ' + delErr.message };

  // 2) Insertar en lotes (evita límites de tamaño de petición)
  const CHUNK = 500;
  const payload = rows.map(rowToCSV);
  let inserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error: insErr } = await sb.from(TABLE_VENTAS).insert(chunk);
    if (insErr) return { ok: false, error: 'Error insertando: ' + insErr.message };
    inserted += chunk.length;
  }

  // 3) Actualizar metadato de "última actualización"
  const nombre = (window.EmcalaAuth && EmcalaAuth.getSession())
    ? (EmcalaAuth.getSession().nombre || EmcalaAuth.getSession().usuario || '')
    : '';
  const { error: metaErr } = await sb.from(TABLE_META).upsert({
    yr: String(yr),
    actualizado_en: new Date().toISOString(),
    filas: inserted,
    actualizado_por: nombre
  }, { onConflict: 'yr' });

  if (metaErr) console.warn('No se pudo guardar metadato:', metaErr.message);

  return { ok: true, inserted };
}

// ── Indica si el usuario actual puede escribir (rol auditor) ──
function puedeEscribir() {
  try {
    const s = window.EmcalaAuth && EmcalaAuth.getSession
      ? EmcalaAuth.getSession()
      : null;
    return !!s && String(s.rol || '').toLowerCase() === 'auditor';
  } catch (e) {
    // Fallback: si no hay EmcalaAuth, permitir (modo sin login).
    return true;
  }
}