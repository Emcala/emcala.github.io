// ============================================================
// EMCALA — Lógica compartida de fechas, mes comercial y días hábiles
// ============================================================
// Fuente ÚNICA de verdad para:
//   - qué días son hábiles (lun-vie + sábados ponderados)
//   - el peso del sábado
//   - el cálculo del mes comercial
//
// REQUIERE que `emcala-config.js` (define EMCALA_HOLIDAYS) se cargue ANTES:
//   <script src="../emcala-config.js"></script>
//   <script src="../emcala-dates.js"></script>
// ============================================================

// Peso de un sábado. Lunes a viernes pesan 1.
// Cambiar acá afecta a TODAS las apps.
const EMCALA_PESO_SABADO = 0.5;

function emcalaFormatD(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function emcalaHoy() {
  return emcalaFormatD(new Date());
}

// Lista de feriados (YYYY-MM-DD). Fuente: emcala-config.js
function emcalaFeriados() {
  return (typeof EMCALA_HOLIDAYS !== 'undefined') ? EMCALA_HOLIDAYS : [];
}

// ------------------------------------------------------------
// CORE: días hábiles en el rango [desde, hasta] INCLUSIVE.
// Devuelve { dias, peso }:
//   dias = conteo crudo (el sábado cuenta 1, igual que un día de semana)
//   peso = ponderado (el sábado cuenta EMCALA_PESO_SABADO)
// Domingos y feriados no cuentan en ninguno de los dos.
// ------------------------------------------------------------
function contarDiasHabiles(desde, hasta) {
  const feriados = emcalaFeriados();
  let dias = 0;
  let peso = 0;
  let d = new Date(desde);
  d.setHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(0, 0, 0, 0);
  while (d <= fin) {
    const ds = emcalaFormatD(d);
    if (d.getDay() !== 0 && !feriados.includes(ds)) {
      dias += 1;
      peso += (d.getDay() === 6) ? EMCALA_PESO_SABADO : 1;
    }
    d.setDate(d.getDate() + 1);
  }
  return { dias: dias, peso: peso };
}

// ------------------------------------------------------------
// MES COMERCIAL (lógica movida del Planificador, sin cambios)
// ------------------------------------------------------------
function getCommercialMonthAndStart(plannerDateStr) {
  if (!plannerDateStr) return { month: '', start: '', last: '' };
  const feriados = emcalaFeriados();
  const formatD = emcalaFormatD;

  // 1. Fecha de entrega (siguiente día hábil)
  let parts = plannerDateStr.split('-');
  let date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() === 0 || feriados.includes(formatD(date)));

  const deliveryDateStr = formatD(date);
  const commercialMonth = deliveryDateStr.substring(0, 7);
  const commYear = parseInt(commercialMonth.substring(0, 4));
  const commMonthIndex = parseInt(commercialMonth.substring(5, 7)) - 1;

  // 2. Primera fecha de entrega del mes comercial
  let firstDelivery = new Date(commYear, commMonthIndex, 1);
  while (firstDelivery.getDay() === 0 || feriados.includes(formatD(firstDelivery))) {
    firstDelivery.setDate(firstDelivery.getDate() + 1);
  }

  // 3. Su fecha de planificación
  let startPlanner = new Date(firstDelivery);
  do {
    startPlanner.setDate(startPlanner.getDate() - 1);
  } while (startPlanner.getDay() === 0 || feriados.includes(formatD(startPlanner)));

  // 4. Última fecha de entrega del mes comercial
  let lastDelivery = new Date(commYear, commMonthIndex + 1, 0);
  while (lastDelivery.getDay() === 0 || feriados.includes(formatD(lastDelivery))) {
    lastDelivery.setDate(lastDelivery.getDate() - 1);
  }

  // 5. Su fecha de planificación
  let lastPlanner = new Date(lastDelivery);
  do {
    lastPlanner.setDate(lastPlanner.getDate() - 1);
  } while (lastPlanner.getDay() === 0 || feriados.includes(formatD(lastPlanner)));

  return {
    month: commercialMonth,
    start: formatD(startPlanner),
    last: formatD(lastPlanner)
  };
}

// Solo el mes comercial ('YYYY-MM')
function getCommercialMonth(dateStr) {
  return getCommercialMonthAndStart(dateStr).month;
}

// ------------------------------------------------------------
// DÍAS HÁBILES DEL MES COMERCIAL (mismos resultados que antes)
// ------------------------------------------------------------
function getDiasHabilesTotales(dateStr) {
  if (!dateStr) return 1;
  const commInfo = getCommercialMonthAndStart(dateStr);
  const r = contarDiasHabiles(new Date(commInfo.start + 'T00:00:00'), new Date(commInfo.last + 'T00:00:00'));
  return r.peso > 0 ? r.peso : 1;
}

function getDiasHabilesTranscurridos(dateStr) {
  if (!dateStr) return 1;
  const commInfo = getCommercialMonthAndStart(dateStr);
  const startD = new Date(commInfo.start + 'T00:00:00');
  const hasta = new Date(dateStr + 'T00:00:00');
  hasta.setDate(hasta.getDate() - 1); // el original usa d < today
  if (hasta < startD) return 1;
  const r = contarDiasHabiles(startD, hasta);
  return r.peso > 0 ? r.peso : 1;
}

function getDiasHabilesRestantes(dateStr) {
  if (!dateStr) return 1;
  const commInfo = getCommercialMonthAndStart(dateStr);
  const today = new Date(dateStr + 'T00:00:00');
  const endD = new Date(commInfo.last + 'T00:00:00');
  const r = contarDiasHabiles(today, endD);
  return r.peso > 0 ? r.peso : 1;
}
