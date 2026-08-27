'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const LABS  = MESES.map(m => m.slice(0,3).toUpperCase());

const UN_LIST = [
  {key:'CERVEZAS CMQ',         label:'Cervezas CMQ',         color:'#ea580c'},
  {key:'UNG',                  label:'UNG',                  color:'#9333ea'},
  {key:'AGUAS ECO',            label:'Aguas Eco',            color:'#0d9488'},
  {key:'ADYACENCIAS',          label:'Adyacencias',          color:'#7c3aed'},
  {key:'VINO',                 label:'Vino',                 color:'#b91c1c'},
  {key:'MARKETPLACE ALIMENTOS',label:'Marketplace',          color:'#15803d'},
];

// Dynamic Config
let SEGS = [];
let CART_PROMO = {};
// ═══════════════════════════════════════════════════════════════
// STATE — one object per page, fully isolated
// ═══════════════════════════════════════════════════════════════
function initActivePromos() {
  const s = new Set();
  SEGS.forEach(seg => seg.promos.forEach(p => s.add(seg.key + '|' + p)));
  return s;
}

const ST = {
  1: { un: 'CERVEZAS CMQ', activePromos: initActivePromos() },
  2: { un: 'CERVEZAS CMQ', activePromos: initActivePromos(), freqSel: new Set(['TODOS']) },
  3: { un: 'CERVEZAS CMQ', activePromos: initActivePromos(), canal: 'TODOS' },
};

// DATA
// ═══════════════════════════════════════════════════════════════
let DATA = [];
let CHS  = {}; // echarts instances
let CH_OBS = {}; // one ResizeObserver per chart container
const CACHE_DB_NAME = 'emcala-dashboard-db';
const CACHE_STORE = 'snapshots';
const CACHE_KEY = 'latest-data-v3';

// Global Month Filter (1-12)
window.GLOBAL_MONTH_LIMIT = 12;
window.GLOBAL_ALLOWED_MONTHS = new Set(MESES);
// Si querés autocarga total para tus jefes, poné aquí los 2 CSV "fijos".
// Ejemplo: ['data/2025.csv', 'data/2026.csv']
const AUTO_CSV_SOURCES = [];
