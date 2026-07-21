/**
 * BACKEND PARA EFECTIVIDAD - GOOGLE APPS SCRIPT
 *
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Crea un nuevo Google Sheet en blanco.
 * 2. Ve a Extensiones > Apps Script.
 * 3. Pega este código reemplazando todo lo que haya.
 * 4. Guarda el proyecto.
 * 5. Arriba a la derecha, haz clic en "Implementar" > "Nueva implementación".
 * 6. Tipo: "Aplicación web".
 * 7. Ejecutar como: "Tú".
 * 8. Quién tiene acceso: "Cualquier persona".
 * 9. Copia la URL de la aplicación web generada y pégala en index.html (const CLOUD_URL).
 */

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'saveVisits') {
      const visitRows = payload.visitRows;
      
      // Limpiar la hoja actual
      sheet.clear();
      
      if (!visitRows || visitRows.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Se limpiaron los datos' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // Armar la matriz de datos para Google Sheets
      const headers = ['vnd', 'modo', 'DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
      const dataMatrix = [headers];
      
      for (const row of visitRows) {
        dataMatrix.push([
          row.vnd || '',
          row.modo || '',
          row.days['DO'] || '',
          row.days['LU'] || '',
          row.days['MA'] || '',
          row.days['MI'] || '',
          row.days['JU'] || '',
          row.days['VI'] || '',
          row.days['SA'] || ''
        ]);
      }
      
      // Escribir en la hoja de forma masiva (más rápido)
      sheet.getRange(1, 1, dataMatrix.length, headers.length).setValues(dataMatrix);
      
      return ContentService.createTextOutput(JSON.stringify({ ok: true, count: visitRows.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Acción desconocida' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    if (!data || data.length < 2) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, visitRows: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const visitRows = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      visitRows.push({
        vnd: String(row[0]),
        modo: String(row[1]),
        days: {
          'DO': String(row[2]),
          'LU': String(row[3]),
          'MA': String(row[4]),
          'MI': String(row[5]),
          'JU': String(row[6]),
          'VI': String(row[7]),
          'SA': String(row[8])
        }
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ ok: true, visitRows: visitRows }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
