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
            const codigo = window.CODE_MAP && window.CODE_MAP[prom] ? window.CODE_MAP[prom] : prom;
            const rowPayload = { date, spv, promotor: prom, codigo, cMonth };
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
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          
          // Si el servidor devolvió un HTTP error (404, 500, etc.), reintentar
          if (!response.ok) {
            console.warn(`saveToServer: HTTP ${response.status}. Intento ${attempt + 1}/${MAX_RETRIES}`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
              continue;
            }
            if (!silent) console.error('saveToServer: servidor respondió con HTTP', response.status);
            return false;
          }
          
          let result;
          try {
            result = await response.json();
          } catch (parseErr) {
            // Respuesta no-JSON (HTML de error de Google, etc.) — reintentar
            console.warn(`saveToServer: respuesta no-JSON. Intento ${attempt + 1}/${MAX_RETRIES}`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
              continue;
            }
            if (!silent) console.error('saveToServer: respuesta no-JSON tras agotar reintentos');
            return false;
          }
          
          if (result.status === 'error' && result.retryable) {
            if (!silent) console.log(`Servidor ocupado. Reintento ${attempt + 1}/${MAX_RETRIES} en breve...`);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(r => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 1000));
              continue;
            }
            return false;
          }
          
          if (result.status === 'success') {
            window.currentCloudState = JSON.stringify(volData);
            return true;
          }
          
          if (!silent && result.message) {
            console.error('Error del servidor:', result.message);
          }
          return false;
          
        } catch (e) {
          // Error de red (offline, DNS, timeout, etc.) — reintentar
          console.warn(`saveToServer: error de red. Intento ${attempt + 1}/${MAX_RETRIES}`, e.message);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
            continue;
          }
          if (!silent) console.error('saveToServer: sin conexión tras agotar reintentos');
          return false;
        }
      }
      return false;
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

        // UN SOLO FETCH: init_bundle trae SKUs + Tareas + Datos del día en 1 sola respuesta
        const cMonth = window.getCommercialMonthAndStart(date).month;
        const fetchUrl = `${SCRIPT_URL}?req=init_bundle&date=${date}&cMonth=${cMonth}&spv=ALL&_t=${Date.now()}`;
        
        const SYNC_MAX_RETRIES = 3;
        let result = null;
        for (let attempt = 0; attempt < SYNC_MAX_RETRIES; attempt++) {
          try {
            btn.innerHTML = attempt === 0 ? '⏳ Descargando datos...' : `⏳ Reintentando (${attempt + 1}/${SYNC_MAX_RETRIES})...`;
            const response = await fetch(fetchUrl);
            
            if (!response.ok) {
              console.warn(`performSync: HTTP ${response.status}. Intento ${attempt + 1}/${SYNC_MAX_RETRIES}`);
              if (attempt < SYNC_MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
                continue;
              }
              throw new Error(`Servidor respondió con HTTP ${response.status}`);
            }
            
            try {
              result = await response.json();
            } catch (parseErr) {
              console.warn(`performSync: respuesta no-JSON. Intento ${attempt + 1}/${SYNC_MAX_RETRIES}`);
              if (attempt < SYNC_MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
                continue;
              }
              throw new Error('El servidor devolvió una respuesta inválida (no-JSON)');
            }
            
            if (result.status === 'success') break; // Éxito, salir del loop
            
            if (result.retryable) {
              btn.innerHTML = '⏳ Servidor ocupado, reintentando...';
              if (attempt < SYNC_MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
                continue;
              }
              throw new Error(result.message || 'Servidor ocupado tras agotar reintentos');
            }
            
            throw new Error(result.message || 'Error al sincronizar');
            
          } catch (fetchErr) {
            if (attempt < SYNC_MAX_RETRIES - 1 && !fetchErr.message.includes('Error al sincronizar')) {
              console.warn(`performSync: error de red. Intento ${attempt + 1}/${SYNC_MAX_RETRIES}`, fetchErr.message);
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
              continue;
            }
            throw fetchErr; // Último intento o error no-retriable, dejar que el catch exterior lo maneje
          }
        }
        if (!result || result.status !== 'success') {
          throw new Error('No se pudo sincronizar tras múltiples intentos');
        }
        
        // Procesar SKUs del bundle
        if (result.skus && result.skus.length > 0) {
          skuMaster = result.skus;
          console.log('SKU Master sincronizado (bundle):', skuMaster.length, 'items');
        }
        
        // Procesar Tareas del bundle
        if (result.tareas) {
          const map = {};
          for (const clienteId in result.tareas) {
            map[clienteId] = new Set(result.tareas[clienteId]);
          }
          tareasMaster = map;
          tareasSyncedMonth = cMonth;
          console.log('Plana de Tareas sincronizada (bundle):', Object.keys(map).length, 'clientes');
        }
        
        // Procesar datos del día
        const cloudData = {};
        const fetched = result.data || {};
        for (let fetchedKey in fetched) {
          let prom = (window.NAME_MAP && window.NAME_MAP[fetchedKey]) ? window.NAME_MAP[fetchedKey] : fetchedKey;
          // Parche de seguridad para problemas de codificación de la Ñ desde Google Sheets
          if (prom.includes('RENZO') && (prom.includes('MI') || prom.includes('MINO'))) {
            prom = 'MIÑO RENZO';
          }
          // Fusionar en vez de sobreescribir: distintas claves del backend (código VEND
          // para planificación/KPIs, nombre como fallback en Acumulados) pueden resolver
          // al mismo promotor, y no queremos que una pise los campos que trajo la otra.
          cloudData[prom] = Object.assign(cloudData[prom] || {}, fetched[fetchedKey]);
        }
        
        // Inyectar objetivos mensuales si vienen en la respuesta
        if (result.objectives && Object.keys(result.objectives).length > 0) {
          const objFields = ['obj-f1', 'obj-f2', 'obj-cv', 'obj-ac', 'obj-bc', 'obj-lt', 'obj-ung', 'obj-up', 'obj-rb', 'obj-ag'];
          for (const p in result.objectives) {
            if (!cloudData[p]) cloudData[p] = {};
            for (const f of objFields) {
              if (result.objectives[p][f] !== undefined) {
                cloudData[p][f] = result.objectives[p][f];
              }
            }
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