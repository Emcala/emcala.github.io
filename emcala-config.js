// ============================================================
// EMCALA — Configuración Global Compartida
// ============================================================
// Este archivo centraliza constantes que usan múltiples módulos
// (Planificador, Dashboard Ventas, Cobertura CVZA, Efectividad).
// Importarlo con <script src="../emcala-config.js"></script>
// ANTES de los scripts propios de cada módulo.
// ============================================================

// Lista global de feriados donde NO hay preventa ni reparto (formato YYYY-MM-DD)
const EMCALA_HOLIDAYS = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-03-24',
  '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-25',
  '2026-06-15', '2026-06-20', '2026-07-09', '2026-08-17',
  '2026-10-12', '2026-11-20', '2026-12-08', '2026-12-25'
];

// Promotores y supervisores con tratamiento especial en la UI del Planificador.
// - EXCLUDED_PROMOTORS: se ocultan las columnas KPI y Boletas para estas personas.
// - EXCLUDED_SPVS: misma lógica aplicada a nivel de supervisor (fila header).
// Editar acá en vez de tocar ui.js cuando cambien las personas.
const EMCALA_EXCLUDED_PROMOTORS = ['LEMOS PATRICIA'];
const EMCALA_EXCLUDED_SPVS = ['MAYO'];
