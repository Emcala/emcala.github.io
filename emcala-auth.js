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
//   const s = EmcalaAuth.getSession();      // { usuario, rol, nombre, sessionToken, ... }
//   EmcalaAuth.logout();                    // limpia y redirige
// ═══════════════════════════════════════════════════════════════════

const EmcalaAuth = (() => {
  // ── CONFIG ─────────────────────────────────────────────────
  const LOGIN_URL       = '../index.html';
  const PORTAL_URL      = '../portal/index.html';
  const SESSION_KEY     = 'user_session';
  const INACTIVITY_MS   = 30 * 60 * 1000; // 30 minutos
  const CHECK_INTERVAL  = 60 * 1000;       // verificar cada 1 min
  const MAX_DIRTY_EXTENSION_MS = 3 * 60 * 60 * 1000; // tope extra con cambios sin guardar (3 h)

  // ── VERIFICADOR DE CAMBIOS PENDIENTES ──────────────────────
  let _dirtyCheckFn = null;
  let _skipUnloadWarning = false;

  function registerDirtyCheck(fn) {
    if (typeof fn === 'function') _dirtyCheckFn = fn;
  }

  function hasUnsavedChanges() {
    try {
      return typeof _dirtyCheckFn === 'function' ? !!_dirtyCheckFn() : false;
    } catch (e) {
      console.error('[EmcalaAuth] Error verificando cambios sin guardar:', e);
      return false;
    }
  }

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
    if (!session.usuario || !session.rol || !session.lastActivity) {
      return false;
    }

    // Verificar que exista el token de sesión emitido por el servidor
    if (!session._h) {
      console.warn('[EmcalaAuth] Sesión sin token válido detectada');
      return false;
    }

    // Verificar inactividad
    const idleMs = Date.now() - session.lastActivity;
    if (idleMs > INACTIVITY_MS) {
      // Con cambios sin guardar se tolera inactividad extra, hasta un tope
      if (hasUnsavedChanges() && idleMs <= INACTIVITY_MS + MAX_DIRTY_EXTENSION_MS) {
        return true;
      }
      console.warn('[EmcalaAuth] Sesión expirada por inactividad');
      return false;
    }

    return true;
  }

  function getSession() {
    const session = getRawSession();
    if (!isSessionValid(session)) return null;
    return {
      usuario:      session.usuario,
      rol:          session.rol,
      nombre:       session.nombre,
      promotores:   session.promotores || '',
      userHash:     session.userHash || '',
      sessionToken: session._h,
      accessToken:  session.accessToken || ''
    };
  }

  let _lastActivityUpdate = 0;
  function updateActivity() {
    const now = Date.now();
    // Throttling: Solo actualizar localStorage cada 5 segundos como máximo
    // Evita congelar el navegador al mover el mouse o scrollear
    if (now - _lastActivityUpdate < 5000) return;
    _lastActivityUpdate = now;

    const session = getRawSession();
    if (!session) return;
    session.lastActivity = now;
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
    // También cerramos la sesión de Supabase (si existe) para que no queden sesiones sueltas
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => localStorage.removeItem(k));
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
        _skipUnloadWarning = true;
        localStorage.removeItem(SESSION_KEY);
        window.location.replace(LOGIN_URL);
      }
    }, CHECK_INTERVAL);

    // Resetear actividad con interacciones del usuario
    ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(evt => {
      document.addEventListener(evt, () => updateActivity(), { passive: true });
    });

    // Protección contra cierre accidental de pestaña o recarga con cambios sin guardar
    window.addEventListener('beforeunload', (e) => {
      if (!_skipUnloadWarning && hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ── CREAR SESIÓN (para uso desde el login) ─────────────────

  function createSession({ usuario, rol, nombre, promotores, userHash, sessionToken, accessToken }) {
    const session = {
      usuario:      usuario,
      rol:          rol,
      nombre:       nombre || usuario,
      promotores:   promotores || '',
      userHash:     userHash || '',
      _h:           sessionToken || '',
      accessToken:  accessToken || '',
      lastActivity: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  // ── UTILIDADES UI ──────────────────────────────────────────

  // Escapa texto para interpolarlo de forma segura dentro de innerHTML.
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Inserta un badge pequeño con info de usuario (para headers de herramientas)
  function renderUserBadge(containerId) {
    const session = getSession();
    if (!session) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const rolColors = {
      auditor:    '#7C3AED',
      supervisor: '#2563EB',
      trade:      '#D97706',
      tecnico:    '#059669',
      promotor:   '#0891B2'
    };

    const rolColor = rolColors[session.rol.toLowerCase()] || '#6B7280';

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque',Inter,system-ui,sans-serif;">
        <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);padding:6px 12px;border-radius:100px;white-space:nowrap;">
          <span style="width:8px;height:8px;border-radius:50%;background:${rolColor};box-shadow:0 0 8px ${rolColor}88;"></span>
          <span style="font-size:12px;font-weight:700;color:#fff;">${escapeHtml(session.nombre)}</span>
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
    registerDirtyCheck,
    hasUnsavedChanges,
    renderUserBadge,
    LOGIN_URL,
    PORTAL_URL
  };

})();
