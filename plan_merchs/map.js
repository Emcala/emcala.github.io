// ============================================
// MAP MANAGER - Generación automática de zonas con Turf.js
// ============================================

const MapManager = {
    map: null,
    layers: { promotorZones: {}, merchZones: {}, clientMarkers: [], labels: [] },
    tileLayers: {},
    currentTileLayer: null,

    // Suralnor: Av. Constitución 2100
    SURALNOR_LAT: -34.4253947,
    SURALNOR_LNG: -58.7779553,

    init(lat, lng, zoom) {
        this.map = L.map('map', {
            center: [lat, lng], zoom: zoom,
            zoomControl: true, attributionControl: true
        });

        // Tile layers — detailed maps with streets, railways, neighborhoods
        // OpenStreetMap: most detailed, shows everything (street names, railways, highways, one-ways, neighborhoods)
        this.tileLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        });
        // CartoDB Voyager: modern clean design with good detail (streets, labels, neighborhoods)
        this.tileLayers.voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd', maxZoom: 20
        });
        // CartoDB Positron: light minimal style
        this.tileLayers.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd', maxZoom: 20
        });
        // CartoDB Dark Matter: dark theme
        this.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd', maxZoom: 20
        });

        // Map style names for the selector
        this.tileLayerNames = {
            osm: 'OpenStreetMap',
            voyager: 'Voyager',
            light: 'Claro',
            dark: 'Oscuro'
        };

        // Default: use osm unconditionally
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const defaultTile = 'osm';
        this.currentTileKey = defaultTile;
        this.currentTileLayer = this.tileLayers[defaultTile];
        this.currentTileLayer.addTo(this.map);

        // Wait for container to get its dimensions
        setTimeout(() => {
            this.map.invalidateSize();
        }, 100);

        // Add custom map controls (Suralnor + Geolocation)
        this.addCustomControls();

        // Add floating layer control panel (bottom-right)
        this.addLayerControlPanel();

        document.getElementById('map-loading').classList.add('hidden');
    },

    setTheme(theme) {
        // No auto-switch tile layer when theme changes, let the user pick from the layer control
    },

    switchTileLayer(key) {
        const newLayer = this.tileLayers[key];
        if (newLayer && newLayer !== this.currentTileLayer) {
            this.map.removeLayer(this.currentTileLayer);
            newLayer.addTo(this.map);
            this.currentTileLayer = newLayer;
            this.currentTileKey = key;
            // Update selector if exists
            const selector = document.getElementById('map-style-selector');
            if (selector) selector.value = key;
        }
    },

    addLayerControlPanel() {
        const LayerPanel = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: (map) => {
                const container = L.DomUtil.create('div', 'map-layer-panel');
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                // Panel header with toggle
                const header = L.DomUtil.create('div', 'layer-panel-header', container);
                const headerBtn = L.DomUtil.create('button', 'layer-panel-toggle-btn', header);
                headerBtn.innerHTML = '<i class="fas fa-layer-group"></i> <span>Capas</span> <i class="fas fa-chevron-up layer-chevron"></i>';
                
                const body = L.DomUtil.create('div', 'layer-panel-body', container);

                // Map style selector
                const styleRow = L.DomUtil.create('div', 'layer-panel-row layer-panel-style-row', body);
                const styleLabel = L.DomUtil.create('span', 'layer-panel-label', styleRow);
                styleLabel.textContent = 'Estilo de mapa';
                const styleSelect = L.DomUtil.create('select', 'layer-panel-select', styleRow);
                styleSelect.id = 'map-style-selector';
                Object.keys(this.tileLayerNames).forEach(key => {
                    const opt = L.DomUtil.create('option', '', styleSelect);
                    opt.value = key;
                    opt.textContent = this.tileLayerNames[key];
                    if (key === this.currentTileKey) opt.selected = true;
                });
                styleSelect.onchange = () => this.switchTileLayer(styleSelect.value);

                // Divider
                L.DomUtil.create('div', 'layer-panel-divider', body);

                const toggles = [
                    { id: 'show-merch-zones', icon: 'fa-vector-square', label: 'Zonas Merchs' },
                    { id: 'show-clients', icon: 'fa-store', label: 'Clientes' }
                ];

                toggles.forEach(t => {
                    const row = L.DomUtil.create('label', 'layer-panel-row layer-panel-toggle', body);
                    const icon = L.DomUtil.create('i', `fas ${t.icon} layer-panel-icon`, row);
                    const label = L.DomUtil.create('span', 'layer-panel-label', row);
                    label.textContent = t.label;
                    const switchWrap = L.DomUtil.create('span', 'layer-panel-switch', row);
                    const cb = L.DomUtil.create('input', '', switchWrap);
                    cb.type = 'checkbox';
                    cb.id = `floating-${t.id}`;
                    cb.checked = t.id !== 'show-promotor-zones';
                    cb.checked = true;
                    const slider = L.DomUtil.create('span', 'layer-panel-slider', switchWrap);

                    cb.onchange = (e) => {
                        const isChecked = e.target.checked;
                        if (t.id === 'show-merch-zones') {
                            Object.keys(this.layers.merchZones).forEach(id => this.toggleMerchZone(id, isChecked));
                        } else if (t.id === 'show-clients') {
                            if (window.UI) UI.applyClientFilters();
                        }
                    };
                });

                // Collapse / expand
                let collapsed = false;
                headerBtn.onclick = () => {
                    collapsed = !collapsed;
                    body.style.display = collapsed ? 'none' : '';
                    headerBtn.querySelector('.layer-chevron').style.transform = collapsed ? 'rotate(180deg)' : '';
                    container.classList.toggle('collapsed', collapsed);
                };

                return container;
            }
        });
        new LayerPanel().addTo(this.map);
    },

    addCustomControls() {
        // Suralnor button
        const SuralnorControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: (map) => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-custom-control');
                const btn = L.DomUtil.create('a', 'map-control-btn', container);
                btn.href = '#';
                btn.title = 'Centrar en Suralnor';
                btn.innerHTML = '<i class="fas fa-building"></i>';
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(btn, 'click', (e) => {
                    L.DomEvent.preventDefault(e);
                    this.map.flyTo([this.SURALNOR_LAT, this.SURALNOR_LNG], 15, { duration: 1 });
                });
                return container;
            }
        });
        new SuralnorControl().addTo(this.map);

        // Geolocation button
        const GeoControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: (map) => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-custom-control');
                const btn = L.DomUtil.create('a', 'map-control-btn', container);
                btn.href = '#';
                btn.title = 'Mi ubicación';
                btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
                btn.id = 'btn-geolocation';
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(btn, 'click', (e) => {
                    L.DomEvent.preventDefault(e);
                    this.geolocate();
                });
                return container;
            }
        });
        new GeoControl().addTo(this.map);
    },

    geolocate() {
        const btn = document.getElementById('btn-geolocation');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        if (!navigator.geolocation) {
            alert('Tu navegador no soporta geolocalización.');
            if (btn) btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                this.map.flyTo([latitude, longitude], 16, { duration: 1 });
                // Add a pulsing dot for current location
                if (this._geoMarker) this.map.removeLayer(this._geoMarker);
                this._geoMarker = L.marker([latitude, longitude], {
                    icon: L.divIcon({
                        className: '',
                        html: '<div class="geo-pulse"><div class="geo-dot"></div></div>',
                        iconSize: [20, 20], iconAnchor: [10, 10]
                    })
                }).addTo(this.map).bindPopup('Tu ubicación');
                if (btn) btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
            },
            (err) => {
                alert('No se pudo obtener tu ubicación: ' + err.message);
                if (btn) btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    },

    clearAll() {
        Object.values(this.layers.merchZones).forEach(l => this.map.removeLayer(l));
        this.layers.clientMarkers.forEach(item => this.map.removeLayer(item.marker));
        this.layers = { merchZones: {}, clientMarkers: [] };
    },

    // Genera un polígono envolvente, línea o círculo
    generateConvexHull(clients, styleOptions, popupHtml) {
        const validClients = clients.filter(c => !isNaN(c.Latitud) && !isNaN(c.Longitud));
        if (validClients.length === 0) return null;

        try {
            if (validClients.length === 1) {
                // 1 punto = Círculo de 500m
                const c = validClients[0];
                const circle = L.circle([c.Latitud, c.Longitud], { radius: 500, ...styleOptions }).addTo(this.map);
                circle.bindPopup(popupHtml);
                return circle;
            } else if (validClients.length === 2) {
                // 2 puntos = Línea gruesa
                const p1 = validClients[0], p2 = validClients[1];
                const line = L.polyline([[p1.Latitud, p1.Longitud], [p2.Latitud, p2.Longitud]], { ...styleOptions, weight: 6 }).addTo(this.map);
                line.bindPopup(popupHtml);
                return line;
            } else {
                // 3+ puntos = Convex Hull (Polígono)
                const points = turf.featureCollection(validClients.map(c => turf.point([c.Longitud, c.Latitud])));
                const hull = turf.convex(points);
                if (hull) {
                    const latLngs = hull.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                    const polygon = L.polygon(latLngs, styleOptions).addTo(this.map);
                    polygon.bindPopup(popupHtml);
                    return polygon;
                }
            }
        } catch (e) {
            console.error("Error generando zona:", e);
        }
        return null;
    },

    renderAll() {
        this.clearAll();
        const { promotores, merchandisers, clientes } = DataService.data;

        let config = {};
        try { config = JSON.parse(localStorage.getItem('emcala_config') || '{}'); } catch(e){}
        const clientIcon = config.clientIcon || 'number';

        // Render merch zones
        merchandisers.forEach(m => {
            const mClients = clientes.filter(c => c.MerchID === m.ID);
            const promotor = DataService.getPromotor(m.PromotorID);
            const popupHtml = `<div class="popup-content"><h3>${m.Nombre}</h3><div class="popup-row"><i class="fas fa-user-tag"></i> Merch</div><div class="popup-row"><i class="fas fa-user-tie"></i> ${promotor ? promotor.Nombre : ''}</div><div class="popup-row"><i class="fas fa-store"></i> ${mClients.length} clientes</div></div>`;
            
            const polygon = this.generateConvexHull(mClients, {
                color: m.Color, weight: 2, opacity: 0.7,
                fillColor: m.Color, fillOpacity: 0.15,
                dashArray: '6, 4'
            }, popupHtml);

            if (polygon) {
                this.layers.merchZones[m.ID] = polygon;
            }
        });

        // Render client markers
        clientes.forEach(c => {
            if (isNaN(c.Latitud) || isNaN(c.Longitud)) return;
            const merch = DataService.getMerch(c.MerchID);
            const promotor = DataService.getPromotor(c.PromotorID);
            const freqObj = DataService.getFrecuencia(c.Frecuencia);
            const markerColor = freqObj ? freqObj.Color : '#6366f1';
            
            let htmlInner = '';
            if (clientIcon === 'number') {
                const markerLabel = c.Prioridad || c.ID;
                htmlInner = `<span>${markerLabel}</span>`;
            } else {
                htmlInner = `<i class="${clientIcon}"></i>`;
            }

            const marker = L.marker([c.Latitud, c.Longitud], {
                icon: L.divIcon({
                    className: '',
                    html: `<div class="custom-marker number-marker" style="background:${markerColor}">${htmlInner}</div>`,
                    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
                })
            }).addTo(this.map);
            
            // Popup: show client code prominently, then razón social
            let popupHtml = `<div class="popup-content">`;
            popupHtml += `<div class="popup-client-code">#${c.ID}</div>`;
            popupHtml += `<h3>${c.Nombre}</h3>`;
            if (c.Direccion) popupHtml += `<div class="popup-row"><i class="fas fa-map-marker-alt"></i> ${c.Direccion}</div>`;
            if (c.Telefono) popupHtml += `<div class="popup-row"><i class="fas fa-phone"></i> ${c.Telefono}</div>`;
            if (c.Frecuencia && c.Frecuencia !== 'Sin Frecuencia') popupHtml += `<div class="popup-row"><i class="fas fa-calendar-alt"></i> ${c.Frecuencia}</div>`;
            if (c.Notas) popupHtml += `<div class="popup-row"><i class="fas fa-sticky-note"></i> ${c.Notas}</div>`;
            popupHtml += `<div class="popup-divider"></div>`;
            if (promotor) popupHtml += `<span class="popup-tag" style="background:${promotor.Color}">${promotor.Nombre}</span> `;
            if (merch) popupHtml += `<span class="popup-tag" style="background:${merch.Color}">${merch.Nombre}</span>`;
            
            // Botones de acción
            popupHtml += `
                <div style="display:flex; justify-content:space-between; margin-top:10px; border-top:1px solid var(--border-color); padding-top:10px;">
                    <button class="btn" onclick="UI.openClientModal('${c.ID}')" style="padding: 4px 8px; font-size: 12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:4px; cursor:pointer;"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn" onclick="UI.deleteClient('${c.ID}')" style="padding: 4px 8px; font-size: 12px; background:var(--bg-tertiary); color:#ef4444; border:none; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i> Borrar</button>
                </div>
            `;
            
            popupHtml += `</div>`;
            marker.bindPopup(popupHtml);
            
            this.layers.clientMarkers.push({ marker, client: c });
        });

        // Autocentrar si hay marcadores (sólo en la carga inicial)
        if (clientes.length > 0 && !this._hasAutoCentered) {
            const markers = this.layers.clientMarkers.map(item => item.marker);
            if (markers.length > 0) {
                const group = new L.featureGroup(markers);
                setTimeout(() => {
                    this.map.invalidateSize();
                    this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
                }, 200);
                this._hasAutoCentered = true;
            }
        }
    },

    toggleMerchZone(id, visible) {
        const l = this.layers.merchZones[id];
        if (l) visible ? l.addTo(this.map) : this.map.removeLayer(l);
    },
    updateClientVisibility(visibleClientIds, globalShowClients) {
        this.layers.clientMarkers.forEach(item => {
            const shouldShow = globalShowClients && visibleClientIds.has(item.client.ID);
            if (shouldShow) {
                if (!this.map.hasLayer(item.marker)) item.marker.addTo(this.map);
            } else {
                if (this.map.hasLayer(item.marker)) this.map.removeLayer(item.marker);
            }
        });
    },
    flyToClient(lat, lng) {
        this.map.flyTo([lat, lng], 17, { duration: 0.8 });
    }
};
