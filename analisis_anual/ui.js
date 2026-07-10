document.getElementById('folder-input').addEventListener('change', e => {
  const files = [...e.target.files].filter(f => f.name.toLowerCase().endsWith('.csv'));
  if (!files.length) return;
  const el = document.getElementById('s25');
  el.textContent = 'Cargando…'; el.className = 'fst pend';
  let loaded = 0;
  let totalRows = 0;
  files.forEach(file => {
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const rows = parseCSV(ev.target.result);
        if (rows.length) {
          const yr = rows[0]?.yr;
          DATA = DATA.filter(r => r.yr !== yr).concat(rows);
          totalRows += rows.length;
        }
      } catch(err) { console.error('Error en', file.name, err); }
      loaded++;
      if (loaded === files.length) {
        const years = [...new Set(DATA.map(r=>r.yr))].sort().join(' · ');
        el.textContent = '✓ ' + years + ' · ' + totalRows.toLocaleString() + ' filas';
        el.className = 'fst ok';
        renderAll();
      }
    };
    rd.readAsText(file, 'utf-16');
  });
});

// ═══════════════════════════════════════════════════════════════
// PAGE TABS
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.ptab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const pg = btn.dataset.page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('pg'+pg).classList.add('active');
    renderPage(+pg);
  });
});

// ═══════════════════════════════════════════════════════════════
// UN DROPDOWNS
// ═══════════════════════════════════════════════════════════════
function mkUN(pg) {
  let btn = document.getElementById('un-btn'+pg);
  if (!btn || btn.dataset.init) return;
  btn.dataset.init = '1';
  const dd = document.getElementById('un-dd'+pg);
  const lbl = document.getElementById('un-lbl'+pg);
  dd.innerHTML = '';
  UN_LIST.forEach(un => {
    const o = document.createElement('div');
    o.className = 'un-opt' + (un.key === ST[pg].un ? ' sel' : '');
    o.dataset.key = un.key;
    o.innerHTML = `<span class="un-dot" style="background:${un.color}"></span>${un.label}`;
    o.addEventListener('click', () => {
      ST[pg].un = un.key;
      lbl.textContent = un.label;
      dd.querySelectorAll('.un-opt').forEach(x => x.classList.toggle('sel', x.dataset.key === un.key));
      dd.classList.remove('open'); btn.classList.remove('open');
      renderPage(pg);
    });
    dd.appendChild(o);
  });
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = dd.classList.toggle('open');
    btn.classList.toggle('open', open);
    // close others
    [1,2,3,6].filter(x=>x!==pg).forEach(x=>{
      document.getElementById('un-dd'+x)?.classList.remove('open');
      document.getElementById('un-btn'+x)?.classList.remove('open');
    });
  });
}
document.addEventListener('click', () => {
  document.querySelectorAll('.un-dd').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.un-btn').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.promo-panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.sdv-btn').forEach(b => b.classList.remove('open'));
});

// ═══════════════════════════════════════════════════════════════
// SDV DROPDOWNS WITH PROMOTER CHECKBOXES
// ═══════════════════════════════════════════════════════════════
function mkSDV(pg) {
  const container = document.getElementById('sdv'+pg);
  if (!container) return;
  container.innerHTML = '';
  let totBtn = document.getElementById('tot'+pg);
  if (totBtn) {
    const newTotBtn = totBtn.cloneNode(true);
    totBtn.parentNode.replaceChild(newTotBtn, totBtn);
    totBtn = newTotBtn;
  }

  function getState(seg) {
    const active = seg.promos.filter(p => ST[pg].activePromos.has(seg.key+'|'+p));
    if (active.length === 0) return 'none';
    if (active.length === seg.promos.length) return 'all';
    return 'partial';
  }

  function updateTotBtn() {
    const allOn = SEGS.every(seg => seg.promos.every(p => ST[pg].activePromos.has(seg.key+'|'+p)));
    const anyOn = SEGS.some(seg => seg.promos.some(p => ST[pg].activePromos.has(seg.key+'|'+p)));
    totBtn.textContent = allOn ? 'TODOS' : (anyOn ? 'TODOS' : 'SELECCIONAR');
    totBtn.classList.toggle('all', allOn);
  }

  SEGS.forEach(seg => {
    const wrap  = document.createElement('div');
    wrap.className = 'sdv-wrap';

    const btn   = document.createElement('button');
    btn.className = 'sdv-btn all';
    btn.innerHTML = seg.label + ' <span class="chv">▼</span>';
    wrap.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'promo-panel';

    // Header = select all for this supervisor
    const hdr = document.createElement('div');
    hdr.className = 'promo-hdr';
    const hdrCb = document.createElement('input');
    hdrCb.type = 'checkbox'; hdrCb.checked = true;
    hdrCb.addEventListener('click', e => e.stopPropagation());
    hdrCb.addEventListener('change', () => {
      seg.promos.forEach(p => {
        if (hdrCb.checked) ST[pg].activePromos.add(seg.key+'|'+p);
        else ST[pg].activePromos.delete(seg.key+'|'+p);
      });
      panel.querySelectorAll('input[data-promo]').forEach(cb => cb.checked = hdrCb.checked);
      updateBtnState();
      updateTotBtn();
      renderPage(pg);
    });
    hdr.appendChild(hdrCb);
    hdr.appendChild(document.createTextNode(' ' + seg.label));
    panel.appendChild(hdr);

    // Individual promoters
    seg.promos.forEach(p => {
      const item = document.createElement('div');
      item.className = 'promo-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.dataset.promo = p;
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (cb.checked) ST[pg].activePromos.add(seg.key+'|'+p);
        else ST[pg].activePromos.delete(seg.key+'|'+p);
        // sync header checkbox
        const actCount = seg.promos.filter(pp => ST[pg].activePromos.has(seg.key+'|'+pp)).length;
        hdrCb.checked = actCount === seg.promos.length;
        hdrCb.indeterminate = actCount > 0 && actCount < seg.promos.length;
        updateBtnState();
        updateTotBtn();
        renderPage(pg);
      });
      const name = p.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
      item.appendChild(cb);
      item.appendChild(document.createTextNode(' ' + name));
      panel.appendChild(item);
    });

    wrap.appendChild(panel);

    // Toggle all items on btn click
    btn.addEventListener('click', e => {
      e.stopPropagation();
      hdrCb.click();
    });

    function updateBtnState() {
      const st = getState(seg);
      btn.classList.toggle('all',     st === 'all');
      btn.classList.toggle('partial', st === 'partial');
      btn.classList.toggle('none',    st === 'none');
    }

    container.appendChild(wrap);
  });

    // TODOS / LIMPIAR button
    totBtn.addEventListener('click', () => {
      const allOn = SEGS.every(seg => seg.promos.every(p => ST[pg].activePromos.has(seg.key+'|'+p)));
      SEGS.forEach(seg => {
        seg.promos.forEach(p => {
          if (allOn) ST[pg].activePromos.delete(seg.key+'|'+p);
          else       ST[pg].activePromos.add(seg.key+'|'+p);
        });
      });
      // sync all checkboxes
      container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = !allOn);
      container.querySelectorAll('.sdv-btn').forEach(b => {
        b.classList.toggle('all', !allOn);
        b.classList.toggle('partial', false);
        b.classList.toggle('none', allOn);
      });
      updateTotBtn();
      renderPage(pg);
    });
  }
[1,2,3].forEach(pg => mkSDV(pg));

// ═══════════════════════════════════════════════════════════════
// FRECUENCIA (page 2) — dropdown estilo SDV, multi-selección
// Claves = valor exacto normalizado de "Días Visita" en el CSV (comas o espacios)
// ═══════════════════════════════════════════════════════════════
const FREQ_LIST = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'LU', label: 'LU' },
  { key: 'LU,JU', label: 'LU · JU' },
  { key: 'JU', label: 'JU' },
  { key: 'MA', label: 'MA' },
  { key: 'MA,VI', label: 'MA · VI' },
  { key: 'VI', label: 'VI' },
  { key: 'MI', label: 'MI' },
  { key: 'MI,SA', label: 'MI · SA' },
  { key: 'SA', label: 'SA' },
];

const FREQ_GROUPS = [
  { id: 'luju', anchor: 'LU · JU', keys: ['LU', 'LU,JU', 'JU'] },
  { id: 'mavi', anchor: 'MA · VI', keys: ['MA', 'MA,VI', 'VI'] },
  { id: 'misa', anchor: 'MI · SA', keys: ['MI', 'MI,SA', 'SA'] },
];

function normDias(s) {
  if (!s) return '';
  return String(s).split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).join(',').toUpperCase();
}

function freqLabelForKey(key) {
  if (key === 'TODOS') return 'Todos';
  const row = FREQ_LIST.find(x => x.key !== 'TODOS' && normDias(x.key) === normDias(key));
  return row ? row.label : key.replace(/,/g, ' · ');
}

function getAllFreqKeysNorm() {
  return FREQ_LIST.filter(x => x.key !== 'TODOS').map(x => normDias(x.key));
}

function freqHasAllDataMode(fs) {
  return !!fs && fs.has('TODOS');
}

function isFullFreqSelection(fs) {
  if (!fs || fs.has('TODOS')) return false;
  const all = getAllFreqKeysNorm();
  if (fs.size !== all.length) return false;
  return all.every(k => fs.has(k));
}

function syncFreqUI() {
  const fs = ST[2].freqSel;
  const hasAllData = freqHasAllDataMode(fs);
  const full = hasAllData || isFullFreqSelection(fs);
  const none = !fs || fs.size === 0;
  const todosBtn = document.getElementById('freq-todos-btn');
  if (todosBtn) {
    todosBtn.textContent = full ? 'TODOS' : 'SELECCIONAR';
    todosBtn.classList.toggle('all', full);
  }

  document.querySelectorAll('#freq-anchors input[data-freq]').forEach(cb => {
    const nk = normDias(cb.dataset.freq);
    cb.checked = full || (fs && fs.has(nk));
  });

  FREQ_GROUPS.forEach(g => {
    const btn = document.querySelector(`#freq-anchors [data-freq-group="${g.id}"]`);
    if (!btn) return;
    if (full) {
      btn.classList.remove('partial', 'none');
      btn.classList.add('all');
      return;
    }
    if (none) {
      btn.classList.remove('all', 'partial');
      btn.classList.add('none');
      return;
    }
    const nk = g.keys.map(k => normDias(k));
    const c = nk.filter(k => fs.has(k)).length;
    btn.classList.remove('all', 'partial', 'none');
    btn.classList.add(c === 0 ? 'none' : (c === nk.length ? 'all' : 'partial'));
  });
}

function makeFreqExtra() {
  const fs = ST[2].freqSel;
  if (freqHasAllDataMode(fs)) return null;
  if (!fs || fs.size === 0) return () => false;
  const keys = new Set([...fs].map(normDias));
  return r => {
    const nd = normDias(r.dias);
    return nd && keys.has(nd);
  };
}

(function initFreqUI() {
  const host = document.getElementById('freq-anchors');
  const todosBtn = document.getElementById('freq-todos-btn');
  if (!host || !todosBtn) return;

  FREQ_GROUPS.forEach(g => {
    const wrap = document.createElement('div');
    wrap.className = 'sdv-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sdv-btn all';
    btn.dataset.freqGroup = g.id;
    btn.innerHTML = g.anchor + ' <span class="chv">▼</span>';

    const panel = document.createElement('div');
    panel.className = 'promo-panel';
    panel.id = 'freq-panel-' + g.id;

    const hdr = document.createElement('div');
    hdr.className = 'promo-hdr freq-hdr';
    hdr.textContent = g.anchor + ' · frecuencias';
    panel.appendChild(hdr);

    g.keys.forEach(keyRaw => {
      const meta = FREQ_LIST.find(x => x.key === keyRaw);
      const label = meta ? meta.label : keyRaw;
      const lab = document.createElement('label');
      lab.className = 'promo-item freq-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.freq = keyRaw;
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (!ST[2].freqSel) ST[2].freqSel = new Set(['TODOS']);
        const fs = ST[2].freqSel;
        if (fs.has('TODOS')) {
          fs.delete('TODOS');
          getAllFreqKeysNorm().forEach(k => fs.add(k));
        }
        const nk = normDias(keyRaw);
        if (cb.checked) fs.add(nk);
        else fs.delete(nk);
        syncFreqUI();
        renderPage(2);
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' ' + label));
      panel.appendChild(lab);
    });

    btn.addEventListener('click', e => {
      e.stopPropagation();
      // Si todos en este grupo están seleccionados, los deseleccionamos. Si no, los seleccionamos todos.
      if (!ST[2].freqSel) ST[2].freqSel = new Set(['TODOS']);
      const fs = ST[2].freqSel;
      if (fs.has('TODOS')) {
        fs.delete('TODOS');
        getAllFreqKeysNorm().forEach(k => fs.add(k));
      }
      const actCount = g.keys.filter(k => fs.has(normDias(k))).length;
      const turnOn = actCount < g.keys.length;
      g.keys.forEach(k => {
        const nk = normDias(k);
        if (turnOn) fs.add(nk); else fs.delete(nk);
      });
      syncFreqUI();
      renderPage(2);
    });

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    host.appendChild(wrap);
  });

  todosBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!ST[2].freqSel) ST[2].freqSel = new Set(['TODOS']);
    const fs = ST[2].freqSel;
    const allOn = freqHasAllDataMode(fs) || isFullFreqSelection(fs);
    if (allOn) {
      fs.clear();
    } else {
      fs.clear();
      getAllFreqKeysNorm().forEach(k => fs.add(k));
    }
    syncFreqUI();
    renderPage(2);
  });

  syncFreqUI();
})();

// ═══════════════════════════════════════════════════════════════
// CANAL TABS (page 3)
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('#canal-tabs .ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#canal-tabs .ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ST[3].canal = btn.dataset.canal;
    renderPage(3);
  });
});

// KPI HELPER
// ═══════════════════════════════════════════════════════════════
function setKPI(id, label, val, d, sfx='', dec=0, sub='') {
  const el = document.getElementById(id);
  if (!el) return;
  const isNull = d === null;
  const sign = !isNull && d >= 0 ? '+' : '';
  const cls  = !isNull && d >= 0 ? 'up' : 'dn';
  el.innerHTML =
    `<div class="kpi-lbl">${label}</div>` +
    `<div class="kpi-val">${fmtN(val,dec)}${sfx}</div>` +
    (sub ? `<div class="kpi-d" style="color:var(--muted)">${sub}</div>` :
     !isNull ? `<div class="kpi-d ${cls}">${sign}${d.toFixed(1)}% vs AA</div>` : '');
}

// ═══════════════════════════════════════════════════════════════
// SHOW / HIDE
// ═══════════════════════════════════════════════════════════════
function showPage(pg, hasData, hasSel) {
  const show = hasData && hasSel;
  document.getElementById('up'+pg).style.display  = show ? 'none' : 'flex';
  document.getElementById('kpi'+pg).style.display = show ? 'flex' : 'none';
  const body = document.getElementById('body'+pg);
  if (body) body.style.display = show ? (pg===2?'flex':pg===1||pg===3?'flex':'none') : 'none';
}

// ═══════════════════════════════════════════════════════════════
// RENDER PAGE 1: MENSUAL
// ═══════════════════════════════════════════════════════════════
function render1() {
  const hasData = DATA.length > 0;
  const hasSel  = ST[1].activePromos.size > 0;
  showPage(1, hasData, hasSel);
  if (!hasData || !hasSel) return;

  const col = unColor(1), vl = volLbl(1);
  ['ld1a','ld1b','ld1c'].forEach(id => { const e=document.getElementById(id); if(e) e.style.background=col; });
  document.getElementById('t1-hl').textContent    = `Volumen ${vl}`;
  document.getElementById('t1-ytd-hl').textContent = `${vl} · YTD vs LYTD`;
  document.getElementById('t1-comp-hl').textContent= `${vl} · Comparativa`;

  const s25 = summarizeRows(getRows(2025, 1), r => volOf(r, 1));
  const s26 = summarizeRows(getRows(2026, 1), r => volOf(r, 1));
  const d25v = s25.vol, d26v = s26.vol;
  const d25c = s25.ccc, d26c = s26.ccc;
  const d25b = s25.bd,  d26b = s26.bd;
  const m26  = MESES.filter(m => d26v[m]>0 || d26c[m]>0);
  const last = lastMes(d26v, d26c);
  const prev = MESES[MESES.indexOf(last)-1] || null;
  const sku26= d26c[last] ? d26b[last]/d26c[last] : 0;
  const sku25= d25c[last] ? d25b[last]/d25c[last] : 0;
  setKPI('k1-0', `${vl} ${last}`,   d26v[last], pct(d26v[last],d25v[last]), ' '+vl);
  setKPI('k1-1', `CCC ${last}`,     d26c[last], pct(d26c[last],d25c[last]));
  setKPI('k1-2', `SKU/PDV ${last}`, sku26,      pct(sku26,sku25), '', 2);
  setKPI('k1-3', `TBD ${last}`,     d26b[last], pct(d26b[last],d25b[last]));

  makeMonthly('c1-hl',  d25v, d26v, col);
  makeMonthly('c1-ccc', d25c, d26c, col);
  makeMonthly('c1-bd',  d25b, d26b, col);
  makeYTD('c1-ytd-hl', d25v, d26v, m26, col);
  makeCNC('c1-cnc',    d26c, m26, col, 1);
  makeYTD('c1-ytd-bd', d25b, d26b, m26, col);
  makeComp('c1-comp-hl',  d26v, d25v, last, prev, col);
  makeComp('c1-comp-ccc', d26c, d25c, last, prev, col);
  makeComp('c1-comp-bd',  d26b, d25b, last, prev, col);
}

// ═══════════════════════════════════════════════════════════════
// RENDER PAGE 2: DÍAS DE VISITA
// ═══════════════════════════════════════════════════════════════
function render2() {
  const hasData = DATA.length > 0;
  const hasSel  = ST[2].activePromos.size > 0;
  showPage(2, hasData, hasSel);
  syncFreqUI();
  if (!hasData || !hasSel) return;

  const col  = unColor(2), vl = volLbl(2);
  const fs = ST[2].freqSel;
  const hasAllData = freqHasAllDataMode(fs);
  const fullList = isFullFreqSelection(fs);
  const extra = makeFreqExtra();
  const fLbl = hasAllData
    ? 'Todos los días'
    : fullList
      ? 'Todas las frecuencias (lista completa)'
      : (fs && fs.size ? [...fs].filter(k => k !== 'TODOS').map(freqLabelForKey).join(' · ') : 'Sin selección');

  ['ld2a','ld2b','ld2c'].forEach(id => { const e=document.getElementById(id); if(e) e.style.background=col; });
  document.getElementById('t2-hl').textContent  = `Volumen ${vl} · Frecuencia: ${fLbl}`;
  document.getElementById('t2-ccc').textContent = `CCC · Frecuencia: ${fLbl}`;

  const rows25 = getRows(2025, 2, extra);
  const rows26 = getRows(2026, 2, extra);
  const s25 = summarizeRows(rows25, r => volOf(r, 2));
  const s26 = summarizeRows(rows26, r => volOf(r, 2));
  const d25v = s25.vol, d26v = s26.vol;
  const d25c = s25.ccc, d26c = s26.ccc;
  const d25b = s25.bd,  d26b = s26.bd;
  const m26  = MESES.filter(m => d26v[m]>0 || d26c[m]>0);
  const last = lastMes(d26v, d26c);
  const sku26= d26c[last] ? d26b[last]/d26c[last] : 0;
  const sku25= d25c[last] ? d25b[last]/d25c[last] : 0;
  const ytd26= m26.reduce((a,m)=>a+(d26v[m]||0),0);
  const ytd25= m26.reduce((a,m)=>a+(d25v[m]||0),0);

  // Best day by volume in last month
  const DIAS_ALL = ['LU','MA','MI','JU','VI','SA'];
  const DIAS_NOM = {LU:'Lunes',MA:'Martes',MI:'Miércoles',JU:'Jueves',VI:'Viernes',SA:'Sábado'};
  const volByDia = {};
  DIAS_ALL.forEach(d => volByDia[d] = 0);
  rows26.filter(r => r.mes === last).forEach(r => {
    if (!r.dias) return;
    r.dias.split(',').map(x => x.trim()).forEach(d => { if (d in volByDia) volByDia[d] += volOf(r,2); });
  });
  const bestD   = DIAS_ALL.reduce((a,d) => volByDia[d]>volByDia[a]?d:a, 'LU');
  const bestVol = Math.round(volByDia[bestD]);

  setKPI('k2-0', `${vl} YTD`,        ytd26, pct(ytd26,ytd25), ' '+vl);
  setKPI('k2-1', `CCC ${last}`,       d26c[last], pct(d26c[last],d25c[last]));
  setKPI('k2-2', `SKU/PDV ${last}`,   sku26, pct(sku26,sku25), '', 2);
  setKPI('k2-3', `TBD ${last}`,       d26b[last], pct(d26b[last],d25b[last]));
  setKPI('k2-4', `Mejor día ${last}`, bestVol, null, ' '+vl, 0, DIAS_NOM[bestD]||bestD);

  makeMonthly('c2-hl',  d25v, d26v, col);
  makeMonthly('c2-ccc', d25c, d26c, col);
  makeMonthly('c2-bd',  d25b, d26b, col);
}

// ═══════════════════════════════════════════════════════════════
// RENDER PAGE 3: CANAL
// ═══════════════════════════════════════════════════════════════
function render3() {
  const hasData = DATA.length > 0;
  const hasSel  = ST[3].activePromos.size > 0;
  showPage(3, hasData, hasSel);
  if (!hasData || !hasSel) return;

  const col   = unColor(3), vl = volLbl(3);
  const canal = ST[3].canal;
  const extra = r => canalFilter(r, canal);
  const cLbl  = {TODOS:'Todos',KT:'K+T',AS:'AS',KTAS:'K+T/AS',REF:'REF',KTREF:'K+T/REF',MAYO_C:'MAYO'}[canal]||canal;

  ['ld3a','ld3b','ld3c'].forEach(id => { const e=document.getElementById(id); if(e) e.style.background=col; });
  document.getElementById('t3-hl').textContent     = `Volumen ${vl} · Canal: ${cLbl}`;
  document.getElementById('t3-ytd-hl').textContent  = `${vl} · YTD vs LYTD`;
  document.getElementById('t3-comp-hl').textContent = `${vl} · Comparativa`;

  const s25 = summarizeRows(getRows(2025, 3, extra), r => volOf(r, 3));
  const s26 = summarizeRows(getRows(2026, 3, extra), r => volOf(r, 3));
  const d25v = s25.vol, d26v = s26.vol;
  const d25c = s25.ccc, d26c = s26.ccc;
  const d25b = s25.bd,  d26b = s26.bd;
  const m26  = MESES.filter(m => d26v[m]>0 || d26c[m]>0);
  const last = lastMes(d26v, d26c);
  const prev = MESES[MESES.indexOf(last)-1] || null;
  const sku26= d26c[last] ? d26b[last]/d26c[last] : 0;
  const sku25= d25c[last] ? d25b[last]/d25c[last] : 0;
  const ytd26= m26.reduce((a,m)=>a+(d26v[m]||0),0);
  const ytd25= m26.reduce((a,m)=>a+(d25v[m]||0),0);
  setKPI('k3-0', `${vl} YTD`,       ytd26, pct(ytd26,ytd25), ' '+vl);
  setKPI('k3-1', `CCC ${last}`,      d26c[last], pct(d26c[last],d25c[last]));
  setKPI('k3-2', `SKU/PDV ${last}`,  sku26, pct(sku26,sku25), '', 2);
  setKPI('k3-3', `TBD ${last}`,      d26b[last], pct(d26b[last],d25b[last]));

  makeMonthly('c3-hl',  d25v, d26v, col);
  makeMonthly('c3-ccc', d25c, d26c, col);
  makeMonthly('c3-bd',  d25b, d26b, col);
  makeYTD('c3-ytd-hl', d25v, d26v, m26, col);
  makeCNC('c3-cnc',    d26c, m26, col, 3);
  makeYTD('c3-ytd-bd', d25b, d26b, m26, col);
  makeComp('c3-comp-hl',  d26v, d25v, last, prev, col);
  makeComp('c3-comp-ccc', d26c, d25c, last, prev, col);
  makeComp('c3-comp-bd',  d26b, d25b, last, prev, col);
}

function renderPage(pg) {
  const fns = [render1,render2,render3,render4,render5,render6,() => renderCRM(), () => render8()];
  if (pg <= fns.length && fns[pg-1]) fns[pg-1]();
}
function renderAll() { render1(); render2(); render3(); if(ST[4]) render4(); if(ST[5]) render5(); if(ST[6]) render6(); buildCRMIndex(); if(CRM_CLI) renderCRM(); if(ST[8]) render8(); }

// ═══════════════════════════════════════════════════════════════
// PAGE 4: CERVEZAS
// ═══════════════════════════════════════════════════════════════

// State
ST[4] = { un:'CERVEZAS CMQ', activePromos: initActivePromos(), calSel: new Set(), marcaSel: new Set() };

// SDV for page 4
mkSDV(4);

// Calibre dropdown (multi-select)
const CAL_LIST = [
  '473 CC LATAS','710 CC LATAS','1000 CC VIDRIO','330 CC S/R',
  'BOTELLA 710 CC','975 CC VIDRIO','340 CC','330 CC VIDRIO',
  '730 CC','BOT VD 275 CC','BOT VD 355'
];

(function initCalUI() {
  CAL_LIST.forEach(c => ST[4].calSel.add(c));
  const btn  = document.getElementById('cal-drop-btn');
  const panel = document.getElementById('cal-panel');
  const hdrAll = document.getElementById('cal-hdr-all');

  function getCalState() {
    if (ST[4].calSel.size === CAL_LIST.length) return 'all';
    if (ST[4].calSel.size === 0) return 'none';
    return 'partial';
  }

  function updateBtn() {
    const st = getCalState();
    btn.classList.toggle('all',     st === 'all');
    btn.classList.toggle('partial', st === 'partial');
    btn.classList.toggle('none',    st === 'none');
    if (st === 'all') {
      btn.innerHTML = 'Calibres <span class="chv">▼</span>';
    } else if (st === 'none') {
      btn.innerHTML = 'Calibres (0) <span class="chv">▼</span>';
    } else {
      btn.innerHTML = 'Calibres (' + ST[4].calSel.size + ') <span class="chv">▼</span>';
    }
  }

  function syncHdr() {
    const allOn  = ST[4].calSel.size === CAL_LIST.length;
    const partial = ST[4].calSel.size > 0 && ST[4].calSel.size < CAL_LIST.length;
    hdrAll.innerHTML = '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = allOn; cb.indeterminate = partial;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      ST[4].calSel.clear();
      if (cb.checked) CAL_LIST.forEach(c => ST[4].calSel.add(c));
      panel.querySelectorAll('input[data-cal]').forEach(c => c.checked = cb.checked);
      syncHdr(); updateBtn(); render4();
    });
    hdrAll.appendChild(cb);
    hdrAll.appendChild(document.createTextNode(' Todos los calibres'));
    panel.querySelectorAll('input[data-cal]').forEach(c => {
      c.checked = ST[4].calSel.has(c.dataset.cal);
    });
  }

  CAL_LIST.forEach(cal => {
    const item = document.createElement('label');
    item.className = 'promo-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.cal = cal; cb.checked = true;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) ST[4].calSel.add(cal);
      else            ST[4].calSel.delete(cal);
      syncHdr(); updateBtn(); render4();
    });
    item.appendChild(cb);
    item.appendChild(document.createTextNode(' ' + cal));
    panel.appendChild(item);
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const cbAll = panel.querySelector('input[type=checkbox]');
    if (cbAll) cbAll.click();
  });

  syncHdr(); updateBtn();
})();

// Marca dropdown (multi-select)
const MARCA_LIST = [
  {key:'BRAHMA',    label:'Brahma'},
  {key:'QUILMES',   label:'Quilmes'},
  {key:'BUDWEISER', label:'Budweiser'},
  {key:'1890',      label:'1890'},
  {key:'ANDES',     label:'Andes'},
  {key:'MICHELOB',  label:'Michelob'},
  {key:'STELLA',    label:'Stella Artois'},
  {key:'CORONA',    label:'Corona'},
  {key:'PATAGONIA', label:'Patagonia'},
];

(function initMarcaUI() {
  MARCA_LIST.forEach(m => ST[4].marcaSel.add(m.key));
  const btn   = document.getElementById('marca-drop-btn');
  const panel = document.getElementById('marca-panel');
  const hdrAll = document.getElementById('marca-hdr-all');

  function getMarcaState() {
    if (ST[4].marcaSel.size === MARCA_LIST.length) return 'all';
    if (ST[4].marcaSel.size === 0) return 'none';
    return 'partial';
  }

  function updateBtn() {
    const st = getMarcaState();
    btn.classList.toggle('all',     st === 'all');
    btn.classList.toggle('partial', st === 'partial');
    btn.classList.toggle('none',    st === 'none');
    if (st === 'all')  btn.innerHTML = 'Marcas <span class="chv">▼</span>';
    else if (st === 'none') btn.innerHTML = 'Marcas (0) <span class="chv">▼</span>';
    else btn.innerHTML = 'Marcas (' + ST[4].marcaSel.size + ') <span class="chv">▼</span>';
  }

  function syncHdr() {
    const allOn  = ST[4].marcaSel.size === MARCA_LIST.length;
    const partial = ST[4].marcaSel.size > 0 && ST[4].marcaSel.size < MARCA_LIST.length;
    hdrAll.innerHTML = '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = allOn; cb.indeterminate = partial;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      ST[4].marcaSel.clear();
      if (cb.checked) MARCA_LIST.forEach(m => ST[4].marcaSel.add(m.key));
      panel.querySelectorAll('input[data-marca]').forEach(c => c.checked = cb.checked);
      syncHdr(); updateBtn(); render4();
    });
    hdrAll.appendChild(cb);
    hdrAll.appendChild(document.createTextNode(' Todas las marcas'));
    panel.querySelectorAll('input[data-marca]').forEach(c => {
      c.checked = ST[4].marcaSel.has(c.dataset.marca);
    });
  }

  MARCA_LIST.forEach(({key, label}) => {
    const item = document.createElement('label');
    item.className = 'promo-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.marca = key; cb.checked = true;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) ST[4].marcaSel.add(key);
      else            ST[4].marcaSel.delete(key);
      syncHdr(); updateBtn(); render4();
    });
    item.appendChild(cb);
    item.appendChild(document.createTextNode(' ' + label));
    panel.appendChild(item);
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const cbAll = panel.querySelector('input[type=checkbox]');
    if (cbAll) cbAll.click();
  });

  syncHdr(); updateBtn();
})();

// Brand detection
const EXCLUIR = ['BOT 1/1 ARACELI','BOT 1/3','BOTSA','ENVASE RET BARRIL','Q  SA','Q CERVEZAS','Q PLAS'];
function getMarca(prod) {
  if (!prod) return null;
  if (EXCLUIR.some(e => prod.startsWith(e))) return null;
  if (prod.startsWith('QUILMES 1890')) return '1890';
  if (prod.startsWith('QUILMES'))      return 'QUILMES';
  if (prod.startsWith('BRAHMA'))       return 'BRAHMA';
  if (prod.startsWith('BUD'))          return 'BUDWEISER';
  if (prod.startsWith('CORONA'))       return 'CORONA';
  if (prod.startsWith('MICHELOB'))     return 'MICHELOB';
  if (prod.startsWith('PATAGONIA'))    return 'PATAGONIA';
  if (prod.startsWith('STELLA'))       return 'STELLA';
  if (prod.startsWith('ANDES'))        return 'ANDES';
  return null;
}

function getCalibre(cal) {
  if (!cal) return null;
  if (cal.includes('1000') || cal.includes('975') || cal === '1L') return '1L';
  if (cal.includes('710'))  return '710';
  if (cal.includes('473'))  return '473';
  if (cal.includes('330'))  return '330';
  if (cal.includes('340'))  return '340';
  if (cal.includes('730'))  return '730';
  if (cal.includes('BARRIL') || cal.includes('20L') || cal.includes('50')) return 'BARRIL';
  if (cal.includes('275') || cal.includes('355')) return '330'; // group small bottles
  return null;
}

// Segment maps
const SEG_CV = new Set(['BRAHMA','QUILMES','BUDWEISER','1890']);
const SEG_AC = new Set(['ANDES','MICHELOB','STELLA','CORONA','PATAGONIA']);

function isBC(r) {
  const m = getMarca(r.prod2);
  if (m === 'MICHELOB') return true;
  if (r.prod2 && (r.prod2.includes('0.0%') || r.prod2.includes('0.0 '))) return true;
  return false;
}

// Colors per brand
function getBCLabel(r) {
  const m = getMarca(r.prod2);
  if (m === 'MICHELOB') return 'Michelob';
  if (r.prod2 && (r.prod2.includes('0.0%') || r.prod2.includes('0.0 '))) {
    const labels = {'CORONA':'Corona 0.0','QUILMES':'Quilmes 0.0','STELLA':'Stella 0.0','ANDES':'Andes 0.0','BUDWEISER':'Bud 0.0'};
    return labels[m] || (m + ' 0.0');
  }
  return m;
}

const BC_COLORS = {
  'Michelob':   '#6366f1',
  'Corona 0.0': '#fb923c',
  'Quilmes 0.0':'#94a3b8',
  'Stella 0.0': '#34d399',
  'Andes 0.0':  '#a16207',
  'Bud 0.0':    '#fcd34d'
};

const BRAND_COLORS = {
  'BRAHMA':  '#3b82f6',   // azul medio
  'QUILMES': '#94a3b8',   // gris azulado
  'BUDWEISER':'#f59e0b',  // ámbar
  '1890':    '#fcd34d',   // amarillo suave
  'ANDES':   '#a16207',   // marrón dorado
  'MICHELOB':'#6366f1',   // índigo
  'STELLA':  '#34d399',   // verde menta
  'CORONA':  '#fb923c',   // naranja suave
  'PATAGONIA':'#a78bfa'   // violeta suave
};

function getRows4(yr, extraFilter) {
  const pf = makePromoFilter(4);
  if (!pf) return [];
  return DATA.filter(r => {
    if (r.yr != yr || r.un !== 'CERVEZAS CMQ') return false;
    if (!pf(r)) return false;
    const marca = getMarca(r.prod2);
    if (!marca) return false; // exclude OTROS
    if (r.hl <= 0) return false; // only actual sales
    // Calibre filter (multi-select; calSel vacío = todos)
    if (!ST[4].calSel.has(r.calibre)) return false;
    // Marca filter
    if (!ST[4].marcaSel.has(marca)) return false;
    if (extraFilter && !extraFilter(r)) return false;
    return true;
  });
}

// Donut chart
function makeDonut(id, segFilter, yr, mes=null, isBCDonut=false) {
  const chart = getEC(id);
  const pf = makePromoFilter(4);
  if (!pf) { chart.clear(); return; }

  const volByBrand = {};
  DATA.filter(r => {
    if (r.yr != yr || r.un !== 'CERVEZAS CMQ') return false;
    if (mes && r.mes !== mes) return false;
    if (!pf(r)) return false;
    if (r.hl <= 0) return false;
    if (!ST[4].calSel.has(r.calibre)) return false;
    if (!ST[4].marcaSel.has(getMarca(r.prod2))) return false;
    return segFilter(r);
  }).forEach(r => {
    const m = isBCDonut ? getBCLabel(r) : getMarca(r.prod2);
    if (!m) return;
    volByBrand[m] = (volByBrand[m] || 0) + r.hl;
  });

  const total = Object.values(volByBrand).reduce((a,b)=>a+b, 0);
  const data = Object.entries(volByBrand)
    .sort((a,b)=>b[1]-a[1])
    .map(([name, value]) => ({
      name,
      value: Math.round(value),
      itemStyle: {
          color: (isBCDonut ? BC_COLORS[name] : BRAND_COLORS[name]) || '#999',
          borderColor: 'transparent', borderWidth: 2
        }
    }));

  chart.setOption({
    animation: false,
    legend: { orient:'vertical', right:0, top:'middle', textStyle:{color:'#475569',fontSize:10, fontFamily:'Barlow Condensed', fontWeight:'bold'} },
    series:[{
      type:'pie', radius:['32%','72%'],
      center:['38%','50%'],
      data,
      label:{
        show: true, position:'inside',
        formatter: p => p.percent >= 5 ? p.percent.toFixed(0)+'%' : '',
        fontSize:10, fontWeight:'bold', color:'#fff', fontFamily:'Barlow Condensed'
      },
      labelLine:{show:false},
      emphasis:{scale:false}
    }],
    tooltip:{
      trigger:'item',
      backgroundColor:'#0B2559', borderColor:'rgba(255,255,255,0.2)', borderWidth:1, textStyle: { color: '#fff' },
      formatter: p => `<b>${p.name}</b><br/>${fmtN(p.value)} HL (${p.percent.toFixed(1)}%)`
    }
  });
}

function render4() {
  if (!ST[4]) return; // not yet initialized
  const hasData = DATA.length > 0;
  const hasSel  = ST[4].activePromos.size > 0;

  document.getElementById('up4').style.display      = hasData && hasSel ? 'none' : 'flex';
  document.getElementById('kpi4').style.display     = hasData && hasSel ? 'flex' : 'none';
  document.getElementById('donuts-row').style.display = hasData && hasSel ? 'flex' : 'none';
  document.getElementById('body4').style.display    = hasData && hasSel ? 'flex' : 'none';
  if (!hasData || !hasSel) return;

  const s25 = summarizeRows(getRows4(2025), r => r.hl);
  const s26 = summarizeRows(getRows4(2026), r => r.hl);
  const d25v = s25.vol, d26v = s26.vol;
  const d25c = s25.ccc, d26c = s26.ccc;
  const d25b = s25.bd,  d26b = s26.bd;
  const m26  = MESES.filter(m => d26v[m]>0 || d26c[m]>0);
  const last = lastMes(d26v, d26c);
  const prev = MESES[MESES.indexOf(last)-1] || null;
  const sku26= d26c[last] ? d26b[last]/d26c[last] : 0;
  const sku25= d25c[last] ? d25b[last]/d25c[last] : 0;
  const col  = '#f97316';
  const vl   = 'HL';

  const nCal = ST[4].calSel.size < CAL_LIST.length ? ST[4].calSel.size+' cal' : '';
  const nMarca = ST[4].marcaSel.size < MARCA_LIST.length ? ST[4].marcaSel.size+' marcas' : '';
  const lbl = [nCal, nMarca].filter(Boolean).join(' · ') || 'Todas las marcas';
  document.getElementById('t4-hl').textContent = 'Volumen HL · ' + lbl;

  setKPI('k4-0', `HL ${last}`,      d26v[last], pct(d26v[last],d25v[last]), ' HL');
  setKPI('k4-1', `CCC ${last}`,     d26c[last], pct(d26c[last],d25c[last]));
  setKPI('k4-2', `SKU/PDV ${last}`, sku26,      pct(sku26,sku25), '', 2);
  setKPI('k4-3', `TBD ${last}`,     d26b[last], pct(d26b[last],d25b[last]));

  // Donuts — último mes de 2026
  makeDonut('d-cv', r => SEG_CV.has(getMarca(r.prod2)), 2026, last);
  makeDonut('d-ac', r => SEG_AC.has(getMarca(r.prod2)), 2026, last);
  makeDonut('d-bc', r => isBC(r), 2026, last, true);

  makeMonthly('c4-hl',  d25v, d26v, '#f97316');
  makeMonthly('c4-ccc', d25c, d26c, '#f97316');
  makeMonthly('c4-bd',  d25b, d26b, '#f97316');
  makeYTD('c4-ytd-hl',  d25v, d26v, m26, '#f97316');
  makeCNC('c4-cnc',     d26c, m26, '#f97316', 4);
  makeYTD('c4-ytd-bd',  d25b, d26b, m26, '#f97316');
  makeComp('c4-comp-hl',  d26v, d25v, last, prev, '#f97316');
  makeComp('c4-comp-ccc', d26c, d25c, last, prev, '#f97316');
  makeComp('c4-comp-bd',  d26b, d25b, last, prev, '#f97316');

}


// ═══════════════════════════════════════════════════════════════
// PAGE 5: NABS
// ═══════════════════════════════════════════════════════════════

ST[5] = { un:'UNG', activePromos: initActivePromos(),
  calSel: new Set(['500 CC PET','350 CC PET','354 CC LATA','2000 RECO','2250 CC PET','1500 CC PET','1250 CC PET','354 CC','250 CC LATAS','2000 CC PET','500 CC VD S/R','269 CC LATA','750 CC PET','355 CC LATA','473 CC','2.25L','TETRA 200CC','TETRA 1L','3000 CC PET']),
  marcaSel: new Set(['7 UP','PASO DE LOS TOROS','PEPSI','PEPSI BLACK','GATORADE','H2Oh','RED BULL','ROCKSTAR','7 UP FREE','MIRINDA','DEL VALLE JUGOS'])
};
mkSDV(5);

// Brand detection for NABS
function getNABSMarca(prod) {
  if (!prod) return null;
  if (prod.startsWith('PEPSI BLACK'))         return 'PEPSI BLACK';
  if (prod.startsWith('PEPSI'))               return 'PEPSI';
  if (prod.startsWith('7 UP FREE'))           return '7 UP FREE';
  if (prod.startsWith('7 UP') || prod.startsWith('7UP') || prod.startsWith('SEVEN UP')) return '7 UP';
  if (prod.startsWith('PASO DE LOS TOROS') || prod.startsWith('PASO DLT') || prod.startsWith('PDT') || prod.startsWith('PDTOROS')) return 'PASO DE LOS TOROS';
  if (prod.startsWith('GATORADE'))            return 'GATORADE';
  if (prod.startsWith('RED BULL') || prod.startsWith('RB ')) return 'RED BULL';
  if (prod.startsWith('ROCKSTAR'))            return 'ROCKSTAR';
  if (prod.startsWith('MIRINDA'))             return 'MIRINDA';
  if (prod.startsWith('H2OH') || prod.startsWith('H2Oh')) return 'H2Oh';
  if (prod.startsWith('DEL VALLE') || prod.startsWith('JUGO DEL VALLE')) return 'DEL VALLE JUGOS';
  return null;
}

// Calibre dropdown page 5
const CAL5_LIST = [
  '500 CC PET','350 CC PET','354 CC LATA','2000 RECO','2250 CC PET',
  '1500 CC PET','1250 CC PET','354 CC','250 CC LATAS','2000 CC PET',
  '500 CC VD S/R','269 CC LATA','750 CC PET','355 CC LATA','473 CC',
  '2.25L','TETRA 200CC','TETRA 1L','3000 CC PET'
];

const MARCA5_LIST = [
  '7 UP','PASO DE LOS TOROS','PEPSI','PEPSI BLACK','GATORADE',
  'H2Oh','RED BULL','ROCKSTAR','7 UP FREE','MIRINDA','DEL VALLE JUGOS'
];

function makeDropdown5(listArr, stKey, btnId, panelId, hdrId, label, renderFn) {
  listArr.forEach(v => ST[5][stKey].add(v));
  const btn    = document.getElementById(btnId);
  const panel  = document.getElementById(panelId);
  const hdrAll = document.getElementById(hdrId);

  function getState() {
    if (ST[5][stKey].size === listArr.length) return 'all';
    if (ST[5][stKey].size === 0) return 'none';
    return 'partial';
  }
  function updateBtn() {
    const st = getState();
    btn.classList.toggle('all',     st === 'all');
    btn.classList.toggle('partial', st === 'partial');
    btn.classList.toggle('none',    st === 'none');
    if (st === 'all')       btn.innerHTML = label + ' <span class="chv">▼</span>';
    else if (st === 'none') btn.innerHTML = label + ' (0) <span class="chv">▼</span>';
    else                    btn.innerHTML = label + ' (' + ST[5][stKey].size + ') <span class="chv">▼</span>';
  }
  function syncHdr() {
    const allOn  = ST[5][stKey].size === listArr.length;
    const partial = ST[5][stKey].size > 0 && ST[5][stKey].size < listArr.length;
    hdrAll.innerHTML = '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = allOn; cb.indeterminate = partial;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      ST[5][stKey].clear();
      if (cb.checked) listArr.forEach(v => ST[5][stKey].add(v));
      panel.querySelectorAll('input[data-item]').forEach(c => c.checked = cb.checked);
      syncHdr(); updateBtn(); renderFn();
    });
    hdrAll.appendChild(cb);
    hdrAll.appendChild(document.createTextNode(' Tod' + (label==='Marcas'?'as':'os')));
    panel.querySelectorAll('input[data-item]').forEach(c => {
      c.checked = ST[5][stKey].has(c.dataset.item);
    });
  }
  listArr.forEach(val => {
    const item = document.createElement('label');
    item.className = 'promo-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.item = val; cb.checked = true;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) ST[5][stKey].add(val);
      else            ST[5][stKey].delete(val);
      syncHdr(); updateBtn(); renderFn();
    });
    item.appendChild(cb);
    item.appendChild(document.createTextNode(' ' + val));
    panel.appendChild(item);
  });
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const cbAll = panel.querySelector('input[type=checkbox]');
    if (cbAll) cbAll.click();
  });
  syncHdr(); updateBtn();
}

makeDropdown5(CAL5_LIST,   'calSel',   'cal5-drop-btn',   'cal5-panel',   'cal5-hdr-all',   'Calibres', render5);
makeDropdown5(MARCA5_LIST, 'marcaSel', 'marca5-drop-btn', 'marca5-panel', 'marca5-hdr-all', 'Marcas',   render5);

// Data helpers page 5
function getRows5(yr, extra) {
  const pf = makePromoFilter(5);
  if (!pf) return [];
  return DATA.filter(r => {
    if (r.yr != yr || r.un !== 'UNG') return false;
    if (!pf(r)) return false;
    const marca = r.marca || getNABSMarca(r.prod2);
    if (!marca) return false;
    if (ST[5].calSel.size > 0 && !ST[5].calSel.has(r.calibre)) return false;
    if (ST[5].marcaSel.size > 0 && !ST[5].marcaSel.has(marca)) return false;
    if (extra && !extra(r)) return false;
    return true;
  });
}

function render5() {
  if (!ST[5]) return;
  const hasData = DATA.length > 0;
  const hasSel  = ST[5].activePromos.size > 0;
  const col5 = '#a855f7';

  document.getElementById('up5').style.display   = hasData && hasSel ? 'none' : 'flex';
  document.getElementById('kpi5').style.display  = hasData && hasSel ? 'flex' : 'none';
  document.getElementById('body5').style.display = hasData && hasSel ? 'flex' : 'none';
  if (!hasData || !hasSel) return;

  const s25 = summarizeRows(getRows5(2025), r => r.hl);
  const s26 = summarizeRows(getRows5(2026), r => r.hl);
  const d25v = s25.vol, d26v = s26.vol;
  const d25c = s25.ccc, d26c = s26.ccc;
  const d25b = s25.bd,  d26b = s26.bd;
  const m26  = MESES.filter(m => d26v[m]>0 || d26c[m]>0);
  const last = lastMes(d26v, d26c);
  const prev = MESES[MESES.indexOf(last)-1] || null;
  const sku26= d26c[last] ? d26b[last]/d26c[last] : 0;
  const sku25= d25c[last] ? d25b[last]/d25c[last] : 0;
  const nCal5   = ST[5].calSel.size < CAL5_LIST.length   ? ST[5].calSel.size+' cal' : '';
  const nMarca5 = ST[5].marcaSel.size < MARCA5_LIST.length ? ST[5].marcaSel.size+' marcas' : '';
  const lbl = [nCal5, nMarca5].filter(Boolean).join(' · ') || 'Todas las marcas';
  document.getElementById('t5-hl').textContent = 'Volumen HL · ' + lbl;

  setKPI('k5-0', `HL ${last}`,   d26v[last], pct(d26v[last],d25v[last]), ' HL');
  setKPI('k5-1', `CCC ${last}`,      d26c[last], pct(d26c[last],d25c[last]));
  setKPI('k5-2', `SKU/PDV ${last}`,  sku26,      pct(sku26,sku25), '', 2);
  setKPI('k5-3', `TBD ${last}`,      d26b[last], pct(d26b[last],d25b[last]));

  makeMonthly('c5-hl',  d25v, d26v, col5);
  makeMonthly('c5-ccc', d25c, d26c, col5);
  makeMonthly('c5-bd',  d25b, d26b, col5);
  makeYTD('c5-ytd-hl',  d25v, d26v, m26, col5);
  makeCNC('c5-cnc',     d26c, m26, col5, 5);
  makeYTD('c5-ytd-bd',  d25b, d26b, m26, col5);
  makeComp('c5-comp-hl',  d26v, d25v, last, prev, col5);
  makeComp('c5-comp-ccc', d26c, d25c, last, prev, col5);
  makeComp('c5-comp-bd',  d26b, d25b, last, prev, col5);
}


// ═══════════════════════════════════════════════════════════════
// PAGE 6: RANKING
// ═══════════════════════════════════════════════════════════════

ST[6] = { un: 'CERVEZAS CMQ', activePromos: initActivePromos(), canal: 'TODOS', seg: 'TODOS',
  marcaSel: new Set(), calSel: new Set() };

mkUN(6);
mkSDV(6);

// Canal tabs pg6
document.querySelectorAll('#canal6-tabs .ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#canal6-tabs .ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ST[6].canal = btn.dataset.canal6;
    render6();
  });
});

// Segmento tabs pg6
document.querySelectorAll('[data-seg6]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-seg6]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ST[6].seg = btn.dataset.seg6;
    render6();
  });
});

// Marca dropdown pg6
const MARCA6_CERV_LIST = ['BRAHMA','QUILMES','BUDWEISER','1890','ANDES','MICHELOB','STELLA','CORONA','PATAGONIA'];
const MARCA6_UNG_LIST  = ['7 UP','PASO DE LOS TOROS','PEPSI','PEPSI BLACK','GATORADE','H2Oh','RED BULL','ROCKSTAR','7 UP FREE','MIRINDA','DEL VALLE JUGOS'];

function initMarca6UI(list) {
  const btn    = document.getElementById('marca6-drop-btn');
  const panel  = document.getElementById('marca6-panel');
  const hdrAll = document.getElementById('marca6-hdr-all');
  if (!btn || !panel || !hdrAll) return;

  // Limpiar panel y poblar marcaSel
  panel.querySelectorAll('.promo-item').forEach(el => el.remove());
  ST[6].marcaSel = new Set(list);

  function getState() {
    if (ST[6].marcaSel.size === list.length) return 'all';
    if (ST[6].marcaSel.size === 0) return 'none';
    return 'partial';
  }
  function updateBtn() {
    const st = getState();
    btn.classList.toggle('all', st==='all'); btn.classList.toggle('partial', st==='partial'); btn.classList.toggle('none', st==='none');
    btn.innerHTML = (st==='all' ? 'Marcas' : 'Marcas ('+ST[6].marcaSel.size+')') + ' <span class="chv">▼</span>';
  }
  function syncHdr() {
    const allOn = ST[6].marcaSel.size === list.length;
    hdrAll.innerHTML = '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = allOn; cb.indeterminate = ST[6].marcaSel.size > 0 && !allOn;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      ST[6].marcaSel.clear();
      if (cb.checked) list.forEach(v => ST[6].marcaSel.add(v));
      panel.querySelectorAll('input[data-m6]').forEach(c => c.checked = cb.checked);
      syncHdr(); updateBtn(); render6();
    });
    hdrAll.appendChild(cb);
    hdrAll.appendChild(document.createTextNode(' Todas las marcas'));
    panel.querySelectorAll('input[data-m6]').forEach(c => { c.checked = ST[6].marcaSel.has(c.dataset.m6); });
  }
  list.forEach(val => {
    const item = document.createElement('label'); item.className = 'promo-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.m6 = val; cb.checked = true;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) ST[6].marcaSel.add(val); else ST[6].marcaSel.delete(val);
      syncHdr(); updateBtn(); render6();
    });
    item.appendChild(cb); item.appendChild(document.createTextNode(' ' + val));
    panel.appendChild(item);
  });
  if (!btn._m6init) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cbAll = panel.querySelector('input[type=checkbox]');
      if (cbAll) cbAll.click();
    });
    btn._m6init = true;
  }
  syncHdr(); updateBtn();
}

// Calibre dropdown pg6
const CAL6_CERV_LIST = ['473 CC LATAS','710 CC LATAS','1000 CC VIDRIO','330 CC S/R','BOTELLA 710 CC','975 CC VIDRIO','340 CC','330 CC VIDRIO','730 CC','BOT VD 275 CC','BOT VD 355'];
const CAL6_UNG_LIST  = ['500 CC PET','350 CC PET','354 CC LATA','2000 RECO','2250 CC PET','1500 CC PET','1250 CC PET','354 CC','250 CC LATAS','2000 CC PET','500 CC VD S/R','269 CC LATA','750 CC PET','355 CC LATA','473 CC','2.25L','TETRA 200CC','TETRA 1L','3000 CC PET'];

function initCal6UI(list) {
  const btn    = document.getElementById('cal6-drop-btn');
  const panel  = document.getElementById('cal6-panel');
  const hdrAll = document.getElementById('cal6-hdr-all');
  if (!btn || !panel || !hdrAll) return;

  panel.querySelectorAll('.promo-item').forEach(el => el.remove());
  ST[6].calSel = new Set(list);

  function getState() {
    if (ST[6].calSel.size === list.length) return 'all';
    if (ST[6].calSel.size === 0) return 'none';
    return 'partial';
  }
  function updateBtn() {
    const st = getState();
    btn.classList.toggle('all', st==='all'); btn.classList.toggle('partial', st==='partial'); btn.classList.toggle('none', st==='none');
    btn.innerHTML = (st==='all' ? 'Calibres' : 'Calibres ('+ST[6].calSel.size+')') + ' <span class="chv">▼</span>';
  }
  function syncHdr() {
    const allOn = ST[6].calSel.size === list.length;
    hdrAll.innerHTML = '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = allOn; cb.indeterminate = ST[6].calSel.size > 0 && !allOn;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      ST[6].calSel.clear();
      if (cb.checked) list.forEach(v => ST[6].calSel.add(v));
      panel.querySelectorAll('input[data-c6]').forEach(c => c.checked = cb.checked);
      syncHdr(); updateBtn(); render6();
    });
    hdrAll.appendChild(cb);
    hdrAll.appendChild(document.createTextNode(' Todos los calibres'));
    panel.querySelectorAll('input[data-c6]').forEach(c => { c.checked = ST[6].calSel.has(c.dataset.c6); });
  }
  list.forEach(val => {
    const item = document.createElement('label'); item.className = 'promo-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.c6 = val; cb.checked = true;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) ST[6].calSel.add(val); else ST[6].calSel.delete(val);
      syncHdr(); updateBtn(); render6();
    });
    item.appendChild(cb); item.appendChild(document.createTextNode(' ' + val));
    panel.appendChild(item);
  });
  if (!btn._c6init) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cbAll = panel.querySelector('input[type=checkbox]');
      if (cbAll) cbAll.click();
    });
    btn._c6init = true;
  }
  syncHdr(); updateBtn();
}

// Inicializar dropdowns con listas de cervezas por defecto
initMarca6UI(MARCA6_CERV_LIST);
initCal6UI(CAL6_CERV_LIST);

// Mostrar/ocultar segmento según UN
function updateSeg6Visibility() {
  const isCerv = ST[6].un === 'CERVEZAS CMQ';
  document.getElementById('seg6-tabs').style.display = isCerv ? 'flex' : 'none';
}

// Helper: segmento filter para pg6
function seg6Filter(r) {
  const seg = ST[6].seg;
  if (seg === 'TODOS') return true;
  const m = getMarca(r.prod2);
  if (seg === 'CV') return SEG_CV.has(m);
  if (seg === 'AC') return SEG_AC.has(m) && !isBC(r);
  if (seg === 'BC') return isBC(r);
  return true;
}

// Helper: canal filter pg6 — mismo criterio que pestaña Canal (pg3)
function canal6Filter(r) {
  return canalFilter(r, ST[6].canal);
}

// Helper: marca/calibre filter pg6
function marcaCal6Filter(r) {
  const isCerv = ST[6].un === 'CERVEZAS CMQ';
  if (isCerv) {
    const m = getMarca(r.prod2);
    if (!m) return false;
    if (ST[6].marcaSel.size > 0 && !ST[6].marcaSel.has(m)) return false;
    if (ST[6].calSel.size > 0 && !ST[6].calSel.has(r.calibre)) return false;
    if (!seg6Filter(r)) return false;
  } else {
    const m = r.marca || '';
    if (!m) return false;
    if (ST[6].marcaSel.size > 0 && !ST[6].marcaSel.has(m)) return false;
    if (ST[6].calSel.size > 0 && !ST[6].calSel.has(r.calibre)) return false;
  }
  return true;
}

// getRows6: filtra por UN, promotores, canal, marca, calibre, segmento
function getRows6(yr, extra) {
  const pf = makePromoFilter(6);
  if (!pf) return [];
  return DATA.filter(r => {
    if (r.yr != yr || r.un !== ST[6].un) return false;
    if (!pf(r)) return false;
    if (!canal6Filter(r)) return false;
    if (!marcaCal6Filter(r)) return false;
    if (extra && !extra(r)) return false;
    return true;
  });
}

// Calcular top 50 clientes por HL acumulado en últimos 3 meses de 2026
function getTop50(lastMes3) {
  const rows = getRows6(2026);
  const hlByCli = {};
  const namesByCli = {};
  rows.filter(r => lastMes3.includes(r.mes) && r.hl > 0).forEach(r => {
    hlByCli[r.cli] = (hlByCli[r.cli] || 0) + r.hl;
    if (!namesByCli[r.cli]) namesByCli[r.cli] = r.cliN || r.cli;
  });
  return Object.entries(hlByCli)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 50)
    .map(([cli]) => cli);
}

// Mix chart: peso de top50 sobre total de la UN en el último mes
function makeMix6(top50Clis, last, lastYr) {
  const chart = getEC('c6-mix');
  if (!chart) return;

  // Total de la UN en el último mes (sin filtro de clientes)
  const pf = makePromoFilter(6);
  if (!pf) return;
  const totalHL = DATA.filter(r => r.yr == lastYr && r.un === ST[6].un && r.mes === last && r.hl > 0 && pf(r))
    .reduce((a,r) => a + r.hl, 0);

  // Calcular HL de top50 (o cliente seleccionado) en el último mes
  const cliSel = ST[6].cliSel;
  let focusHL = 0;
  let focusName = 'Top 50';

  if (cliSel) {
    focusHL = DATA.filter(r => r.yr == lastYr && r.un === ST[6].un && r.mes === last && r.hl > 0 && pf(r) && r.cli === cliSel)
      .reduce((a,r) => a + r.hl, 0);
    focusName = cliSel;
  } else {
    const top50Set = new Set(top50Clis);
    focusHL = DATA.filter(r => r.yr == lastYr && r.un === ST[6].un && r.mes === last && r.hl > 0 && pf(r) && top50Set.has(r.cli))
      .reduce((a,r) => a + r.hl, 0);
  }

  const otros = Math.max(totalHL - focusHL, 0);
  const col = unColor(6);

  chart.setOption({
    animation: false,
    series: [{
      type: 'pie', radius: ['35%','70%'], center: ['38%','50%'],
      data: [
        { name: focusName, value: Math.round(focusHL), itemStyle: { color: col } },
        { name: 'Resto', value: Math.round(otros), itemStyle: { color: 'rgba(0,0,0,0.1)' } }
      ],
      label: { show: true, position: 'inside', formatter: p => p.percent >= 5 ? p.percent.toFixed(0)+'%' : '', fontSize: 10, fontWeight: 'bold', color: '#fff', fontFamily: 'Barlow Condensed' },
      labelLine: { show: false }, emphasis: { scale: false }
    }],
    legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 10, fontFamily: 'Barlow Condensed', fontWeight: 'bold', color: 'rgba(255,255,255,0.7)' } },
    tooltip: { trigger: 'item', backgroundColor: '#0B2559', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, textStyle: { color: '#fff' },
      formatter: p => `<b>${p.name}</b><br/>${fmtN(p.value)} HL (${p.percent.toFixed(1)}%)` }
  });
}

function render6() {
  if (!ST[6]) return;

  // Actualizar listas de marca/calibre según UN
  const isCerv = ST[6].un === 'CERVEZAS CMQ';
  updateSeg6Visibility();

  const hasData = DATA.length > 0;
  const hasSel  = ST[6].activePromos.size > 0;

  const up = document.getElementById('up6');
  const kpi = document.getElementById('kpi6');
  const body = document.getElementById('body6');
  if (up)  up.style.display  = hasData && hasSel ? 'none' : 'flex';
  if (kpi) kpi.style.display = hasData && hasSel ? 'flex' : 'none';
  if (body) body.style.display = hasData && hasSel ? 'flex' : 'none';
  if (!hasData || !hasSel) return;

  const col = unColor(6);
  const ld6a = document.getElementById('ld6a'); if (ld6a) ld6a.style.background = col;
  const ld6b = document.getElementById('ld6b'); if (ld6b) ld6b.style.background = col;

  // Determinar último mes de 2026
  const rows26all = DATA.filter(r => r.yr == 2026 && r.un === ST[6].un && r.hl > 0);
  const mesesConDatos = MESES.filter(m => rows26all.some(r => r.mes === m));
  const last = mesesConDatos[mesesConDatos.length - 1] || MESES[0];
  const lastIdx = MESES.indexOf(last);
  const prev = MESES[lastIdx - 1] || null;

  // Top 50 clientes por HL en el último mes
  const top50Clis = getTop50([last]);
  const top50Set = new Set(top50Clis);

  // Filtrar filas solo de top50 (y del cliente seleccionado, si hay)
  const extraTop50 = r => top50Set.has(r.cli) && (!ST[6].cliSel || r.cli === ST[6].cliSel);
  const s25 = summarizeRows(getRows6(2025, extraTop50), r => r.hl);
  const s26 = summarizeRows(getRows6(2026, extraTop50), r => r.hl);
  const d25v = s25.vol, d26v = s26.vol;
  const d25c = s25.ccc, d26c = s26.ccc;
  const d25b = s25.bd,  d26b = s26.bd;
  const m26  = MESES.filter(m => d26v[m]>0 || d26c[m]>0);
  const sku26 = d26c[last] ? d26b[last]/d26c[last] : 0;
  const sku25 = d25c[last] ? d25b[last]/d25c[last] : 0;

  // Período en el label
  const per3lbl = last.slice(0,3).toUpperCase();
  const t6 = document.getElementById('t6-hl');
  if (t6) t6.textContent = `Volumen HL · Top 50 · ${per3lbl}`;

  setKPI('k6-0', `HL ${last}`,      d26v[last], pct(d26v[last],d25v[last]), ' HL');
  setKPI('k6-1', `SKU/PDV ${last}`, sku26, pct(sku26,sku25), '', 2);
  setKPI('k6-2', `SKU/PDV ${last}`, sku26,      pct(sku26,sku25), '', 2);
  setKPI('k6-3', `Top 50 · ${per3lbl}`, top50Clis.length, null, ' clientes', 0, '');

  makeMonthly('c6-hl',  d25v, d26v, col);

  // SKU/PDV promedio mensual de los top50
  const sku25m = initMonthMap(), sku26m = initMonthMap();
  MESES.forEach(m => {
    sku25m[m] = d25c[m] > 0 ? d25b[m] / d25c[m] : 0;
    sku26m[m] = d26c[m] > 0 ? d26b[m] / d26c[m] : 0;
  });
  makeSKUMonthly('c6-sku', sku25m, sku26m, col);

  makeMix6(top50Clis, last, 2026);

  // Construir tabla de clientes
  const tbody = document.getElementById('t6-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    // Recopilar info de cada cliente top50: HL del último mes, nombre, UN, promotor, supervisor
    const rows26 = getRows6(2026);
    const cliInfo = {};
    rows26.filter(r => r.mes === last && r.hl > 0 && top50Set.has(r.cli)).forEach(r => {
      if (!cliInfo[r.cli]) cliInfo[r.cli] = { name: r.cliN || r.cli, hl: 0, un: r.un, prom: r.sdv2, sup: r.sdv };
      cliInfo[r.cli].hl += r.hl;
    });
    // Ordenar top50 por HL desc
    top50Clis.forEach((cli, idx) => {
      const info = cliInfo[cli];
      if (!info) return;
      const tr = document.createElement('tr');
      const rank = idx + 1;
      const rankCls = rank <= 3 ? 'rank top3' : 'rank';
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      tr.innerHTML =
        `<td class="${rankCls}">${medal}</td>` +
        `<td>${cli}</td>` +
        `<td title="${info.name}">${info.name}</td>` +
        `<td class="hl-val">${fmtN(info.hl, 1)}</td>` +
        `<td>${info.un}</td>` +
        `<td title="${info.prom}">${info.prom ? info.prom.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' ') : ''}</td>` +
        `<td title="${info.sup}">${info.sup ? info.sup.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' ') : ''}</td>`;
      tr.style.cursor = 'pointer';
      if (ST[6].cliSel === cli) tr.style.background = 'rgba(0,0,0,0.05)';
      tr.addEventListener('click', () => {
        ST[6].cliSel = (ST[6].cliSel === cli) ? null : cli;
        render6();
      });
      tbody.appendChild(tr);
    });
  }
}

// Actualizar listas de marca/calibre cuando cambia la UN
document.getElementById('un-dd6')?.addEventListener('click', () => {
  setTimeout(() => {
    const isCerv = ST[6].un === 'CERVEZAS CMQ';
    initMarca6UI(isCerv ? MARCA6_CERV_LIST : MARCA6_UNG_LIST);
    initCal6UI(isCerv ? CAL6_CERV_LIST : CAL6_UNG_LIST);
    render6();
  }, 50);
});



// ═══════════════════════════════════════════════════════════════
// PAGE 7: CRM
// ═══════════════════════════════════════════════════════════════

let CRM_CLI = null; // cliente seleccionado actualmente

// Índice de clientes — se construye cuando se cargan los datos
ST[7] = { un: 'TODAS' };

let CRM_INDEX = {}; // { cli_code: { name, canal, sup, prom, dias, un, uns, lastFecha } }

function buildCRMIndex() {
  CRM_INDEX = {};
  DATA.forEach(r => {
    if (!r.cli) return;
    if (!CRM_INDEX[r.cli]) {
      CRM_INDEX[r.cli] = {
        name: r.cliN || r.cli,
        canal: r.canal || '—',
        sup: r.sdv || '—',
        prom: r.sdv2 || '—',
        dias: r.dias || '—',
        un: r.un || '—',
        uns: new Set([r.un || '—']),
        lastFecha: r.fecha || ''
      };
    } else {
      if (r.un) CRM_INDEX[r.cli].uns.add(r.un);
      if (r.fecha && r.fecha > CRM_INDEX[r.cli].lastFecha) {
        CRM_INDEX[r.cli].lastFecha = r.fecha;
      }
    }
  });
}

// Buscador
(function initCRMSearch() {
  const input = document.getElementById('crm-input');
  const dd    = document.getElementById('crm-dd');
  if (!input || !dd) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    dd.innerHTML = '';
    if (q.length < 2) { dd.classList.remove('open'); return; }

    const matches = Object.entries(CRM_INDEX)
      .filter(([code, info]) =>
        info.name.toLowerCase().includes(q) || code.toLowerCase().includes(q)
      )
      .slice(0, 30);

    if (!matches.length) { dd.classList.remove('open'); return; }

    matches.forEach(([code, info]) => {
      const opt = document.createElement('div');
      opt.className = 'crm-opt';
      opt.innerHTML = `${info.name} <small>${code} · ${info.canal} · ${info.un}</small>`;
      opt.addEventListener('click', () => {
        input.value = info.name;
        dd.classList.remove('open');
        selectCRMClient(code);
      });
      dd.appendChild(opt);
    });
    dd.classList.add('open');
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) dd.classList.add('open');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.crm-search-wrap')) dd.classList.remove('open');
  });
})();

function selectCRMClient(code) {
  CRM_CLI = code;
  ST[7].un = 'TODAS';
  document.getElementById('crm-un-lbl').textContent = 'Todas las UN';
  
  const info = CRM_INDEX[CRM_CLI];
  const wrap = document.getElementById('crm-un-wrap');
  const sep = document.getElementById('crm-un-sep');
  const dd = document.getElementById('crm-un-dd');
  
  if (info && info.uns && info.uns.size > 0 && dd) {
    wrap.style.display = 'block';
    if (sep) sep.style.display = 'block';
    dd.innerHTML = '';
    
    const allOpt = document.createElement('div');
    allOpt.className = 'un-opt sel';
    allOpt.dataset.un = 'TODAS';
    allOpt.innerHTML = `Todas las UN`;
    allOpt.addEventListener('click', () => setCRMUN('TODAS', allOpt));
    dd.appendChild(allOpt);
    
    [...info.uns].filter(u => u !== '—').sort().forEach(u => {
      const o = document.createElement('div');
      o.className = 'un-opt';
      o.dataset.un = u;
      o.innerHTML = u;
      o.addEventListener('click', () => setCRMUN(u, o));
      dd.appendChild(o);
    });
  } else if (wrap) {
    wrap.style.display = 'none';
    if (sep) sep.style.display = 'none';
  }
  
  renderCRM();
}

function setCRMUN(un, optEl) {
  ST[7].un = un;
  document.getElementById('crm-un-lbl').textContent = un === 'TODAS' ? 'Todas las UN' : un;
  const dd = document.getElementById('crm-un-dd');
  if (dd) {
    dd.querySelectorAll('.un-opt').forEach(el => el.classList.remove('sel'));
    if (optEl) optEl.classList.add('sel');
  }
  renderCRM();
}

function renderCRM() {
  if (!CRM_CLI) return;
  const info = CRM_INDEX[CRM_CLI];
  if (!info) return;

  // Ficha
  const ficha = document.getElementById('crm-ficha');
  if (ficha) ficha.style.display = 'flex';
  const fmt = s => s ? s.split(' ').map(w=>w[0]+w.slice(1).toLowerCase()).join(' ') : '—';
  const el = id => document.getElementById(id);
  if (el('crm-canal')) el('crm-canal').textContent = info.canal || '—';
  if (el('crm-sup'))   el('crm-sup').textContent   = fmt(info.sup);
  if (el('crm-prom'))  el('crm-prom').textContent  = fmt(info.prom);
  if (el('crm-dias'))  el('crm-dias').textContent  = info.dias || '—';
  if (el('crm-un'))    el('crm-un').textContent    = ST[7].un === 'TODAS' ? (info.un || '—') : ST[7].un;

  const unFilter = ST[7].un;
  const rows26 = DATA.filter(r => r.yr == 2026 && r.cli === CRM_CLI && (unFilter === 'TODAS' || r.un === unFilter));
  const rows25 = DATA.filter(r => r.yr == 2025 && r.cli === CRM_CLI && (unFilter === 'TODAS' || r.un === unFilter));
  
  let dynamicLastFecha = '';
  if (unFilter !== 'TODAS') {
    const dates = rows26.concat(rows25).map(r => r.fecha).filter(Boolean).sort();
    if (dates.length) dynamicLastFecha = dates[dates.length - 1];
  } else {
    dynamicLastFecha = info.lastFecha;
  }
  
  if (el('crm-fecha')) {
    el('crm-fecha').textContent = dynamicLastFecha ? dynamicLastFecha.split('-').reverse().join('/') : '—';
  }

  if (!rows26.length && !rows25.length) return;

  // Último mes con datos (global)
  let globalLast = MESES[0];
  for (let i = MESES.length - 1; i >= 0; i--) {
    if (DATA.some(r => r.yr == 2026 && r.mes === MESES[i] && r.hl > 0)) {
      globalLast = MESES[i];
      break;
    }
  }
  const globalPrev = MESES[MESES.indexOf(globalLast)-1] || null;

  const meses26 = MESES.filter(m => rows26.some(r => r.mes === m && r.hl > 0));
  const last = globalLast;
  const prev = globalPrev;

  // Resumir por mes
  const vol26 = initMonthMap(), vol25 = initMonthMap();
  const sku26m = initMonthMap(), sku25m = initMonthMap();
  const prodSets26 = {}, cliSets26 = {};

  rows26.forEach(r => {
    if (!r.mes || r.hl <= 0) return;
    vol26[r.mes] += r.hl;
    if (!prodSets26[r.mes]) prodSets26[r.mes] = new Set();
    prodSets26[r.mes].add(r.prod);
  });
  rows25.forEach(r => {
    if (!r.mes || r.hl <= 0) return;
    vol25[r.mes] += r.hl;
    if (!cliSets26[r.mes]) cliSets26[r.mes] = new Set();
    cliSets26[r.mes].add(r.prod);
  });

  // SKU/PDV = productos distintos por mes
  MESES.forEach(m => {
    sku26m[m] = prodSets26[m] ? prodSets26[m].size : 0;
    sku25m[m] = cliSets26[m] ? cliSets26[m].size : 0;
  });

  const col = '#10b981';
  const hlLast26 = vol26[last] || 0;
  const hlLast25 = vol25[last] || 0;
  const skuLast = sku26m[last] || 0;
  const skuLast25 = sku25m[last] || 0;
  const ytd26 = meses26.reduce((a,m) => a+(vol26[m]||0), 0);
  const ytd25 = meses26.reduce((a,m) => a+(vol25[m]||0), 0);

  // Mostrar secciones
  const kpi7 = document.getElementById('kpi7');
  const body7 = document.getElementById('body7');
  const empty = document.getElementById('crm-empty');
  if (kpi7)  kpi7.style.display  = 'flex';
  if (body7) body7.style.display = 'flex';
  if (empty) empty.style.display = 'none';

  if (el('t7-hl')) el('t7-hl').textContent = `Volumen HL · ${info.name}`;

  setKPI('k7-0', `HL ${last}`,      hlLast26, pct(hlLast26, hlLast25), ' HL');
  setKPI('k7-1', `SKU/PDV ${last}`, skuLast,  pct(skuLast, skuLast25), '', 0);
  setKPI('k7-2', `HL YTD`,          ytd26,    pct(ytd26, ytd25), ' HL');
  const diasFmt = info.dias ? info.dias.replace(/,/g,' · ') : '—';
  setKPI('k7-3', 'Frec. visita', 0, null, '', 0, diasFmt);

  // Gráficos
  makeMonthly('c7-hl',  vol25, vol26, col);
  makeSKUMonthly('c7-sku', sku25m, sku26m, col);
  makeComp('c7-comp', vol26, vol25, last, prev, col);

  // Fecha última compra en panel derecho
  const elLastFecha = document.getElementById('crm-last-fecha');
  if (elLastFecha) {
    elLastFecha.textContent = dynamicLastFecha ? dynamicLastFecha.split('-').reverse().join('/') : '—';
  }

  // Tabla de productos del último mes
  const tbody = document.getElementById('t7-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const prodRows = rows26.filter(r => r.mes === last && r.hl > 0);
    const prodMap = {};
    prodRows.forEach(r => {
      const key = r.prod;
      if (!prodMap[key]) prodMap[key] = { name: r.prod2 || r.prod, marca: r.marca || '—', calibre: r.calibre || '—', hl: 0 };
      prodMap[key].hl += r.hl;
    });
    Object.values(prodMap)
      .sort((a,b) => b.hl - a.hl)
      .forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          `<td style="padding:3px 6px;border-bottom:1px solid var(--brd);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.name}">${p.name}</td>` +
          `<td style="padding:3px 6px;border-bottom:1px solid var(--brd);">${p.marca}</td>` +
          `<td style="padding:3px 6px;border-bottom:1px solid var(--brd);">${p.calibre}</td>` +
          `<td style="padding:3px 6px;border-bottom:1px solid var(--brd);text-align:right;font-weight:700;color:var(--acc);">${fmtN(p.hl,1)}</td>`;
        tbody.appendChild(tr);
      });
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE 8: MARCAS
// ═══════════════════════════════════════════════════════════════

ST[8] = { un: 'CERVEZAS CMQ', tab: 'CERV' };

// UN dropdown for page 8
mkUN(8);

document.querySelectorAll('#marcas-tabs .ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#marcas-tabs .ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ST[8].tab = btn.dataset.marcas;
    render8();
  });
});

const LOGOS = {
  // Cervezas
  'CORONA': 'img/corona-beer-logo.png',
  'PATAGONIA': 'img/NicePng_patagonia-logo-png_2218575.png',
  'STELLA': 'img/stella-artois-seeklogo.png',
  'ANDES': 'img/andes-origen-seeklogo.png',
  'MICHELOB': 'img/michelob-ultra-seeklogo.png',
  'BRAHMA': 'img/brahma-beer-logo.png',
  'BUDWEISER': 'img/budweiser-beer-logo.png',
  'QUILMES': 'img/Quilmes_Logo.svg',
  '1890': 'img/1890_logo.png',

  // UNG
  'PEPSI': 'img/pepsi-logo.png',
  '7UP': 'img/7up_logo.svg',
  'MIRINDA': 'img/Mirinda_brand_logo.png',
  'PASO DE LOS TOROS': 'img/paso_de_los_toros_logo.jpg',
  'GATORADE': 'img/Gatorade_logo_before_2009.png',
  'RED BULL': 'img/red-bull-vertical-logo.png',
  'ROCKSTAR': 'img/rockstar_logo.jpg',
  'H2OH!': 'img/h2oh_logo.png'
};

function render8() {
  const hasData = DATA.length > 0;
  const up = document.getElementById('up8');
  const body = document.getElementById('body8');
  
  const isCerv = ST[8].tab === 'CERV';
  
  if (up) up.style.display = hasData ? 'none' : 'flex';
  if (body) body.style.display = hasData ? 'flex' : 'none';
  if (!hasData) return;

  const wrapUN = document.getElementById('un-wrap-8');
  const sepUN = wrapUN.previousElementSibling;
  
  if (isCerv) {
    wrapUN.style.display = 'block';
    if(sepUN) sepUN.style.display = 'block';
  } else {
    wrapUN.style.display = 'none';
    if(sepUN) sepUN.style.display = 'none';
  }

  const yr26 = 2026;
  const yr25 = 2025;
  
  let rows26, rows25;
  if (isCerv) {
    rows26 = DATA.filter(r => r.yr == yr26 && r.un === ST[8].un && getMarca(r.prod2));
    rows25 = DATA.filter(r => r.yr == yr25 && r.un === ST[8].un && getMarca(r.prod2));
  } else {
    rows26 = DATA.filter(r => r.yr == yr26 && r.un !== 'CERVEZAS CMQ' && r.marca);
    rows25 = DATA.filter(r => r.yr == yr25 && r.un !== 'CERVEZAS CMQ' && r.marca);
  }

  const mesesConDatos = MESES.filter(m => rows26.some(r => r.mes === m && r.hl > 0));
  const last = mesesConDatos[mesesConDatos.length - 1] || MESES[0];
  const lastIdx = MESES.indexOf(last);
  const monthsYTD = MESES.slice(0, lastIdx + 1);
  const lastMesName = last.slice(0,3).toUpperCase();
  
  const vol26ByMarca = {};
  const vol25ByMarca = {};
  
  rows26.forEach(r => {
    if (monthsYTD.includes(r.mes) && r.hl > 0) {
      const m = isCerv ? getMarca(r.prod2) : r.marca;
      const nm = m.trim().toUpperCase();
      if (!vol26ByMarca[nm]) vol26ByMarca[nm] = 0;
      vol26ByMarca[nm] += r.hl;
    }
  });
  
  rows25.forEach(r => {
    if (monthsYTD.includes(r.mes) && r.hl > 0) {
      const m = isCerv ? getMarca(r.prod2) : r.marca;
      const nm = m.trim().toUpperCase();
      if (!vol25ByMarca[nm]) vol25ByMarca[nm] = 0;
      vol25ByMarca[nm] += r.hl;
    }
  });

  const grid = document.getElementById('marcas-grid');
  grid.innerHTML = '';
  
  let marcasList = isCerv 
    ? ['CORONA', 'PATAGONIA', 'STELLA', 'ANDES', 'MICHELOB', 'BRAHMA', 'BUDWEISER', 'QUILMES', '1890']
    : ['PEPSI', '7UP', 'MIRINDA', 'PASO DE LOS TOROS', 'GATORADE', 'RED BULL', 'ROCKSTAR', 'H2OH!'];
    
  // Collect all cards first, then split into rows
  const cards = [];
  const rendered = new Set();
    
  marcasList.forEach(mRaw => {
    const bucket = mRaw.trim().toUpperCase();
    if(rendered.has(bucket)) return;
    
    let v26 = 0;
    let v25 = 0;
    
    const allKeys = new Set([...Object.keys(vol26ByMarca), ...Object.keys(vol25ByMarca)]);
    
    allKeys.forEach(k => {
       let matches = false;
       if (bucket === '7UP' && (k === '7UP' || k === '7 UP')) matches = true;
       else if (bucket === 'H2OH!' && k.startsWith('H2')) matches = true;
       else if (k === bucket) matches = true;
       
       if (matches) {
           v26 += vol26ByMarca[k] || 0;
           v25 += vol25ByMarca[k] || 0;
       }
    });
    
    rendered.add(bucket);
    if (v26 === 0 && v25 === 0) return;
    
    const diff = v26 - v25;
    const isUp = diff >= 0;
    const diffCls = isUp ? 'up' : 'dn';
    const diffSign = isUp ? '+' : '';
    const logoUrl = LOGOS[bucket] || '';
    
    const card = document.createElement('div');
    card.className = 'brand-card';
    card.innerHTML = `
      <div class="brand-logo">
        ${logoUrl ? `<img src="${logoUrl}" alt="${bucket}" onerror="this.outerHTML='<span>${bucket}</span>'">` : `<span>${bucket}</span>`}
      </div>
      <div class="brand-vr">VR <span class="val">${Math.round(v26)}</span> HL YTD</div>
      <div class="brand-dif ${diffCls}">${diffSign}${Math.round(diff)} HL vs ${lastMesName} 25</div>
    `;
    cards.push(card);
  });
  
  // Split into two rows: CERV=5+4, UNG=4+4
  const row1Count = isCerv ? 5 : 4;
  const row1 = document.createElement('div');
  row1.className = 'brand-row';
  const row2 = document.createElement('div');
  row2.className = 'brand-row';
  
  cards.forEach((c, i) => {
    if (i < row1Count) row1.appendChild(c);
    else row2.appendChild(c);
  });
  
  grid.appendChild(row1);
  if (row2.children.length > 0) {
    grid.appendChild(row2);
    // Match row2 card height to row1 card height
    requestAnimationFrame(() => {
      const firstCard = row1.querySelector('.brand-card');
      if (firstCard) {
        const h = firstCard.offsetHeight;
        Array.from(row2.children).forEach(c => {
          c.style.height = h + 'px';
        });
      }
    });
  }
  
  // --- CHARTS LOGIC ---
  const prev = MESES[MESES.indexOf(last) - 1] || null;
  const moNames = { last26: `${last.slice(0,3)} 26`, prev26: prev ? `${prev.slice(0,3)} 26` : '', last25: `${last.slice(0,3)} 25` };
  
  const chartBrands = [];
  const volLast26 = [], volPrev26 = [], volLast25 = [];
  const cccLast26 = [], cccPrev26 = [], cccLast25 = [];
  const richConfig = {};
  
  const metrics = {};
  marcasList.forEach(mRaw => {
    const bucket = mRaw.trim().toUpperCase();
    metrics[bucket] = { vol26: 0, volPrev: 0, vol25: 0, ccc26: new Set(), cccPrev: new Set(), ccc25: new Set() };
  });
  
  const processRow = (r, isYr26) => {
    let rawMarca = isCerv ? getMarca(r.prod2) : r.marca;
    if (!rawMarca) return;
    rawMarca = rawMarca.trim().toUpperCase();
    
    let bucket = rawMarca;
    if (bucket === '7UP' || bucket === '7 UP') bucket = '7UP';
    else if (bucket.startsWith('H2')) bucket = 'H2OH!';
    
    if (!metrics[bucket]) return;
    
    if (isYr26) {
      if (r.mes === last && r.hl > 0) {
        metrics[bucket].vol26 += r.hl;
        metrics[bucket].ccc26.add(r.cli);
      }
      if (prev && r.mes === prev && r.hl > 0) {
        metrics[bucket].volPrev += r.hl;
        metrics[bucket].cccPrev.add(r.cli);
      }
    } else {
      if (r.mes === last && r.hl > 0) {
        metrics[bucket].vol25 += r.hl;
        metrics[bucket].ccc25.add(r.cli);
      }
    }
  };
  
  DATA.filter(r => r.yr == 2026 && (isCerv ? r.un === ST[8].un : r.un !== 'CERVEZAS CMQ')).forEach(r => processRow(r, true));
  DATA.filter(r => r.yr == 2025 && (isCerv ? r.un === ST[8].un : r.un !== 'CERVEZAS CMQ')).forEach(r => processRow(r, false));
  
  marcasList.forEach(mRaw => {
    const bucket = mRaw.trim().toUpperCase();
    if (!metrics[bucket] || (metrics[bucket].vol26 === 0 && metrics[bucket].volPrev === 0 && metrics[bucket].vol25 === 0)) return;
    
    chartBrands.push(bucket);
    volLast26.push(Math.round(metrics[bucket].vol26));
    volPrev26.push(Math.round(metrics[bucket].volPrev));
    volLast25.push(Math.round(metrics[bucket].vol25));
    
    cccLast26.push(metrics[bucket].ccc26.size);
    cccPrev26.push(metrics[bucket].cccPrev.size);
    cccLast25.push(metrics[bucket].ccc25.size);
    
    const logo = LOGOS[bucket];
    const rk = 'rk_' + bucket.replace(/[^a-zA-Z0-9_]/g, '');
    if (logo) {
      let logoHeight = 45;
      if (bucket === 'STELLA' || bucket === 'ANDES' || bucket === 'MICHELOB') {
        logoHeight = 65; // Un poco más grandes pero no tanto para que no pisen el gráfico
      }
      richConfig[rk] = { height: logoHeight, width: 65, align: 'center', verticalAlign: 'middle', backgroundColor: { image: logo } };
    } else {
      richConfig[rk] = { color: '#1e293b', fontSize: 20, fontWeight: 'bold', fontFamily: 'Barlow Condensed' };
    }
  });

  if (window._chartVol8) window._chartVol8.dispose();
  if (window._chartCcc8) window._chartCcc8.dispose();
  
  window._chartVol8 = echarts.init(document.getElementById('marcas-chart-vol'));
  window._chartCcc8 = echarts.init(document.getElementById('marcas-chart-ccc'));
  
  const commonOptions = {
    animation: false,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: [moNames.last26, moNames.prev26, moNames.last25].filter(Boolean), top: 0, textStyle: { fontFamily: 'Barlow Condensed', fontWeight: 'bold', fontSize: 14 } },
    grid: { left: '3%', right: '3%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: chartBrands,
      axisLabel: {
        formatter: function(value) { 
          const rk = 'rk_' + value.replace(/[^a-zA-Z0-9_]/g, '');
          return LOGOS[value] ? '{' + rk + '| }' : '{' + rk + '|' + value + '}'; 
        },
        rich: richConfig,
        margin: 20
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: { type: 'value', show: false }
  };
  
  const richConf = {
    green: { color: '#4ade80', fontSize: 13, fontWeight: 'bold', fontFamily: 'Barlow Condensed', align: 'center', lineHeight: 16 },
    red: { color: '#f87171', fontSize: 13, fontWeight: 'bold', fontFamily: 'Barlow Condensed', align: 'center', lineHeight: 16 },
    val: { color: '#1e293b', fontSize: 16, fontWeight: 'bold', fontFamily: 'Barlow Condensed', align: 'center', lineHeight: 18 },
    line: { backgroundColor: '#1e293b', height: 4, width: 24, align: 'center', borderRadius: 2 }
  };

  const getSeries = (dLast26, dPrev26, dLast25) => {
    const s = [
      { name: moNames.last26, type: 'bar', data: dLast26, itemStyle: { color: '#65a30d', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', align: 'center', formatter: '{line| }\n{val|{c}}', rich: richConf } }
    ];
    if (prev) {
      s.push({ 
        name: moNames.prev26, 
        type: 'bar', 
        data: dPrev26, 
        itemStyle: { color: '#0284c7', borderRadius: [4, 4, 0, 0] }, 
        label: { 
          show: true, 
          position: 'top', 
          align: 'center',
          formatter: (params) => {
            const vB = params.value;
            const vA = dLast26[params.dataIndex];
            if (!vB || !vA) return '{val|' + (vB||0) + '}';
            const p = (vA - vB) / vB * 100;
            const sign = p > 0 ? '▲\n+' : '▼\n';
            const color = p >= 0 ? '{green|' : '{red|';
            return color + sign + p.toFixed(1) + '%}\n{val|' + vB + '}';
          },
          rich: richConf
        } 
      });
    }
    s.push({ 
      name: moNames.last25, 
      type: 'bar', 
      data: dLast25, 
      itemStyle: { color: '#f97316', borderRadius: [4, 4, 0, 0] }, 
      label: { 
        show: true, 
        position: 'top', 
        align: 'center',
        formatter: (params) => {
            const vC = params.value;
            const vA = dLast26[params.dataIndex];
            if (!vC || !vA) return '{val|' + (vC||0) + '}';
            const p = (vA - vC) / vC * 100;
            const sign = p > 0 ? '▲\n+' : '▼\n';
            const color = p >= 0 ? '{green|' : '{red|';
            return color + sign + p.toFixed(1) + '%}\n{val|' + vC + '}';
        },
        rich: richConf
      } 
    });
    return s;
  };
  
  window._chartVol8.setOption({ ...commonOptions, series: getSeries(volLast26, volPrev26, volLast25) });
  window._chartCcc8.setOption({ ...commonOptions, series: getSeries(cccLast26, cccPrev26, cccLast25) });
}

/* MARCAS CAROUSEL LOGIC */
let currentMarcasSlide = 0;
const totalMarcasSlides = 3;

function updateMarcasCarousel() {
  for (let i = 0; i < totalMarcasSlides; i++) {
    const slide = document.getElementById('slide-marcas-' + i);
    if (slide) {
      if (i === currentMarcasSlide) {
        slide.classList.add('active');
        // If it's a chart slide, resize it immediately so ECharts draws correctly
        if (i === 1 && window._chartVol8) window._chartVol8.resize();
        if (i === 2 && window._chartCcc8) window._chartCcc8.resize();
      } else {
        slide.classList.remove('active');
      }
    }
  }
}

// Bind carousel events
(function initCarousel() {
  const btnPrev = document.getElementById('marcas-prev');
  const btnNext = document.getElementById('marcas-next');
  
  if (btnPrev && btnNext) {
    btnPrev.addEventListener('click', () => {
      currentMarcasSlide = (currentMarcasSlide - 1 + totalMarcasSlides) % totalMarcasSlides;
      updateMarcasCarousel();
    });
    
    btnNext.addEventListener('click', () => {
      currentMarcasSlide = (currentMarcasSlide + 1) % totalMarcasSlides;
      updateMarcasCarousel();
    });
  }
  
  // Also force resize when window resizes
  window.addEventListener('resize', () => {
    if (currentMarcasSlide === 1 && window._chartVol8) window._chartVol8.resize();
    if (currentMarcasSlide === 2 && window._chartCcc8) window._chartCcc8.resize();
  });
})();
