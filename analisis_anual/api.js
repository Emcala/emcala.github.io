async function fetchConfigData() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;font-size:24px;font-family:"Barlow Condensed";font-weight:700;color:#1a56db;flex-direction:column;gap:10px;';
  overlay.innerHTML = '<div>🔄 Cargando configuración de mesas y cartera...</div><div style="font-size:14px;color:#6b6b7a;font-weight:500;">Conectando con Google Sheets</div>';
  document.body.appendChild(overlay);

  try {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycby25P-2-HSw7tQcbhpwaWs5hj97kq4UWO_LYuzml7BAYvoIMNM_icn1RQ3Q8H01uHA/exec';
    
    // Evitamos caché para forzar la lectura real
    const response = await fetch(`${GAS_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error('Error HTTP: ' + response.status);
    
    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.message || 'Error en Google Apps Script');

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
    
    SEGS = Object.keys(supMap).map(sup => ({
      key: sup.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: sup.length > 15 ? sup.split(' ')[0] : sup,
      sdv: sup,
      promos: supMap[sup]
    }));

    // Procesar Maestro
    const headersMaestro = dataMaestro[0] || [];
    const matchCol = (cols, keywords) => cols.findIndex(c => {
      const lbl = String(c || '').trim().toUpperCase();
      return keywords.some(k => lbl.includes(k));
    });
    
    let iMPromo = matchCol(headersMaestro, ['PERSONAL COMERCIAL', 'PROMOTOR', 'FUERZA DE VENTA']);
    if (iMPromo === -1) iMPromo = matchCol(headersMaestro, ['VENDEDOR']);
    const iAnulado = matchCol(headersMaestro, ['ANULADO']);
    const iFvAnulado = matchCol(headersMaestro, ['FV1 ANULADO', 'FUERZA DE VENTA 1 ANULADO']);

    let promoCounts = {};
    for (let i = 1; i < dataMaestro.length; i++) {
      const r = dataMaestro[i];
      const anu = iAnulado >= 0 && r[iAnulado] ? String(r[iAnulado]).trim().toUpperCase() : '';
      const fvAnu = iFvAnulado >= 0 && r[iFvAnulado] ? String(r[iFvAnulado]).trim().toUpperCase() : '';
      if (anu !== 'SI' && fvAnu !== 'SI') {
        const p = iMPromo >= 0 && r[iMPromo] ? String(r[iMPromo]).trim().toUpperCase() : '';
        if (p) {
          promoCounts[p] = (promoCounts[p] || 0) + 1;
        }
      }
    }
    CART_PROMO = promoCounts;

    // Actualizar activePromos en todos los ST
    [1,2,3,4,5,6].forEach(pg => {
      if (ST[pg]) ST[pg].activePromos = initActivePromos();
    });

  } catch (err) {
    console.error('Error cargando config:', err);
    alert('Error al descargar configuración de Google Sheets.\nMotivo: ' + err.message);
  }
  
  overlay.remove();
}

function openCacheDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDataCache() {
  try {
    const db = await openCacheDB();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const st = tx.objectStore(CACHE_STORE);
      st.put({
        id: CACHE_KEY,
        rows: DATA,
        savedAt: Date.now(),
        years: [...new Set(DATA.map(r => r.yr))].sort(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('No se pudo guardar cache local:', err);
  }
}

async function loadDataCache() {
  try {
    const db = await openCacheDB();
    if (!db) return null;
    const snap = await new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const st = tx.objectStore(CACHE_STORE);
      const rq = st.get(CACHE_KEY);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => reject(rq.error);
    });
    db.close();
    return snap;
  } catch (err) {
    console.warn('No se pudo leer cache local:', err);
    return null;
  }
}

