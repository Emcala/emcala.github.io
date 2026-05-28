// ═══════════════════════════════════════════════════════════════════
// EMCALA AUTH — Módulo centralizado de autenticación
// ═══════════════════════════════════════════════════════════════════
// Importar en cualquier herramienta:
//   <script src="emcala-auth.js"></script>    (misma carpeta)
//   <script src="../PORTAL EMCALA/emcala-auth.js"></script>  (otra carpeta)
//
// Uso:
//   EmcalaAuth.requireLogin();              // redirige si no hay sesión
//   EmcalaAuth.requireRole(['supervisor']); // redirige si no tiene el rol
//   const s = EmcalaAuth.getSession();      // { usuario, rol, nombre, ... }
//   EmcalaAuth.logout();                    // limpia y redirige
// ═══════════════════════════════════════════════════════════════════

const EmcalaAuth = (() => {
  // ── CONFIG ─────────────────────────────────────────────────
  const LOGIN_URL       = '../index.html';
  const PORTAL_URL      = '../portal/index.html';
  const SESSION_KEY     = 'user_session';
  const INACTIVITY_MS   = 30 * 60 * 1000; // 30 minutos
  const CHECK_INTERVAL  = 60 * 1000;       // verificar cada 1 min

  // ── UTILIDADES ─────────────────────────────────────────────

  // Hash simple para firmar sesión (no criptográfico, solo anti-manipulación)
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0; // convertir a 32bit int
    }
    return 'h' + Math.abs(hash).toString(36);
  }

  // El hash ya no se computa localmente, se confía en el token del servidor.
  // Mantenemos la firma para compatibilidad o uso futuro si fuera necesario.

  // ── SESIÓN ─────────────────────────────────────────────────

  function getRawSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isSessionValid(session) {
    if (!session) return false;

    // Campos obligatorios
    if (!session.usuario || !session.rol || !session.usuario || !session.lastActivity) {
      return false;
    }

    // Verificar que exista el token de sesión emitido por el servidor
    if (!session._h) {
      console.warn('[EmcalaAuth] Sesión sin token válido detectada');
      return false;
    }

    // Verificar inactividad
    if (Date.now() - session.lastActivity > INACTIVITY_MS) {
      console.warn('[EmcalaAuth] Sesión expirada por inactividad');
      return false;
    }

    return true;
  }

  function getSession() {
    const session = getRawSession();
    if (!isSessionValid(session)) return null;
    return {
      usuario:    session.usuario,
      rol:        session.rol,
      nombre:     session.nombre,
      promotores: session.promotores || '',
      userHash:   session.userHash || ''
    };
  }

  function updateActivity() {
    const session = getRawSession();
    if (!session) return;
    session.lastActivity = Date.now();
    // El token _h ya viene del servidor y no debe reescribirse
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  // ── PROTECCIÓN ─────────────────────────────────────────────

  function requireLogin() {
    // --- TEMPORAL PARA DESARROLLO LOCAL ---
    if (window.location.protocol === 'file:') {
      if (!isSessionValid(getRawSession())) {
        createSession({ usuario: 'LOCALDEV', rol: 'jdv', nombre: 'Matias (Local)', promotores: '', userHash: 'local_hash' });
      }
      return true;
    }
    // --------------------------------------

    const session = getRawSession();
    if (!isSessionValid(session)) {
      localStorage.removeItem(SESSION_KEY);
      window.location.replace(LOGIN_URL);
      return false;
    }
    updateActivity();
    _startInactivityMonitor();
    return true;
  }

  function requireRole(allowedRoles) {
    if (!requireLogin()) return false;
    const session = getSession();
    if (!session) return false;
    const rolNorm = session.rol.toLowerCase();
    if (!allowedRoles.map(r => r.toLowerCase()).includes(rolNorm)) {
      alert('No tenés permiso para acceder a esta herramienta.');
      window.location.replace(PORTAL_URL);
      return false;
    }
    return true;
  }

  function hasRole(roles) {
    const session = getSession();
    if (!session) return false;
    return roles.map(r => r.toLowerCase()).includes(session.rol.toLowerCase());
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.replace(LOGIN_URL);
  }

  // ── MONITOR DE INACTIVIDAD ─────────────────────────────────

  let _monitorStarted = false;

  function _startInactivityMonitor() {
    if (_monitorStarted) return;
    _monitorStarted = true;

    // Verificar periódicamente
    setInterval(() => {
      const session = getRawSession();
      if (!isSessionValid(session)) {
        localStorage.removeItem(SESSION_KEY);
        window.location.replace(LOGIN_URL);
      }
    }, CHECK_INTERVAL);

    // Resetear actividad con interacciones del usuario
    ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(evt => {
      document.addEventListener(evt, () => updateActivity(), { passive: true });
    });
  }

  // ── CREAR SESIÓN (para uso desde el login) ─────────────────

  function createSession({ usuario, rol, nombre, promotores, userHash, sessionToken }) {
    const session = {
      usuario:      usuario,
      rol:          rol,
      nombre:       nombre || usuario,
      promotores:   promotores || '',
      userHash:     userHash || '',
      _h:           sessionToken || '',
      lastActivity: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  // ── UTILIDADES UI ──────────────────────────────────────────

  // Inserta un badge pequeño con info de usuario (para headers de herramientas)
  function renderUserBadge(containerId) {
    const session = getSession();
    if (!session) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const rolColors = {
      auditor:    { bg: '#7C3AED', label: 'JEFE DE VENTA' },
      supervisor: { bg: '#2563EB', label: 'SUPERVISOR' },
      trade:      { bg: '#D97706', label: 'TRADE MARKETING' },
      tecnico:    { bg: '#059669', label: 'TÉCNICO' },
      promotor:   { bg: '#0891B2', label: 'PROMOTOR' },
      merch:      { bg: '#DB2777', label: 'MERCH' },
      admin:      { bg: '#DC2626', label: 'ADMIN' }
    };

    const info = rolColors[session.rol.toLowerCase()] || { bg: '#6B7280', label: session.rol.toUpperCase() };

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;font-family:'Bricolage Grotesque',Inter,system-ui,sans-serif;">
        <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);padding:6px 14px;border-radius:100px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${info.bg};box-shadow:0 0 8px ${info.bg}88;"></span>
          <span style="font-size:13px;font-weight:700;color:#fff;">${session.nombre}</span>
        </div>
        <button onclick="EmcalaAuth.logout()" title="Cerrar Sesión" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:50%;color:#ef4444;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
        </button>
      </div>
    `;
  }

  // ── API PÚBLICA ────────────────────────────────────────────

  return {
    requireLogin,
    requireRole,
    hasRole,
    getSession,
    logout,
    createSession,
    updateActivity,
    renderUserBadge,
    LOGIN_URL,
    PORTAL_URL
  };

})();
