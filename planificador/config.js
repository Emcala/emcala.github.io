    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzePqSmRPZhZJ9LPg6dWr50lf_uGvX8Tt09hbwqKiYJVOa8jt85lyGKRReZ-c_OxMcAcg/exec';
    // URL del servidor centralizado de Auth (corregida)
    const AUTH_URL = 'https://script.google.com/macros/s/AKfycbxtaLF6l7f_UEj8ypCZV_4LoPKJtgH44e5hvPxPceu7Ya_lI_WM3eaWqd2iSUJfEFfIzw/exec';

    // Feriados: referencia al archivo compartido emcala-config.js
    const HOLIDAYS = (typeof EMCALA_HOLIDAYS !== 'undefined') ? EMCALA_HOLIDAYS : [
      '2026-01-01', '2026-02-16', '2026-02-17', '2026-03-24',
      '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-25',
      '2026-06-15', '2026-06-20', '2026-07-09', '2026-08-17',
      '2026-10-12', '2026-11-20', '2026-12-08', '2026-12-25'
    ];

    // Usar fecha LOCAL (no UTC) para evitar desfase de zona horaria
    function setTodayDate() {
      const _now = new Date();
      return `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
    }
    const dateInputEl = document.getElementById('date-input');
    dateInputEl.value = setTodayDate();

    // SPV_DATA se carga dinámicamente desde el servidor
    let SPV_DATA = {};
    let _mesasLoaded = false;

    // Función para traer mesas del servidor y actualizar SPV_DATA
    async function fetchMesasFromServer() {
      let retries = 3;
      while (retries > 0) {
        try {
          const response = await fetch(AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getMesas' })
          });
          const result = await response.json();
          if (result.ok && result.mesas && Object.keys(result.mesas).length > 0) {
            SPV_DATA = result.mesas;
            
            // Mapas de traducción de código a nombre y viceversa
            window.CODE_MAP = result.codigos || {}; 
            window.NAME_MAP = {};
            for (const promotor in window.CODE_MAP) {
              window.NAME_MAP[window.CODE_MAP[promotor]] = promotor;
            }
            
            _mesasLoaded = true;
            console.log('Mesas cargadas del servidor:', Object.keys(SPV_DATA).length, 'supervisores');
            return true;
          }
          break; // Si respondió pero sin mesas, salir del bucle
        } catch(e) {
          console.warn(`Intento fallido al cargar mesas del servidor. Intentos restantes: ${retries - 1}`, e);
          retries--;
          if (retries > 0) await new Promise(r => setTimeout(r, 1500)); // Esperar 1.5s antes de reintentar
        }
      }
      return false;
    }

    // Aplicar filtro de supervisor si el usuario es supervisor
    const session = typeof EmcalaAuth !== 'undefined' ? EmcalaAuth.getSession() : null;
    const isSupervisor = session && session.rol.toLowerCase() === 'supervisor';
    const isAuditor = session && session.rol.toLowerCase() === 'auditor';
    const MY_SPV = session ? session.nombre.toUpperCase() : '';

    function applyRoleFilter() {
      if (!isSupervisor) return;
      const btnClear = document.getElementById('btn-clear');
      if (btnClear) btnClear.style.display = 'none';
      
      const normalizeStr = (s) => String(s || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/ig, "")
        .toUpperCase();
      const normMySpv = normalizeStr(MY_SPV);
      
      let filtered = {};
      let spvMatched = false;
      for (const key in SPV_DATA) {
        const normKey = normalizeStr(key);
        if (normMySpv.includes(normKey) || normKey.includes(normMySpv)) {
          filtered[key] = SPV_DATA[key];
          spvMatched = true;
          break;
        }
      }
      if (spvMatched) {
        SPV_DATA = filtered;
      } else {
        // No mostrar datos ajenos — loguear error y dejar vacío
        console.error('applyRoleFilter: no se encontró mesa para supervisor', MY_SPV);
        SPV_DATA = {};
      }
    }

    // Aplicar filtro inicial si ya tenemos mesas del caché
    if (_mesasLoaded && isSupervisor) {
      applyRoleFilter();
    }