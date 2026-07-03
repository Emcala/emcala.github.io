    // === SKU Master (solo en memoria, nunca en localStorage) ===
    function loadSkuMaster() {
      // SKUs se cargan exclusivamente desde la nube via syncSkus()
      // Esta función existe como placeholder para compatibilidad
      if (!skuMaster || skuMaster.length === 0) {
        skuMaster = [];
      }
    }

    async function syncSkus() {
      try {
        const response = await fetch(`${SCRIPT_URL}?req=skus`);
        const result = await response.json();
        if (result.status === 'success' && result.skus) {
          skuMaster = result.skus;
          console.log('SKU Master sincronizado:', skuMaster.length, 'items');
          return true;
        }
      } catch (e) {
        console.error('Error al sincronizar SKUs:', e);
      }
      return false;
    }

    // === Datos de volumen (solo en memoria, nube como fuente única de verdad) ===

    function deletePromoterData(prom) {
      if (confirm(`¿Estás seguro de que deseas borrar SOLO la planificación de ${prom}? (Se mantendrán sus ventas)`)) {
        if (volData[prom]) {
          const planFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p'];
          planFields.forEach(f => {
            delete volData[prom][f];
          });
          renderTables();
          saveToServer(true);
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

      // Permitir que el navegador dibuje el texto '⏳ Sincronizando...' antes de bloquear el hilo
      await new Promise(r => setTimeout(r, 10));

      try {
        // Solo guardar planificación pendiente si fue clic manual del usuario
        if (!isAutoSync) {
          await saveToServer(true);
        }
        // Sincronizar maestro de SKUs
        if (!isAutoSync) {
          await syncSkus();
        } else {
          syncSkus(); // Non-blocking en auto-sync
        }

        // UN SOLO FETCH: traer TODOS los datos del día (sin filtrar por SPV)
        const cMonth = window.getCommercialMonthAndStart(date).month;
        const fetchUrl = `${SCRIPT_URL}?date=${date}&cMonth=${cMonth}&spv=ALL&_t=${Date.now()}`;
        
        btn.innerHTML = '⏳ Descargando datos...';
        const response = await fetch(fetchUrl);
        const result = await response.json();
        
        if (result.status !== 'success') {
          throw new Error(result.message || 'Error al sincronizar');
        }
        
        const cloudData = {};
        const fetched = result.data || {};
        for (let originalProm in fetched) {
          let prom = originalProm;
          // Parche de seguridad para problemas de codificación de la Ñ desde Google Sheets
          if (prom.includes('RENZO') && (prom.includes('MI') || prom.includes('MINO'))) {
            prom = 'MIÑO RENZO';
          }
          cloudData[prom] = fetched[originalProm];
        }
        
        // Inyectar objetivos mensuales si vienen en la respuesta
        if (result.objectives && Object.keys(result.objectives).length > 0) {
          for (const p in result.objectives) {
            if (!cloudData[p]) cloudData[p] = {};
            if (result.objectives[p]['obj-f1'] !== undefined) cloudData[p]['obj-f1'] = result.objectives[p]['obj-f1'];
            if (result.objectives[p]['obj-f2'] !== undefined) cloudData[p]['obj-f2'] = result.objectives[p]['obj-f2'];
          }
        }
        
        // Reemplazar volData con datos de la nube (reemplazo completo)
        volData = cloudData;
        window.currentLoadedDate = date;
        renderTables();
        window.currentCloudState = JSON.stringify(volData);
        
        // Indicador visual de éxito
        btn.innerHTML = '✅ Sincronizado'; 
        btn.disabled = false;
        dateEl.disabled = false;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
        return;
      } catch (e) {
        console.warn('Error de sincronización:', e);
        // Sin localStorage fallback — mostrar error claro
        volData = {};
        renderTables();
        btn.innerHTML = '❌ Sin conexión';
        btn.disabled = false;
        dateEl.disabled = false;
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#ef4444';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.borderColor = '';
          btn.style.color = '';
          btn.classList.add('btn-needs-sync');
        }, 4000);
        return;
      }
    }