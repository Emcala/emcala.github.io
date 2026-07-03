// ==========================================
// COBERTURA CVZA - App Logic
// ==========================================

// === STATE ===
let maestroData  = null;  // { promotorName: Set<clientId> }
let ventasData   = null;  // { promotorName: Set<clientId> }  cerveza only
let mesasData    = null;  // [ { promotor, supervisor, canal, codigo } ]
let historicosData = null; // { promotorName: { cccMA, cccMMAA } }

const MAESTRO_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwWNSg301DKRbdF44UNrPhTU3jD3bSDLUjrI3CJlx_somu-KJu0cPewUcU1tET2i6_ffg/exec';
const MESAS_AUTH_URL = 'https://script.google.com/macros/s/AKfycbxtaLF6l7f_UEj8ypCZV_4LoPKJtgH44e5hvPxPceu7Ya_lI_WM3eaWqd2iSUJfEFfIzw/exec';
const PLANIFICADOR_URL = 'https://script.google.com/macros/s/AKfycbzePqSmRPZhZJ9LPg6dWr50lf_uGvX8Tt09hbwqKiYJVOa8jt85lyGKRReZ-c_OxMcAcg/exec';
// Feriados argentinos 2026  (agregar o quitar según sea necesario)
const FERIADOS = [
  '2026-01-01','2026-02-16','2026-02-17','2026-03-24',
  '2026-04-02','2026-04-03','2026-05-01','2026-05-25',
  '2026-06-15','2026-06-20','2026-07-09','2026-08-17',
  '2026-10-12','2026-11-20','2026-12-08','2026-12-25'
];

// ==========================================
// CSV PARSER  (comillas + separador variable)
// ==========================================
function parseQuotedCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (inQ) {
      if (ch === '"' && nx === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && nx === '\n')) {
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else if (ch !== '\r') field += ch;
    }
  }
  if (field || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

// ==========================================
// NORMALIZE
// ==========================================
function norm(name) {
  return (name || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function findMatch(target, keySet) {
  const nt = norm(target);
  if (!nt) return null;
  for (const k of keySet) { if (norm(k) === nt) return k; }
  // Fallback: match by last name + first name initial
  const tp = nt.split(' ');
  for (const k of keySet) {
    const kp = norm(k).split(' ');
    if (kp[0] === tp[0] && kp.length > 1 && tp.length > 1 && kp[1][0] === tp[1][0]) return k;
  }
  return null;
}

// ==========================================
// LOAD MESAS
// ==========================================
async function loadMesas() {
  updateStatus('mesas', 'loading');
  try {
    const r = await fetch(MESAS_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getMesas' })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok || !data.mesas) throw new Error('Formato inválido');
    
    mesasData = [];
    for (const spv in data.mesas) {
      for (const prom of data.mesas[spv]) {
        mesasData.push({ promotor: prom, supervisor: spv, canal: 'Ventas', codigo: '' });
      }
    }
    updateStatus('mesas', 'loaded', Object.keys(data.mesas).length + ' SPV');
    tryRender();
  } catch (e) {
    console.error('Mesas error:', e);
    updateStatus('mesas', 'error');
    showToast('❌ Error al cargar Mesas centralizadas');
  }
}

// ==========================================
// LOAD MAESTRO  (Google Sheets via Apps Script)
// ==========================================
async function loadMaestro() {
  updateStatus('maestro', 'loading');
  try {
    if (MAESTRO_SCRIPT_URL === 'PEGAR_AQUI_LA_URL_DEL_SCRIPT') {
      updateStatus('maestro', 'error', 'Falta URL Apps Script');
      showToast('⚠️ Falta configurar el Apps Script en app.js');
      return;
    }

    const r = await fetch(MAESTRO_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getCartera' }),
      // text/plain avoids CORS preflight issues with GAS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    maestroData = data.cartera;
    
    if (data.historicos && Object.keys(data.historicos).length > 0) {
      historicosData = data.historicos;
      updateStatus('historicos', 'loaded', Object.keys(historicosData).length + ' PR');
    } else {
      updateStatus('historicos', 'error', 'Sin datos');
    }
    
    updateStatus('maestro', 'loaded', data.total + ' cli');
    showToast('✅ Maestro cargado: ' + data.total + ' clientes con licencia alcohol');
    tryRender();
  } catch (e) {
    console.error('Maestro error:', e);
    updateStatus('maestro', 'error', e.message);
    showToast('❌ Error al cargar maestro.');
  }
}

// ==========================================
// LOAD AVANCE CCC (Desde Planificador)
// ==========================================
async function loadAvance() {
  updateStatus('ventas', 'loading');
  
  // Esperar a que las mesas estén cargadas para saber la lista de SPVs
  if (!mesasData) {
    setTimeout(loadAvance, 500);
    return;
  }
  
  try {
    const now = new Date();
    // Ajustar si es feriado o domingo se podría hacer, pero usando la fecha de hoy, 
    // si el planificador guardó datos hoy, los traemos.
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const cMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    
    // Lista única de supervisores de las mesas
    const spvs = [...new Set(mesasData.map(m => m.supervisor))];
    
    ventasData = {};
    let totalCcc = 0;
    
    // Consultar el endpoint del planificador en paralelo para cada SPV
    const promises = spvs.map(async (spv) => {
      try {
        const response = await fetch(`${PLANIFICADOR_URL}?date=${dateStr}&cMonth=${cMonth}&spv=${encodeURIComponent(spv)}&_t=${Date.now()}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
          // El planificador devuelve los datos acumulados bajo result.data[promotor]
          for (const prom in result.data) {
            const promFlat = norm(prom);
            if (!ventasData[promFlat]) {
               ventasData[promFlat] = { size: 0 }; // Simulamos el comportamiento de Set.size para tryRender
            }
            const ccc = parseInt(result.data[prom]['acum-ccc']) || 0;
            if (ccc > 0) {
              ventasData[promFlat].size = ccc;
            }
          }
        }
      } catch (e) {
        console.warn(`No se pudieron obtener ventas de ${spv}`, e);
      }
    });
    
    await Promise.all(promises);
    
    totalCcc = Object.values(ventasData).reduce((sum, prom) => sum + (prom.size || 0), 0);
    
    updateStatus('ventas', 'loaded', totalCcc + ' CCC');
    showToast('✅ Avance CCC descargado');
    tryRender();
  } catch (e) {
    console.error('Ventas error:', e);
    updateStatus('ventas', 'error');
    showToast('❌ Error al procesar avance CCC');
  }
}

// ==========================================
// BUSINESS DAYS REMAINING
// ==========================================
function calcDiasRestantes() {
  const now  = new Date();
  const year = now.getFullYear();
  const mon  = now.getMonth();
  const last = new Date(year, mon + 1, 0).getDate();
  let dias = 0;

  for (let d = now.getDate() + 1; d <= last; d++) {
    const dt  = new Date(year, mon, d);
    const dow = dt.getDay(); // 0=Sun … 6=Sat
    const ds  = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    if (FERIADOS.includes(ds) || dow === 0) continue;   // feriado o domingo
    dias += (dow === 6) ? 0.5 : 1;                      // sábado = 0.5
  }
  return dias;
}

// ==========================================
// AVANCE COLOR  (HSL gradient red→green)
// ==========================================
function avanceStyle(pct) {
  // Clamp 0-100
  const p = Math.max(0, Math.min(pct, 100));
  // Map to hue: 0% → 0° (red), 50% → 45° (orange/yellow), 100% → 130° (green)
  const hue = p < 50 ? p * 0.9 : 45 + (p - 50) * 1.7;
  const sat = p > 85 ? 55 : 65;
  const lgt = p > 85 ? 38 : (p < 40 ? 42 : 40);
  const txtColor = p >= 48 && p <= 58 ? '#1a1a1a' : '#fff';
  return `background:hsl(${hue},${sat}%,${lgt}%);color:${txtColor}`;
}

// ==========================================
// RENDER TABLE
// ==========================================
function tryRender() {
  if (!mesasData || !maestroData || !ventasData) return;

  const dias = calcDiasRestantes();

  // Show dias info
  const diasEl = document.getElementById('diasInfo');
  diasEl.style.display = 'block';
  diasEl.innerHTML = `Días hábiles restantes del mes: <strong>${dias}</strong>`;

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  const maestroKeys = new Set(Object.keys(maestroData));
  const ventasKeys  = new Set(Object.keys(ventasData));
  const histKeys    = historicosData ? new Set(Object.keys(historicosData)) : null;

  // Group by supervisor (preserve mesas.csv order)
  const spvOrder = [];
  const spvMap   = {};
  for (const m of mesasData) {
    if (!spvMap[m.supervisor]) {
      spvMap[m.supervisor] = [];
      spvOrder.push(m.supervisor);
    }
    spvMap[m.supervisor].push(m);
  }

  // JDV totals
  let jCartera = 0, jCCC = 0, jCNC = 0, jMA = 0, jAA = 0;

  for (const spv of spvOrder) {
    const proms = spvMap[spv];
    let sCartera = 0, sCCC = 0, sCNC = 0, sMA = 0, sAA = 0;

    const promRows = [];

    for (const m of proms) {
      const pn = norm(m.promotor);

      const mKey = findMatch(pn, maestroKeys);
      const cartera = mKey ? maestroData[mKey] : 0;

      const vKey = findMatch(pn, ventasKeys);
      const ccc = vKey ? ventasData[vKey].size : 0;

      const cnc = Math.max(cartera - ccc, 0);
      const avance = cartera > 0 ? (ccc / cartera * 100) : 0;

      let cccMA = 0, cccMMAA = 0;
      if (histKeys) {
        const hKey = findMatch(pn, histKeys);
        if (hKey) { cccMA = historicosData[hKey].cccMA; cccMMAA = historicosData[hKey].cccMMAA; }
      }

      const media = dias > 0 ? Math.round(cnc / dias) : cnc;

      sCartera += cartera; sCCC += ccc; sCNC += cnc;
      sMA += cccMA; sAA += cccMMAA;

      promRows.push({ canal: m.canal, promotor: m.promotor, cartera, ccc, cnc, avance, cccMA, cccMMAA, media });
    }

    // Supervisor totals
    const sAvance = sCartera > 0 ? (sCCC / sCartera * 100) : 0;
    const sMedia  = dias > 0 ? Math.round(sCNC / dias) : sCNC;

    // --- Supervisor header row ---
    const sRow = document.createElement('tr');
    sRow.className = 'row-supervisor';
    sRow.innerHTML =
      `<td></td>` +
      `<td>${spv}</td>` +
      `<td>${sCartera.toLocaleString('es-AR')}</td>` +
      `<td>${sCCC.toLocaleString('es-AR')}</td>` +
      `<td>${sCNC.toLocaleString('es-AR')}</td>` +
      `<td><span class="avance-cell" style="${avanceStyle(sAvance)}">${sAvance.toFixed(2)}%</span></td>` +
      `<td>${sMA || ''}</td>` +
      `<td>${sAA || ''}</td>` +
      `<td>${sMedia.toLocaleString('es-AR')}</td>`;
    tbody.appendChild(sRow);

    // --- Promotor rows ---
    for (const p of promRows) {
      const pRow = document.createElement('tr');
      pRow.className = 'row-promotor';
      pRow.innerHTML =
        `<td>${p.canal}</td>` +
        `<td>${p.promotor}</td>` +
        `<td>${p.cartera.toLocaleString('es-AR')}</td>` +
        `<td>${p.ccc.toLocaleString('es-AR')}</td>` +
        `<td>${p.cnc.toLocaleString('es-AR')}</td>` +
        `<td><span class="avance-cell" style="${avanceStyle(p.avance)}">${p.avance.toFixed(2)}%</span></td>` +
        `<td>${p.cccMA || ''}</td>` +
        `<td>${p.cccMMAA || ''}</td>` +
        `<td>${p.media.toLocaleString('es-AR')}</td>`;
      tbody.appendChild(pRow);
    }

    jCartera += sCartera; jCCC += sCCC; jCNC += sCNC;
    jMA += sMA; jAA += sAA;
  }

  // --- JDV total row ---
  const jAvance = jCartera > 0 ? (jCCC / jCartera * 100) : 0;
  const jMedia  = dias > 0 ? Math.round(jCNC / dias) : jCNC;

  const jRow = document.createElement('tr');
  jRow.className = 'row-jdv';
  jRow.innerHTML =
    `<td></td>` +
    `<td>JDV</td>` +
    `<td>${jCartera.toLocaleString('es-AR')}</td>` +
    `<td>${jCCC.toLocaleString('es-AR')}</td>` +
    `<td>${jCNC.toLocaleString('es-AR')}</td>` +
    `<td><span class="avance-cell" style="${avanceStyle(jAvance)}">${jAvance.toFixed(2)}%</span></td>` +
    `<td>${jMA || ''}</td>` +
    `<td>${jAA || ''}</td>` +
    `<td>${jMedia.toLocaleString('es-AR')}</td>`;
  tbody.appendChild(jRow);

  // Show table
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableScroll').style.display = 'block';
}

// ==========================================
// UI HELPERS
// ==========================================
function updateStatus(src, state, detail) {
  const dot  = document.getElementById('status' + cap(src));
  const text = document.getElementById('status' + cap(src) + 'Text');
  if (!dot || !text) return;

  dot.className = 'status-dot ' + state;
  const labels = { maestro: 'Maestro', mesas: 'Mesas', ventas: 'Avance', historicos: 'Históricos' };
  const icons  = { pending: '', loading: '⏳', loaded: '✓', error: '✗' };
  text.textContent = (labels[src] || src) + ' ' + (icons[state] || '') + (detail ? ' · ' + detail : '');
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function showLoading(msg) {
  document.getElementById('loadingText').textContent = msg || 'Procesando...';
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadMesas();
  loadMaestro();
  loadAvance();
});
