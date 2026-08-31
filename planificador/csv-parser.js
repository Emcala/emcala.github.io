    // Helper para formatear fecha en formato CSV (d-mmm-yy)
    function formatCSVDate(date) {
      const day = date.getDate();
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const month = months[date.getMonth()];
      const year = date.getFullYear().toString().slice(-2);
      return `${day}-${month}-${year}`;
    }

    // Obtener la fecha del CSV para la venta (Directa 1 a 1 con la fecha del Planificador)
    function getCSVTargetDate(plannerDateStr) {
      const [y, m, d] = plannerDateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return formatCSVDate(date);
    }

    // Helper para parsear fecha del CSV (d-mmm-yy) a Objeto Date
    function parseCSVDateToObj(csvDateStr) {
      const parts = csvDateStr.split('-');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0], 10);
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const monthIdx = months.indexOf(parts[1].toLowerCase());
      if (monthIdx === -1) return null;
      const year = 2000 + parseInt(parts[2], 10);
      return new Date(year, monthIdx, day);
    }

    // Obtener la fecha del Planificador en base a la fecha del CSV
    function getPlannerDateFromCSVDate(csvDateStr) {
      const date = parseCSVDateToObj(csvDateStr);
      if (!date) return null;
      // Lógica de Preventa: el CSV tiene la fecha de entrega (venta real).
      // La planificación se hizo el día hábil anterior (toma de pedido).
      date.setDate(date.getDate() - 1); // Retroceder 1 día inicial
      // Función auxiliar para saber si es feriado
      function isHoliday(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const d_day = String(d.getDate()).padStart(2, '0');
        return HOLIDAYS.includes(`${y}-${m}-${d_day}`);
      }
      // Mientras caiga en un feriado o domingo, seguimos retrocediendo (los sábados SI se trabaja)
      while (isHoliday(date) || date.getDay() === 0) {
        date.setDate(date.getDate() - 1);
      }
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    // Procesar texto CSV para MÚLTIPLES fechas a la vez
    function parseCSVAndApply(csvText) {
      const dateInput = document.getElementById('date-input').value;
      const lines = csvText.split('\n');
      if (lines.length < 2) {
        alert('El archivo CSV está vacío.');
        return;
      }
      // Validación estricta del formato CSV
      let validColumns = 0;
      const headerText = lines[0].toLowerCase();
      if (headerText.includes('vendedor')) validColumns++;
      if (headerText.includes('código') || headerText.includes('codigo')) validColumns++;
      if (headerText.includes('cantidades')) validColumns++;
      if (headerText.includes('cliente')) validColumns++;
      if (validColumns < 2) {
        alert('❌ Error: El archivo CSV no tiene el formato correcto.\n\nPor favor, verificá que estás subiendo el reporte de Ventas correcto y no otro archivo.');
        return;
      }
      const h = lines[0].split(';').map(s => s.trim().toLowerCase());
      const cm = {
        date: h.indexOf('descripción período'),
        clientId: h.indexOf('cod. cliente'),
        promoter: h.indexOf('descripción vendedor'),
        vendorCode: h.findIndex(x => x === 'vendedor'), // Código VEND del vendedor (columna exacta "Vendedor", no "Descripción Vendedor")
        sku: h.indexOf('código'),
        article: h.indexOf('artículos') !== -1 ? h.indexOf('artículos') + 2 : 18,
        brand: h.indexOf('marca') !== -1 ? h.indexOf('marca') + 1 : 20,
        calibreDesc: h.indexOf('calibre') !== -1 ? h.indexOf('calibre') + 1 : 23,
        division: h.indexOf('división') !== -1 ? h.indexOf('división') : h.indexOf('division'),
        category: h.indexOf('unidad de negocio') !== -1 ? h.indexOf('unidad de negocio') + 1 : 35,
        volume: h.indexOf('cantidades totales') !== -1 ? h.indexOf('cantidades totales') : h.indexOf('cantidades vendidas'),
        invoices: h.indexOf('cantidad de facturas')
      };
      // Si algún índice crítico no se encontró, usar defaults históricos
      if (cm.date === -1) cm.date = 2;
      if (cm.clientId === -1) cm.clientId = 4;
      if (cm.promoter === -1) cm.promoter = 15;
      if (cm.sku === -1) cm.sku = 17;
      if (cm.division === -1) cm.division = 25;
      if (cm.category === -1) cm.category = 35;
      if (cm.volume === -1) cm.volume = 41;
      if (cm.invoices === -1) cm.invoices = 45;
      // Crear un mapa para buscar rápidamente los SKUs del maestro y sus clasificaciones
      const skuMap = {};
      if (skuMaster && skuMaster.length > 0) {
        skuMaster.forEach(item => {
          const normId = normalizeSku(item.id);
          if (normId) {
            skuMap[normId] = {
              shortDesc: item.s,
              fullDesc: item.f,
              skuId: item.id
            };
          }
        });
      }
      // Acumulador de ventas: { [plannerDate]: { [promoterNameUpper]: { cerveza: 0, nabs: 0 } } }
      let allDatesSales = {};
      let totalLinesProcessed = 0;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(';');
        if (cols.length < 5) continue; // Ignorar filas rotas (muy cortas)
        const csvDate = cols[cm.date] ? cols[cm.date].trim() : '';
        const plannerDate = getPlannerDateFromCSVDate(csvDate);
        if (!plannerDate) continue;
        const promoter = cols[cm.promoter] ? cols[cm.promoter].trim().toUpperCase() : '';
        const vendorCode = (cm.vendorCode !== -1 && cols[cm.vendorCode]) ? cols[cm.vendorCode].trim() : '';
        // Agrupamos por CÓDIGO de vendedor cuando está disponible (es único y no cambia),
        // y solo si no vino código caemos al nombre de texto (ambiguo si hay nombres repetidos).
        const acumKey = vendorCode || promoter;
        const category = cols[cm.category] ? cols[cm.category].trim().toUpperCase() : '';
        const rawVolume = cols[cm.volume] ? cols[cm.volume].trim().replace(',', '.') : '0';
        const volume = parseFloat(rawVolume || 0);
        const clientId = cols[cm.clientId] ? cols[cm.clientId].trim() : '';
        const rawInvoices = cols[cm.invoices] ? cols[cm.invoices].trim().replace(',', '.') : '0';
        const invoices = parseFloat(rawInvoices || 0);
        const divisionVal = cols[cm.division] ? cols[cm.division].trim() : '';
        let isGaseosa = (divisionVal === '1');
        if (!allDatesSales[plannerDate]) {
          allDatesSales[plannerDate] = {};
        }
        if (!allDatesSales[plannerDate][acumKey]) {
          allDatesSales[plannerDate][acumKey] = {
            _vendorCode: vendorCode, _csvName: promoter,
            // Volúmenes (VOL) - GENERALES (Foco I y II, suma todo)
            cerveza: 0, nabs: 0, core: 0, value: 0, aboveCore: 0, balanced: 0, latones: 0, ungTop: 0, redbull: 0, aguas: 0, totalUng: 0,
            // Clientes únicos por segmento (CCC) - GENERALES
            clientsTotalCerveza: new Set(), clientsCore: new Set(), clientsValue: new Set(), clientsAboveCore: new Set(), clientsLatones: new Set(),
            clientsBalanced: new Set(), clientsNabs: new Set(), clientsAll: new Set(),
            // Transacciones por segmento (TBD) - GENERALES (Set de 'clientId_skuCode')
            txTotalCerveza: new Set(), txCore: new Set(), txValue: new Set(), txAboveCore: new Set(), txLatones: new Set(), txBalanced: new Set(), txNabs: new Set(), txAll: new Set(),

            // Clientes únicos con venta de SKU de validación de tarea (CV)
            cvClientsCerveza: new Set(), cvClientsCore: new Set(), cvClientsValue: new Set(), cvClientsAboveCore: new Set(), cvClientsLatones: new Set(),
            cvClientsBalanced: new Set(), cvClientsNabs: new Set(), cvClientsAguas: new Set(),
            cvClientsUngTop: new Set(), cvClientsEficiencia: new Set()
          };
        }
        const pSales = allDatesSales[plannerDate][acumKey];
        const csvSkuCode = cols[cm.sku] ? cols[cm.sku].trim() : '';
        // Ignorar envases vacos que no suman volumen real
        if (csvSkuCode === '2731' || csvSkuCode === '2776') {
          continue;
        }
        const normalizedCsvSku = normalizeSku(csvSkuCode);
        const skuData = skuMap[normalizedCsvSku];
        if (clientId) {
          pSales.clientsAll.add(clientId);
        }
        pSales.txAll += invoices;
        let isCerveza = false;
        let isAboveCore = false;
        let isBalanced = false;
        let isLatones = false;
        let isNabs = false;
        let isAguas = false;
        let isCore = false;
        let isValue = false;
        let isUngTop = false;
        // Calcular dinámicamente calibre para UNG TOP basado en las columnas de la fila
        const brand = cols[cm.brand] ? cols[cm.brand].trim().toUpperCase() : '';
        const articleName = cols[cm.article] ? cols[cm.article].trim().toUpperCase() : '';
        const calibreDesc = cols[cm.calibreDesc] ? cols[cm.calibreDesc].trim().toUpperCase() : '';
        const ccMatch = calibreDesc.match(/(\d+)\s*(CC|ML)/i);
        const cc = ccMatch ? parseInt(ccMatch[1], 10) : 9999;
        const isGatorade = brand.includes('GATORADE');
        const isRedBull = brand.includes('RED BULL') || brand.includes('REDBULL');
        const isRockstar = brand.includes('ROCKSTAR');
        const calcUngTop = isGatorade || isRedBull || isRockstar || cc <= 500;
        // 1) CLASIFICACIÓN USANDO SIEMPRE LAS COLUMNAS DEL CSV (Marca / Categoría / Artículo)
        if (category.includes('CERVEZA') || category.includes('ARTESANAL')) {
          isCerveza = true;
          const isQuilmes1890 = (brand === 'QUILMES 1890' || brand === '1890' || articleName.includes('1890'));
          const isBajoCero = (brand.includes('BAJO CERO') || articleName.includes('BAJO CERO'));
          const isStellaPureGold = (brand.includes('STELLA') && articleName.includes('PURE GOLD'));
          isBalanced = (articleName.includes('0.0') || articleName.includes('SIN ALCOHOL') || articleName.includes('MICHELOB') || brand.includes('MICHELOB') || isStellaPureGold);
          const isAndes = brand.includes('ANDES');
          const isMichelob = brand.includes('MICHELOB');
          const isStella = brand.includes('STELLA');
          const isPatagonia = brand.includes('PATAGONIA');
          const isCorona = brand.includes('CORONA');
          const isGoose = brand.includes('GOOSE');
          const isTemple = brand.includes('TEMPLE');
          if (isAndes || isMichelob || isStella || isPatagonia || isCorona || isGoose || isTemple) {
            isAboveCore = true;
          } else {
            if (isQuilmes1890 || isBajoCero) {
              isValue = true;
            } else {
              isCore = true; // Todo lo que no sea Above Core o Value, cae en Core (incluye Quilmes, Brahma, Bud, etc.)
            }
          }
          if (calibreDesc === '710 CC LATAS' || articleName.includes('LATON 710')) {
            isLatones = true;
          }
        } else if (category === 'UNG' || category === 'NABS') {
          isNabs = true;
          isUngTop = calcUngTop;
        } else if (category === 'AGUAS ECO' || category === 'AGUAS') {
          isAguas = true;
        }

        // 3) VALIDACIÓN CV (Creación de Valor a nivel de segmento)
        // El cliente cumple el CV de un segmento si compró un SKU de ese segmento 
        // Y tenía asignada al menos una tarea correspondiente a ese mismo segmento.
        let hasCervezaTask = false;
        let hasCoreTask = false;
        let hasAboveCoreTask = false;
        let hasValueTask = false;
        let hasLatonesTask = false;
        let hasBalancedTask = false;
        let hasNabsTask = false;

        const normClientId = String(clientId).replace(/^0+/, '');
        if (tareasMaster) {
          const tareasSet = tareasMaster[clientId] || tareasMaster[normClientId];
          if (tareasSet) {
             for (const t of tareasSet) {
               const tUpper = String(t).trim().toUpperCase();
               
               // Clasificar la tarea según las marcas/reglas del negocio
               // (mismas marcas que ya usa la clasificación de ventas más abajo — mantener ambas listas sincronizadas)
               const tAbove = tUpper.includes('ANDES') || tUpper.includes('MICHELOB') || tUpper.includes('STELLA') || tUpper.includes('PATAGONIA') || tUpper.includes('CORONA') || tUpper.includes('GOOSE') || tUpper.includes('TEMPLE');
               const tCore = tUpper.includes('QUILMES') || tUpper.includes('BRAHMA') || tUpper.includes('BUDWEISER');
               const tValue = tUpper.includes('1890') || tUpper.includes('BAJO CERO');
               const tBalanced = tUpper.includes('MICHELOB') || (tUpper.includes('STELLA') && tUpper.includes('PURE GOLD')) || tUpper.includes('SIN ALCOHOL');
               const tLatones = tUpper.includes('LATON') || tUpper.includes('LATONES');
               const tNabs = tUpper.includes('UNG') || tUpper.includes('NABS') || tUpper.includes('GATORADE') || tUpper.includes('RED BULL') || tUpper.includes('ROCKSTAR');
               
               const tCerveza = tAbove || tCore || tValue || tBalanced || tUpper.includes('CERVEZA') || tUpper.includes('CZA');

               if (tCerveza) hasCervezaTask = true;
               if (tAbove) hasAboveCoreTask = true;
               if (tCore) hasCoreTask = true;
               if (tValue) hasValueTask = true;
               if (tBalanced) hasBalancedTask = true;
               if (tLatones) hasLatonesTask = true;
               if (tNabs) hasNabsTask = true;
             }
          }
        }

        // Agregar al CV si el SKU vendido está en el maestro que valida y cumple la tarea
        // del mismo segmento (gate de día de visita eliminado).
        if (skuData && csvSkuCode) {
          if (isCerveza && hasCervezaTask) pSales.cvClientsCerveza.add(clientId);
          if (isCore && hasCoreTask) pSales.cvClientsCore.add(clientId);
          if (isAboveCore && hasAboveCoreTask) pSales.cvClientsAboveCore.add(clientId);
          if (isValue && hasValueTask) pSales.cvClientsValue.add(clientId);
          if (isLatones && hasLatonesTask) pSales.cvClientsLatones.add(clientId);
          if (isBalanced && hasBalancedTask) pSales.cvClientsBalanced.add(clientId);
          if (isNabs && hasNabsTask) pSales.cvClientsNabs.add(clientId);
          // Aguas no tiene foco de CV — no cuenta nunca
          // UngTop pertenece al segmento NABS, usa la misma tarea que NABS
          if (isUngTop && hasNabsTask) pSales.cvClientsUngTop.add(clientId);

          // Eficiencia (Cualquier tarea cumplida)
          if ((isCerveza && hasCervezaTask) || (isNabs && hasNabsTask)) {
            pSales.cvClientsEficiencia.add(clientId);
          }
        }
        const tbdKeyGen = clientId + '_' + csvSkuCode;
        // Acumular volúmenes, CCC y TBD generales (tanto para maestro como para fallback)
        if (isCerveza) {
          pSales.cerveza += volume;
          if (clientId) pSales.clientsTotalCerveza.add(clientId);
          if (clientId && csvSkuCode) pSales.txTotalCerveza.add(tbdKeyGen);
        }
        if (isCore) {
          pSales.core += volume;
          if (clientId) pSales.clientsCore.add(clientId);
          if (clientId && csvSkuCode) pSales.txCore.add(tbdKeyGen);
        }
        if (isValue) {
          pSales.value += volume;
          if (clientId) pSales.clientsValue.add(clientId);
          if (clientId && csvSkuCode) pSales.txValue.add(tbdKeyGen);
        }
        if (isAboveCore) {
          pSales.aboveCore += volume;
          if (clientId) pSales.clientsAboveCore.add(clientId);
          if (clientId && csvSkuCode) pSales.txAboveCore.add(tbdKeyGen);
        }
        if (isBalanced) {
          pSales.balanced += volume;
          if (clientId) pSales.clientsBalanced.add(clientId);
          if (clientId && csvSkuCode) pSales.txBalanced.add(tbdKeyGen);
        }
        if (isLatones) {
          pSales.latones += volume;
          if (clientId) pSales.clientsLatones.add(clientId);
          if (clientId && csvSkuCode) pSales.txLatones.add(tbdKeyGen);
        }
        if (isNabs) {
          pSales.nabs += volume;
          if (clientId) pSales.clientsNabs.add(clientId);
          if (clientId && csvSkuCode) pSales.txNabs.add(tbdKeyGen);
        }
        if (isUngTop) pSales.ungTop += volume;
        if (isRedBull) pSales.redbull += volume;
        if (isAguas) {
          pSales.aguas += volume;
        }
        if (isGaseosa) {
          pSales.totalUng += volume;
        }
        totalLinesProcessed++;
      }
      if (totalLinesProcessed === 0) {
        // Collect debug info from the first line
        let debugInfo = "Debug: ";
        if (lines.length > 1) {
            const firstDataLine = lines[1].trim();
            const cols = firstDataLine.split(';');
            debugInfo += `Cols length: ${cols.length}. cm.invoices: ${cm.invoices}. `;
            if (cols.length > cm.date) {
                const csvDate = cols[cm.date] ? cols[cm.date].trim() : '';
                const plannerDate = getPlannerDateFromCSVDate(csvDate);
                debugInfo += `Raw date: ${csvDate}, parsed: ${plannerDate}. `;
            }
        }
        alert('No se encontraron transacciones de Cerveza o Nabs en el CSV.\n\n' + debugInfo);
        return;
      }
      let processedDatesCount = 0;
      let totalMatchCount = 0;
      // ENVÍO DIRECTO A LA NUBE (sin localStorage)
      const currentPlannerDate = document.getElementById('date-input').value;
      const sortedDates = Object.keys(allDatesSales).sort();
      const payload = [];
      
      for (const pDate of sortedDates) {
        const cMonth = window.getCommercialMonthAndStart(pDate).month;
        const daySales = allDatesSales[pDate];
        let dateMatches = 0;
        
        for (const acumKey in daySales) {
          const pSales = daySales[acumKey];
          const vendorCode = pSales._vendorCode;
          const promoter = pSales._csvName; // nombre de texto tal cual vino en el CSV, para el fallback difuso
          let trackedPromoter = null;

          // 1) Match DIRECTO por código de Vendedor contra Mesas — exacto, sin ambigüedad.
          if (vendorCode && window.NAME_MAP && window.NAME_MAP[vendorCode]) {
            trackedPromoter = window.NAME_MAP[vendorCode];
          }

          // 2) Fallback: matching difuso por nombre (solo si no vino código o no está en Mesas).
          if (!trackedPromoter) {
            const normalizeParts = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/ig, " ").trim().toUpperCase().split(/\s+/);
            const normalizeFlat = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/ig, "").toUpperCase();
            const csvFlat = normalizeFlat(promoter);
            if (csvFlat.length > 2) {
              const csvParts = normalizeParts(promoter);
              for (const spv in SPV_DATA) {
                const match = SPV_DATA[spv].find(p => {
                  const pParts = normalizeParts(p);
                  const pFlat = normalizeFlat(p);
                  const pInCsv = pParts.every(part => csvParts.includes(part));
                  const csvInP = csvParts.every(part => pParts.includes(part));
                  const isFlatMatch = pFlat === csvFlat || csvFlat.includes(pFlat) || (csvFlat.length > 5 && pFlat.includes(csvFlat));
                  return pInCsv || csvInP || isFlatMatch;
                });
                if (match) { trackedPromoter = match; break; }
              }
            }
            if (trackedPromoter && vendorCode) {
              console.warn(`⚠️ Vendedor "${promoter}" (código ${vendorCode}) no está en Mesas — se matcheó por nombre a "${trackedPromoter}". Revisar VEND en Mesas.`);
            }
          }

          if (!trackedPromoter) continue;
          const rCore = pSales.core > 0 ? parseFloat(pSales.core.toFixed(2)) : '';
          const rValue = pSales.value > 0 ? parseFloat(pSales.value.toFixed(2)) : '';
          const rAc = pSales.aboveCore > 0 ? parseFloat(pSales.aboveCore.toFixed(2)) : '';
          const rUng = pSales.totalUng > 0 ? parseFloat(pSales.totalUng.toFixed(2)) : '';
          const rAg = pSales.aguas > 0 ? parseFloat(pSales.aguas.toFixed(2)) : '';
          const rNabs = pSales.nabs > 0 ? parseFloat(pSales.nabs.toFixed(2)) : '';
          const coreValueSum = (parseFloat(rCore)||0) + (parseFloat(rValue)||0);
          const f1TotalSum = parseFloat((coreValueSum + (parseFloat(rAc)||0)).toFixed(2));
          const f2TotalSum = parseFloat((parseFloat(rNabs)||0).toFixed(2));
          const spvName = Object.keys(SPV_DATA).find(s => SPV_DATA[s].includes(trackedPromoter));
          payload.push({
            date: pDate, spv: spvName, promotor: trackedPromoter, cMonth,
            'f1-v': f1TotalSum || '', 'f1-cv': parseFloat(coreValueSum.toFixed(2)) || '', 'f1-ac': rAc, 'f1-bc': pSales.balanced > 0 ? parseFloat(pSales.balanced.toFixed(2)) : '', 'f1-lt': pSales.latones > 0 ? parseFloat(pSales.latones.toFixed(2)) : '',
            'f2-v': f2TotalSum || '', 'f2-ung': rUng, 'f2-up': pSales.ungTop > 0 ? parseFloat(pSales.ungTop.toFixed(2)) : '', 'f2-rb': pSales.redbull > 0 ? parseFloat(pSales.redbull.toFixed(2)) : '', 'f2-ag': rAg,
            'bol-v': pSales.clientsAll.size || '',
            'ccc-ids-cerveza': Array.from(pSales.clientsTotalCerveza).join(','), 'ccc-cerveza': pSales.clientsTotalCerveza.size, 'ccc-core': pSales.clientsCore.size, 'ccc-value': pSales.clientsValue.size, 'ccc-abovecore': pSales.clientsAboveCore.size, 'ccc-latones': pSales.clientsLatones.size, 'ccc-balanced': pSales.clientsBalanced.size, 'ccc-nabs': pSales.clientsNabs.size,
            'tbd-cerveza': pSales.txTotalCerveza.size, 'tbd-core': pSales.txCore.size, 'tbd-value': pSales.txValue.size, 'tbd-abovecore': pSales.txAboveCore.size, 'tbd-latones': pSales.txLatones.size, 'tbd-balanced': pSales.txBalanced.size, 'tbd-nabs': pSales.txNabs.size,
            'cv-cerveza': pSales.cvClientsCerveza.size, 'cv-core': pSales.cvClientsCore.size, 'cv-value': pSales.cvClientsValue.size, 'cv-abovecore': pSales.cvClientsAboveCore.size, 'cv-latones': pSales.cvClientsLatones.size, 'cv-balanced': pSales.cvClientsBalanced.size, 'cv-nabs': pSales.cvClientsNabs.size, 'cv-aguas': pSales.cvClientsAguas.size, 'cv-ungtop': pSales.cvClientsUngTop.size, 'cv-eficiencia': pSales.cvClientsEficiencia.size
          });
          dateMatches++;
          totalMatchCount++;
        }
        if (dateMatches > 0) processedDatesCount++;
      }
      
      if (payload.length === 0) {
        alert('ATENCION: El archivo CSV fue ignorado porque no se encontraron promotores coincidentes.');
        return;
      }
      
      // Actualizar la fecha del planificador a la más reciente del CSV
      const csvDates = Object.keys(allDatesSales).sort().reverse();
      if (csvDates.length > 0) {
        document.getElementById('date-input').value = csvDates[0];
      }
      
      alert(`Subiendo ${processedDatesCount} fechas (${payload.length} registros) a la nube, por favor esperá...`);
      
      // ENVIAR DIRECTO A LA NUBE (sin localStorage intermediario)
      setTimeout(async () => {
        if (SCRIPT_URL === 'AQUI_VA_LA_URL_DE_TU_APPS_SCRIPT') {
          alert('No se pueden subir a la nube porque falta SCRIPT_URL');
          return;
        }
        try {
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          const result = await response.json();
          if (result.status === 'success') {
            console.log('Ventas subidas exitosamente');
            // Sincronizar para traer los datos frescos de la nube
            await performSync();
          } else {
            alert('Error al subir ventas a la nube: ' + result.message);
          }
        } catch (e) {
          alert('❌ Error de conexión al intentar subir los datos a la nube.');
        }
      }, 500);
    }