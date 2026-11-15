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
    const iVend = headersMesas.findIndex(c => String(c).trim().toUpperCase() === 'VEND.');
    
    // Preferir la columna "Nombre SDV" (columna C) que tiene los nombres legibles de los supervisores
    let iNomSDV = headersMesas.findIndex(c => String(c).trim().toUpperCase().includes('NOMBRE'));
    if (iNomSDV === -1) iNomSDV = iSup; // fallback a SUPERVISOR si no existe
    
    let supMap = {};
    window.NAME_TO_VEND = {};    // promotor → código VEND
    window.VEND_TO_CANAL = {};   // código VEND → canal (AS, REF, K+T, MAYO, etc.)
    
    const iCanal = headersMesas.findIndex(c => String(c).trim().toUpperCase() === 'CANAL');
    
    for (let i = 1; i < dataMesas.length; i++) {
      const r = dataMesas[i];
      const promo = r[iPromo] ? String(r[iPromo]).trim().toUpperCase() : '';
      const sup = r[iNomSDV] ? String(r[iNomSDV]).trim().toUpperCase() : '';
      
      let vend = '';
      if (iVend >= 0 && r[iVend] !== null && r[iVend] !== undefined) {
          const vStr = String(r[iVend]).trim();
          vend = isNaN(parseInt(vStr, 10)) ? vStr : String(parseInt(vStr, 10));
      }
      
      let canal = '';
      if (iCanal >= 0 && r[iCanal]) {
          canal = String(r[iCanal]).trim().toUpperCase();
      }

      if (!promo || !sup) continue;
      
      if (vend) {
          window.NAME_TO_VEND[promo] = vend;
          if (canal) {
              window.VEND_TO_CANAL[vend] = canal;
          }
      }
      
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
    let promoCervCounts = {};
    const hasCounts = !!(data.maestro_counts && Object.keys(data.maestro_counts).length);
    const hasCervCounts = !!(data.maestro_counts_cerveza && Object.keys(data.maestro_counts_cerveza).length);
    const allKnownPromos = Object.values(supMap).flat();

    const vendToName = {};
    Object.entries(window.NAME_TO_VEND || {}).forEach(([name, code]) => {
      const c = String(code == null ? '' : code).trim();
      if (c) vendToName[c] = name;
    });

    const normPromoKey = raw => {
      const rawP = String(raw == null ? '' : raw).trim().toUpperCase();
      if (!rawP) return '';
      const mapped = vendToName[rawP] ||
        allKnownPromos.find(kp => rawP.includes(kp) || kp.includes(rawP)) ||
        rawP;
      return mapped === 'VTA DEPOSITO' ? '' : mapped;
    };

    const isSi = v => {
      const s = String(v == null ? '' : v).trim().toUpperCase();
      return s === 'SI' || s === 'SÍ' || s === 'YES' || s === 'TRUE' || s === '1';
    };

    // 1) Camino rápido: conteos ya calculados por el GAS
    if (hasCounts) {
      Object.entries(data.maestro_counts).forEach(([k, v]) => {
        const p = normPromoKey(k);
        if (!p) return;
        promoCounts[p] = (promoCounts[p] || 0) + (Number(v) || 0);
      });
    }
    if (hasCervCounts) {
      Object.entries(data.maestro_counts_cerveza).forEach(([k, v]) => {
        const p = normPromoKey(k);
        if (!p) return;
        promoCervCounts[p] = (promoCervCounts[p] || 0) + (Number(v) || 0);
      });
    }

    // 2) Fallback / cálculo desde el maestro completo
    if (dataMaestro && dataMaestro.length > 0) {
      const headersMaestro = dataMaestro[0] || [];
      const normHdr = s => String(s == null ? '' : s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim().toUpperCase();
      const matchCol = (keywords, exact) => headersMaestro.findIndex(c => {
        const lbl = normHdr(c);
        return exact
          ? keywords.some(k => lbl === normHdr(k))
          : keywords.some(k => lbl.includes(normHdr(k)));
      });

      // Nombre del promotor (evitar la columna de código "Personal comercial")
      let iMPromo = matchCol(['FUERZA DE VENTA 1 DESCRIPCION PERSONAL COMERCIAL'], true);
      if (iMPromo === -1) iMPromo = matchCol(['DESCRIPCION PERSONAL COMERCIAL']);
      if (iMPromo === -1) iMPromo = matchCol(['PERSONAL COMERCIAL']);
      if (iMPromo === -1) iMPromo = matchCol(['PROMOTOR']);
      if (iMPromo === -1) iMPromo = matchCol(['VENDEDOR']);

      let iAnulado = matchCol(['ANULADO'], true);
      if (iAnulado === -1) iAnulado = matchCol(['ANULADO']);
      let iFvAnulado = matchCol(['FUERZA DE VENTA 1 ANULADO'], true);
      if (iFvAnulado === -1) iFvAnulado = matchCol(['FV1 ANULADO', 'FUERZA DE VENTA 1 ANULADO']);

      // Permiso para vender cerveza
      let iLic = matchCol(['LICENCIA ALCOHOL'], true);
      if (iLic === -1) iLic = matchCol(['LICENCIA ALCOHOL']);

      if (iLic === -1 && !hasCervCounts) {
        console.warn('Análisis Anual: el maestro no trae la columna "Licencia alcohol"; la cartera de Cerveza usará la cartera total.');
      }

      for (let i = 1; i < dataMaestro.length; i++) {
        const r = dataMaestro[i];
        if (!r) continue;
        if (isSi(iAnulado >= 0 ? r[iAnulado] : '') || isSi(iFvAnulado >= 0 ? r[iFvAnulado] : '')) continue;

        const p = normPromoKey(iMPromo >= 0 ? r[iMPromo] : '');
        if (!p) continue;

        if (!hasCounts) {
          promoCounts[p] = (promoCounts[p] || 0) + 1;
        }
        if (!hasCervCounts && iLic >= 0 && isSi(r[iLic])) {
          promoCervCounts[p] = (promoCervCounts[p] || 0) + 1;
        }
      }
    }

    CART_PROMO = promoCounts;
    CART_PROMO_CERV = Object.keys(promoCervCounts).length ? promoCervCounts : promoCounts;

    if (!Object.keys(promoCervCounts).length) {
      console.warn('Análisis Anual: no se pudo calcular la cartera de Cerveza con licencia; se usa la cartera total.');
    }

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



