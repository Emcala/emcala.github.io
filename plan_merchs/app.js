// ============================================
// APP INIT
// ============================================
window.EMCALA_API_URL = 'https://script.google.com/macros/s/AKfycbwRrxNQuOXgdneNO1tMLrHhUVtgZuOBd3FdlH7VghHqoqBFQdZ-68CbAppjclBPrm1o/exec';

document.addEventListener('DOMContentLoaded', async () => {
    // ── Auth check ──
    if (!EmcalaAuth.requireLogin()) return;
    EmcalaAuth.renderUserBadge('emcala-user-badge');

    // ── Role-based permissions ──
    const ROLES_CRUD = ['supervisor', 'jdv', 'admin', 'trade'];
    const btnNewClient = document.getElementById('btn-new-client');
    if (btnNewClient && !EmcalaAuth.hasRole(ROLES_CRUD)) {
        btnNewClient.style.display = 'none';
    }

    let config = {};
    try {
        config = JSON.parse(localStorage.getItem('emcala_config') || '{}');
    } catch (e) {
        console.warn('No se pudo acceder a localStorage', e);
    }
    
    const lat = config.lat || -34.455;
    const lng = config.lng || -58.818;
    const zoom = config.zoom || 13;

    // Init map
    MapManager.init(lat, lng, zoom);

    // Init UI
    UI.init();

    // Load data
    const ok = await DataService.loadFromAPI(window.EMCALA_API_URL);
    if (!ok) {
        alert('No se pudo cargar la base de datos desde Google Sheets. Verificá la URL o los permisos. Se cargarán datos de prueba.');
        DataService.loadDemo();
    }

    // Render
    MapManager.renderAll();
    UI.renderUI();
});
