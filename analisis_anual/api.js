function fetchSheetJSONP(sheetId, gid) {
  return new Promise((resolve, reject) => {
    const cb = 'gviz_cb_' + Math.random().toString(36).substring(2);
    window[cb] = function(data) {
      delete window[cb];
      document.head.removeChild(script);
      if (data && data.status === 'error') {
        const msg = (data.errors && data.errors[0] && data.errors[0].message) ? data.errors[0].message : 'Acceso denegado o archivo no encontrado';
        reject(new Error('Google Sheets: ' + msg));
      } else {
        resolve(data);
      }
    };
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${cb}&gid=${gid}&headers=1`;
    script.onerror = () => reject(new Error('Failed to load JSONP'));
    document.head.appendChild(script);
  });
}

async function fetchConfigData() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;font-size:24px;font-family:"Barlow Condensed";font-weight:700;color:#1a56db;flex-direction:column;gap:10px;';
  overlay.innerHTML = '<div>🔄 Cargando configuración de mesas y cartera...</div><div style="font-size:14px;color:#6b6b7a;font-weight:500;">Conectando con Google Sheets</div>';
  document.body.appendChild(overlay);

  try {
    const [dataMesas, dataMaestro] = await Promise.all([
      fetchSheetJSONP('1SYNVATCfdV1-OatJ5VOHktDLRoYRO26CEM8_taNhd9c', '0'),
      fetchSheetJSONP('1XckEGDuSZ5r6vREiJUeWQftzxqby8N71YcjlYP37iVs', '0')
    ]);

    // Procesar Mesas
    const iPromo = dataMesas.table.cols.findIndex(c => c && c.label === 'PROMOTOR');
    const iSup = dataMesas.table.cols.findIndex(c => c && c.label === 'SUPERVISOR');
    
    let supMap = {};
    dataMesas.table.rows.forEach(r => {
      if (!r.c) return;
      const promo = r.c[iPromo] && r.c[iPromo].v ? String(r.c[iPromo].v).trim().toUpperCase() : '';
      const sup = r.c[iSup] && r.c[iSup].v ? String(r.c[iSup].v).trim().toUpperCase() : '';
      if (!promo || !sup) return;
      if (!supMap[sup]) supMap[sup] = [];
      if (!supMap[sup].includes(promo)) supMap[sup].push(promo);
    });
    
    SEGS = Object.keys(supMap).map(sup => ({
      key: sup.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      label: sup.length > 15 ? sup.split(' ')[0] : sup,
      sdv: sup,
      promos: supMap[sup]
    }));

    // Procesar Maestro
    const matchCol = (cols, keywords) => cols.findIndex(c => {
      if (!c || !c.label) return false;
      const lbl = String(c.label).trim().toUpperCase();
      return keywords.some(k => lbl.includes(k));
    });
    
    let iMPromo = matchCol(dataMaestro.table.cols, ['PERSONAL COMERCIAL', 'PROMOTOR', 'FUERZA DE VENTA']);
    if (iMPromo === -1) iMPromo = matchCol(dataMaestro.table.cols, ['VENDEDOR']);
    const iAnulado = matchCol(dataMaestro.table.cols, ['ANULADO']);
    const iFvAnulado = matchCol(dataMaestro.table.cols, ['FV1 ANULADO', 'FUERZA DE VENTA 1 ANULADO']);

    let promoCounts = {};
    dataMaestro.table.rows.forEach(r => {
      if (!r.c) return;
      const anu = iAnulado >= 0 && r.c[iAnulado] && r.c[iAnulado].v ? String(r.c[iAnulado].v).trim().toUpperCase() : '';
      const fvAnu = iFvAnulado >= 0 && r.c[iFvAnulado] && r.c[iFvAnulado].v ? String(r.c[iFvAnulado].v).trim().toUpperCase() : '';
      if (anu !== 'SI' && fvAnu !== 'SI') {
        const p = iMPromo >= 0 && r.c[iMPromo] && r.c[iMPromo].v ? String(r.c[iMPromo].v).trim().toUpperCase() : '';
        if (p) {
          promoCounts[p] = (promoCounts[p] || 0) + 1;
        }
      }
    });
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

