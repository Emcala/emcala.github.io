// ==========================================
// COBERTURA CVZA - App Logic
// ==========================================

// === STATE ===
let maestroData  = null;  // { promotorName: count }
let ventasData   = null;  // { promotorName: { size: N } }
let mesasData    = null;  // [ { promotor, supervisor, canal, codigo } ]
let historicosData = null; // { promotorName: { cccMA, cccMMAA } }

const MAESTRO_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwWNSg301DKRbdF44UNrPhTU3jD3bSDLUjrI3CJlx_somu-KJu0cPewUcU1tET2i6_ffg/exec';
const MESAS_AUTH_URL = 'https://script.google.com/macros/s/AKfycbwQ_cArrrXQ8Z1e07cpTYm62TfLkMo0vbrmWRMrWcP7XUfNeE7gqLz81aSmPQfc7tm82g/exec';
const PLANIFICADOR_URL = 'https://script.google.com/macros/s/AKfycbzePqSmRPZhZJ9LPg6dWr50lf_uGvX8Tt09hbwqKiYJVOa8jt85lyGKRReZ-c_OxMcAcg/exec';
// Feriados argentinos 2026  (agregar o quitar según sea necesario)
const FERIADOS = [
  '2026-01-01','2026-02-16','2026-02-17','2026-03-24',
  '2026-04-02','2026-04-03','2026-05-01','2026-05-25',
  '2026-06-15','2026-06-20','2026-07-09','2026-08-17',
  '2026-10-12','2026-11-20','2026-12-08','2026-12-25'
];

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ==========================================
// FETCH CON REINTENTOS
// Apps Script a veces devuelve 404/HTML en vez del JSON esperado bajo
// carga (mismo fenómeno ya visto en el planificador) — reintenta antes
// de darse por vencido, en vez de fallar al primer intento.
// ==========================================
async function fetchJsonRetry(url, options, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await fetch(url, options);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      await new Promise(res => setTimeout(res, 1500 * (attempt + 1) + Math.random() * 1000));
    }
  }
}

// ==========================================
// MONTH SELECTOR
// ==========================================
const monthSelect = document.getElementById('monthSelect');

// Calcula el mes comercial actual: el mes al que pertenece la entrega de
// la venta de hoy (siguiente día hábil).  Misma lógica que el Planificador.
function getCommercialMonthNow() {
  const now = new Date();
  const formatD = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let delivery = new Date(now);
  do {
    delivery.setDate(delivery.getDate() + 1);
  } while (delivery.getDay() === 0 || FERIADOS.includes(formatD(delivery)));
  return `${delivery.getFullYear()}-${String(delivery.getMonth()+1).padStart(2,'0')}`;
}

function populateMonthSelector() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  const commercialMonth = getCommercialMonthNow();

  monthSelect.innerHTML = '';

  // Show last 6 months + current calendar month
  for (let i = 6; i >= 0; i--) {
    let m = currentMonth - i;
    let y = currentYear;
    if (m < 0) { m += 12; y--; }
    const val = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[m]} ${y}`;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    monthSelect.appendChild(opt);
  }

  // Si el mes comercial está adelantado respecto al calendario
  // (ej: 31 de agosto → entrega 1 de sept → comercial = septiembre),
  // agregarlo al selector para que el usuario pueda elegirlo.
  const calendarMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  if (commercialMonth > calendarMonth) {
    const parts = commercialMonth.split('-');
    const cm = parseInt(parts[1]) - 1;
    const cy = parseInt(parts[0]);
    const opt = document.createElement('option');
    opt.value = commercialMonth;
    opt.textContent = `${MONTH_NAMES[cm]} ${cy}`;
    monthSelect.appendChild(opt);
  }

  // Seleccionar el mes comercial actual por defecto
  monthSelect.value = commercialMonth;
}

function getSelectedMonth() {
  return monthSelect.value; // "YYYY-MM"
}

function isCurrentMonth(cMonth) {
  return cMonth === getCommercialMonthNow();
}

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
  
  const tp = nt.split(' ');
  const tpSorted = tp.slice().sort().join(' ');
  
  for (const k of keySet) {
    const kp = norm(k).split(' ');
    
    // Match por palabras invertidas (ej. "RENZO MIÑO" == "MIÑO RENZO")
    if (kp.slice().sort().join(' ') === tpSorted) return k;
    
    // Fallback original: match by last name + first name initial
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
    const data = await fetchJsonRetry(MESAS_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getMesas' })
    });
    if (!data.ok || !data.mesas) throw new Error('Formato inválido');
    
    mesasData = [];
    for (const spv in data.mesas) {
      for (const prom of data.mesas[spv]) {
        const codigo = (data.codigos && data.codigos[prom]) ? data.codigos[prom] : prom;
        mesasData.push({ promotor: prom, supervisor: spv, canal: 'Ventas', codigo: codigo });
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
async function loadMaestro(forceRefresh) {
  updateStatus('maestro', 'loading');
  try {
    if (MAESTRO_SCRIPT_URL === 'PEGAR_AQUI_LA_URL_DEL_SCRIPT') {
      updateStatus('maestro', 'error', 'Falta URL Apps Script');
      showToast('⚠️ Falta configurar el Apps Script en app.js');
      return;
    }

    const data = await fetchJsonRetry(MAESTRO_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'getCartera', forceRefresh: !!forceRefresh }),
      // text/plain avoids CORS preflight issues with GAS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    maestroData = data.cartera;
    
    // DEBUG: ver qué trae el GAS de históricos
    console.log('📊 HIST_DEBUG:' + JSON.stringify(data.histDebug));
    console.log('📊 HIST_ERROR:' + JSON.stringify(data.histError));
    const _sample = Object.entries(data.historicos || {}).slice(0, 3);
    console.log('📊 HIST_SAMPLE:' + JSON.stringify(_sample));
    
    if (data.historicos && Object.keys(data.historicos).length > 0) {
      historicosData = data.historicos;
      updateStatus('historicos', 'loaded', Object.keys(historicosData).length + ' PR');
    } else {
      updateStatus('historicos', 'error', 'Sin datos');
    }
    
    updateStatus('maestro', 'loaded', data.total + ' CLI');
    showToast('✅ Maestro cargado: ' + data.total + ' clientes con licencia alcohol');
    tryRender();
  } catch (e) {
    console.error('Maestro error:', e);
    updateStatus('maestro', 'error');
    showToast('❌ Error al cargar maestro.');
  }
}

// ==========================================
// LOAD AVANCE CCC (Desde Planificador)
// Accepts optional cMonth parameter for month selection
// ==========================================
async function loadAvance(selectedMonth) {
  updateStatus('ventas', 'loading');
  
  // Esperar a que las mesas estén cargadas para saber la lista de SPVs
  if (!mesasData) {
    setTimeout(() => loadAvance(selectedMonth), 500);
    return;
  }
  
  try {
    const cMonth = selectedMonth || getSelectedMonth();
    
    // For the date parameter, use the last day of the selected month
    // If it's the current month, use today's date
    let dateStr;
    const isCurrent = isCurrentMonth(cMonth);
    if (isCurrent) {
      // Para el mes actual, queremos consultar la fecha de PLANIFICACION (hoy),
      // no la fecha de entrega (mañana).
      let date = new Date();
      const formatD = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      // Si hoy es domingo o feriado, retrocedemos al último día hábil
      while (date.getDay() === 0 || FERIADOS.includes(formatD(date))) {
        date.setDate(date.getDate() - 1);
      }
      dateStr = formatD(date);
    } else {
      // Last day of the selected month
      const parts = cMonth.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const lastDay = new Date(y, m, 0).getDate();
      dateStr = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }
    
    // Lista única de supervisores de las mesas
    const spvs = [...new Set(mesasData.map(m => m.supervisor))];
    
    ventasData = {};
    let totalCcc = 0;
    
    // Consultar el endpoint del planificador para cada SPV, con un pequeño
    // escalonamiento entre pedidos (en vez de dispararlos todos en el mismo
    // instante) para no generar una ráfaga de N pedidos simultáneos contra
    // el mismo Apps Script que usa el planificador matinal.
    const promises = spvs.map(async (spv, idx) => {
      await new Promise(res => setTimeout(res, idx * 200 + Math.random() * 150));
      try {
        const result = await fetchJsonRetry(
          `${PLANIFICADOR_URL}?date=${dateStr}&cMonth=${cMonth}&spv=${encodeURIComponent(spv)}&_t=${Date.now()}`
        );
        if (result.status === 'success' && result.data) {
          // El planificador devuelve los datos acumulados bajo result.data[promotor]
          for (const prom in result.data) {
            const promFlat = norm(prom);
            if (!ventasData[promFlat]) {
               ventasData[promFlat] = { size: 0, nuevos: 0 }; // Simulamos el comportamiento de Set.size para tryRender
            }
            const ccc = parseInt(result.data[prom]['acum-ccc']) || 0;
            if (ccc > 0) {
              ventasData[promFlat].size = ccc;
            }
            // "Clientes Nuevos" is a list of IDs (e.g. "9052, 12266" or just 9052)
            // Solo lo mostramos si estamos mirando el mes actual (pedido del usuario)
            if (isCurrent) {
              let nuevosIds = new Set();
              const rawNuevos = result.data[prom]['clientes-nuevos'];
              if (rawNuevos !== undefined && rawNuevos !== null && rawNuevos !== "") {
                if (typeof rawNuevos === 'string') {
                  rawNuevos.split(',').forEach(x => {
                    const id = x.trim();
                    if (id) nuevosIds.add(id);
                  });
                } else if (typeof rawNuevos === 'number') {
                  nuevosIds.add(String(rawNuevos));
                }
              }
              if (nuevosIds.size > 0) {
                ventasData[promFlat].nuevos = nuevosIds.size;
                ventasData[promFlat].nuevosIds = nuevosIds;
              }
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
// Parameterized: for past months returns 0
// ==========================================
function calcDiasRestantes() {
  const cMonth = getSelectedMonth();
  const commercialMonth = getCommercialMonthNow();
  
  // Meses pasados (ya cerrados): sin días restantes
  if (cMonth < commercialMonth) return 0;
  
  const parts = cMonth.split('-');
  const year = parseInt(parts[0]);
  const mon = parseInt(parts[1]) - 1; // 0-based
  
  let startDay, lastDay;
  if (cMonth === commercialMonth) {
    // Mes comercial actual: días restantes desde mañana
    const now = new Date();
    if (now.getMonth() === mon) {
      // Caso normal: mes calendario == mes comercial
      startDay = now.getDate() + 1;
    } else {
      // Caso borde: todavía en mes calendario anterior (ej: 31/8 → comercial Sep)
      // La venta de hoy ya contó; los días restantes son todos los del nuevo mes.
      startDay = 1;
    }
    lastDay = new Date(year, mon + 1, 0).getDate();
  } else {
    // Mes futuro: todos los días
    startDay = 1;
    lastDay = new Date(year, mon + 1, 0).getDate();
  }
  
  let dias = 0;
  for (let d = startDay; d <= lastDay; d++) {
    const dt = new Date(year, mon, d);
    const dow = dt.getDay(); // 0=Sun … 6=Sat
    const ds = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    if (FERIADOS.includes(ds) || dow === 0) continue;   // feriado o domingo
    dias += (dow === 6) ? 0.5 : 1;                      // sábado = 0.5
  }
  return dias;
}

// ==========================================
// AVANCE COLOR  (Igual que Efectividad)
// ==========================================
function avanceStyle(pct) {
  if (pct < 50) return '#ef4444'; // Rojo
  if (pct < 90) return '#f59e0b'; // Naranja/Ambar
  return '#107c41'; // Verde Excel
}

// ==========================================
// RENDER TABLE
// ==========================================
function tryRender() {
  if (!mesasData || !maestroData || !ventasData) return;

  const dias = calcDiasRestantes();
  const cMonth = getSelectedMonth();

  // Show dias info
  const diasEl = document.getElementById('diasInfo');
  diasEl.style.display = 'block';
  if (dias > 0) {
    diasEl.innerHTML = `Días hábiles restantes del mes: <strong>${dias}</strong>`;
  } else {
    const parts = cMonth.split('-');
    diasEl.innerHTML = `Cierre de <strong>${MONTH_NAMES[parseInt(parts[1]) - 1]} ${parts[0]}</strong> (mes cerrado)`;
  }

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
  let jCartera = 0, jCCC = 0, jCNC = 0, jMA = 0, jAA = 0, jNuevos = 0;
  let jNuevosSet = new Set();

  for (const spv of spvOrder) {
    const proms = spvMap[spv];
    let sCartera = 0, sCCC = 0, sCNC = 0, sMA = 0, sAA = 0, sNuevos = 0;
    let sNuevosSet = new Set();

    const promRows = [];

    for (const m of proms) {
      const pn = norm(m.promotor);
      const pc = norm(m.codigo);

      const mKey = findMatch(pn, maestroKeys);
      const cartera = mKey ? maestroData[mKey] : 0;

      // Buscar por código VEND primero. Si no encuentra, intentar por nombre (para datos viejos no migrados)
      let vKey = findMatch(pc, ventasKeys);
      if (!vKey && pc !== pn) {
        vKey = findMatch(pn, ventasKeys);
      }

      const ccc = vKey ? ventasData[vKey].size : 0;
      const nuevos = vKey ? (ventasData[vKey].nuevos || 0) : 0;
      
      if (vKey && ventasData[vKey].nuevosIds) {
        ventasData[vKey].nuevosIds.forEach(id => {
          sNuevosSet.add(id);
          jNuevosSet.add(id);
        });
      }

      const cnc = Math.max(cartera - ccc, 0);
      const avance = cartera > 0 ? (ccc / cartera * 100) : 0;

      let cccMA = 0, cccMMAA = 0;
      if (histKeys) {
        let hKey = findMatch(pc, histKeys);
        if (!hKey && pc !== pn) {
          hKey = findMatch(pn, histKeys);
        }
        if (hKey) { cccMA = historicosData[hKey].cccMA; cccMMAA = historicosData[hKey].cccMMAA; }
      }

      const media = dias > 0 ? Math.round(cnc / dias) : cnc;

      sCartera += cartera; sCCC += ccc; sCNC += cnc;
      sMA += cccMA; sAA += cccMMAA;

      promRows.push({ canal: m.canal, promotor: m.promotor, codigo: m.codigo || '', cartera, ccc, cnc, avance, cccMA, cccMMAA, nuevos, media });
    }

    // Ordenar los promotores por su código VEND numéricamente/alfabéticamente
    promRows.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

    // Supervisor totals
    const sAvance = sCartera > 0 ? (sCCC / sCartera * 100) : 0;
    const sMedia  = dias > 0 ? Math.round(sCNC / dias) : sCNC;
    sNuevos = sNuevosSet.size;

    // --- Supervisor header row ---
    const sRow = document.createElement('tr');
    sRow.className = 'sdv-row';
    sRow.innerHTML =
      `<td class="name-col">${spv}</td>` +
      `<td>${sCartera.toLocaleString('es-AR')}</td>` +
      `<td>${sCCC.toLocaleString('es-AR')}</td>` +
      `<td>${sCNC.toLocaleString('es-AR')}</td>` +
      `<td class="progress-cell"><span>${sAvance.toFixed(2)}%</span><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(sAvance,100)}%; background:${avanceStyle(sAvance)};"></div></div></td>` +
      `<td>${sMA || ''}</td>` +
      `<td>${sAA || ''}</td>` +
      `<td class="col-nuevos">${sNuevos || ''}</td>` +
      `<td>${sMedia.toLocaleString('es-AR')}</td>`;
    tbody.appendChild(sRow);

    // --- Promotor rows ---
    for (const p of promRows) {
      const pRow = document.createElement('tr');
      pRow.className = 'prom-row';
      
      const classMA = (p.cccMA > 0 && p.ccc >= p.cccMA) ? ' class="achieved"' : '';
      const classAA = (p.cccMMAA > 0 && p.ccc >= p.cccMMAA) ? ' class="achieved"' : '';

      // Format: MELA GONZALO
      const displayName = p.promotor;

      pRow.innerHTML =
        `<td class="name-col">${displayName}</td>` +
        `<td>${p.cartera.toLocaleString('es-AR')}</td>` +
        `<td>${p.ccc.toLocaleString('es-AR')}</td>` +
        `<td>${p.cnc.toLocaleString('es-AR')}</td>` +
        `<td class="progress-cell"><span>${p.avance.toFixed(2)}%</span><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(p.avance,100)}%; background:${avanceStyle(p.avance)};"></div></div></td>` +
        `<td${classMA}>${p.cccMA || ''}</td>` +
        `<td${classAA}>${p.cccMMAA || ''}</td>` +
        `<td class="col-nuevos">${p.nuevos || ''}</td>` +
        `<td>${p.media.toLocaleString('es-AR')}</td>`;
      tbody.appendChild(pRow);
    }

    jCartera += sCartera; jCCC += sCCC; jCNC += sCNC;
    jMA += sMA; jAA += sAA;
  }

  // --- JDV total row ---
  const jAvance = jCartera > 0 ? (jCCC / jCartera * 100) : 0;
  const jMedia  = dias > 0 ? Math.round(jCNC / dias) : jCNC;
  jNuevos = jNuevosSet.size;

  const jRow = document.createElement('tr');
  jRow.className = 'grand-row';
  jRow.innerHTML =
    `<td class="name-col">JDV</td>` +
    `<td>${jCartera.toLocaleString('es-AR')}</td>` +
    `<td>${jCCC.toLocaleString('es-AR')}</td>` +
    `<td>${jCNC.toLocaleString('es-AR')}</td>` +
    `<td class="progress-cell"><span>${jAvance.toFixed(2)}%</span><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(jAvance,100)}%; background:${avanceStyle(jAvance)};"></div></div></td>` +
    `<td>${jMA || ''}</td>` +
    `<td>${jAA || ''}</td>` +
    `<td class="col-nuevos">${jNuevos || ''}</td>` +
    `<td>${jMedia.toLocaleString('es-AR')}</td>`;
  tbody.appendChild(jRow);

  // Show table
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tableWrap').style.display = 'flex';
}

// ==========================================
// UI HELPERS
// ==========================================
function updateStatus(src, state, detail) {
  const dot  = document.getElementById('status' + cap(src));
  const text = document.getElementById('status' + cap(src) + 'Text');
  if (!dot || !text) return;

  dot.className = 'status-dot ' + state;
  const labels = { maestro: 'MAESTRO', mesas: 'MESAS', ventas: 'AVANCE', historicos: 'HISTÓRICOS' };
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
// MONTH CHANGE HANDLER
// ==========================================
monthSelect.addEventListener('change', async () => {
  // Reset ventas data to re-fetch for the selected month
  ventasData = null;
  document.getElementById('tableWrap').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
  
  updateStatus('ventas', 'pending');
  
  await loadAvance(getSelectedMonth());
});

// ==========================================
// REFRESH MANUAL  (fuerza datos frescos, ignora caché)
// ==========================================
async function refreshAll() {
  const btn = document.getElementById('btnRefresh');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('spinning');
  }

  // Reset de estado para que tryRender() no pinte con datos viejos mezclados
  maestroData = null;
  ventasData = null;
  mesasData = null;
  historicosData = null;
  document.getElementById('tableWrap').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';

  updateStatus('maestro', 'pending');
  updateStatus('mesas', 'pending');
  updateStatus('ventas', 'pending');
  updateStatus('historicos', 'pending');

  try {
    await Promise.all([
      loadMesas(),
      loadMaestro(true),   // forceRefresh=true → saltea el caché de 2hs del Maestro
      loadAvance()         // ya trae datos en vivo (sin caché) desde el Planificador
    ]);
    showToast('✅ Datos actualizados al instante');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('spinning');
    }
  }
}

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  populateMonthSelector();
  
  loadMesas();
  loadMaestro();
  loadAvance();

  const btn = document.getElementById('btnRefresh');
  if (btn) btn.addEventListener('click', refreshAll);

  const btnCopy = document.getElementById('btn-copy-img');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const orig = btnCopy.innerHTML;
      btnCopy.innerHTML = '⏳ Capturando...';
      btnCopy.disabled = true;
      try {
        const toolbar = document.querySelector('.hdr');
        let toolbarWasVisible = false;
        if (toolbar) {
          toolbarWasVisible = toolbar.style.display !== 'none';
          toolbar.style.display = 'none';
        }
        await new Promise(r => setTimeout(r, 80));

        const captureEl = document.querySelector('.table-wrap');
        const origOverflow = captureEl.style.overflow;
        const origMaxHeight = captureEl.style.maxHeight;
        captureEl.style.overflow = 'visible';
        captureEl.style.maxHeight = 'none';

        const canvas = await html2canvas(captureEl, {
          backgroundColor: null,
          scale: 2,
          logging: false,
          useCORS: true
        });

        captureEl.style.overflow = origOverflow;
        captureEl.style.maxHeight = origMaxHeight;

        if (toolbar && toolbarWasVisible) {
          toolbar.style.display = '';
        }

        canvas.toBlob(async (blob) => {
          try {
            const dateStr = new Date().toLocaleDateString('es-AR');
            const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const titleText = `COBERTURA CVZA · ${dateStr} · ${timeStr}`;
            const textBlob = new Blob([titleText], { type: 'text/plain' });
            
            await navigator.clipboard.write([
              new ClipboardItem({
                [blob.type]: blob,
                'text/plain': textBlob
              })
            ]);
            btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';
          } catch (err) {
            const link = document.createElement('a');
            link.download = `Cobertura_CVZA.png`;
            link.href = canvas.toDataURL();
            link.click();
            btnCopy.innerHTML = '<i class="fa-solid fa-download"></i> ¡Descargado!';
          }
          
          setTimeout(() => {
            btnCopy.innerHTML = orig;
            btnCopy.disabled = false;
          }, 2000);
        }, "image/png");
      } catch (e) {
        console.error(e);
        btnCopy.innerHTML = '<i class="fa-solid fa-xmark"></i> Error';
        setTimeout(() => {
          btnCopy.innerHTML = orig;
          btnCopy.disabled = false;
        }, 2000);
      }
    });
  }
});
