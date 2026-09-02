    if (isAuditor) {
      document.getElementById('kpi-dropdown-wrapper').style.display = 'inline-block';
      const toggleBtn = document.getElementById('btn-toggle-kpi');
      const kpiMenu = document.getElementById('spv-kpi-menu');
      
      toggleBtn.addEventListener('click', (e) => {
        kpiMenu.classList.toggle('active');
        e.stopPropagation();
      });
      
      document.addEventListener('click', (e) => {
        if (!kpiMenu.contains(e.target) && !toggleBtn.contains(e.target)) {
          kpiMenu.classList.remove('active');
        }
      });

      const met1 = document.getElementById('spv-kpi1-met');
      const tar1 = document.getElementById('spv-kpi1-tar');
      const met2 = document.getElementById('spv-kpi2-met');
      const tar2 = document.getElementById('spv-kpi2-tar');
      
      document.getElementById('btn-apply-kpi').addEventListener('click', () => {
        // Obtenemos los promotores (asumimos que SPV_DATA tiene las llaves)
        let promotores = [];
        for (const spv in SPV_DATA) {
          promotores = promotores.concat(SPV_DATA[spv]);
        }
        
        promotores.forEach(prom => {
          if (!volData[prom]) volData[prom] = {};
          volData[prom]['k1-met'] = met1.value;
          volData[prom]['k1-tar'] = tar1.value;
          volData[prom]['k2-met'] = met2.value;
          volData[prom]['k2-tar'] = tar2.value;
        });
        renderTables();
        saveToServer(true); // Auto save solo datos de planificación a la nube
        const btnSync = document.getElementById('btn-sync');
        if (btnSync) btnSync.classList.add('btn-needs-sync');
        
        kpiMenu.classList.remove('active'); // Close menu after applying
      });
      
      // Botón Archivar CCC Histórico
      const btnArchivar = document.getElementById('btn-archivar-ccc');
      if (btnArchivar) {
        btnArchivar.style.display = 'inline-block';
        btnArchivar.addEventListener('click', async () => {
          const cMonth = typeof window.getCommercialMonthAndStart === 'function' && window.currentDateObj 
             ? window.getCommercialMonthAndStart(window.currentDateObj).cMonth
             : document.getElementById('date-input').value.substring(0, 7);
             
          if (!confirm(`¿Estás seguro que querés archivar en el Histórico los CCC de Cerveza del mes comercial ${cMonth}?`)) {
            return;
          }
          
          btnArchivar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Archivando...';
          btnArchivar.disabled = true;
          
          try {
            const res = await fetch(`${SCRIPT_URL}?req=archivarHistorico&cMonth=${encodeURIComponent(cMonth)}`);
            const data = await res.json();
            if (data.status === 'success') {
              alert(`¡Éxito! ${data.message}`);
            } else {
              alert('Error: ' + data.message);
            }
          } catch (e) {
            alert('Error de red al intentar archivar: ' + e.message);
          } finally {
            btnArchivar.innerHTML = '<i class="fa-solid fa-box-archive"></i> Archivar CCC';
            btnArchivar.disabled = false;
          }
        });
      }
    }
    const tbody = document.getElementById('tbody-main');
    let volData = {};
    // === MAESTRO DE SKUs PARA VALIDACIÓN DE TAREAS ===
    let skuMaster = [];
    // Inicializar SKUs locales
    loadSkuMaster();
    // Función para mostrar/ocultar los promotores de un SPV
    window.toggleSpv = function (spvId) {
      const rows = document.querySelectorAll(`.prom-row-${spvId}`);
      const icon = document.getElementById(`icon-${spvId}`);
      if (rows.length > 0) {
        const isHidden = rows[0].style.display === 'none';
        rows.forEach(r => { r.style.display = isHidden ? '' : 'none'; });
        icon.textContent = isHidden ? '▼' : '▶';
      }
    };
    document.getElementById('date-input').addEventListener('change', () => {
      document.getElementById('btn-sync').click();
    });
    document.getElementById('btn-print').addEventListener('click', () => { window.print(); });

    document.getElementById('btn-copy-img').addEventListener('click', async () => {
      const btn = document.getElementById('btn-copy-img');
      const orig = btn.innerHTML;
      btn.innerHTML = '⏳ Capturando...';
      btn.disabled = true;
      try {
        // ── NUEVO: ocultar barra de botones antes de capturar ──
        const toolbar = document.getElementById('main-hdr');
        let toolbarWasVisible = false;
        if (toolbar) {
          toolbarWasVisible = toolbar.style.display !== 'none';
          toolbar.style.display = 'none';
        }
        await new Promise(r => setTimeout(r, 80)); // esperar que el DOM se repinte
        // ──────────────────────────────────────────────────────

        const captureEl = document.querySelector('#capture-area');
        // 1. Obtener fecha y hora actuales
        const dateInputVal = document.getElementById('date-input').value; // AAAA-MM-DD
        let formattedDate = '';
        if (dateInputVal) {
          const parts = dateInputVal.split('-');
          if (parts.length === 3) formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          formattedDate = new Date().toLocaleDateString('es-AR');
        }
        const formattedTime = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const titleText = `AVANCE VENTA · ${formattedDate} · ${formattedTime}`;
          const tableCont = captureEl.querySelector('.table-container');
          let origTableMaxHeight = '';
          let origTableOverflowY = '';
          if (tableCont) {
            origTableMaxHeight = tableCont.style.maxHeight;
            origTableOverflowY = tableCont.style.overflowY;
            tableCont.style.maxHeight = 'none';
            tableCont.style.overflowY = 'visible';
          }
          // Replace inputs with spans for html2canvas (it can't center text in inputs)
          const inputBackup = [];
          captureEl.querySelectorAll('input.cell-input').forEach(inp => {
            const span = document.createElement('span');
            span.textContent = inp.value;
            const compStyle = window.getComputedStyle(inp);
            span.style.cssText = compStyle.cssText;
            span.style.display = 'inline-block';
            span.style.width = '100%';
            span.style.height = '100%';
            span.style.textAlign = 'center';
            span.style.verticalAlign = 'middle';
            // Usamos el tamaño y line-height calculado real en vez de 10.5px fijo
            span.style.lineHeight = compStyle.lineHeight !== 'normal' ? compStyle.lineHeight : (inp.parentElement.style.height || '14px');
            span.style.fontSize = compStyle.fontSize;
            span.style.fontWeight = inp.classList.contains('real') ? '800' : '600';
            span.style.fontFamily = "'Aptos Display', 'Aptos', 'Barlow', sans-serif";
            span.style.padding = '0';
            span.style.margin = '0';
            span.style.border = 'none';
            // Respetamos el color de fondo y de texto para que salga el rojo/verde/ambar
            span.style.backgroundColor = compStyle.backgroundColor;
            span.style.color = compStyle.color;
            span.className = 'capture-span';
            inputBackup.push({ input: inp, parent: inp.parentElement });
            inp.parentElement.replaceChild(span, inp);
          });
        // Adaptar captura exactamente al tamaño de la grilla
        const originalWidth = captureEl.style.width;
        const originalMinWidth = captureEl.style.minWidth;
        const targetWidth = (tableCont ? tableCont.scrollWidth + 60 : captureEl.scrollWidth) + 'px';
        captureEl.style.width = targetWidth;
        captureEl.style.minWidth = targetWidth;
        // Guardamos las variables para restaurar luego (comportamiento unificado para todas las resoluciones)
        const origMargin = captureEl.style.margin;
        const origPosition = captureEl.style.position;
        const origLeft = captureEl.style.left;
        // Permitir que captureEl crezca de alto
        const origCaptureHeight = captureEl.style.height;
        const origCaptureMaxHeight = captureEl.style.maxHeight;
        const origCaptureOverflow = captureEl.style.overflow;
        const origCapturePaddingBottom = captureEl.style.paddingBottom;
        captureEl.style.height = 'auto';
        captureEl.style.maxHeight = 'none';
        captureEl.style.overflow = 'visible';
        captureEl.style.paddingBottom = '15px'; // Evita que se corte la tabla abajo
        // Esperar 50ms para asegurar que el navegador calcule el ancho/alto real
        await new Promise(r => setTimeout(r, 50));
        const canvas = await html2canvas(captureEl, {
          backgroundColor: '#0B2559',
          scale: 2,
          windowWidth: tableCont ? tableCont.scrollWidth + 60 : captureEl.scrollWidth,
          windowHeight: captureEl.scrollHeight + 20,
          logging: false,
          useCORS: true
        });
        // Restaurar ancho original
        captureEl.style.width = originalWidth;
        captureEl.style.minWidth = originalMinWidth;
        captureEl.style.margin = origMargin;
        captureEl.style.position = origPosition;
        captureEl.style.left = origLeft;
        captureEl.style.height = origCaptureHeight;
        captureEl.style.maxHeight = origCaptureMaxHeight;
        captureEl.style.overflow = origCaptureOverflow;
        captureEl.style.paddingBottom = origCapturePaddingBottom;
        // Restore inputs
        inputBackup.forEach(({ input, parent }) => {
          const span = parent.querySelector('.capture-span');
          if (span) parent.replaceChild(input, span);
        });
        if (tableCont) {
          tableCont.style.maxHeight = origTableMaxHeight;
          tableCont.style.overflowY = origTableOverflowY;
        }

        // ── NUEVO: restaurar barra ──
        if (toolbar && toolbarWasVisible) {
          toolbar.style.display = '';
        }
        // ───────────────────────────

        canvas.toBlob(async (blob) => {
          try {
            // Escribir imagen y texto descriptivo en el portapapeles
            const textBlob = new Blob([titleText], { type: 'text/plain' });
            const data = [new ClipboardItem({
              [blob.type]: blob,
              'text/plain': textBlob
            })];
            await navigator.clipboard.write(data);
            showCopyToast(titleText);
          } catch (err) {
            console.warn("Clipboard API no soportada. Descargando imagen...", err);
            // Fallback: descargar si falla el portapapeles
            const link = document.createElement('a');
            link.download = `Planificador_EMCALA_${formattedDate.replace(/\//g, '-')}.png`;
            link.href = canvas.toDataURL();
            link.click();
            showCopyToast(" Foto descargada a tu PC ⬇️");
          }
          btn.innerHTML = orig;
          btn.disabled = false;
        }, "image/png");
      } catch (e) {
        console.error(e);
        alert('Hubo un pequeño inconveniente al generar la captura. Por favor, reintenta.');
        btn.innerHTML = orig;
        btn.disabled = false;
      }
    });
    // Botón único de importación (Auto-detect)
    const btnImportAuto = document.getElementById('btn-import-auto');
    const autoFileInput = document.getElementById('auto-file-input');
    
    if (btnImportAuto && autoFileInput) {
      btnImportAuto.addEventListener('click', () => {
        autoFileInput.click();
      });
      
      autoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const origText = btnImportAuto.innerHTML;
        const ext = file.name.split('.').pop().toLowerCase();
        
        // --- 1. PROCESAMIENTO DE EXCEL (OBJETIVOS PAS) ---
        if (ext === 'xlsx' || ext === 'xls') {
          btnImportAuto.innerHTML = '⏳ Procesando Excel de Objetivos...';
          btnImportAuto.disabled = true;
          const reader = new FileReader();
          reader.onload = function(evt) {
            try {
              const data = new Uint8Array(evt.target.result);
              const workbook = XLSX.read(data, {type: 'array'});
              let promotoresFound = 0;
              const allPromoters = [];
              for (let spv in SPV_DATA) {
                allPromoters.push(...SPV_DATA[spv]);
              }
              const resetProms = {};
              let monthStr = window.getCommercialMonthAndStart(document.getElementById('date-input').value).month;
              let monthObjs = {};

              workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ''});
                let currentCategory = '';
                for (let i = 0; i < json.length; i++) {
                  const row = json[i];
                  if (!row || row.length === 0) continue;
                  const colA = String(row[0] || '').trim();
                  const colD = String(row[3] || '').trim();
                  const colG = parseFloat(row[6]) || 0; // Columna G es índice 6 (Objetivos)
                  
                  if (colA !== '') {
                    currentCategory = colA.toUpperCase();
                  }

                  // Normalización robusta para matching de promotores
                  const normalizeFlat = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/ig, "").toUpperCase();
                  const normalizeParts = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/ig, " ").trim().toUpperCase().split(/\s+/);
                  
                  const colDUpper = colD.toUpperCase();
                  const colDFlat = normalizeFlat(colD);
                  const colDParts = normalizeParts(colD);

                  let matchedProm = null;
                  if (colDFlat.length > 2 && colDUpper !== 'TOTAL' && colDUpper !== 'FOCO') {
                    // Detectar si la fila contiene el nombre de algún promotor conocido en la Columna D
                    matchedProm = allPromoters.find(p => {
                      const pFlat = normalizeFlat(p);
                      const pParts = normalizeParts(p);
                      const pInCol = pParts.every(part => colDParts.includes(part));
                      const colInP = colDParts.every(part => pParts.includes(part));
                      const isFlatMatch = colDFlat.includes(pFlat) || pFlat === colDFlat || (colDFlat.length > 5 && pFlat.includes(colDFlat));
                      return pInCol || colInP || isFlatMatch;
                    });
                  }

                  if (matchedProm && !colDUpper.includes('TOTAL') && !colDUpper.includes('FOCO')) {
                    if (!volData[matchedProm]) volData[matchedProm] = {};
                    if (!resetProms[matchedProm]) {
                      volData[matchedProm]['obj-cv'] = 0;
                      volData[matchedProm]['obj-ac'] = 0;
                      volData[matchedProm]['obj-up'] = 0;
                      volData[matchedProm]['obj-rb'] = 0;
                      volData[matchedProm]['obj-ag'] = 0;
                      volData[matchedProm]['obj-f2'] = 0;
                      resetProms[matchedProm] = true;
                      promotoresFound++;
                    }

                    if (currentCategory.includes('CORE VALUE') || currentCategory.includes('CORE+VALUE')) {
                      volData[matchedProm]['obj-cv'] += colG;
                    } else if (currentCategory.includes('ABOVE CORE')) {
                      volData[matchedProm]['obj-ac'] += colG;
                    } else if (currentCategory.includes('UNG TOP')) {
                      volData[matchedProm]['obj-up'] += colG;
                    } else if (currentCategory.includes('RED BULL') || currentCategory.includes('REDBULL')) {
                      volData[matchedProm]['obj-rb'] += colG;
                    } else if (currentCategory.includes('AGUAS')) {
                      volData[matchedProm]['obj-ag'] += colG;
                    } else if (currentCategory.includes('TOTAL UNG 2026') || currentCategory.includes('TOTAL UNG')) {
                      volData[matchedProm]['obj-f2'] += colG;
                    }
                  }
                }
              });

              for (const p in volData) {
                if (resetProms[p]) {
                  const cv = volData[p]['obj-cv'] || 0;
                  const ac = volData[p]['obj-ac'] || 0;
                  monthObjs[p] = {
                    'obj-f1': cv + ac,
                    'obj-f2': volData[p]['obj-f2'] || 0,
                    'obj-cv': cv,
                    'obj-ac': ac,
                    'obj-up': volData[p]['obj-up'] || 0,
                    'obj-rb': volData[p]['obj-rb'] || 0,
                    'obj-ag': volData[p]['obj-ag'] || 0
                  };
                }
              }
              
              renderTables(); 
              
              fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({ req: 'upload_objectives', month: monthStr, objectives: monthObjs })
              }).then(res => res.json()).then(res => {
                 if (res.status === 'success') {
                    alert(`✅ Excel de objetivos procesado. Se actualizaron ${promotoresFound} promotores y se guardaron los objetivos globales en la nube.`);
                 } else {
                    alert(`⚠️ Se cargaron los objetivos localmente, pero hubo un error subiendo a la nube: ` + res.message);
                 }
              }).catch(e => {
                 alert(`⚠️ Se cargaron los objetivos localmente, pero hubo un error de conexión subiendo a la nube.`);
              });
            } catch (error) {
              console.error(error);
              alert('❌ Ocurrió un error al procesar el archivo Excel. Asegúrate de subir el archivo correcto de objetivos.');
            } finally {
              btnImportAuto.innerHTML = origText;
              btnImportAuto.disabled = false;
              autoFileInput.value = '';
            }
          };
          reader.readAsArrayBuffer(file);
          return; 
        }
        
        // --- 2. PROCESAMIENTO DE CSV (AUTO-DETECCION) ---
        if (ext === 'csv') {
          btnImportAuto.innerHTML = '⏳ Detectando archivo...';
          btnImportAuto.disabled = true;
          
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const text = evt.target.result;
            autoFileInput.value = ''; // Reset
            
            // Limpiar BOM
            const cleanText = text.replace(/^\uFEFF/, '');
            const lines = cleanText.split('\n');
            if (lines.length < 2) { 
              alert('CSV vacío o sin datos'); 
              btnImportAuto.innerHTML = origText;
              btnImportAuto.disabled = false;
              return; 
            }
            
            const firstLine = lines[0];
            const separator = firstLine.includes(';') ? ';' : ',';
            const headers = firstLine.split(separator).map(s => s.trim().toLowerCase());
            
            // --- DETECCION SKUs ---
            const idxIdSKU = headers.findIndex(h => h.includes('sku') || h === 'código' || h === 'codigo' || h === 'id' || h.includes('material'));
            const idxShortSKU = headers.findIndex(h => h.includes('short') || h.includes('corta') || (h.includes('desc') && !h.includes('full') && !h.includes('larga')));
            const idxFullSKU = headers.findIndex(h => h.includes('full') || h.includes('larga') || h.includes('desc'));
            
            const isSkus = (idxIdSKU !== -1 && (idxShortSKU !== -1 || idxFullSKU !== -1) && !headers.some(h => h.includes('cliente_id') || h.includes('periodos')));
            
            // --- DETECCION TAREAS ---
            const idxClienteTarea = headers.findIndex(h => h.includes('cliente_id') || h === 'cliente' || (h.includes('cod') && h.includes('cliente')) || h.includes('clienteid'));
            const idxTarea = headers.findIndex(h => h.includes('tarea'));
            const isTareas = (idxClienteTarea !== -1 && idxTarea !== -1 && !headers.some(h => h.includes('periodos')));
            
            // --- DETECCION VENTAS ---
            // Periodos	Cod. Período	Descripción Período	Clientes	Cod. Cliente
            const hasPeriodos = headers.some(h => h.includes('periodo') || h.includes('período'));
            const hasCodPeriodo = headers.some(h => h.includes('cod') && (h.includes('periodo') || h.includes('período')));
            const hasClientes = headers.some(h => h === 'clientes' || h === 'cliente' || (h.includes('cliente') && !h.includes('cliente_id') && !h.includes('clienteid')));
            const isVentas = hasPeriodos && hasCodPeriodo && hasClientes;
            
            console.log('📋 Detección de archivo:', { isVentas, isTareas, isSkus, headers: headers.slice(0, 8) });

            if (!isVentas && !isTareas && !isSkus) {
              alert('⚠️ No se pudo determinar el tipo de archivo CSV.\n\nAsegurate de subir uno de estos formatos:\n• CSV de Ventas (con columnas Periodos, Cod. Período, etc.)\n• CSV de Tareas (con columnas cliente_id, tarea)\n• CSV de SKUs (con columnas sku/código, descripción)');
              btnImportAuto.innerHTML = origText;
              btnImportAuto.disabled = false;
              return;
            }
            
            // -- LOGICA VENTAS --
            if (isVentas) {
              btnImportAuto.innerHTML = '⏳ Sincronizando SKUs y Tareas...';
              
              await syncSkus();
              const cMonthActual = window.getCommercialMonthAndStart(document.getElementById('date-input').value).month;
              const okTareas = await syncTareas(cMonthActual);
              if (!okTareas) {
                const continuar = confirm('No se pudo cargar la Plana de Tareas.\nLa validación de CV puede salir en 0 para todos los promotores.\n\n¿Querés continuar igual con la importación de ventas?');
                if (!continuar) {
                  btnImportAuto.innerHTML = origText;
                  btnImportAuto.disabled = false;
                  return;
                }
              }
              
              btnImportAuto.innerHTML = '⏳ Procesando CSV de Ventas...';
              setTimeout(() => {
                try {
                  parseCSVAndApply(evt.target.result);
                } catch (error) {
                  console.error("Error procesando Ventas CSV:", error);
                  alert("Hubo un error procesando el archivo CSV de Ventas: " + error.message);
                } finally {
                  btnImportAuto.innerHTML = origText;
                  btnImportAuto.disabled = false;
                }
              }, 50);
              return;
            }
            
            // -- LOGICA TAREAS --
            if (isTareas) {
              btnImportAuto.innerHTML = '⏳ Procesando Plana de Tareas...';
              const tareasPorCliente = {};
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = line.split(separator);
                if (cols.length <= Math.max(idxClienteTarea, idxTarea)) continue;
                const clienteId = (cols[idxClienteTarea] || '').trim();
                const tarea = (cols[idxTarea] || '').trim();
                if (!clienteId || !tarea) continue;
                if (!tareasPorCliente[clienteId]) tareasPorCliente[clienteId] = new Set();
                tareasPorCliente[clienteId].add(tarea);
              }
              const clientesConTarea = Object.keys(tareasPorCliente);
              if (clientesConTarea.length === 0) { 
                alert('No se encontraron tareas asignadas en el CSV.'); 
                btnImportAuto.innerHTML = origText;
                btnImportAuto.disabled = false;
                return; 
              }
              
              const tareasPayload = {};
              let totalTareas = 0;
              clientesConTarea.forEach(cid => { 
                const arr = Array.from(tareasPorCliente[cid]);
                tareasPayload[cid] = arr;
                totalTareas += arr.length;
              });

              const cMonth = window.getCommercialMonthAndStart(document.getElementById('date-input').value).month;
              try {
                const response = await fetch(SCRIPT_URL, {
                  method: 'POST',
                  body: JSON.stringify({ req: 'upload_tareas', month: cMonth, tareas: tareasPayload })
                });
                const result = await response.json();
                if (result.status === 'success') {
                  alert(`¡Plana de Tareas de ${cMonth} actualizada correctamente en la nube!\n(${totalTareas} tareas asignadas en ${clientesConTarea.length} clientes)`);
                  await syncTareas(cMonth, true); 
                } else {
                  alert('Hubo un problema: ' + result.message);
                }
              } catch(err) {
                console.error(err);
                alert('Error de conexión al subir la Plana de Tareas: ' + err.message);
              }
              btnImportAuto.innerHTML = origText;
              btnImportAuto.disabled = false;
              return;
            }
            
            // -- LOGICA SKUS --
            if (isSkus) {
              btnImportAuto.innerHTML = '⏳ Procesando SKUs...';
              let idxS = idxShortSKU !== -1 ? idxShortSKU : idxFullSKU;
              let idxF = idxFullSKU !== -1 ? idxFullSKU : idxShortSKU;
              
              const skus = [];
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = line.split(separator).map(s => s.trim());
                if (cols.length > Math.max(idxIdSKU, idxS, idxF) && cols[idxIdSKU]) {
                  skus.push({ id: cols[idxIdSKU], s: cols[idxS] || '', f: cols[idxF] || '' });
                }
              }
              if (skus.length === 0) { 
                alert('No se encontraron SKUs en el CSV.'); 
                btnImportAuto.innerHTML = origText;
                btnImportAuto.disabled = false;
                return; 
              }
              
              try {
                const response = await fetch(SCRIPT_URL, {
                  method: 'POST',
                  body: JSON.stringify({ req: 'upload_skus', skus: skus })
                });
                const result = await response.json();
                if (result.status === 'success') {
                  alert('¡Maestro de SKUs actualizado correctamente en la nube!\nTodos los usuarios verán los nuevos SKUs en su próxima sincronización.');
                  await syncSkus(); 
                  document.getElementById('btn-sync').click();
                } else {
                  alert('Hubo un problema: ' + result.message);
                }
              } catch(err) {
                console.error(err);
                alert('Error de conexión al subir SKUs: ' + err.message);
              }
              btnImportAuto.innerHTML = origText;
              btnImportAuto.disabled = false;
              return;
            }
          };
          reader.readAsText(file);
        }
      });
    }
    
    document.getElementById('btn-clear').addEventListener('click', async () => {
      if (confirm('¿Seguro que deseas borrar TODA la planificación del día actual (sin afectar las ventas reales)?')) {
        const planFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p'];
        for (const prom in volData) {
          planFields.forEach(f => {
            delete volData[prom][f];
          });
        }
        renderTables();
        await saveToServer(true);
      }
    });

    document.getElementById('btn-sync').addEventListener('click', async (e) => {
      await performSync(false);
    });

    // Flujo Inicial Nube-First
    const plannerContainer = document.getElementById('planner-container');
    if (plannerContainer) {
      plannerContainer.innerHTML = '<div style="text-align:center; padding:50px; font-size:1.2rem; color:#64748b;">⏳ Conectando con la nube...</div>';
    }

    // Deshabilitar el botón YA (no recién dentro del setTimeout de abajo) para que un
    // clic manual justo al cargar la página no dispare un segundo performSync en paralelo
    // al auto-sync inicial — eso es lo que generaba el 404 intermitente contra Apps Script.
    (function lockSyncButtonUntilInitialSync() {
      const btn = document.getElementById('btn-sync');
      const dateEl = document.getElementById('date-input');
      if (btn) btn.disabled = true;
      if (dateEl) dateEl.disabled = true;
    })();

    setTimeout(async () => {
      // 1. Feedback visual INMEDIATO para evitar la "grilla estática"
      const btn = document.getElementById('btn-sync');
      const dateEl = document.getElementById('date-input');
      const origBtnText = btn ? btn.innerHTML : '';
      if (btn) { btn.innerHTML = '⏳ Conectando...'; btn.disabled = true; }
      if (dateEl) dateEl.disabled = true;

      let mesasOk = await fetchMesasFromServer();
      if (!mesasOk || Object.keys(SPV_DATA).length === 0) {
        // Reintentar una vez más tras 3 segundos
        console.warn('Mesas no cargaron a la primera. Reintentando en 3s...');
        if (btn) btn.innerHTML = '⏳ Reintentando...';
        await new Promise(r => setTimeout(r, 3000));
        mesasOk = await fetchMesasFromServer();
      }
      if (!mesasOk || Object.keys(SPV_DATA).length === 0) {
        if (btn) { btn.innerHTML = '❌ Error al cargar mesas'; btn.style.color = '#ef4444'; }
        if (plannerContainer) {
            plannerContainer.innerHTML = '<div style="text-align:center; padding:50px; font-size:1.2rem; color:#ef4444;">❌ No se pudieron cargar las mesas de promotores. Verificá tu conexión o recargá la página.</div>';
        }
        alert('No se pudieron cargar las mesas de promotores.\nVerificá tu conexión a internet e intentá recargar la página.');
        return;
      }
      
      // 2. Restaurar botón temporalmente antes de pasárselo a performSync
      if (btn) btn.innerHTML = origBtnText;
      
      applyRoleFilter(); 
      await performSync(true);
    }, 300);