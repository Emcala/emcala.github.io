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
    // Event listener para botón de Importar CSV
    const btnImportCsv = document.getElementById('btn-import-csv');
    const csvFileInput = document.getElementById('csv-file-input');
    btnImportCsv.addEventListener('click', () => {
      csvFileInput.click();
    });
    csvFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const origText = btnImportCsv.innerHTML;
      btnImportCsv.innerHTML = '⏳ Sincronizando SKUs...';
      btnImportCsv.disabled = true;
      // Sincronizar SKUs antes de procesar el archivo elegido
      await syncSkus();
      // Sincronizar Plana de Tareas (del mes actual) y Maestro de Clientes — necesarios para validar CV
      btnImportCsv.innerHTML = '⏳ Sincronizando Plana de Tareas...';
      const cMonthActual = window.getCommercialMonthAndStart(document.getElementById('date-input').value).month;
      const okTareas = await syncTareas(cMonthActual);
      const okVisitas = await syncVisitDays();
      if (!okTareas || !okVisitas) {
        const continuar = confirm('No se pudo cargar la Plana de Tareas y/o el Maestro de Clientes.\nLa validación de CV puede salir en 0 para todos los promotores.\n\n¿Querés continuar igual con la importación?');
        if (!continuar) {
          btnImportCsv.innerHTML = origText;
          btnImportCsv.disabled = false;
          csvFileInput.value = '';
          return;
        }
      }
      btnImportCsv.innerHTML = '⏳ Procesando CSV...';
      const reader = new FileReader();
      reader.onload = (evt) => {
        // Usar setTimeout para permitir que la UI se renderice antes de bloquear el hilo
        setTimeout(() => {
          try {
            parseCSVAndApply(evt.target.result);
          } catch (error) {
            console.error("Error procesando CSV:", error);
            alert("Hubo un error procesando el archivo CSV: " + error.message);
          } finally {
            csvFileInput.value = ''; // Reset
            btnImportCsv.innerHTML = origText;
            btnImportCsv.disabled = false;
          }
        }, 50);
      };
      reader.readAsText(file);
    });
    const btnImportSkus = document.getElementById('btn-import-skus');
    const csvSkusInput = document.getElementById('csv-skus-input');
    btnImportSkus.addEventListener('click', () => {
      csvSkusInput.click();
    });
    csvSkusInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target.result;
        csvSkusInput.value = ''; // Reset
        const lines = text.split('\n');
        if (lines.length < 2) { alert('CSV vacío o sin datos'); return; }
        // Detectar separador
        const firstLine = lines[0];
        const separator = firstLine.includes(';') ? ';' : ',';
        // Autodetectar columnas
        const headers = firstLine.split(separator).map(s => s.trim().toLowerCase());
        let idxId = headers.findIndex(h => h.includes('sku') || h.includes('código') || h.includes('codigo') || h.includes('id') || h.includes('material'));
        let idxShort = headers.findIndex(h => h.includes('short') || h.includes('corta') || (h.includes('desc') && !h.includes('full') && !h.includes('larga')));
        let idxFull = headers.findIndex(h => h.includes('full') || h.includes('larga') || h.includes('desc'));
        // Validación estricta
        if (idxId === -1 || (idxShort === -1 && idxFull === -1)) {
          alert('❌ Error: El archivo CSV no tiene el formato correcto para SKUs.\n\nDebe contener encabezados en la primera fila como "Código" o "SKU" y "Descripción".');
          return;
        }
        // Fallbacks por si solo hay un tipo de descripción
        if (idxShort === -1) idxShort = idxFull;
        if (idxFull === -1) idxFull = idxShort;
        const skus = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(separator).map(s => s.trim());
          // Asegurar que la fila tiene suficientes columnas
          if (cols.length > Math.max(idxId, idxShort, idxFull) && cols[idxId]) {
            skus.push({ id: cols[idxId], s: cols[idxShort] || '', f: cols[idxFull] || '' });
          }
        }
        if (skus.length === 0) { alert('No se encontraron SKUs en el CSV.'); return; }
        const origText = btnImportSkus.innerHTML;
        btnImportSkus.innerHTML = '⏳ Subiendo...';
        btnImportSkus.disabled = true;
        try {
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ req: 'upload_skus', skus: skus })
          });
          const result = await response.json();
          if (result.status === 'success') {
            alert('¡Maestro de SKUs actualizado correctamente en la nube!\nTodos los usuarios verán los nuevos SKUs en su próxima sincronización.');
            await syncSkus(); // Sincronizar en memoria tras la subida exitosa
            document.getElementById('btn-sync').click(); // Auto sync
          } else {
            alert('Hubo un problema: ' + result.message);
          }
        } catch(err) {
          console.error(err);
          alert('Error de conexión al subir SKUs: ' + err.message + '\n\nRevisa si actualizaste la SCRIPT_URL correctamente en el código HTML.');
        }
        btnImportSkus.innerHTML = origText;
        btnImportSkus.disabled = false;
      };
      reader.readAsText(file);
    });
    const btnImportTareas = document.getElementById('btn-import-tareas');
    const csvTareasInput = document.getElementById('csv-tareas-input');
    btnImportTareas.addEventListener('click', () => {
      csvTareasInput.click();
    });
    csvTareasInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target.result;
        csvTareasInput.value = ''; // Reset
        // Quitar BOM si viene (Excel suele agregarlo)
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split('\n');
        if (lines.length < 2) { alert('CSV vacío o sin datos'); return; }
        // Detectar separador (la bajada de tareas suele venir con ';')
        const firstLine = lines[0];
        const separator = firstLine.includes(';') ? ';' : ',';
        // Autodetectar columnas: solo necesitamos cliente_id y TAREA, el resto se ignora
        const headers = firstLine.split(separator).map(s => s.trim().toLowerCase());
        const idxCliente = headers.findIndex(h => h.includes('cliente_id') || h === 'cliente' || h.includes('cod') && h.includes('cliente'));
        const idxTarea = headers.findIndex(h => h.includes('tarea'));
        if (idxCliente === -1 || idxTarea === -1) {
          alert('❌ Error: El archivo CSV no tiene el formato correcto para la Plana de Tareas.\n\nDebe contener columnas "cliente_id" y "TAREA".');
          return;
        }
        // Agrupar por cliente, deduplicando tareas repetidas (una fila por día/tarea en el archivo original)
        const tareasPorCliente = {};
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(separator);
          if (cols.length <= Math.max(idxCliente, idxTarea)) continue;
          const clienteId = (cols[idxCliente] || '').trim();
          const tarea = (cols[idxTarea] || '').trim();
          if (!clienteId || !tarea) continue;
          if (!tareasPorCliente[clienteId]) tareasPorCliente[clienteId] = new Set();
          tareasPorCliente[clienteId].add(tarea);
        }
        const clientesConTarea = Object.keys(tareasPorCliente);
        if (clientesConTarea.length === 0) { alert('No se encontraron tareas asignadas en el CSV.'); return; }
        // Convertir Sets a arrays para poder enviarlos como JSON
        const tareasPayload = {};
        clientesConTarea.forEach(cid => { tareasPayload[cid] = Array.from(tareasPorCliente[cid]); });

        const cMonth = window.getCommercialMonthAndStart(document.getElementById('date-input').value).month;
        const origText = btnImportTareas.innerHTML;
        btnImportTareas.innerHTML = '⏳ Subiendo...';
        btnImportTareas.disabled = true;
        try {
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ req: 'upload_tareas', month: cMonth, tareas: tareasPayload })
          });
          const result = await response.json();
          if (result.status === 'success') {
            alert(`¡Plana de Tareas de ${cMonth} actualizada correctamente en la nube!\n(${clientesConTarea.length} clientes con tareas asignadas)`);
            await syncTareas(cMonth, true); // Forzar refresco inmediato en esta sesión
          } else {
            alert('Hubo un problema: ' + result.message);
          }
        } catch(err) {
          console.error(err);
          alert('Error de conexión al subir la Plana de Tareas: ' + err.message);
        }
        btnImportTareas.innerHTML = origText;
        btnImportTareas.disabled = false;
      };
      reader.readAsText(file);
    });
    document.getElementById('btn-clear').addEventListener('click', async () => {
      if (confirm('¿Seguro que deseas borrar TODA la planificación del día actual (sin afectar las ventas reales)?')) {
        const planFields = ['f1-p', 'f2-p', 'k1-met', 'k1-tar', 'k1-p', 'k2-met', 'k2-tar', 'k2-p', 'bol-p'];
        for (const prom in volData) {
          planFields.forEach(f => {
            delete volData[prom][f];
          });
        }
        renderTables();
        // Ejecutar guardado silencioso para asegurar que la nube quede limpia de planificación también
        await saveToServer(true);
      }
    });
    // btn-save ha sido eliminado por redundante. El guardado se maneja mediante api.js saveToServer().
    document.getElementById('btn-sync').addEventListener('click', async (e) => {
      await performSync(false);
    });
    // Lógica para carga de archivo Excel de Objetivos
    const btnImportObj = document.getElementById('btn-import-obj');
    const objFileInput = document.getElementById('obj-file-input');
    btnImportObj.addEventListener('click', () => {
      objFileInput.click();
    });
    objFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const origText = btnImportObj.innerHTML;
      btnImportObj.innerHTML = '⏳ Procesando Excel...';
      btnImportObj.disabled = true;
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
                currentCategory = colA;
              }
              // Detectar si la fila contiene el nombre de algún promotor conocido en la Columna D
              const matchedProm = allPromoters.find(p => colD.includes(p));
              if (matchedProm && !colD.includes('Total') && !colD.includes('FOCO')) {
                if (!volData[matchedProm]) volData[matchedProm] = {};
                // Si es la primera vez que vemos este promotor en este parseo, inicializamos en 0
                if (!resetProms[matchedProm]) {
                  volData[matchedProm]['obj-f1'] = 0;
                  volData[matchedProm]['obj-f2'] = 0;
                  resetProms[matchedProm] = true;
                }
                if (currentCategory.includes('CZA Core+Value') || currentCategory.includes('CZA Above Core')) {
                  volData[matchedProm]['obj-f1'] = parseFloat((volData[matchedProm]['obj-f1'] + colG).toFixed(2));
                } else if (currentCategory.includes('Total UNG 2026') || currentCategory.includes('4b - Aguas')) {
                  volData[matchedProm]['obj-f2'] = parseFloat((volData[matchedProm]['obj-f2'] + colG).toFixed(2));
                }
                promotoresFound++;
              }
            }
          });
          // Guardar globalmente los objetivos del mes en la nube (sin localStorage)
          const monthStr = window.getCommercialMonthAndStart(document.getElementById('date-input').value).month;
          let monthObjs = {};
          for (let p in volData) {
            if (volData[p]['obj-f1'] !== undefined || volData[p]['obj-f2'] !== undefined) {
              monthObjs[p] = {};
              if (volData[p]['obj-f1'] !== undefined) monthObjs[p]['obj-f1'] = volData[p]['obj-f1'];
              if (volData[p]['obj-f2'] !== undefined) monthObjs[p]['obj-f2'] = volData[p]['obj-f2'];
            }
          }
          
          // Render para reflejar cambios en memoria
          renderTables(); 
          
          // Subir los objetivos a la nueva pestaña global
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
          btnImportObj.innerHTML = origText;
          btnImportObj.disabled = false;
          objFileInput.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    });

    // Flujo Inicial Nube-First
    const plannerContainer = document.getElementById('planner-container');
    if (plannerContainer) {
      plannerContainer.innerHTML = '<div style="text-align:center; padding:50px; font-size:1.2rem; color:#64748b;">⏳ Conectando con la nube...</div>';
    }
    
    // AUTO-SINCRONIZACIÓN AL CARGAR LA PÁGINA
    setTimeout(async () => {
      await fetchMesasFromServer();
      applyRoleFilter(); 
      await performSync(true);
    }, 300);