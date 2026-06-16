    const feriados = ['2026-06-15', '2026-06-20'];

    window.getCommercialMonthAndStart = function(plannerDateStr) {
      if (!plannerDateStr) return { month: '', start: '', last: '' };
      
      const formatD = (d) => {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      };
      
      // 1. Calculate Delivery Date
      let parts = plannerDateStr.split('-');
      let date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      do {
        date.setDate(date.getDate() + 1);
      } while (date.getDay() === 0 || feriados.includes(formatD(date)));
      
      const deliveryDateStr = formatD(date);
      const commercialMonth = deliveryDateStr.substring(0, 7); // e.g. "2026-06"
      const commYear = parseInt(commercialMonth.substring(0, 4));
      const commMonthIndex = parseInt(commercialMonth.substring(5, 7)) - 1;
      
      // 2. Find first Delivery Date of that commercial month
      let firstDelivery = new Date(commYear, commMonthIndex, 1);
      while (firstDelivery.getDay() === 0 || feriados.includes(formatD(firstDelivery))) {
        firstDelivery.setDate(firstDelivery.getDate() + 1);
      }
      
      // 3. Find its corresponding Planner Date (startPlannerDate)
      let startPlanner = new Date(firstDelivery);
      do {
        startPlanner.setDate(startPlanner.getDate() - 1);
      } while (startPlanner.getDay() === 0 || feriados.includes(formatD(startPlanner)));

      // 4. Find last Delivery Date of that commercial month
      let lastDelivery = new Date(commYear, commMonthIndex + 1, 0);
      while (lastDelivery.getDay() === 0 || feriados.includes(formatD(lastDelivery))) {
        lastDelivery.setDate(lastDelivery.getDate() - 1);
      }
      
      // 5. Find its corresponding Planner Date (lastPlannerDate)
      let lastPlanner = new Date(lastDelivery);
      do {
        lastPlanner.setDate(lastPlanner.getDate() - 1);
      } while (lastPlanner.getDay() === 0 || feriados.includes(formatD(lastPlanner)));
      
      return {
        month: commercialMonth,
        start: formatD(startPlanner),
        last: formatD(lastPlanner)
      };
    };

    function normalizeSku(sku) {
      if (!sku) return '';
      let s = String(sku).trim().toUpperCase();
      if (s.endsWith('-U')) {
        s = s.slice(0, -2);
      }
      // Quitar ceros a la izquierda
      s = s.replace(/^0+/, '');
      return s;
    }

    function val(prom, field) { 
      let v = (volData[prom] && volData[prom][field] !== undefined && volData[prom][field] !== '') ? volData[prom][field] : null;
      
      // Fallback a los objetivos mensuales globales usando el MES COMERCIAL
      if ((v === null || parseFloat(v) === 0) && (field === 'obj-f1' || field === 'obj-f2')) {
        const pDateStr = document.getElementById('date-input').value;
        const monthStr = window.getCommercialMonthAndStart(pDateStr).month;
        try {
          const monthObjs = JSON.parse(localStorage.getItem(`emcala_obj_${monthStr}`) || '{}');
          if (monthObjs[prom] && monthObjs[prom][field]) {
            v = monthObjs[prom][field];
            if (!volData[prom]) volData[prom] = {};
            volData[prom][field] = v; // Auto-guardar en memoria
          }
        } catch(e){}
      }
      
      // Para el acumulado: la nube es la fuente de verdad.
      // v ya fue seteado arriba desde volData; si es null, aún no llegó de la nube.
      // Solo recalculamos localmente como fallback offline.
      if (field === 'acum-f1' || field === 'acum-f2') {
        // Leer directo de volData (sin pasar por v, que puede ser null si el campo era '' vacío)
        const raw = volData[prom] && volData[prom][field] !== undefined ? volData[prom][field] : null;
        const cloudVal = (raw !== null && raw !== '') ? parseFloat(raw) : null;
        if (cloudVal !== null && !isNaN(cloudVal)) {
          // La nube ya tiene el valor (puede ser 0 legítimamente)
          v = cloudVal;
        } else {
          // Fallback local: sumar desde localStorage (offline o primer día del mes sin sync)
          const currentDateStr = document.getElementById('date-input').value;
          const dailyField = field === 'acum-f1' ? 'f1-v' : 'f2-v';
          v = getAcumuladoMensual(prom, dailyField, currentDateStr);
          if (!volData[prom]) volData[prom] = {};
          volData[prom][field] = v; // Guardar en memoria para que calcTotals lo sume correctamente
        }
      }

      if (v !== null) {
        if (!isNaN(v) && v !== '') {
          const n = parseFloat(v);
          return (field === 'bol-p' || field === 'bol-v') ? (parseInt(v) || 0) : (isNaN(n) ? '0.00' : n.toFixed(2));
        }
        return v;
      }
      const isString = field.endsWith('-met') || field.endsWith('-tar');
      if (isString) return '';
      return (field === 'bol-p' || field === 'bol-v') ? '0' : '0.00'; 
    }

    // === AUTO-CÁLCULO GLOBAL DE KPI REAL ===
    // Lee la métrica+tarea de cada promotor y calcula k1-v / k2-v
    // desde los datos de segmento almacenados (CCC/TBD/VOL)
    function computeAllKpiReal() {
      for (const spv in SPV_DATA) {
        SPV_DATA[spv].forEach(prom => {
          if (!volData[prom]) return;
          const d = volData[prom];
          
          const kpiFields = [
            { metField: 'k1-met', tarField: 'k1-tar', valField: 'k1-v' },
            { metField: 'k2-met', tarField: 'k2-tar', valField: 'k2-v' }
          ];
          
          for (const kf of kpiFields) {
            let met = String(d[kf.metField] || '').toUpperCase();
            let tar = String(d[kf.tarField] || '').toUpperCase();
            
            if (!met || !tar) {
              if (kf.valField === 'k1-v') {
                const elMet = document.getElementById('spv-kpi1-met');
                const elTar = document.getElementById('spv-kpi1-tar');
                met = (elMet && elMet.value) ? elMet.value.toUpperCase() : 'CV';
                tar = (elTar && elTar.value) ? elTar.value.toUpperCase() : 'ABOVE CORE';
              } else if (kf.valField === 'k2-v') {
                const elMet = document.getElementById('spv-kpi2-met');
                const elTar = document.getElementById('spv-kpi2-tar');
                met = (elMet && elMet.value) ? elMet.value.toUpperCase() : 'CV';
                tar = (elTar && elTar.value) ? elTar.value.toUpperCase() : 'NABS';
              }
            }
            
            let kpiVal = null;
            
            if (tar === 'EFICIENCIA DE VENTAS') {
              kpiVal = d['cv-eficiencia'];
            } else if (met === 'CCC') {
              // Todo el universo (clientes únicos por segmento general)
              if (tar === 'TOTAL CZA' || tar === 'TOTAL CERVEZA') kpiVal = d['ccc-cerveza'];
              else if (tar === 'CORE') kpiVal = d['ccc-core'];
              else if (tar === 'VALUE') kpiVal = d['ccc-value'];
              else if (tar === 'ABOVE CORE') kpiVal = d['ccc-abovecore'];
              else if (tar === 'LATONES 710' || tar === 'LATONES') kpiVal = d['ccc-latones'];
              else if (tar === 'BALANCED CHOICES') kpiVal = d['ccc-balanced'];
              else if (tar === 'NABS') kpiVal = d['ccc-nabs'];
            } else if (met === 'TBD') {
              // Todo el universo (transacciones por segmento general)
              if (tar === 'TOTAL CZA' || tar === 'TOTAL CERVEZA') kpiVal = d['tbd-cerveza'];
              else if (tar === 'CORE') kpiVal = d['tbd-core'];
              else if (tar === 'VALUE') kpiVal = d['tbd-value'];
              else if (tar === 'ABOVE CORE') kpiVal = d['tbd-abovecore'];
              else if (tar === 'LATONES 710' || tar === 'LATONES') kpiVal = d['tbd-latones'];
              else if (tar === 'BALANCED CHOICES') kpiVal = d['tbd-balanced'];
              else if (tar === 'NABS') kpiVal = d['tbd-nabs'];
            } else if (met === 'VOL') {
              // Todo el universo (volúmenes generales del foco I y II)
              if (tar === 'TOTAL CZA' || tar === 'TOTAL CERVEZA') kpiVal = d['f1-v'];
              else if (tar === 'CORE') kpiVal = d['f1-core'];
              else if (tar === 'VALUE') kpiVal = d['f1-value'];
              else if (tar === 'ABOVE CORE') kpiVal = d['f1-ac'];
              else if (tar === 'LATONES 710' || tar === 'LATONES') kpiVal = d['f1-lt'];
              else if (tar === 'BALANCED CHOICES') kpiVal = d['f1-bc'];
              else if (tar === 'NABS') kpiVal = d['f2-v'];
              else if (tar === 'AGUAS') kpiVal = d['f2-ag'];
              else if (tar === 'UNG TOP') kpiVal = d['f2-up'];
            } else if (met === 'CV') {
              // Solo SKUs validados del maestro (clientes con venta de SKU que valida)
              if (tar === 'TOTAL CZA' || tar === 'TOTAL CERVEZA') kpiVal = d['cv-cerveza'];
              else if (tar === 'CORE') kpiVal = d['cv-core'];
              else if (tar === 'VALUE') kpiVal = d['cv-value'];
              else if (tar === 'ABOVE CORE') kpiVal = d['cv-abovecore'];
              else if (tar === 'LATONES 710' || tar === 'LATONES') kpiVal = d['cv-latones'];
              else if (tar === 'BALANCED CHOICES') kpiVal = d['cv-balanced'];
              else if (tar === 'NABS') kpiVal = d['cv-nabs'];
              else if (tar === 'AGUAS') kpiVal = d['cv-aguas'];
              else if (tar === 'UNG TOP') kpiVal = d['cv-ungtop'];
            }
            
            if (kpiVal !== null && kpiVal !== undefined && kpiVal !== '') {
              const computed = parseFloat(Number(kpiVal).toFixed(2));
              d[kf.valField] = computed;
              // Actualizar el input en el DOM si existe
              const input = document.querySelector(`input[data-prom="${prom}"][data-field="${kf.valField}"]`);
              if (input) input.value = computed;
            }
          }
        });
      }
      saveData();
    }

    function calcTotals() {
      // Recalcular KPI Real antes de mostrar totales
      computeAllKpiReal();
      
      let grandTots = { 'f1-p':0,'obj-f1':0,'acum-f1':0,'f1-v':0,'f1-cv':0,'f1-ac':0,'f1-bc':0,'f1-lt':0,'f2-p':0,'obj-f2':0,'acum-f2':0,'f2-v':0,'f2-ung':0,'f2-up':0,'f2-rb':0,'f2-ag':0,'k1-p':0,'k1-v':0,'k2-p':0,'k2-v':0,'bol-p':0,'bol-v':0 };
      let grandK1Pcts = [];
      let grandK2Pcts = [];

      let diasRestantes = typeof getDiasHabilesRestantes === 'function' ? getDiasHabilesRestantes(document.getElementById('date-input').value) : 1;

      for (const spv in SPV_DATA) {
        let spvTots = { 'f1-p':0,'obj-f1':0,'acum-f1':0,'f1-v':0,'f1-cv':0,'f1-ac':0,'f1-bc':0,'f1-lt':0,'f2-p':0,'obj-f2':0,'acum-f2':0,'f2-v':0,'f2-ung':0,'f2-up':0,'f2-rb':0,'f2-ag':0,'k1-p':0,'k1-v':0,'k2-p':0,'k2-v':0,'bol-p':0,'bol-v':0 };
        let k1Pcts = [];
        let k2Pcts = [];
        const promotores = SPV_DATA[spv];

        promotores.forEach(p => {
          if (volData[p]) {
            for (let k in grandTots) {
              const vStr = volData[p][k];
              const v = (!vStr || isNaN(vStr) || vStr === '') ? 0 : parseFloat(parseFloat(vStr).toFixed(2));
              spvTots[k] += v;
              grandTots[k] += v;
            }
            // Update individual progs
            updateProg(`${p}-f1`, volData[p]['f1-p'], volData[p]['f1-v']);
            updateProg(`${p}-f2`, volData[p]['f2-p'], volData[p]['f2-v']);
            updateProg(`${p}-k1`, volData[p]['k1-p'], volData[p]['k1-v']);
            updateProg(`${p}-k2`, volData[p]['k2-p'], volData[p]['k2-v']);
            updateProg(`${p}-bol`, volData[p]['bol-p'], volData[p]['bol-v']);

            applyCellColor(document.querySelector(`input[data-prom="${p}"][data-field="f1-v"]`), volData[p]['f1-v'], volData[p]['f1-p']);
            applyCellColor(document.querySelector(`input[data-prom="${p}"][data-field="f2-v"]`), volData[p]['f2-v'], volData[p]['f2-p']);
            applyCellColor(document.querySelector(`input[data-prom="${p}"][data-field="k1-v"]`), volData[p]['k1-v'], volData[p]['k1-p']);
            applyCellColor(document.querySelector(`input[data-prom="${p}"][data-field="k2-v"]`), volData[p]['k2-v'], volData[p]['k2-p']);
            applyCellColor(document.querySelector(`input[data-prom="${p}"][data-field="bol-v"]`), volData[p]['bol-v'], volData[p]['bol-p']);

            // Acumular porcentajes para promedios de KPI (Focos III y IV)
            const k1P = parseFloat(volData[p]['k1-p'] || 0);
            const k1V = parseFloat(volData[p]['k1-v'] || 0);
            if (k1P > 0) {
              const pct = Math.min(100, Math.round((k1V / k1P) * 100));
              k1Pcts.push(pct);
              grandK1Pcts.push(pct);
            }

            const k2P = parseFloat(volData[p]['k2-p'] || 0);
            const k2V = parseFloat(volData[p]['k2-v'] || 0);
            if (k2P > 0) {
              const pct = Math.min(100, Math.round((k2V / k2P) * 100));
              k2Pcts.push(pct);
              grandK2Pcts.push(pct);
            }
          }
        });

        const spvId = spv.replace(/\s+/g, '-');
        for (let k in spvTots) {
          const el = document.getElementById(`tot-${spvId}-${k}`);
          if (el) {
            if (k.startsWith('k')) { el.textContent = ''; } // No totales para KPI
            else { el.textContent = formatNum(spvTots[k], k); }
          }
        }
        
        // Asignar ACUMULADO en FOCO I y II
        const elSpvF1ObjV = document.getElementById(`tot-${spvId}-f1-obj-v`);
        if (elSpvF1ObjV) elSpvF1ObjV.textContent = formatNum(spvTots['acum-f1']);
        const elSpvF2ObjV = document.getElementById(`tot-${spvId}-f2-obj-v`);
        if (elSpvF2ObjV) elSpvF2ObjV.textContent = formatNum(spvTots['acum-f2']);
        
        // Asignar MEDIA NECESARIA del SPV
        const medSpvF1 = Math.max(0, (spvTots['obj-f1'] - spvTots['acum-f1']) / diasRestantes);
        const elSpvF1Med = document.getElementById(`tot-${spvId}-f1-med`);
        if (elSpvF1Med) elSpvF1Med.textContent = formatNum(medSpvF1);
        
        const medSpvF2 = Math.max(0, (spvTots['obj-f2'] - spvTots['acum-f2']) / diasRestantes);
        const elSpvF2Med = document.getElementById(`tot-${spvId}-f2-med`);
        if (elSpvF2Med) elSpvF2Med.textContent = formatNum(medSpvF2);

        // Calcular promedio de KPI I y II para el supervisor
        let k1Avg = 0;
        if (k1Pcts.length > 0) {
          k1Avg = Math.round(k1Pcts.reduce((a, b) => a + b, 0) / k1Pcts.length);
        }
        let k2Avg = 0;
        if (k2Pcts.length > 0) {
          k2Avg = Math.round(k2Pcts.reduce((a, b) => a + b, 0) / k2Pcts.length);
        }

        updateProg(`${spvId}-f1`, spvTots['f1-p'], spvTots['f1-v']);
        updateProg(`${spvId}-f2`, spvTots['f2-p'], spvTots['f2-v']);
        updateProg(`${spvId}-k1`, 100, k1Avg);
        updateProg(`${spvId}-k2`, 100, k2Avg);
        updateProg(`${spvId}-bol`, spvTots['bol-p'], spvTots['bol-v']);
      }

      for (let k in grandTots) {
        const el = document.getElementById(`grand-${k}`);
        if (el) {
          if (k.startsWith('k')) { el.textContent = ''; } // No totales para KPI
          else { el.textContent = formatNum(grandTots[k], k); }
        }
      }
      
      const elGrandF1ObjV = document.getElementById(`grand-f1-obj-v`);
      if (elGrandF1ObjV) elGrandF1ObjV.textContent = formatNum(grandTots['acum-f1']);
      const elGrandF2ObjV = document.getElementById(`grand-f2-obj-v`);
      if (elGrandF2ObjV) elGrandF2ObjV.textContent = formatNum(grandTots['acum-f2']);
      
      const medGrandF1 = Math.max(0, (grandTots['obj-f1'] - grandTots['acum-f1']) / diasRestantes);
      const elGrandF1Med = document.getElementById(`grand-f1-med`);
      if (elGrandF1Med) elGrandF1Med.textContent = formatNum(medGrandF1);
      
      const medGrandF2 = Math.max(0, (grandTots['obj-f2'] - grandTots['acum-f2']) / diasRestantes);
      const elGrandF2Med = document.getElementById(`grand-f2-med`);
      if (elGrandF2Med) elGrandF2Med.textContent = formatNum(medGrandF2);

      // Calcular promedio general de KPI I y II para el pie de tabla
      let grandK1Avg = 0;
      if (grandK1Pcts.length > 0) {
        grandK1Avg = Math.round(grandK1Pcts.reduce((a, b) => a + b, 0) / grandK1Pcts.length);
      }
      let grandK2Avg = 0;
      if (grandK2Pcts.length > 0) {
        grandK2Avg = Math.round(grandK2Pcts.reduce((a, b) => a + b, 0) / grandK2Pcts.length);
      }

      updateProg(`grand-f1`, grandTots['f1-p'], grandTots['f1-v']);
      updateProg(`grand-f2`, grandTots['f2-p'], grandTots['f2-v']);
      updateProg(`grand-k1`, 100, grandK1Avg);
      updateProg(`grand-k2`, 100, grandK2Avg);
      updateProg(`grand-bol`, grandTots['bol-p'], grandTots['bol-v']);
    }

    function getAcumuladoMensual(promotor, field, currentDateStr) {
      const commInfo = window.getCommercialMonthAndStart(currentDateStr);
      const startPlannerStr = commInfo.start;
      
      let sum = 0;
      let d = new Date(startPlannerStr + 'T00:00:00');
      let endD = new Date(currentDateStr + 'T00:00:00');
      
      const formatD = (dt) => {
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      };
      
      while (d <= endD) {
        const dateKey = formatD(d);
        
        if (d.getDay() !== 0 && !feriados.includes(dateKey)) {
          if (dateKey === currentDateStr) {
            if (volData[promotor] && volData[promotor][field]) {
               sum += parseFloat(volData[promotor][field]) || 0;
            }
          } else {
            const storageKey = `emcala_vol_all_${dateKey}_v3`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
              try {
                const data = JSON.parse(saved);
                if (data[promotor] && data[promotor][field]) {
                  sum += parseFloat(data[promotor][field]) || 0;
                }
              } catch(e) {}
            }
          }
        }
        d.setDate(d.getDate() + 1);
      }
      return sum;
    }

    function getLastAcumulado(promotor, field, currentDateStr) {
      const currentMonth = currentDateStr.substring(0, 7);
      const currentDay = parseInt(currentDateStr.substring(8, 10), 10);
      
      for (let d = currentDay - 1; d >= 1; d--) {
        const dayStr = String(d).padStart(2, '0');
        const dateKey = `${currentMonth}-${dayStr}`;
        const storageKey = `emcala_vol_all_${dateKey}_v3`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const data = JSON.parse(saved);
            if (data[promotor] && data[promotor][field] !== undefined && data[promotor][field] !== '') {
              const val = parseFloat(data[promotor][field]) || 0;
              if (val > 0) return val;
            }
          } catch(e) {}
        }
      }
      return 0; // Si no hay dias anteriores
    }

    function getDiasHabilesRestantes(dateStr) {
      if (!dateStr) return 1;
      const commInfo = window.getCommercialMonthAndStart(dateStr);
      const today = new Date(dateStr + 'T00:00:00');
      const endD = new Date(commInfo.last + 'T00:00:00');
      
      let diasRestantes = 0;
      let d = new Date(today);
      
      const formatD = (dt) => {
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      };
      
      while (d <= endD) {
        const dateFmt = formatD(d);
        if (d.getDay() !== 0 && !feriados.includes(dateFmt)) {
          if (d.getDay() === 6) diasRestantes += 0.5; // Sábado
          else diasRestantes += 1; // Lunes a Viernes
        }
        d.setDate(d.getDate() + 1);
      }
      return diasRestantes > 0 ? diasRestantes : 1;
    }