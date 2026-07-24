// ============================================================
// BACKEND - APP CLIENTES NO COMPRADORES (CNC)
// Proyecto de Apps Script INDEPENDIENTE — no modifica ni comparte
// código con el backend de Análisis Anual ni con el Planificador.
// Lee los mismos Sheets (Maestro y Mesas) por ID, en modo lectura.
// ============================================================

const ID_MAESTRO = '1XckEGDuSZ5r6vREiJUeWQftzxqby8N71YcjlYP37iVs';
const ID_MESAS   = '1bYstnKlrL50LTWWFauFRwU9PifnXuQmQjZ4RZGY8K-A';

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  try {
    if (action === 'universo') return jsonOut(getUniverso());
    if (action === 'equipo') return jsonOut(getEquipo());

    return jsonOut({
      status: 'ok',
      info: 'Usar ?action=universo (clientes del Maestro) o ?action=equipo (Promotor/Supervisor/Canal de Mesas).'
    });
  } catch (err) {
    return jsonOut({ status: 'error', error: err.toString() });
  }
}

function doPost(e) {
  return doGet(e);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Busca el índice de columna probando varias palabras clave (case-insensitive, contains).
function findCol(headers, keywords) {
  for (var i = 0; i < headers.length; i++) {
    for (var k = 0; k < keywords.length; k++) {
      if (headers[i].indexOf(keywords[k].toLowerCase()) !== -1) return i;
    }
  }
  return -1;
}

// ------------------------------------------------------------
// action=universo  ->  clientes activos (no anulados) del Maestro,
// con su Promotor. Solo las columnas necesarias (payload liviano).
// ------------------------------------------------------------
function getUniverso() {
  var ss = SpreadsheetApp.openById(ID_MAESTRO);
  var hoja = ss.getSheets()[0];
  var data = hoja.getDataRange().getValues();
  if (data.length < 2) return { status: 'success', clientes: [] };

  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCliente = findCol(headers, ['cliente']);
  var iRazon = findCol(headers, ['razon social']);
  var iFantasia = findCol(headers, ['nombre de fantasia']);
  var iProm = findCol(headers, ['fuerza de venta 1 descripcion personal comercial', 'personal comercial', 'promotor']);
  var iAnu = findCol(headers, ['anulado']);

  var clientes = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var anu = iAnu >= 0 && r[iAnu] ? String(r[iAnu]).trim().toUpperCase() : '';
    if (anu === 'SI') continue;

    var cliente = iCliente >= 0 ? r[iCliente] : '';
    if (cliente === '' || cliente === null) continue;

    var razon = (iRazon >= 0 && r[iRazon]) ? r[iRazon] : (iFantasia >= 0 ? r[iFantasia] : '');
    var promotor = iProm >= 0 && r[iProm] ? String(r[iProm]).trim().toUpperCase() : '';

    clientes.push([cliente, razon, promotor]);
  }

  // Se devuelve como arrays [cliente, razon, promotor] en vez de objetos
  // para bajar el peso del payload en bases grandes.
  return { status: 'success', columnas: ['cliente', 'razon', 'promotor'], clientes: clientes };
}

// ------------------------------------------------------------
// action=equipo  ->  filas de la hoja MESAS: PROMOTOR, SUPERVISOR,
// NOMBRE, SDV, CANAL, VEND.
// ------------------------------------------------------------
function getEquipo() {
  var ss = SpreadsheetApp.openById(ID_MESAS);
  var hoja = ss.getSheetByName('MESAS') || ss.getSheetByName('Mesas') || ss.getSheets()[0];
  var data = hoja.getDataRange().getValues();
  if (data.length < 2) return { status: 'success', equipo: [] };

  var headers = data[0].map(function (h) { return String(h).trim().toUpperCase(); });
  var iProm = headers.indexOf('PROMOTOR');
  var iSup = headers.indexOf('SUPERVISOR');
  var iNombre = headers.indexOf('NOMBRE');
  var iSdv = headers.indexOf('SDV');
  var iCanal = headers.indexOf('CANAL');
  var iVend = headers.indexOf('VEND.');
  if (iVend === -1) iVend = headers.indexOf('VEND');

  var equipo = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var prom = iProm >= 0 && r[iProm] ? String(r[iProm]).trim().toUpperCase() : '';
    if (!prom) continue;
    equipo.push({
      promotor: prom,
      supervisor: iSup >= 0 ? r[iSup] : '',
      nombre: iNombre >= 0 ? r[iNombre] : '',
      sdv: iSdv >= 0 ? r[iSdv] : '',
      canal: iCanal >= 0 ? r[iCanal] : '',
      vend: iVend >= 0 ? r[iVend] : ''
    });
  }
  return { status: 'success', equipo: equipo };
}
