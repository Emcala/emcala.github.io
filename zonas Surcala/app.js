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
    setTimeout(async () => {
        // Init map
        MapManager.init(lat, lng, zoom);

        // Init UI
        UI.init();

        // Cargar clientes desde clientes.csv
        try {
            await DataService.loadData();
        } catch (e) {
            console.error('[Zonas Surcala] No se pudieron cargar los clientes:', e);
            alert('No se pudieron cargar los clientes (clientes.csv).\nVerificá que el archivo esté junto al index.html y recargá la página.');
            return;
        }

        // Render UI
        UI.renderUI();

        // Si el mapa ya terminó de cargar antes que los datos, dibujamos ahora.
        // Si no, lo hará el handler map.on('load') de map.js (isLoaded ya es true).
        if (MapManager.isLoaded) {
            MapManager.renderAll();
            UI.applyClientFilters();
        }
    }, 50);
});
