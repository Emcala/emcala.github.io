// =============================================
// GOOGLE APPS SCRIPT - API para Mapa EMCALA (Una sola hoja)
// Pegar este código en tu Google Sheets
// Ir a: Extensiones → Apps Script → Pegar → Implementar como Web App
// =============================================

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet(); // Lee la hoja que esté activa (la primera)
  
  var data = sheet.getDataRange().getValues();
  var result = { clientes: [] };

  if (data.length > 1) {
    var headers = data[0];
    
    // Normalizar cabeceras a minúsculas para evitar problemas de mayúsculas/minúsculas
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

// Devolver JSON con soporte CORS automático
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var headers = sheet.getDataRange().getValues()[0];
  var normalizedHeaders = headers.map(function(h) { return h.toString().toLowerCase().trim(); });

  var action = e.parameter.action;
  var result = { status: 'success', message: '' };

  // Función interna para mapear los campos estándar de la app a las columnas reales del sheet
  function getFieldValue(header) {
    if (header.indexOf('cod') > -1 || header === 'id') return e.parameter.codigo;
    if (header.indexOf('razon') > -1 || header.indexOf('nombre') > -1 || header.indexOf('client') > -1) return e.parameter.razon_social;
    if (header.indexOf('dir') > -1 || header.indexOf('domic') > -1) return e.parameter.direccion;
    if (header.indexOf('lat') > -1) return e.parameter.latitud;
    if (header.indexOf('lon') > -1 || header.indexOf('lng') > -1) return e.parameter.longitud;
    if (header.indexOf('prom') > -1) return e.parameter.promotor;
    if (header.indexOf('merch') > -1) return e.parameter.merch;
    if (header.indexOf('frec') > -1) return e.parameter.frecuencia;
    if (header.indexOf('tel') > -1) return e.parameter.telefono;
    if (header.indexOf('nota') > -1) return e.parameter.notas;
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
      var original_codigo = e.parameter.original_codigo;
      var original_nombre = e.parameter.original_nombre;
      
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
    } else {
      result.status = 'error';
      result.message = 'Acción desconocida';
    }
  } catch (error) {
    result.status = 'error';
    result.message = error.toString();
  }

  // Devolver configuración CORS explícita para POST (aunque no se use directamente con form-urlencoded)
  var output = ContentService.createTextOutput(JSON.stringify(result));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
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
