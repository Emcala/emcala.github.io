// ============================================================
// COBERTURA CVZA - Google Apps Script
// ============================================================
// INSTRUCCIONES DE DEPLOY:
// 1. Ir a https://script.google.com → Nuevo Proyecto
// 2. Borrar todo el contenido y pegar ESTE archivo completo
// 3. Ir a Implementar → Nueva implementación
// 4. Tipo: "Aplicación web"
// 5. Ejecutar como: "Yo" (tu cuenta)
// 6. Quién tiene acceso: "Cualquier persona"
// 7. Click en "Implementar" → Copiar la URL
// 8. Pegar la URL en app.js donde dice SCRIPT_URL
// ============================================================

const MAESTRO_SHEET_ID = '1XckEGDuSZ5r6vREiJUeWQftzxqby8N71YcjlYP37iVs';
const HISTORICOS_SHEET_ID = '1MIToBR9cVqsTnIKQ5XofCQIG10At-MzoosbNFkNqdek';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'getCartera') {
      return getCartera(body.forceRefresh);
    }

    return _json({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return _json({ ok: false, error: err.toString() });
  }
}

function doGet() {
  return getCartera(false);
}

// -------------------------------------------------------
// getCartera: lee el maestro de clientes, filtra por
// Licencia alcohol = SI, Anulado ≠ SI, FV1 Anulado ≠ SI
// Devuelve: { ok, cartera: { promotorName: count }, total }
// -------------------------------------------------------
function getCartera(forceRefresh) {
  // Cache de 2 horas para no leer el Sheet en cada request
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('cartera_v2');
    if (cached) return _json(JSON.parse(cached));
  }

  var ss = SpreadsheetApp.openById(MAESTRO_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();

  if (data.length < 2) return _json({ ok: false, error: 'Sheet vacío' });

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var iCli  = headers.indexOf('cliente');
  var iLic  = _findCol(headers, 'licencia alcohol', 'vencimiento');
  var iAnu  = headers.indexOf('anulado');
  var iProm = _findCol(headers, 'descripcion personal comercial');
  var iFvA  = _findColRegex(headers, /fuerza.*1.*anulado/, /fecha/);

  if (iCli === -1 || iLic === -1 || iProm === -1) {
    return _json({ ok: false, error: 'Columnas no encontradas (cli=' + iCli + ' lic=' + iLic + ' prom=' + iProm + ')' });
  }

  var cartera = {};
  var total = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var lic   = String(row[iLic]  || '').trim().toUpperCase();
    var anu   = iAnu !== -1 ? String(row[iAnu] || '').trim().toUpperCase() : 'NO';
    var fvA   = iFvA !== -1 ? String(row[iFvA] || '').trim().toUpperCase() : 'NO';
    var prom  = String(row[iProm] || '').trim().toUpperCase();
    var cli   = String(row[iCli]  || '').trim();

    if (lic === 'SI' && anu !== 'SI' && fvA !== 'SI' && prom && cli) {
      cartera[prom] = (cartera[prom] || 0) + 1;
      total++;
    }
  }

  // --- 2. HISTORICOS ---
  var historicos = {};
  try {
    var ssHist = SpreadsheetApp.openById(HISTORICOS_SHEET_ID);
    var sheetHist = ssHist.getSheets()[0];
    var dataH = sheetHist.getDataRange().getValues();
    if (dataH.length > 1) {
      var headersH = dataH[0].map(function(h) { return String(h).trim().toLowerCase(); });
      var iHP = _findColRegex(headersH, /promotor|vendedor|nombre/i);
      var iHMA = _findColRegex(headersH, /ccc.*ma$|mes.*ant/i);
      var iHAA = _findColRegex(headersH, /mm\s*aa|a.*o.*ant|ccc.*aa/i);
      
      if (iHP !== -1) {
        for (var j = 1; j < dataH.length; j++) {
          var hProm = String(dataH[j][iHP]).trim().toUpperCase();
          if (hProm) {
            historicos[hProm] = {
              cccMA: (iHMA !== -1 && dataH[j][iHMA]) ? parseInt(dataH[j][iHMA], 10) || 0 : 0,
              cccMMAA: (iHAA !== -1 && dataH[j][iHAA]) ? parseInt(dataH[j][iHAA], 10) || 0 : 0
            };
          }
        }
      }
    }
  } catch(e) {
    // Si falla históricos no rompemos maestro
  }

  var result = { ok: true, cartera: cartera, historicos: historicos, total: total };

  // Guardar en caché (max 6 horas = 21600s, pero GAS limita chunks a 100KB)
  try {
    cache.put('cartera_v2', JSON.stringify(result), 7200);
  } catch(e) { /* cache too large, skip */ }

  return _json(result);
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
function _findCol(headers, includes, excludes) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(includes) !== -1) {
      if (excludes && headers[i].indexOf(excludes) !== -1) continue;
      return i;
    }
  }
  return -1;
}

function _findColRegex(headers, pattern, excludePattern) {
  for (var i = 0; i < headers.length; i++) {
    if (pattern.test(headers[i])) {
      if (excludePattern && excludePattern.test(headers[i])) continue;
      return i;
    }
  }
  return -1;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
