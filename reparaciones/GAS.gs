// ==========================================
// 1. FUNCIONES DE SEGURIDAD Y HELPERS
// ==========================================
const SESSION_SECRET_SERVER = 'emcala_secure_server_key_2026';


function generarHash(password) {
  if (!password) return "";
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  var hash = "";
  for (var i = 0; i < digest.length; i++) {
    var byte = digest[i];
    if (byte < 0) byte += 256;
    var byteStr = byte.toString(16);
    if (byteStr.length == 1) byteStr = '0' + byteStr;
    hash += byteStr;
  }
  return hash;
}

function generarSalt() {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    new Date().getTime().toString() + Math.random().toString()
  );
  return Utilities.base64Encode(raw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

function getUsuariosEnVivo() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('usuarios');
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'usuarios');
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  cache.put('usuarios', JSON.stringify(rows), 300); // 5 minutos
  return rows;
}

function getCachedMesas() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('mesas');
  if (cached) return JSON.parse(cached);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('MESAS');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  cache.put('mesas', JSON.stringify(rows), 1800);
  return rows;
}

function getPromotoresDeSupervisor(usuario) {
  const mesasRows = getCachedMesas();
  if (mesasRows.length < 2) return [];
  const mH = mesasRows[0].map(h => h.toString().trim().toLowerCase());
  const iProm = mH.findIndex(h => h.includes('promotor'));
  const iSup  = mH.findIndex(h => h.includes('supervisor'));
  if (iProm < 0 || iSup < 0) return [];
  return mesasRows.slice(1)
    .filter(r => r[iSup].toString().trim().toUpperCase() === usuario)
    .map(r => r[iProm].toString().trim().toUpperCase());
}

function getUltimasFilas(sheet, n) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const startRow = Math.max(2, lastRow - n + 1);
  const numRows = lastRow - startRow + 1;
  const dataRows = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
  return [headerRow, ...dataRows];
}

// Verifica usuario + userHash para escrituras
// El userHash que guarda el front es generarHash(salt+password) o generarHash(password)
function verificarUsuario(usuario, userHash) {
  const uRows = getUsuariosEnVivo();
  for (let i = 1; i < uRows.length; i++) {
    const rowUser   = uRows[i][0].toString().toUpperCase().trim();
    const rowPass   = uRows[i][1].toString().trim();
    const rowActivo = uRows[i][3].toString().toUpperCase().trim();
    if (rowUser === usuario && rowPass === userHash && rowActivo === 'SI') {
      return { autorizado: true, rol: uRows[i][2].toString().trim().toLowerCase() };
    }
  }
  return { autorizado: false };
}

// ==========================================
// 2. EL CEREBRO CENTRAL (doPost)
// ==========================================
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch(err) {
    return resp({error: 'Payload inválido'});
  }

  // --- ACCIONES ABIERTAS PARA EL FORMULARIO DEL PROMOTOR ---
  if (data.action === 'getPromotores') {
    const sheet = ss.getSheetByName('MESAS');
    if (!sheet) return resp({promotores: []});
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return resp({promotores: []});
    const header = rows[0].map(h => h.toString().trim().toLowerCase());
    const iProm = header.findIndex(h => h.includes('promotor'));
    if (iProm < 0) return resp({promotores: []});
    const list = [...new Set(rows.slice(1).map(r => r[iProm].toString().trim().toUpperCase()))]
      .filter(Boolean)
      .sort();
    return resp({promotores: list});
  }

  if (data.action === 'buscarCliente') {
    const cod = (data.cliente || '').toString().trim();
    if (!cod) return resp({encontrado: false});
    const sheet = ss.getSheetByName('Clientes');
    if (!sheet) return resp({encontrado: false});
    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return resp({encontrado: false});
    const header = rows[0].map(h => h.toString().trim().toLowerCase());
    const iCod = header.findIndex(h => h === 'código cliente' || h === 'codigo cliente' || h === 'cliente' || h.includes('código'));
    const iNom = header.findIndex(h => h.includes('nombre') || h.includes('razón') || h.includes('razon'));
    const iLoc = header.findIndex(h => h === 'localidad' || h.includes('localidad'));
    if (iCod < 0) return resp({encontrado: false});
    const row = rows.slice(1).find(r => r[iCod].toString().trim() === cod);
    if (row) {
      return resp({
        encontrado: true,
        nombre: iNom >= 0 ? row[iNom].toString().trim() : '',
        localidad: iLoc >= 0 ? row[iLoc].toString().trim() : ''
      });
    }
    return resp({encontrado: false});
  }

  // --- A. GESTIÓN DE LOGIN ---
  if (data.action === 'login') {
    const usuario  = (data.usuario  || '').toUpperCase().trim();
    const password = (data.password || '').trim();
    const hashSimple = generarHash(password);
    const rows = getUsuariosEnVivo();
    const sheet = ss.getSheets().find(s => s.getName().toLowerCase() === 'usuarios');

    for (let i = 1; i < rows.length; i++) {
      const rowUser   = rows[i][0].toString().toUpperCase().trim();
      const rowHash   = rows[i][1].toString().trim();
      const rowRol    = rows[i][2].toString().trim().toLowerCase();
      const rowActivo = rows[i][3].toString().toUpperCase().trim();
      const rowSalt   = rows[i][4] ? rows[i][4].toString().trim() : '';

      if (rowUser !== usuario || rowActivo !== 'SI') continue;

      let autorizado = false;

      if (rowSalt) {
        // Usuario con salt — verificación con salt
        autorizado = generarHash(rowSalt + password) === rowHash;
      } else {
        // Usuario sin salt — verificación simple
        autorizado = hashSimple === rowHash;
      }

      if (autorizado) {
        let promotoresList = '';
        if (rowRol === 'supervisor') promotoresList = getPromotoresDeSupervisor(usuario).join(',');
        
        const tokenData = usuario + '|' + rowRol + '|' + rowHash;
        const signature = Utilities.computeHmacSha256Signature(tokenData, SESSION_SECRET_SERVER);
        const sessionToken = Utilities.base64Encode(signature);

        return resp({
          ok: true,
          rol: rowRol,
          label: rows[i][0].toString(),
          promotores: promotoresList,
          userHash: rowHash,
          sessionToken: sessionToken
        });
      }
    }
    return resp({ok: false, error: 'Credenciales inválidas'});
  }

  // --- A.2. GESTIÓN DE USUARIOS (Solo Auditor) ---
  if (data.action === 'get_usuarios') {
    const usuario = (data.usuario || '').toUpperCase().trim();
    const userHash = (data.userHash || '').trim();
    const verificacion = verificarUsuario(usuario, userHash);
    if (!verificacion.autorizado || verificacion.rol !== 'auditor') return resp({ok: false, error: 'No autorizado'});

    const rows = getUsuariosEnVivo();
    const headers = rows[0].map(h => h.toString().trim().toLowerCase());
    const usuarios = rows.slice(1).map(r => ({
      usuario: r[0].toString().trim(),
      rol: r[2].toString().trim().toLowerCase(),
      activo: r[3].toString().toUpperCase().trim(),
      promotores: r[5] ? r[5].toString().trim() : ''
    }));
    return resp({ok: true, usuarios});
  }

  if (data.action === 'save_usuario') {
    const usuarioAdmin = (data.usuario || '').toUpperCase().trim();
    const userHash = (data.userHash || '').trim();
    const verificacion = verificarUsuario(usuarioAdmin, userHash);
    if (!verificacion.autorizado || verificacion.rol !== 'auditor') return resp({ok: false, error: 'No autorizado'});

    const sheet = ss.getSheetByName('usuarios');
    if (!sheet) return resp({ok: false, error: 'Hoja usuarios no encontrada'});
    
    const targetUser = (data.targetUser || '').toUpperCase().trim();
    const targetPass = (data.targetPass || '').trim();
    const targetRol = (data.targetRol || '').trim().toLowerCase();
    const targetActivo = (data.targetActivo || 'SI').toUpperCase().trim();
    const targetPromotores = (data.targetPromotores || '').trim();

    if (!targetUser) return resp({ok: false, error: 'Usuario destino vacío'});

    const rows = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for(let i = 1; i < rows.length; i++) {
      if(rows[i][0].toString().toUpperCase().trim() === targetUser) {
        rowIndex = i + 1; // 1-based index
        break;
      }
    }

    let hashAGuardar = '';
    let saltAGuardar = '';
    
    if (rowIndex > -1) {
      // Edit existing user
      if (targetPass) {
        saltAGuardar = Math.random().toString(36).substring(2, 10);
        hashAGuardar = generarHash(saltAGuardar + targetPass);
      } else {
        // Keep old password
        hashAGuardar = rows[rowIndex - 1][1];
        saltAGuardar = rows[rowIndex - 1][4];
      }
      sheet.getRange(rowIndex, 1, 1, 6).setValues([[
        targetUser, hashAGuardar, targetRol, targetActivo, saltAGuardar, targetPromotores
      ]]);
    } else {
      // Create new user
      if (!targetPass) return resp({ok: false, error: 'Se requiere contraseña para nuevo usuario'});
      saltAGuardar = Math.random().toString(36).substring(2, 10);
      hashAGuardar = generarHash(saltAGuardar + targetPass);
      sheet.appendRow([targetUser, hashAGuardar, targetRol, targetActivo, saltAGuardar, targetPromotores]);
    }

    CacheService.getScriptCache().remove('CACHE_USUARIOS');
    return resp({ok: true});
  }


  // --- B. LECTURA DE DATOS PARA EL DASHBOARD ---
  if (data.action === 'datos') {
    const usuario   = (data.usuario  || '').toUpperCase().trim();
    const userHash  = (data.userHash || '').trim();
    const diasAtras = parseInt(data.dias || '30');

    const verificacion = verificarUsuario(usuario, userHash);
    if (!verificacion.autorizado) return resp({ok: false, error: 'No autorizado'});
    const rolActual = verificacion.rol;

    const formSheet = ss.getSheetByName('Form');
    const segSheet  = ss.getSheetByName('seguimientos');
    const chatSheet = ss.getSheetByName('chat');
    const histSheet = ss.getSheetByName('historial');

    const fechaLimite = new Date();
    fechaLimite.setFullYear(fechaLimite.getFullYear() - 10); // Cargamos todo (10 años) para todos los roles, dado el volumen bajo de datos.

    let promotoresDelSup = [];
    if (rolActual === 'supervisor') promotoresDelSup = getPromotoresDeSupervisor(usuario);

    // 1. MAESTRO DE CLIENTES
    let clientesDict = {};
    const clientesSheet = ss.getSheetByName('Clientes');
    if (clientesSheet && clientesSheet.getLastRow() > 1) {
      const cData = clientesSheet.getDataRange().getValues();
      const cH = cData[0].map(h => h.toString().trim().toLowerCase());
      const iCod = cH.findIndex(h => h === 'código cliente' || h === 'codigo cliente' || h === 'cliente' || h.includes('código'));
      const iNom = cH.findIndex(h => h.includes('nombre') || h.includes('razón') || h.includes('razon'));
      const iDir = cH.findIndex(h => h === 'dirección' || h === 'direccion' || h.includes('direcci'));
      const iLoc = cH.findIndex(h => h === 'localidad' || h.includes('localidad'));
      const iProm = cH.findIndex(h => h.includes('promotor vendedor') || h.includes('promotor'));
      const iFrec = cH.findIndex(h => h.includes('frecuencia'));

      if (iCod >= 0) {
        for (let i = 1; i < cData.length; i++) {
          const cod = cData[i][iCod].toString().trim();
          if (cod) {
            clientesDict[cod] = {
              nombre: iNom >= 0 ? cData[i][iNom].toString().trim() : '',
              direccion: iDir >= 0 ? cData[i][iDir].toString().trim() : '',
              localidad: iLoc >= 0 ? cData[i][iLoc].toString().trim() : '',
              promotor: iProm >= 0 ? cData[i][iProm].toString().trim() : '',
              frecuencia: iFrec >= 0 ? cData[i][iFrec].toString().trim() : ''
            };
          }
        }
      }
    }

    // 2. REGISTROS (Form)
    let registros = [];
    if (formSheet && formSheet.getLastRow() > 1) {
      const allRows = getUltimasFilas(formSheet, 2000);
      const header  = allRows[0].map(h => h.toString().trim().toLowerCase());
      const iTs   = header.findIndex(h => h.includes('timestamp'));
      const iCli  = header.findIndex(h => h.includes('cliente') && !h.includes('nombre'));
      const iPromForm = header.findIndex(h => h.includes('promotor'));

      const newHeader = [...allRows[0], 'razon_social', 'direccion', 'localidad', 'frecuencia'];

      const filteredRows = allRows.slice(1).filter(row => {
        if (iTs >= 0 && row[iTs]) {
          const ts = new Date(row[iTs]);
          if (!isNaN(ts) && ts < fechaLimite) return false;
        }
        const cod = iCli >= 0 ? row[iCli].toString().trim() : '';
        const dataCli = clientesDict[cod] || {nombre:'', direccion:'', localidad:'', frecuencia:'', promotor:''};
        const promotorReal = dataCli.promotor || (iPromForm >= 0 ? row[iPromForm].toString().trim() : '');

        if (rolActual === 'supervisor') {
          if (!promotoresDelSup.includes(promotorReal.toUpperCase())) return false;
        }
        row._dataCli = dataCli;
        row._promotorReal = promotorReal;
        return true;
      }).map(row => {
        const d = row._dataCli;
        if (iPromForm >= 0) row[iPromForm] = row._promotorReal;
        const cleanRow = [...row];
        delete cleanRow._dataCli;
        delete cleanRow._promotorReal;
        return [...cleanRow, d.nombre, d.direccion, d.localidad, d.frecuencia];
      });
      registros = [newHeader, ...filteredRows];
    }

    // 3. HISTORIAL
    let historial = [];
    if (histSheet && histSheet.getLastRow() > 1) {
      const allHist = getUltimasFilas(histSheet, 500);
      const hHist   = allHist[0].map(h => h.toString().trim().toLowerCase());
      const iTsHist = hHist.findIndex(h => h.includes('timestamp'));
      const iCliHist = hHist.findIndex(h => h.includes('cliente') && !h.includes('nombre'));
      const iHtec   = hHist.findIndex(h => h.includes('tecnico'));
      const iHsup   = hHist.findIndex(h => h.includes('supervisor'));

      const newHeaderHist = [...allHist[0], 'razon_social', 'direccion', 'localidad', 'frecuencia'];

      const filteredHist = allHist.slice(1).filter(r => {
        if (iTsHist >= 0 && r[iTsHist]) {
           const ts = new Date(r[iTsHist]);
           if (!isNaN(ts) && ts < fechaLimite) return false;
        }
        const cod = iCliHist >= 0 ? r[iCliHist].toString().trim() : '';
        const dataCli = clientesDict[cod] || {nombre:'', direccion:'', localidad:'', frecuencia:'', promotor:''};

        if (rolActual === 'tecnico' && iHtec >= 0) {
          if (r[iHtec].toString().trim().toUpperCase() !== usuario) return false;
        } else if (rolActual === 'supervisor' && iHsup >= 0) {
          if (r[iHsup].toString().trim().toUpperCase() !== usuario) return false;
        }
        r._dataCli = dataCli;
        return true;
      }).map(r => {
        const d = r._dataCli;
        const cleanRow = [...r];
        delete cleanRow._dataCli;
        return [...cleanRow, d.nombre, d.direccion, d.localidad, d.frecuencia];
      });
      historial = [newHeaderHist, ...filteredHist];
    }

    // FILTRAR OTs VÁLIDAS
    const validOTs = new Set();
    if (registros.length > 1) {
      const hReg = registros[0].map(h => h.toString().trim().toLowerCase());
      const iOtReg = hReg.findIndex(h => h.includes('ot'));
      if (iOtReg >= 0) registros.slice(1).forEach(r => validOTs.add(r[iOtReg].toString().trim()));
    }
    if (historial.length > 1) {
       const hHist = historial[0].map(h => h.toString().trim().toLowerCase());
       const iOtHist = hHist.findIndex(h => h.includes('ot'));
       if (iOtHist >= 0) historial.slice(1).forEach(r => validOTs.add(r[iOtHist].toString().trim()));
    }

    // 4. SEGUIMIENTOS & CHAT
    let seguimientos = [], chat = [];
    if (segSheet && segSheet.getLastRow() > 1) {
      const allSeg = segSheet.getDataRange().getValues();
      const hSeg   = allSeg[0].map(h => h.toString().trim().toLowerCase());
      const iOtSeg = hSeg.findIndex(h => h.includes('ot'));
      seguimientos = [allSeg[0], ...allSeg.slice(1).filter(row => {
        if (iOtSeg >= 0 && (rolActual === 'supervisor' || rolActual === 'tecnico')) return validOTs.has(row[iOtSeg].toString().trim());
        return true;
      })];
    }
    if (chatSheet && chatSheet.getLastRow() > 1) {
      const allChat = chatSheet.getDataRange().getValues();
      const hChat   = allChat[0].map(h => h.toString().trim().toLowerCase());
      const iOtChat = hChat.findIndex(h => h.includes('ot'));
      chat = [allChat[0], ...allChat.slice(1).filter(row => {
        if (iOtChat >= 0 && (rolActual === 'supervisor' || rolActual === 'tecnico')) return validOTs.has(row[iOtChat].toString().trim());
        return true;
      })];
    }

    return resp({ok: true, registros, seguimientos, chat, historial});
  }

  // --- C. BARRERA DE SEGURIDAD PARA ESCRITURAS ---
  // Excepción: El formulario público del promotor no envía login y no tiene 'tipo' definido.
  const isPromotorForm = (data.rol === 'promotor' && !data.tipo);
  
  if (!isPromotorForm) {
    const usuarioEscritura = (data.usuario || '').toUpperCase().trim();
    const hashEscritura = (data.userHash || '').trim();
    const verificacionE = verificarUsuario(usuarioEscritura, hashEscritura);
    if (!verificacionE.autorizado) {
      return resp({error: 'Acceso denegado.'});
    }
  }

  // --- D. LÓGICA DE ESCRITURA ---
  if (data.tipo === 'seguimiento') {
    let sheet = ss.getSheetByName('seguimientos');
    if (!sheet) {
      sheet = ss.insertSheet('seguimientos');
      sheet.appendRow(['timestamp','ot','cliente','promotor','estado','comentario','tecnico',
        'prioridad_sugerida','prioridad_aprobada','aprobado_por','tec_lat','tec_lng','tec_timestamp']);
    }
    sheet.appendRow([
      data.timestamp, data.ot, data.cliente, data.promotor,
      data.estado||'', data.comentario||'', data.tecnico||'',
      data.prioridad_sugerida||'', data.prioridad_aprobada||'', data.aprobado_por||'',
      data.tec_lat||'', data.tec_lng||'', data.tec_timestamp||''
    ]);

    const estadoLow = (data.estado||'').toLowerCase();
    if ((estadoLow === 'resuelto' || estadoLow === 'retiro' || estadoLow === 'cliente-cerrado') && data.tecnico) {
      let supervisorPromotor = '';
      const mesasRows = getCachedMesas();
      if (mesasRows.length > 1) {
        const mH = mesasRows[0].map(h => h.toString().trim().toLowerCase());
        const iProm = mH.findIndex(h => h.includes('promotor'));
        const iSup  = mH.findIndex(h => h.includes('supervisor'));
        if (iProm >= 0 && iSup >= 0) {
          const fila = mesasRows.slice(1).find(r => r[iProm].toString().trim().toUpperCase() === (data.promotor||'').toUpperCase().trim());
          if (fila) supervisorPromotor = fila[iSup].toString().trim();
        }
      }
      const histSheet = ss.getSheetByName('historial');
      if (histSheet) {
        histSheet.appendRow([
          data.timestamp, data.ot, data.cliente, data.promotor,
          supervisorPromotor, data.marca||'', data.edf||'', data.falla||'',
          data.tecnico, data.comentario||'',
          data.prioridad_aprobada||data.prioridad_sugerida||'',
          data.tec_lat||'', data.tec_lng||'', data.tec_timestamp||''
        ]);
      }
    }
  } else if (data.tipo === 'chat') {
    let sheet = ss.getSheetByName('chat');
    if (!sheet) {
      sheet = ss.insertSheet('chat');
      sheet.appendRow(['timestamp','ot','autor','rol','chat_tipo','mensaje']);
    }
    sheet.appendRow([data.timestamp, data.ot, data.autor, data.rol, data.chat_tipo||'', data.mensaje]);

  } else {
    const sheet = ss.getSheetByName('Form') || ss.getSheets()[0];
    
    // Generación atómica de OT usando LockService y una hoja 'Config'
    const lock = LockService.getScriptLock();
    let ot = '';
    try {
      lock.waitLock(10000); // Esperar hasta 10 segundos
      let configSheet = ss.getSheetByName('Config');
      if (!configSheet) {
        configSheet = ss.insertSheet('Config');
        configSheet.appendRow(['Clave', 'Valor']);
        configSheet.appendRow(['UltimaOT', 181652000000]);
      }
      
      let currentVal = parseInt(configSheet.getRange(2, 2).getValue());
      
      // Buscar el OT máximo real en la hoja Form para evitar duplicados si se borraron filas
      let maxOtInSheet = 181652000000;
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const otValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < otValues.length; i++) {
          const val = parseInt(otValues[i][0]);
          if (!isNaN(val) && val > maxOtInSheet) {
            maxOtInSheet = val;
          }
        }
      }
      
      // Asegurar que el OT nuevo siempre sea mayor que el máximo histórico de la hoja
      if (isNaN(currentVal) || currentVal < maxOtInSheet) {
        currentVal = maxOtInSheet;
      }
      
      const nextVal = currentVal + 1;
      configSheet.getRange(2, 2).setValue(nextVal);
      ot = String(nextVal);
    } catch (e) {
      // Fallback seguro si falla el lock
      ot = String(Date.now()); // Usa timestamp para asegurar unicidad absoluta
    } finally {
      try { lock.releaseLock(); } catch(e){}
    }

    let fotoUrl = data.foto || '';
    if (data.fotoBase64 && data.fotoMimeType) {
      try {
        let parentFolder = DriveApp.getFileById(ss.getId()).getParents().next();
        let folders = parentFolder.getFoldersByName("Fotos_OT");
        let targetFolder = folders.hasNext() ? folders.next() : parentFolder.createFolder("Fotos_OT");
        
        let fileBlob = Utilities.newBlob(Utilities.base64Decode(data.fotoBase64), data.fotoMimeType, "OT_" + ot + "." + (data.fotoExtension || "jpg"));
        let file = targetFolder.createFile(fileBlob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fotoUrl = file.getUrl();
      } catch (err) {
        Logger.log("Error guardando foto: " + err.toString());
      }
    }

    const newRow = sheet.getLastRow() + 1;
    sheet.appendRow([ot, data.timestamp, data.promotor, data.rol, data.cliente,
      data.marca, data.edf, data.falla,
      String(data.lat||''), String(data.lng||''), fotoUrl, data.notas||'']);
    try { sheet.getRange(newRow, 9).setNumberFormat('@'); } catch(e){}
    try { sheet.getRange(newRow, 10).setNumberFormat('@'); } catch(e){}
    return resp({result: 'ok', ot: ot});
  }

  return resp({result: 'ok'});
}

function doGet(e) {
  return ContentService.createTextOutput("Servidor EMCALA Activo (Solo POST permitido).");
}

function resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const formSheet = ss.getSheetByName('Form');
  const histSheet = ss.getSheetByName('historial');
  const segSheet = ss.getSheetByName('seguimientos');
  
  Logger.log('Form filas: ' + (formSheet ? formSheet.getLastRow() : 'NO EXISTE'));
  Logger.log('historial filas: ' + (histSheet ? histSheet.getLastRow() : 'NO EXISTE'));
  Logger.log('seguimientos filas: ' + (segSheet ? segSheet.getLastRow() : 'NO EXISTE'));
}

function testPromotor() {
  const promotores = getPromotoresDeSupervisor('ECEIZA');
  Logger.log('Promotores de ECEIZA: ' + JSON.stringify(promotores));
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = ss.getSheetByName('Form');
  const rows = form.getRange(2, 1, 5, form.getLastColumn()).getValues();
  const header = form.getRange(1, 1, 1, form.getLastColumn()).getValues()[0];
  const iProm = header.findIndex(h => h.toString().toLowerCase().includes('promotor'));
  Logger.log('Columna promotor índice: ' + iProm);
  Logger.log('Primeros 5 promotores en Form: ' + rows.map(r => r[iProm]).join(' | '));
}

function testHeaderForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = ss.getSheetByName('Form');
  const header = form.getRange(1, 1, 1, form.getLastColumn()).getValues()[0];
  Logger.log('Headers: ' + JSON.stringify(header));
}

function testRegistrosEceiza() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = ss.getSheetByName('Form');
  const rows = form.getDataRange().getValues();
  const iProm = 2; // columna promotor
  
  const promotoresEceiza = ["DOMINGUEZ GONZALO","GEREZ JONATHAN","GONZALEZ ROBERTO",
    "GUARAZ JUAN","MENDOZA SERGIO","MUÑOZ PAULA","REGNER LEANDRO","JOFRE LUCAS","SCORNAVACHE WALTER"];
  
  const encontrados = rows.slice(1).filter(r => 
    promotoresEceiza.includes(r[iProm].toString().trim().toUpperCase())
  );
  
  Logger.log('Registros de promotores de ECEIZA: ' + encontrados.length);
  if(encontrados.length > 0) Logger.log('Ejemplo: ' + JSON.stringify(encontrados[0]));
}

// ==========================================
// 3. UTILITY SCRIPT FOR ONE-TIME CLEANUP
// ==========================================
function ejecutarLimpiezaBaseDeDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const otsAEliminar = ["181652000083", "181652000113", "181652000114", "181652000115", "181652000116", "181652000117"];
  
  Logger.log("--- INICIANDO LIMPIEZA DE BASE DE DATOS EMCALA ---");
  
  // 1. Limpiar OTs a eliminar en todas las hojas relevantes
  const hojas = ["Form", "seguimientos", "chat", "historial"];
  hojas.forEach(nombreHoja => {
    const sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) {
      Logger.log("Hoja no encontrada: " + nombreHoja);
      return;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    
    const dataRange = sheet.getDataRange();
    const rows = dataRange.getValues();
    const headers = rows[0].map(h => h.toString().trim().toLowerCase());
    const iOt = headers.findIndex(h => h.includes('ot'));
    
    if (iOt < 0) {
      Logger.log("No se encontró columna OT en la hoja: " + nombreHoja);
      return;
    }
    
    let filasAEliminar = [];
    for (let i = 1; i < rows.length; i++) {
      const otVal = rows[i][iOt].toString().trim();
      // Eliminar si está en la lista o si en la hoja Form está vacía excepto OT
      if (otsAEliminar.includes(otVal)) {
        filasAEliminar.push(i + 1); // 1-based index
      } else if (nombreHoja === "Form" && otVal >= "181652000113" && otVal <= "181652000117") {
        filasAEliminar.push(i + 1);
      } else if (nombreHoja === "Form" && rows[i].slice(1).every(val => !val.toString().trim())) {
        // Fila extra vacía
        filasAEliminar.push(i + 1);
      }
    }
    
    // Eliminar de abajo hacia arriba para no alterar índices
    filasAEliminar.sort((a, b) => b - a);
    // Eliminar duplicados de filas a eliminar por seguridad
    filasAEliminar = [...new Set(filasAEliminar)];
    
    Logger.log("Hoja " + nombreHoja + ": Eliminando " + filasAEliminar.length + " filas.");
    filasAEliminar.forEach(rowIdx => {
      sheet.deleteRow(rowIdx);
    });
  });
  
  // 2. Corregir y dar formato a coordenadas GPS en 'Form', 'historial' y 'seguimientos'
  const hojasGPS = ["Form", "historial", "seguimientos"];
  hojasGPS.forEach(nombreHoja => {
    try {
      const sheet = ss.getSheetByName(nombreHoja);
      if (!sheet) return;
      
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;
      
      const dataRange = sheet.getDataRange();
      const rows = dataRange.getValues();
      const headers = rows[0].map(h => h.toString().trim().toLowerCase());
      
      const iLat = headers.findIndex(h => h === 'lat' || h === 'tec_lat' || h.includes('latitud'));
      const iLng = headers.findIndex(h => h === 'lng' || h === 'tec_lng' || h.includes('longitud'));
      
      if (iLat < 0 || iLng < 0) {
        Logger.log("No se encontraron columnas de coordenadas en la hoja: " + nombreHoja);
        return;
      }
      
      let corregidosCount = 0;
      
      for (let i = 1; i < rows.length; i++) {
        try {
          const rowIndex = i + 1;
          const latVal = rows[i][iLat].toString().trim();
          const lngVal = rows[i][iLng].toString().trim();
          
          const cleanLat = cleanCoordinateFormat(latVal);
          const cleanLng = cleanCoordinateFormat(lngVal);
          
          if (cleanLat !== latVal || cleanLng !== lngVal) {
            corregidosCount++;
          }
          
          // Escribir valor limpio (sin forzar formato para evitar conflicto con Tablas)
          const cellLat = sheet.getRange(rowIndex, iLat + 1);
          cellLat.setValue(cleanLat);
          
          const cellLng = sheet.getRange(rowIndex, iLng + 1);
          cellLng.setValue(cleanLng);
        } catch(rowErr) {
          Logger.log("Hoja " + nombreHoja + " fila " + (i+1) + ": No se pudo corregir (" + rowErr.message + ")");
        }
      }
      
      Logger.log("Hoja " + nombreHoja + ": Corregidas e indexadas " + corregidosCount + " celdas de GPS.");
    } catch(sheetErr) {
      Logger.log("⚠️ Hoja " + nombreHoja + ": No se pudo procesar GPS (" + sheetErr.message + "). Continuando con la siguiente...");
    }
  });
  
  Logger.log("--- LIMPIEZA COMPLETADA CON ÉXITO ---");
}

function cleanCoordinateFormat(val) {
  if (!val) return '';
  let str = val.toString().trim();
  if (!str) return '';
  
  // Quitar espacios extras y normalizar comas a puntos decimales
  str = str.replace(/\s+/g, '').replace(/,/g, '.');
  
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2) {
      // Si tiene múltiples puntos (ej: -34.425.096)
      // Mantener el primer punto y unir el resto
      str = parts[0] + '.' + parts.slice(1).join('');
    }
  }
  return str;
}

function testBuscarCliente() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Clientes');
  const rows = sheet.getDataRange().getValues();
  Logger.log('Headers: ' + JSON.stringify(rows[0]));
  Logger.log('Primera fila de datos: ' + JSON.stringify(rows[1]));
}

function testCodigo7946() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Clientes');
  const rows = sheet.getDataRange().getValues();
  const header = rows[0].map(h => h.toString().trim().toLowerCase());
  const iCod = header.findIndex(h => h.includes('código') || h.includes('codigo') || h === 'cliente');
  
  Logger.log('Columna código index: ' + iCod);
  
  // Buscar 7946 de distintas formas
  const encontrado = rows.slice(1).find(r => r[iCod].toString().trim() === '7946');
  Logger.log('Búsqueda exacta "7946": ' + (encontrado ? 'ENCONTRADO ✅' : 'NO encontrado ❌'));
  
  // Mostrar los primeros 5 códigos para ver cómo son
  Logger.log('Primeros 5 códigos: ' + rows.slice(1,6).map(r => JSON.stringify(r[iCod]) + ' (tipo: ' + typeof r[iCod] + ')').join(' | '));
  
  // Buscar si 7946 existe de alguna forma
  const aprox = rows.slice(1).find(r => r[iCod].toString().includes('7946'));
  Logger.log('Búsqueda aproximada "7946": ' + (aprox ? 'ENCONTRADO: ' + JSON.stringify(aprox[iCod]) : 'NO existe en la hoja'));
}

function testGuardar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Form');
  Logger.log('Hoja Form encontrada: ' + (sheet ? 'SÍ' : 'NO'));
  Logger.log('Última fila: ' + (sheet ? sheet.getLastRow() : 'N/A'));
  Logger.log('Nombre planilla: ' + ss.getName());
}

function testUltimaFila() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Form');
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('Última fila: ' + JSON.stringify(data));
}