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

    // === Plana de Tareas (validación CV): { clienteId: Set(tarea1, tarea2, ...) } ===
    // Se cachea por mes comercial durante la sesión — no se vuelve a pedir si ya se trajo ese mes.
    let tareasMaster = null;
    let tareasSyncedMonth = null;

    async function syncTareas(cMonth, forceRefresh) {
      if (tareasSyncedMonth === cMonth && tareasMaster && !forceRefresh) return true;
      try {
        const response = await fetch(`${SCRIPT_URL}?req=tareas&cMonth=${encodeURIComponent(cMonth)}`);
        const result = await response.json();
        if (result.status === 'success' && result.tareas) {
          const map = {};
          for (const clienteId in result.tareas) {
            map[clienteId] = new Set(result.tareas[clienteId]);
          }
          tareasMaster = map;
          tareasSyncedMonth = cMonth;
          console.log('Plana de Tareas sincronizada para', cMonth, ':', Object.keys(map).length, 'clientes');
          return true;
        }
      } catch (e) {
        console.error('Error al sincronizar Plana de Tareas:', e);
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
      // Base de comparación: última foto conocida del servidor (o el último guardado exitoso).
      // Evita reenviar TODOS los promotores en cada guardado; solo se manda lo que cambió.
      let baseline = {};
      try {
        baseline = window.currentCloudState ? JSON.parse(window.currentCloudState) : {};
      } catch (e) {
        baseline = {};
      }
      for (const spv in SPV_DATA) {
        SPV_DATA[spv].forEach(prom => {
          if (volData[prom]) {
            const cMonth = window.getCommercialMonthAndStart(date).month;
            const rowPayload = { date, spv, promotor: prom, cMonth };
            let hasChanges = false;
            const baseProm = baseline[prom] || {};
            planFields.forEach(f => {
              const curVal = volData[prom][f];
              if (curVal !== undefined && curVal !== "") {
                // Solo incluir el campo si difiere de lo último sincronizado con el servidor
                if (baseProm[f] === undefined || String(baseProm[f]) !== String(curVal)) {
                  rowPayload[f] = curVal;
                  hasChanges = true;
                }
              }
            });
            if (hasChanges) {
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
        if (result.status === 'success') {
          // Actualizar la base de comparación para que el próximo guardado
          // solo mande lo que cambie a partir de ahora.
          window.currentCloudState = JSON.stringify(volData);
        }
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
        // Sincronizar maestro de SKUs SOLO en carga inicial
        if (isAutoSync) {
          syncSkus(); // Non-blocking en auto-sync
          const cMonthInit = window.getCommercialMonthAndStart(date).month;
          syncTareas(cMonthInit); // Non-blocking: pre-cargar Plana de Tareas
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