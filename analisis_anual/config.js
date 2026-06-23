'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const LABS  = MESES.map(m => m.slice(0,3).toUpperCase());

const UN_LIST = [
  {key:'CERVEZAS CMQ',         label:'Cervezas CMQ',         color:'#f97316'},
  {key:'UNG',                  label:'UNG',                  color:'#a855f7'},
  {key:'AGUAS ECO',            label:'Aguas Eco',            color:'#14b8a6'},
  {key:'ADYACENCIAS',          label:'Adyacencias',          color:'#8b5cf6'},
  {key:'VINO',                 label:'Vino',                 color:'#dc2626'},
  {key:'MARKETPLACE ALIMENTOS',label:'Marketplace',          color:'#16a34a'},
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
// Si querés autocarga total para tus jefes, poné aquí los 2 CSV "fijos".
// Ejemplo: ['data/2025.csv', 'data/2026.csv']
const AUTO_CSV_SOURCES = ['bases/2025.csv', 'bases/2026.csv'];

