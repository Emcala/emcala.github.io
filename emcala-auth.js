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
      <div style="display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque',Inter,system-ui,sans-serif;">
        <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);padding:6px 12px;border-radius:100px;white-space:nowrap;">
          <span style="width:8px;height:8px;border-radius:50%;background:${info.bg};box-shadow:0 0 8px ${info.bg}88;"></span>
          <span style="font-size:12px;font-weight:700;color:#fff;">${session.nombre}</span>
        </div>
        <button onclick="window.location.href='${PORTAL_URL}'" title="Volver al menú principal" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:transparent;border:1.5px solid rgba(255,255,255,0.4);border-radius:50%;color:white;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)';this.style.borderColor='white';" onmouseout="this.style.background='transparent';this.style.borderColor='rgba(255,255,255,0.4)';">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 576 512"><path d="M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1V472c0 22.1-17.9 40-40 40H456c-11 0-20-9-20-20v-56c0-13.3-10.7-24-24-24H164c-13.3 0-24 10.7-24 24v56c0 11-9 20-20 20H104c-22.1 0-40-17.9-40-40v-16.2c-.3-2.7-.5-5.4-.5-8.1L64.7 287.6h-32c-17 0-32-14.1-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 11 15 11 24z"/></svg>
        </button>
        <button onclick="EmcalaAuth.logout()" title="Cerrar Sesión" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:transparent;border:1.5px solid #EF4444;border-radius:50%;color:#EF4444;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='#EF4444';this.style.color='white';" onmouseout="this.style.background='transparent';this.style.color='#EF4444';">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
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
