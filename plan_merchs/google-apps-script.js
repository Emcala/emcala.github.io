// =============================================
// GOOGLE APPS SCRIPT - API para Mapa EMCALA (Una sola hoja)
// Pegar este código en tu Google Sheets
// Ir a: Extensiones → Apps Script → Pegar → Implementar como Web App
// =============================================

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var action = e.parameter.action || 'all';

  // Si la acción no es 'all', procesamos como si fuera un POST (evita errores CORS de POST)
  if (action === 'add' || action === 'edit' || action === 'delete' || action === 'bulk_edit_frecuencia') {
    return handleRequest(e.parameter, sheet);
  }

  // Comportamiento por defecto: obtener todos los clientes
  var data = sheet.getDataRange().getValues();
  var result = { clientes: [] };

  if (data.length > 1) {
    var headers = data[0];
    var normalizedHeaders = headers.map(function(h) {
      return h.toString().toLowerCase().trim();
    });

    for (var i = 1; i < data.length; i++) {
      var row = {};
      var isEmpty = true;
      for (var j = 0; j < headers.length; j++) {
        var val = data[i][j];
        if (val !== "") isEmpty = false;
        row[normalizedHeaders[j] || "columna_" + j] = val;
      }
      if (!isEmpty) {
        result.clientes.push(row);
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(paramData, sheet) {
  var headers = sheet.getDataRange().getValues()[0];
  var normalizedHeaders = headers.map(function(h) { return h.toString().toLowerCase().trim(); });

  var action = paramData.action;
  var result = { status: 'success', message: '' };

  // Función interna para mapear los campos estándar de la app a las columnas reales del sheet
  function getFieldValue(header) {
    if (header.indexOf('cod') > -1 || header === 'id') return paramData.codigo;
    if (header.indexOf('razon') > -1 || header.indexOf('nombre') > -1 || header.indexOf('client') > -1) return paramData.razon_social;
    if (header.indexOf('dir') > -1 || header.indexOf('domic') > -1) return paramData.direccion;
    if (header.indexOf('lat') > -1) return paramData.latitud;
    if (header.indexOf('lon') > -1 || header.indexOf('lng') > -1) return paramData.longitud;
    if (header.indexOf('prom') > -1) return paramData.promotor;
    if (header.indexOf('merch') > -1) return paramData.merch;
    if (header.indexOf('frec') > -1) return paramData.frecuencia;
    if (header.indexOf('tel') > -1) return paramData.telefono;
    if (header.indexOf('nota') > -1) return paramData.notas;
    return undefined;
  }

  try {
    if (action === 'add') {
      var newRow = [];
      for (var j = 0; j < headers.length; j++) {
        var val = getFieldValue(normalizedHeaders[j]);
        newRow.push(val !== undefined ? val : "");
      }
      sheet.appendRow(newRow);
      result.message = 'Cliente agregado';
    } 
    else if (action === 'edit' || action === 'delete') {
      var original_codigo = paramData.original_codigo;
      var original_nombre = paramData.original_nombre;
      
      var data = sheet.getDataRange().getValues();
      var rowIndex = -1;
      
      // Encontrar la fila
      var colCodigo = -1;
      var colNombre = -1;
      for (var j = 0; j < normalizedHeaders.length; j++) {
        if (normalizedHeaders[j].indexOf('cod') > -1 || normalizedHeaders[j] === 'id') colCodigo = j;
        if (normalizedHeaders[j].indexOf('razon') > -1 || normalizedHeaders[j].indexOf('nombre') > -1 || normalizedHeaders[j].indexOf('client') > -1) colNombre = j;
      }

      for (var i = 1; i < data.length; i++) {
        var match = false;
        if (colCodigo > -1 && original_codigo) {
           if (data[i][colCodigo] == original_codigo) match = true;
        } else if (colNombre > -1 && original_nombre) {
           if (data[i][colNombre] == original_nombre) match = true;
        }
        if (match) {
          rowIndex = i + 1; // Base 1
          break;
        }
      }

      if (rowIndex > -1) {
        if (action === 'delete') {
          sheet.deleteRow(rowIndex);
          result.message = 'Cliente eliminado';
        } else if (action === 'edit') {
          for (var j = 0; j < headers.length; j++) {
            var val = getFieldValue(normalizedHeaders[j]);
            if (val !== undefined) {
              sheet.getRange(rowIndex, j + 1).setValue(val);
            }
          }
          result.message = 'Cliente actualizado';
        }
      } else {
        result.status = 'error';
        result.message = 'No se encontró el cliente a modificar/borrar.';
      }
    } else if (action === 'bulk_edit_frecuencia') {
      var idsStr = paramData.codigos || "";
      var nombresStr = paramData.nombres || "";
      var ids = idsStr ? idsStr.split('|||') : [];
      var nombres = nombresStr ? nombresStr.split('|||') : [];
      var nuevaFrecuencia = paramData.frecuencia;

      var data = sheet.getDataRange().getValues();
      var colCodigo = -1;
      var colNombre = -1;
      var colFrecuencia = -1;

      for (var j = 0; j < normalizedHeaders.length; j++) {
        if (normalizedHeaders[j].indexOf('cod') > -1 || normalizedHeaders[j] === 'id') colCodigo = j;
        if (normalizedHeaders[j].indexOf('razon') > -1 || normalizedHeaders[j].indexOf('nombre') > -1 || normalizedHeaders[j].indexOf('client') > -1) colNombre = j;
        if (normalizedHeaders[j].indexOf('frec') > -1) colFrecuencia = j;
      }

      if (colFrecuencia > -1) {
        var count = 0;
        for (var i = 1; i < data.length; i++) {
           var match = false;
           var rowCod = data[i][colCodigo] ? data[i][colCodigo].toString() : "";
           var rowNom = data[i][colNombre] ? data[i][colNombre].toString() : "";
           
           if (rowCod && ids.indexOf(rowCod) > -1) match = true;
           else if (rowNom && nombres.indexOf(rowNom) > -1) match = true;

           if (match) {
             sheet.getRange(i + 1, colFrecuencia + 1).setValue(nuevaFrecuencia);
             count++;
           }
        }
        result.message = 'Se actualizaron ' + count + ' clientes.';
      } else {
        result.status = 'error';
        result.message = 'No se encontró la columna de frecuencia.';
      }
    } else {
      result.status = 'error';
      result.message = 'Acción desconocida';
    }
  } catch (error) {
    result.status = 'error';
    result.message = error.toString();
  }

  var output = ContentService.createTextOutput(JSON.stringify(result));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  var paramData = {};
  if (e && e.postData && e.postData.contents) {
    try {
      paramData = JSON.parse(e.postData.contents);
    } catch(err) {
      paramData = e.parameter;
    }
  } else if (e && e.parameter) {
    paramData = e.parameter;
  }
  
  return handleRequest(paramData, sheet);
}

// =============================================
// INSTRUCCIONES:
// 
// 1. Abrí tu Google Sheets
// 2. Asegurate de que la hoja con tus clientes sea la primera o la activa.
//    Debe tener columnas (sin importar el orden): codigo, razon_social, direccion, 
//    latitud, longitud, promotor, merch, telefono (opcional), notas (opcional).
// 3. Andá a Extensiones → Apps Script
// 4. Borrá todo y pegá este código
// 5. Guardá (Ctrl+S)
// 6. Hacé clic en "Implementar" → "Nueva implementación" (Si ya tenías una, elegí "Gestionar implementaciones" -> "Editar" -> "Nueva versión")
// 7. Tipo: "Aplicación web"
// 8. Ejecutar como: "Yo"
// 9. Quién tiene acceso: "Cualquier persona"
// 10. Hacé clic en "Implementar"
// 11. Copiá la URL y pegala en la configuración de la app
// =============================================
