async function fetchConfigData() {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycby25P-2-HSw7tQcbhpwaWs5hj97kq4UWO_LYuzml7BAYvoIMNM_icn1RQ3Q8H01uHA/exec';
  const CACHE_KEY = 'emcala_config_cache_v1';

  function applyData(data) {
    const dataMesas = data.mesas;
    const dataMaestro = data.maestro;

    // Procesar Mesas
    const headersMesas = dataMesas[0] || [];
    const iPromo = headersMesas.findIndex(c => String(c).trim().toUpperCase() === 'PROMOTOR');
    const iSup = headersMesas.findIndex(c => String(c).trim().toUpperCase() === 'SUPERVISOR');
    
    let supMap = {};
    for (let i = 1; i < dataMesas.length; i++) {
      const r = dataMesas[i];
      const promo = r[iPromo] ? String(r[iPromo]).trim().toUpperCase() : '';
      const sup = r[iSup] ? String(r[iSup]).trim().toUpperCase() : '';
      if (!promo || !sup) continue;
      if (!supMap[sup]) supMap[sup] = [];
      if (!supMap[sup].includes(promo)) supMap[sup].push(promo);
    }
    
    SEGS = Object.keys(supMap).map(sup => {
      let lbl = sup.length > 15 ? sup.split(' ')[0] : sup;
      if (lbl === 'RIERA' || sup.includes('RIERA')) lbl = 'RIERA SALA';
      return {
        key: sup.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        label: lbl,
        sdv: sup,
        promos: supMap[sup]
      };
    });

    // Procesar Maestro (Si el GAS ya envió los counts optimizados, los usamos directo)
    let promoCounts = {};
    if (data.maestro_counts) {
      promoCounts = data.maestro_counts;
    } else if (dataMaestro && dataMaestro.length > 0) {
      const headersMaestro = dataMaestro[0] || [];
      const matchCol = (cols, keywords) => cols.findIndex(c => {
        const lbl = String(c || '').trim().toUpperCase();
        return keywords.some(k => lbl.includes(k));
      });
      
      let iMPromo = matchCol(headersMaestro, ['PERSONAL COMERCIAL', 'PROMOTOR', 'FUERZA DE VENTA']);
      if (iMPromo === -1) iMPromo = matchCol(headersMaestro, ['VENDEDOR']);
      const iAnulado = matchCol(headersMaestro, ['ANULADO']);
      const iFvAnulado = matchCol(headersMaestro, ['FV1 ANULADO', 'FUERZA DE VENTA 1 ANULADO']);

      for (let i = 1; i < dataMaestro.length; i++) {
        const r = dataMaestro[i];
        const anu = iAnulado >= 0 && r[iAnulado] ? String(r[iAnulado]).trim().toUpperCase() : '';
        const fvAnu = iFvAnulado >= 0 && r[iFvAnulado] ? String(r[iFvAnulado]).trim().toUpperCase() : '';
        if (anu !== 'SI' && fvAnu !== 'SI') {
          const rawP = iMPromo >= 0 && r[iMPromo] ? String(r[iMPromo]).trim().toUpperCase() : '';
          if (rawP) {
            let p = rawP;
            const allKnownPromos = Object.values(supMap).flat();
            const known = allKnownPromos.find(kp => rawP.includes(kp) || kp.includes(rawP));
            p = known || rawP;
            promoCounts[p] = (promoCounts[p] || 0) + 1;
          }
        }
      }
    }
    
    // Si viene por data.maestro_counts, también normalizamos
    if (data.maestro_counts) {
      const normCounts = {};
      const allKnownPromos = Object.values(supMap).flat();
      Object.entries(data.maestro_counts).forEach(([k, v]) => {
        const cleanK = String(k).trim().toUpperCase();
        const known = allKnownPromos.find(kp => cleanK.includes(kp) || kp.includes(cleanK));
        const p = known || cleanK;
        normCounts[p] = (normCounts[p] || 0) + v;
      });
      promoCounts = normCounts;
    }
    
    CART_PROMO = promoCounts;

    // Actualizar activePromos en todos los ST
    [1,2,3,4,5,6].forEach(pg => {
      if (ST[pg]) ST[pg].activePromos = initActivePromos();
    });
  }

  let hasCache = false;
  const cachedRaw = localStorage.getItem(CACHE_KEY);
  if (cachedRaw) {
    try {
      const cachedData = JSON.parse(cachedRaw);
      applyData(cachedData);
      hasCache = true;
    } catch (e) {
      console.warn("Error parseando caché de config", e);
    }
  }

  let overlay;
  if (!hasCache) {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,37,89,0.95);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;font-size:26px;font-family:"Barlow Condensed",sans-serif;font-weight:700;color:#fff;flex-direction:column;gap:14px;transition:opacity 0.3s;';
    overlay.innerHTML = `
      <style>
        @keyframes spin-loader { 100% { transform: rotate(360deg); } }
        .svg-loader { animation: spin-loader 1s linear infinite; width: 38px; height: 38px; }
        .svg-loader circle.bg { stroke: #e2e8f0; }
        .svg-loader circle.fg { stroke: #2563eb; stroke-dasharray: 90; stroke-dashoffset: 40; stroke-linecap: round; }
      </style>
      <div style="display:flex;align-items:center;gap:14px;">
        <svg class="svg-loader" viewBox="0 0 50 50">
          <circle class="bg" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
          <circle class="fg" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>
        <div>Cargando mesas y cartera...</div>
      </div>
      <div style="font-size:15px;color:#64748b;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Conectando con Google Sheets</div>
    `;
    document.body.appendChild(overlay);
  }

  try {
    const fetchPromise = fetch(`${GAS_URL}?t=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error('Error HTTP: ' + res.status);
        return res.json();
      })
      .then(data => {
        if (data.status !== 'success') throw new Error(data.message || 'Error en Google Apps Script');
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        
        if (hasCache) {
          applyData(data);
          [1,2,3,6].forEach(pg => { if (typeof mkUN === 'function') mkUN(pg); });
          [1,2,3,4,5,6].forEach(pg => { if (typeof mkSDV === 'function') mkSDV(pg); });
          if (typeof renderAll === 'function') renderAll();
        } else {
          applyData(data);
          if (overlay) overlay.remove();
        }
      });

    if (!hasCache) {
      await fetchPromise;
    }
  } catch (err) {
    console.error('Error cargando config:', err);
    if (!hasCache) {
      alert('Error al descargar configuración de Google Sheets.\nMotivo: ' + err.message);
      if (overlay) overlay.remove();
    }
  }
}



