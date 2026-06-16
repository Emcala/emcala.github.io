    function loadSkuMaster() {
      try {
        const saved = localStorage.getItem('emcala_skus');
        if (saved) {
          try {
            skuMaster = JSON.parse(saved);
          } catch(e) {
            skuMaster = [];
          }
        }
      } catch (e) {
        console.warn('localStorage no disponible para skuMaster');
        skuMaster = [];
      }
    }

    async function syncSkus() {
      try {
        const response = await fetch(`${SCRIPT_URL}?req=skus`);
        const result = await response.json();
        if (result.status === 'success' && result.skus) {
          skuMaster = result.skus;
          localStorage.setItem('emcala_skus', JSON.stringify(skuMaster));
          console.log('SKU Master sincronizado:', skuMaster.length, 'items');
          return true;
        }
      } catch (e) {
        console.error('Error al sincronizar SKUs:', e);
      }
      return false;
    }

    function getStorageKey() {
      const date = window.currentLoadedDate || document.getElementById('date-input').value;
      return `emcala_vol_all_${date}_v3`;
    }

    function loadData() {
      const date = document.getElementById('date-input').value;
      const monthStr = window.getCommercialMonthAndStart(date).month;
      const mainKey = `emcala_vol_all_${date}_v3`;
      try {
        const saved = localStorage.getItem(mainKey);
        // Solo cargamos del localStorage los campos de planificación, nunca ventas
        const planFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p', 'acum-f1', 'acum-f2'];
        volData = {};
        if (saved) {
          const parsed = JSON.parse(saved);
          for (const prom in parsed) {
            volData[prom] = {};
            planFields.forEach(f => {
              if (parsed[prom][f] !== undefined) volData[prom][f] = parsed[prom][f];
            });
          }
        }
        window.currentCloudState = JSON.stringify(volData);
        // Inyectar objetivos mensuales
        const objStorageKey = `emcala_obj_${monthStr}`;
        const monthObjsStr = localStorage.getItem(objStorageKey);
        if (monthObjsStr) {
          const monthObjs = JSON.parse(monthObjsStr);
          for (const p in monthObjs) {
            if (!volData[p]) volData[p] = {};
            if (monthObjs[p]['obj-f1'] !== undefined) volData[p]['obj-f1'] = monthObjs[p]['obj-f1'];
            if (monthObjs[p]['obj-f2'] !== undefined) volData[p]['obj-f2'] = monthObjs[p]['obj-f2'];
          }
        }
        window.currentLoadedDate = date;
      } catch (e) {
        console.warn('localStorage no disponible para loadData');
        volData = {};
        window.currentLoadedDate = date;
      }
    }

    function saveData() {
      localStorage.setItem(getStorageKey(), JSON.stringify(volData));
    }

    function deletePromoterData(prom) {
      if (confirm(`¿Estás seguro de que deseas borrar SOLO la planificación de ${prom}? (Se mantendrán sus ventas)`)) {
        if (volData[prom]) {
          const planFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p'];
          planFields.forEach(f => {
            delete volData[prom][f];
          });
          saveData();
          renderTables();
          saveToServer(true); // Solo enviar campos de planificación, nunca pisar ventas
        }
      }
    }

    async function saveToServer(silent) {
      const date = window.currentLoadedDate || document.getElementById('date-input').value;
      if (SCRIPT_URL === 'AQUI_VA_LA_URL_DE_TU_APPS_SCRIPT') return false;
      const payload = [];
      const planFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p'];
      for (const spv in SPV_DATA) {
        SPV_DATA[spv].forEach(prom => {
          if (volData[prom]) {
            const cMonth = window.getCommercialMonthAndStart(date).month;
            const rowPayload = { date, spv, promotor: prom, cMonth };
            // Solo incluimos campos de planificación, NUNCA ventas.
            // Esto asegura que si el usuario dejó la página abierta por horas,
            // no sobrescriba las ventas reales de la nube con su caché local vieja.
            let hasData = false;
            planFields.forEach(f => {
              if (volData[prom][f] !== undefined && volData[prom][f] !== "") {
                rowPayload[f] = volData[prom][f];
                hasData = true;
              }
            });
            if (hasData) {
              payload.push(rowPayload);
            }
          }
        });
      }
      if (payload.length === 0) return false;
      try {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        return result.status === 'success';
      } catch (e) {
        if (!silent) console.error('Error guardando al servidor:', e);
        return false;
      }
    }

    async function syncAllDatesToCloud(sortedDates) {
      if (SCRIPT_URL === 'AQUI_VA_LA_URL_DE_TU_APPS_SCRIPT') return;
      const payload = [];
      const allFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p', 'acum-f1', 'acum-f2', 'f1-v', 'f1-cv', 'f1-ac', 'f1-bc', 'f1-lt', 'f2-v', 'f2-ung', 'f2-up', 'f2-rb', 'f2-ag', 'k1-v', 'k2-v', 'bol-v'];
      for (const pDate of sortedDates) {
        const storageKey = `emcala_vol_all_${pDate}_v3`;
        const saved = localStorage.getItem(storageKey);
        if (!saved) continue;
        let dataDay = {};
        try { dataDay = JSON.parse(saved); } catch(e){ continue; }
        for (const spv in SPV_DATA) {
          SPV_DATA[spv].forEach(prom => {
            if (dataDay[prom]) {
              const cMonth = window.getCommercialMonthAndStart(pDate).month;
              const rowPayload = { date: pDate, spv, promotor: prom, cMonth };
              let hasData = false;
              allFields.forEach(f => {
                if (dataDay[prom][f] !== undefined) {
                  rowPayload[f] = dataDay[prom][f];
                  hasData = true;
                }
              });
              if (hasData) {
                payload.push(rowPayload);
              }
            }
          });
        }
      }
      if (payload.length === 0) return;
      try {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
          console.log("Ventas masivas sincronizadas correctamente a la nube.");
        }
      } catch(e) {
        console.error("Error sincronizando ventas masivas:", e);
      }
    }

    async function performSync(isAutoSync = false) {
      const dateEl = document.getElementById('date-input');
      const date = dateEl.value;
      if (SCRIPT_URL === 'AQUI_VA_LA_URL_DE_TU_APPS_SCRIPT') { alert('Falta URL de Sheets'); return; }
      const btn = document.getElementById('btn-sync');
      btn.classList.remove('btn-needs-sync');
      const orig = btn.innerHTML;
      btn.innerHTML = '⏳ Sincronizando...'; 
      btn.disabled = true;
      dateEl.disabled = true;
      try {
        // Solo guardamos automáticamente ANTES de sincronizar si fue un clic manual del usuario.
        // Si es auto-sync al abrir la app, NO guardamos, para no pisar la nube con caché viejo local.
        if (!isAutoSync) {
          await saveToServer(true);
        }
        // 2. Sincronizar maestro de SKUs
        await syncSkus();
        // 3. Traer datos actualizados del servidor — SIEMPRE reemplaza volData completo
        const cloudData = {};
        const cMonth = window.getCommercialMonthAndStart(date).month;
        const promises = Object.keys(SPV_DATA).map(async (spv) => {
          const response = await fetch(`${SCRIPT_URL}?date=${date}&cMonth=${cMonth}&spv=${encodeURIComponent(spv)}&_t=${Date.now()}`);
          const result = await response.json();
          if (result.status === 'success') {
            const fetched = result.data || {};
            for (let originalProm in fetched) {
              let prom = originalProm;
              // Parche de seguridad para problemas de codificación de la Ñ desde Google Sheets
              if (prom.includes('RENZO') && (prom.includes('MI') || prom.includes('MINO'))) {
                prom = 'MIÑO RENZO';
              }
              if (!cloudData[prom]) cloudData[prom] = {};
              Object.assign(cloudData[prom], fetched[originalProm]);
            }
            // Guardar objetivos mensuales si vienen en la respuesta
            if (result.objectives && Object.keys(result.objectives).length > 0) {
              const monthStr = window.getCommercialMonthAndStart(date).month;
              const objStorageKey = `emcala_obj_${monthStr}`;
              localStorage.setItem(objStorageKey, JSON.stringify(result.objectives));
              // Inyectar en cloudData para mostrarlos instantáneamente
              for (const p in result.objectives) {
                if (!cloudData[p]) cloudData[p] = {};
                if (result.objectives[p]['obj-f1'] !== undefined) cloudData[p]['obj-f1'] = result.objectives[p]['obj-f1'];
                if (result.objectives[p]['obj-f2'] !== undefined) cloudData[p]['obj-f2'] = result.objectives[p]['obj-f2'];
              }
            }
          }
        });
        await Promise.all(promises);
        // Reemplazar volData con datos de la nube (no merge, reemplazo completo)
        volData = cloudData;
        window.currentLoadedDate = date;
        saveData();
        renderTables();
        window.currentCloudState = JSON.stringify(volData);
        // Indicador visual de éxito
        btn.innerHTML = '✅ Sincronizado'; 
        btn.disabled = false;
        dateEl.disabled = false;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
        return;
      } catch (e) {
        console.warn('Error de sincronización, intentando caché local:', e);
        // FALLBACK: si falla la nube, intentar cargar de localStorage
        loadData();
        renderTables();
        window.currentCloudState = JSON.stringify(volData);
        btn.innerHTML = '⚠️ Sin conexión (datos locales)';
        btn.disabled = false;
        dateEl.disabled = false;
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#ef4444';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 4000);
        return;
      }
    }