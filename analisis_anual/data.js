async function loadAutoCsvSources() {
  if (!Array.isArray(AUTO_CSV_SOURCES) || AUTO_CSV_SOURCES.length === 0) return 0;
  let loadedFiles = 0;
  let nextData = [...DATA];
  for (const src of AUTO_CSV_SOURCES) {
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      const rows = parseCSV(txt);
      if (!rows.length) continue;
      const yr = rows[0]?.yr;
      nextData = nextData.filter(r => r.yr !== yr).concat(rows);
      loadedFiles++;
    } catch (err) {
      console.warn('No se pudo autocargar:', src, err);
    }
  }
  if (loadedFiles > 0) DATA = nextData;
  return loadedFiles;
}

function parseCSV(txt) {
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  const H = lines[0].split(';').map(h => h.trim());
  const ix = n => H.indexOf(n);
  const iS=ix('Sector de Supervisión');
  const iCodS=ix('Código Sector de Supervisión');
  let iS2 = H.findIndex(h => {
    const l = h.toLowerCase();
    if (l.includes('código') || l.includes('codigo')) return false;
    return l.includes('sector de venta') || l.includes('descripcion vendedor') || l === 'vendedor' || l === 'promotor';
  });
  const iCodS2 = H.findIndex(h => {
    const l = h.toLowerCase();
    return (l.includes('código') || l.includes('codigo')) && (l.includes('sector de venta') || l.includes('vendedor') || l.includes('promotor'));
  });
  const iUN=ix('Unidad de Negocio'),    iA=ix('Año'), iM=ix('Mes'),
        iHL=ix('Cantidad Total en HL'), iB=ix('Cantidad Total en Bultos'),
        iC=ix('Código Cliente'),        iP=ix('Código Producto'),
        iD=ix('Días Visita'),           iCA=ix('Canal Ajustado'),
        iCAL=ix('Calibre'),              iPROD=ix('Producto'),
        iMAR=ix('Marca'),             iCLI_N=ix('Cliente'),
        iRET=ix('Retornable'),        iNET=ix('Importe Neto');
  let iFECHA=H.findIndex(h => h.toLowerCase() === 'fecha');
  if (iFECHA === -1) iFECHA = ix('Fecha'); // fallback if strict matching fails

  function parseDateStr(d) {
    if (!d) return '';
    d = String(d).trim();
    if (/^\d{5}$/.test(d)) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setDate(excelEpoch.getDate() + parseInt(d, 10));
      return excelEpoch.toISOString().split('T')[0];
    }
    if (/^\d{8}$/.test(d)) return d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8);
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(d)) {
      const parts = d.split(/[\/\-]/);
      return parts[2] + '-' + parts[1].padStart(2,'0') + '-' + parts[0].padStart(2,'0');
    }
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(d)) {
      const parts = d.split(/[\/\-]/);
      return parts[0] + '-' + parts[1].padStart(2,'0') + '-' + parts[2].padStart(2,'0');
    }
    return d;
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(';');
    let sdv = (p[iS]||'').trim().toUpperCase();
    sdv = sdv.replace(/\bSDVAS?\b/g, '').replace(/\bSDVS?\b/g, '').replace(/\bSUPERVISOR(?:ES)?\b/g, '').trim();
    const codS = iCodS !== -1 ? (p[iCodS]||'').trim().toUpperCase() : '';
    const sdv2 = (p[iS2]||'').trim().toUpperCase();
    const codS2 = iCodS2 !== -1 ? (p[iCodS2]||'').trim().toUpperCase() : '';
    const un = (p[iUN]||'').trim(); if (!un) continue;
      let marca = (p[iMAR]||'').trim();
      if (marca.toUpperCase() === 'PEPSI BLACK') marca = 'PEPSI';
      if (marca.toUpperCase() === 'STILL' || marca.toUpperCase() === 'H2O' || marca.toUpperCase() === 'H2OH') marca = 'H2Oh';
      
      rows.push({
      sdv, codS, sdv2, codS2, un,
      yr:  (p[iA] ||'').trim(),
      mes: (p[iM] ? p[iM].trim().charAt(0).toUpperCase() + p[iM].trim().slice(1).toLowerCase() : ''),
      hl:  parseFloat((p[iHL]||'').replace(/\./g, '').replace(',','.')) || 0,
      bul: parseFloat((p[iB] ||'').replace(/\./g, '').replace(',','.')) || 0,
      cli: (p[iC] ||'').trim(),
      prod:(p[iP] ||'').trim(),
      dias:(p[iD] ||'').trim(),
      canal:(p[iCA]  ||'').trim(),
      calibre:(p[iCAL]||'').trim(),
      prod2:(p[iPROD]||'').trim(),
      marca: marca,
      cliN:(p[iCLI_N]||'').trim(),
      fecha: iFECHA !== -1 ? parseDateStr(p[iFECHA]) : '',
      retornable: iRET !== -1 ? (p[iRET]||'').trim() : '',
      importeNeto: iNET !== -1 ? parseFloat((p[iNET]||'').replace(/\./g, '').replace(',','.')) || 0 : 0,
    });
  }
  return rows;
}

// DATA HELPERS
// ═══════════════════════════════════════════════════════════════
function isMarket(pg) { return ST[pg].un === 'MARKETPLACE ALIMENTOS'; }
function volOf(r, pg) { return isMarket(pg) ? r.bul : r.hl; }
function volLbl(pg)   { return isMarket(pg) ? 'Bultos' : 'HL'; }
function unColor(pg)  { return UN_LIST.find(u => u.key === ST[pg].un)?.color || '#f97316'; }

// Build row filter from activePromos
function makePromoFilter(pg) {
  const ap = ST[pg].activePromos;
  if (ap.size === 0) return null;
  const allOn = SEGS.every(seg => seg.promos.every(p => ap.has(seg.key+'|'+p)));
  if (allOn) return () => true;
  
  const activeSdv2 = new Set();
  const flexSet = new Set();
  SEGS.forEach(seg => {
    seg.promos.forEach(p => {
      if (ap.has(seg.key+'|'+p)) {
        activeSdv2.add(p);
        flexSet.add(p.split(' ').sort().join(' '));
      }
    });
  });
  
  return r => {
    if (activeSdv2.has(r.sdv2)) return true;
    if (!r.sdv2) return false;
    
    // Caching the sorted string on the row object for O(1) repeated checks
    if (!r._sdv2_norm) r._sdv2_norm = r.sdv2.split(' ').sort().join(' ');
    if (flexSet.has(r._sdv2_norm)) return true;
    
    return false;
  };
}

function getCartera(pg) {
  let apiTotal = 0;
  const ap = ST[pg].activePromos;
  const cartKeys = Object.keys(CART_PROMO);
  const allOn = SEGS.every(seg => seg.promos.every(p => ap.has(seg.key+'|'+p)));

  if (allOn) {
    Object.values(CART_PROMO).forEach(v => apiTotal += v);
  } else {
    SEGS.forEach(seg => {
      seg.promos.forEach(p => {
        if (ap.has(seg.key+'|'+p)) {
          if (CART_PROMO[p]) {
            apiTotal += CART_PROMO[p];
          } else {
            // Buscar match flexible
            const match = cartKeys.find(k => p.includes(k) || k.includes(p));
            if (match && CART_PROMO[match]) {
              apiTotal += CART_PROMO[match];
            }
          }
        }
      });
    });
  }

  if (apiTotal > 0) return apiTotal;

  // Fallback: contar clientes únicos directamente desde DATA
  const uniqueClients = new Set();
  const pf = makePromoFilter(pg);
  if (pf) {
    for (let i = 0; i < DATA.length; i++) {
      const r = DATA[i];
      if (pf(r) && r.cli && r.un === ST[pg].un) uniqueClients.add(r.cli);
    }
  }
  return uniqueClients.size;
}

function canalFilter(r, canal) {
  const promotoresAres = ['DIAZ VALERIA', 'FERNANDEZ LUIS', 'GALLO JONATHAN', 'LOPEZ PABLO', 'RENZO MIÑO', 'SANCHEZ ROCIO'];
  const esPromotorAres = promotoresAres.some(n => r.sdv2.includes(n));
  const isAres = r.sdv.includes('ARES') || r.sdv.includes('SDVAS') || r.codS.includes('ARES') || r.codS.includes('SDVAS') || r.sdv2.includes('ARES') || r.sdv2.includes('SDVAS') || r.codS2.includes('ARES') || r.codS2.includes('SDVAS') || esPromotorAres;

  switch(canal) {
    case 'TODOS':  return r.canal !== 'NO';
    case 'KT':     return r.canal === 'K+T';
    case 'AS':     return r.canal === 'AS'  && isAres;
    case 'KTAS':   return r.canal === 'AS'  && !isAres;
    case 'REF':    return r.canal === 'REF' && r.sdv.includes('LEMOS');
    case 'KTREF':  return r.canal === 'REF' && !r.sdv.includes('LEMOS');
    case 'MAYO_C': return r.canal === 'MAYO';
    default: return true;
  }
}

// Main data fetch: filter by year, UN, active promos, optional extra filter
function getRows(yr, pg, extra) {
  const pf = makePromoFilter(pg);
  if (!pf) return [];
  const un = ST[pg].un;
  const is2026 = (yr == 2026);
  const allowedMonths = window.GLOBAL_ALLOWED_MONTHS;
  
  return DATA.filter(r => {
    if (r.yr != yr || r.un !== un) return false;
    if (is2026 && allowedMonths && !allowedMonths.has(r.mes)) return false;
    if (!pf(r)) return false;
    if (extra && !extra(r)) return false;
    return true;
  });
}

function initMonthMap() {
  const out = {};
  MESES.forEach(m => out[m] = 0);
  return out;
}

function summarizeRows(rows, valueFn) {
  const vol = initMonthMap();
  const cSets = {};
  const bSets = {};

  rows.forEach(r => {
    if (vol[r.mes] === undefined) return;
    const v = valueFn(r);
    vol[r.mes] += v;
    if (v <= 0) return;
    if (!cSets[r.mes]) cSets[r.mes] = new Set();
    if (!bSets[r.mes]) bSets[r.mes] = new Set();
    cSets[r.mes].add(r.cli);
    bSets[r.mes].add(r.cli + '|' + r.prod);
  });

  const ccc = initMonthMap();
  const bd  = initMonthMap();
  MESES.forEach(m => {
    ccc[m] = cSets[m] ? cSets[m].size : 0;
    bd[m]  = bSets[m] ? bSets[m].size : 0;
  });
  return { vol, ccc, bd };
}

// Helpers
function fmtN(v, dec=0) { return Number(v).toLocaleString('es-AR', {maximumFractionDigits:dec}); }

// Responsive font size for ECharts labels
function rf(base) {
  const w = window.innerWidth;
  if (w >= 1920) return Math.round(base * 1.3);
  if (w >= 1600) return Math.round(base * 1.15);
  if (w >= 1366) return base;
  return Math.max(Math.round(base * 0.9), 8);
}
function pct(a, b) { return b ? (a-b)/b*100 : null; }
function lastMes(dv, dc) { return [...MESES].reverse().find(m => dv[m]>0 || dc[m]>0) || MESES[0]; }

