// ============================================
// APP INIT - Zonas Surcala
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // ── Auth check ──
    if (!EmcalaAuth.requireLogin()) return;
    EmcalaAuth.renderUserBadge('emcala-user-badge');

    let config = {};
    try {
        config = JSON.parse(localStorage.getItem('surcala_config') || '{}');
    } catch (e) {
        console.warn('No se pudo acceder a localStorage', e);
    }
    
    const lat = config.lat || -34.455;
    const lng = config.lng || -58.818;
    const zoom = config.zoom || 13;

    // Retrasar unos milisegundos la inicialización pesada 
    // para permitir que el navegador pinte la interfaz de "Cargando"
    setTimeout(() => {
        // Init map
        MapManager.init(lat, lng, zoom);

        // Init UI
        UI.init();

        // Load embedded data
        DataService.loadData();

        // Render UI
        UI.renderUI();
    }, 50);
});
