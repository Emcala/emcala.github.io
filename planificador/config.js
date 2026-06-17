    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzePqSmRPZhZJ9LPg6dWr50lf_uGvX8Tt09hbwqKiYJVOa8jt85lyGKRReZ-c_OxMcAcg/exec';
    // Usar fecha LOCAL (no UTC) para evitar desfase de zona horaria
    function setTodayDate() {
      const _now = new Date();
      return `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    }
    const dateInputEl = document.getElementById('date-input');
    dateInputEl.value = setTodayDate();
    const RAW_SPV_DATA = {
      'ARES PEDRO': ['GALLO JONATHAN', 'DIAZ VALERIA', 'FERREYRA LEONARDO', 'MIÑO RENZO', 'LOPEZ PABLO', 'SANCHEZ ROCIO'],
      'AVILA EZEQUIEL': ['FERNANDEZ LUIS', 'THEILLET NICOLAS', 'JAIMES EZEQUIEL', 'MOURELLE ALFREDO', 'PEREYRA BRAIAN', 'SAN JUAN CARLOS', 'SANTILLAN SERGIO', 'TESEI ALEJANDRA', 'TORRES KARINA'],
      'ECEIZA KEVIN': ['DOMINGUEZ GONZALO', 'GEREZ JONATHAN', 'GONZALEZ ROBERTO', 'JOFRE LUCAS', 'GUARAZ JUAN', 'MENDOZA SERGIO', 'MUÑOZ PAULA', 'REGNER LEANDRO', 'SCORNAVACHE WALTER'],
      'RIERA SALA DANIELA': ['ASCONA MATIAS', 'BENITEZ NAHUEL', 'CESPEDES ENZO', 'FERREYRA TOBIAS', 'FREDES CLAUDIA', 'GARCIA MAIRA', 'LEITES RODRIGO', 'LOPEZ ALEJANDRA', 'MORENO AGUSTINA'],
      'BDR': ['ANDUAGA SANTIAGO', 'GOMEZ GUSTAVO', 'VEDIA ELIZABETH'],
      'LEMOS PATRICIA': ['LEMOS PATRICIA']
    };
    let SPV_DATA = {};
    const session = typeof EmcalaAuth !== 'undefined' ? EmcalaAuth.getSession() : null;
    const isSupervisor = session && session.rol.toLowerCase() === 'supervisor';
    const isAuditor = session && session.rol.toLowerCase() === 'auditor';
    const MY_SPV = session ? session.nombre.toUpperCase() : '';

    if (isSupervisor) {
      const btnClear = document.getElementById('btn-clear');
      if (btnClear) btnClear.style.display = 'none';
      let spvMatched = false;
      const normalizeStr = (s) => String(s || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/ig, "")
        .toUpperCase();
      const normMySpv = normalizeStr(MY_SPV);
      for (const key in RAW_SPV_DATA) {
        const normKey = normalizeStr(key);
        if (normMySpv.includes(normKey) || normKey.includes(normMySpv)) {
          SPV_DATA[key] = RAW_SPV_DATA[key];
          spvMatched = true;
          break;
        }
      }
      if (!spvMatched) {
        // Fallback
        const firstKey = Object.keys(RAW_SPV_DATA)[0];
        SPV_DATA[firstKey] = RAW_SPV_DATA[firstKey];
      }
    } else {
      Object.assign(SPV_DATA, RAW_SPV_DATA);
    }