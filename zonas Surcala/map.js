// ============================================
// MAP MANAGER - Zonas Surcala (MapLibre GL JS / WebGL)
// Supervisor zones, Promotor zones, and Client markers rendered natively with GPU
// ============================================

const MapManager = {
    map: null,
    isLoaded: false,
    _hasAutoCentered: false,
    _lastCenter: [-58.818, -34.455], // [lng, lat]
    _lastZoom: 13,
    _currentBaseMap: 'carto-light',

    baseMaps: {
        'osm': {
            "version": 8,
            "sources": {
                "osm": {
                    "type": "raster",
                    "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap Contributors"
                }
            },
            "layers": [{
                "id": "osm",
                "type": "raster",
                "source": "osm",
                "minzoom": 0,
                "maxzoom": 19
            }]
        },
        'carto-voyager': {
            "version": 8,
            "sources": {
                "carto": {
                    "type": "raster",
                    "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap, &copy; CARTO"
                }
            },
            "layers": [{
                "id": "carto",
                "type": "raster",
                "source": "carto",
                "minzoom": 0,
                "maxzoom": 20
            }]
        },
        'carto-light': {
            "version": 8,
            "sources": {
                "carto-light": {
                    "type": "raster",
                    "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap, &copy; CARTO"
                }
            },
            "layers": [{
                "id": "carto-light",
                "type": "raster",
                "source": "carto-light",
                "minzoom": 0,
                "maxzoom": 20
            }]
        },
        'carto-dark': {
            "version": 8,
            "sources": {
                "carto-dark": {
                    "type": "raster",
                    "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap, &copy; CARTO"
                }
            },
            "layers": [{
                "id": "carto-dark",
                "type": "raster",
                "source": "carto-dark",
                "minzoom": 0,
                "maxzoom": 20
            }]
        }
    },
    
    tileLayerNames: {
        'osm': 'OpenStreetMap',
        'carto-voyager': 'Voyager',
        'carto-light': 'Claro',
        'carto-dark': 'Oscuro'
    },

    init(lat, lng, zoom) {
        document.getElementById('map-loading').classList.remove('hidden');

        // Restore config if available, safely handling NaN values
        let pLat = parseFloat(localStorage.getItem('surcala_map_lat'));
        let pLng = parseFloat(localStorage.getItem('surcala_map_lng'));
        let pZoom = parseFloat(localStorage.getItem('surcala_map_zoom'));

        if (!isNaN(pLat) && !isNaN(pLng)) {
            this._lastCenter = [pLng, pLat];
        } else {
            this._lastCenter = [lng, lat];
        }
        
        if (!isNaN(pZoom)) {
            this._lastZoom = pZoom;
        } else {
            this._lastZoom = zoom;
        }
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        this._currentBaseMap = isDark ? 'carto-dark' : 'osm';

        this.map = new maplibregl.Map({
            container: 'map',
            style: this.baseMaps[this._currentBaseMap],
            center: this._lastCenter,
            zoom: this._lastZoom,
            maxZoom: 19,
            attributionControl: false
        });

        this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        
        const geolocate = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true
        });
        this.map.addControl(geolocate, 'bottom-right');

        this.map.on('load', () => {
            this.isLoaded = true;
            this.addCustomControls();
            this.addLayerControlPanel();
            document.getElementById('map-loading').classList.add('hidden');
            
            // Wait slightly for UI to sync filters
            setTimeout(() => {
                if (DataService.isLoaded) {
                    this.renderAll();
                    if (window.UI) UI.applyClientFilters();
                }
            }, 100);
        });

        // Initialize Mapbox Draw
        this.draw = new MapboxDraw({
            displayControlsDefault: false
        });
        this.map.addControl(this.draw);

        this.map.on('draw.create', this.onDrawUpdate.bind(this));
        this.map.on('draw.update', this.onDrawUpdate.bind(this));
        this.map.on('draw.delete', this.onDrawDelete.bind(this));
        
        // Cancelar dibujo/selección con la tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.draw) {
                this.draw.changeMode('simple_select');
                this.draw.deleteAll();
                if (window.UI) UI.clearMapSelection();
            }
        });

        this.map.on('moveend', () => {
            const center = this.map.getCenter();
            localStorage.setItem('surcala_map_lat', center.lat);
            localStorage.setItem('surcala_map_lng', center.lng);
            localStorage.setItem('surcala_map_zoom', this.map.getZoom());
        });

        // Popup logic
        this.popup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            offset: 15,
            maxWidth: '300px'
        });

        this.hoverPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'hover-tooltip',
            offset: 15
        });

        let hoveredSupervisorID = null;

        this.map.on('click', 'clients-points', (e) => {
            const feature = e.features[0];
            const c = feature.properties;
            
            new maplibregl.Popup({ offset: 15, className: 'client-popup' })
                .setLngLat(feature.geometry.coordinates)
                .setHTML(this.generatePopupHtml(c))
                .addTo(this.map);
        });

        this.map.on('mousemove', 'clients-points', (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
            if (!e.features || e.features.length === 0) return;
            
            const feature = e.features[0];
            const c = feature.properties;
            
            // Hover Tooltip Promotor
            const html = `<div style="font-weight:600; font-size:12px; color:var(--text-primary); text-align:center;">${c.PromotorName || 'Sin Promotor'}</div>`;
            this.hoverPopup.setLngLat(feature.geometry.coordinates)
                .setHTML(html)
                .addTo(this.map);
        });

        this.map.on('mouseleave', 'clients-points', () => {
            this.map.getCanvas().style.cursor = '';
            hoveredSupervisorID = null;
            this.hoverPopup.remove();
        });
    },

    setTheme(theme) {
        // Automatically switch base map to dark/light variants if using default
        if (!this.map || !this.isLoaded) return;
        if (theme === 'dark') {
            this.switchTileLayer('carto-dark');
        } else {
            this.switchTileLayer('osm');
        }
    },

    switchTileLayer(key) {
        if (!this.baseMaps[key] || this._currentBaseMap === key) return;
        this._currentBaseMap = key;
        
        // Changing style in MapLibre removes custom sources/layers
        // So we must wait for the new style to load, then re-add our data.
        this.map.setStyle(this.baseMaps[this._currentBaseMap]);
        this.map.once('styledata', () => {
            if (DataService.isLoaded) {
                this.renderAll();
                if (window.UI) UI.applyClientFilters();
            }
        });
        
        const selector = document.getElementById('map-style-selector');
        if (selector) selector.value = key;
    },

    addCustomControls() {
        const container = document.createElement('div');
        container.className = 'map-custom-control';
        
        const centerBtn = document.createElement('a');
        centerBtn.href = '#';
        centerBtn.className = 'map-control-btn maplibregl-ctrl-group';
        centerBtn.title = 'Ir a Base Suralnor';
        centerBtn.innerHTML = '<i class="fas fa-building" style="margin:8px"></i>';
        centerBtn.onclick = (e) => {
            e.preventDefault();
            this.map.flyTo({ center: [-58.7779553, -34.4253947], zoom: 16 });
        };
        
        const selectBtn = document.createElement('a');
        selectBtn.href = '#';
        selectBtn.className = 'map-control-btn maplibregl-ctrl-group';
        selectBtn.title = 'Seleccionar área';
        selectBtn.innerHTML = '<i class="fas fa-draw-polygon" style="margin:8px"></i>';
        selectBtn.onclick = (e) => {
            e.preventDefault();
            this.draw.changeMode('draw_polygon');
            
            // Notification toast
            const toast = document.createElement('div');
            toast.className = 'layer-panel-body'; // Reusing a nice style
            toast.style.cssText = 'position:absolute; top:20px; left:50%; transform:translateX(-50%); background:var(--accent-primary); color:white; padding:10px 20px; border-radius:20px; z-index:2000; font-weight:500; font-size:14px; box-shadow:0 4px 12px rgba(0,0,0,0.15);';
            toast.innerHTML = '<i class="fas fa-info-circle"></i> Haz clic en el mapa para dibujar el área';
            document.getElementById('map-container').appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        };
        
        const searchBtn = document.createElement('a');
        searchBtn.href = '#';
        searchBtn.className = 'map-control-btn maplibregl-ctrl-group';
        searchBtn.title = 'Buscar cliente';
        searchBtn.innerHTML = '<i class="fas fa-search" style="margin:8px"></i>';
        searchBtn.onclick = (e) => {
            e.preventDefault();
            this.toggleSearchWidget(searchBtn);
        };
        
        container.appendChild(searchBtn);
        container.appendChild(selectBtn);
        container.appendChild(centerBtn);
        this.map.getContainer().appendChild(container);
    },

    toggleSearchWidget(btn) {
        const widget = document.getElementById('map-search-widget');
        const input = document.getElementById('map-search-input');
        if (widget.classList.contains('hidden')) {
            widget.classList.remove('hidden');
            btn.classList.add('active');
            input.focus();
            this.initSearchWidget();
        } else {
            widget.classList.add('hidden');
            btn.classList.remove('active');
        }
    },

    initSearchWidget() {
        if (this._searchInited) return;
        this._searchInited = true;

        const input = document.getElementById('map-search-input');
        const clearBtn = document.getElementById('map-search-clear');
        const resultsDiv = document.getElementById('map-search-results');
        const widget = document.getElementById('map-search-widget');

        clearBtn.onclick = () => {
            input.value = '';
            resultsDiv.innerHTML = '';
            widget.classList.add('hidden');
            const btn = document.querySelector('.map-control-btn[title="Buscar cliente"]');
            if (btn) btn.classList.remove('active');
        };

        input.oninput = () => {
            const query = input.value.trim();
            if (query.length < 2) {
                resultsDiv.innerHTML = '';
                return;
            }

            const results = DataService.searchClients(query).slice(0, 15);

            if (results.length === 0) {
                resultsDiv.innerHTML = '<div class="map-search-result-item"><div class="item-sub">No se encontraron clientes</div></div>';
                return;
            }

            resultsDiv.innerHTML = results.map(c => `
                <div class="map-search-result-item" data-id="${c.ID}">
                    <div class="item-title">#${c.Codigo || c.ID} - ${c.Nombre}</div>
                    <div class="item-sub"><i class="fas fa-map-marker-alt"></i> ${c.Direccion || 'Sin dirección'}</div>
                </div>
            `).join('');

            resultsDiv.querySelectorAll('.map-search-result-item[data-id]').forEach(item => {
                item.onclick = () => {
                    const c = DataService.data.clientes.find(cl => cl.ID === item.dataset.id);
                    if (c && !isNaN(c.Latitud) && !isNaN(c.Longitud)) {
                        input.value = c.Nombre;
                        resultsDiv.innerHTML = '';
                        this.flyToClient(c);
                    }
                    
                    widget.classList.add('hidden');
                    const btn = document.querySelector('.map-control-btn[title="Buscar cliente"]');
                    if (btn) btn.classList.remove('active');
                };
            });
        };
    },

    toggleSelectionMode(btn) {
        if (this.isSelectingArea) {
            this.disableSelectionMode(btn);
        } else {
            this.enableSelectionMode(btn);
        }
    },

    onDrawUpdate(e) {
        const data = this.draw.getAll();
        if (data.features.length === 0) return;

        // Si hay más de un polígono, quedarnos sólo con el último
        if (data.features.length > 1) {
            const lastFeature = data.features[data.features.length - 1];
            this.draw.deleteAll();
            this.draw.add(lastFeature);
        }

        const polygon = this.draw.getAll().features[0];
        
        // Usar Turf.js para cruzar con los clientes
        const selectedIds = [];
        DataService.data.clientes.forEach(c => {
            if (!isNaN(c.Latitud) && !isNaN(c.Longitud)) {
                const pt = turf.point([c.Longitud, c.Latitud]);
                if (turf.booleanPointInPolygon(pt, polygon)) {
                    selectedIds.push(c.ID);
                }
            }
        });

        if (window.UI && selectedIds.length > 0) {
            UI.handleMapSelection(selectedIds);
        } else if (selectedIds.length === 0) {
            alert('No se encontraron clientes dentro del área dibujada.');
            this.draw.deleteAll();
            if (window.UI) UI.clearMapSelection();
        }
    },

    onDrawDelete() {
        if (window.UI) UI.clearMapSelection();
    },

    clearDrawSelection() {
        if (this.draw) {
            this.draw.deleteAll();
        }
    },

    addLayerControlPanel() {
        // Create an absolute positioned panel for MapLibre since it doesn't use L.Control
        const container = document.createElement('div');
        container.className = 'map-layer-panel';
        container.style.position = 'absolute';
        container.style.bottom = '30px';
        container.style.right = '50px'; // To avoid overlapping native controls
        container.style.zIndex = '10';

        const header = document.createElement('div');
        header.className = 'layer-panel-header';
        const headerBtn = document.createElement('button');
        headerBtn.className = 'layer-panel-toggle-btn';
        headerBtn.innerHTML = '<i class="fas fa-layer-group"></i> <span>Capas</span> <i class="fas fa-chevron-up layer-chevron"></i>';
        header.appendChild(headerBtn);
        container.appendChild(header);
        
        const body = document.createElement('div');
        body.className = 'layer-panel-body';
        container.appendChild(body);

        // Map style selector
        const styleRow = document.createElement('div');
        styleRow.className = 'layer-panel-row layer-panel-style-row';
        const styleLabel = document.createElement('span');
        styleLabel.className = 'layer-panel-label';
        styleLabel.textContent = 'Estilo de mapa';
        const styleSelect = document.createElement('select');
        styleSelect.className = 'layer-panel-select';
        styleSelect.id = 'map-style-selector';
        Object.keys(this.tileLayerNames).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = this.tileLayerNames[key];
            if (key === this._currentBaseMap) opt.selected = true;
            styleSelect.appendChild(opt);
        });
        styleSelect.onchange = () => this.switchTileLayer(styleSelect.value);
        
        styleRow.appendChild(styleLabel);
        styleRow.appendChild(styleSelect);
        body.appendChild(styleRow);

        const divider = document.createElement('div');
        divider.className = 'layer-panel-divider';
        body.appendChild(divider);

        // Toggle rows
        const toggles = [
            { id: 'show-clients', icon: 'fa-store', label: 'Clientes', default: true },
            { id: 'color-freq', icon: 'fa-palette', label: 'Días de Visita', default: false }
        ];

        toggles.forEach(t => {
            const row = document.createElement('label');
            row.className = 'layer-panel-row layer-panel-toggle';
            
            const icon = document.createElement('i');
            icon.className = `fas ${t.icon} layer-panel-icon`;
            row.appendChild(icon);
            
            const label = document.createElement('span');
            label.className = 'layer-panel-label';
            label.textContent = t.label;
            row.appendChild(label);
            
            const switchWrap = document.createElement('span');
            switchWrap.className = 'layer-panel-switch';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = `floating-${t.id}`;
            cb.checked = t.default;
            const slider = document.createElement('span');
            slider.className = 'layer-panel-slider';
            switchWrap.appendChild(cb);
            switchWrap.appendChild(slider);
            row.appendChild(switchWrap);

            cb.onchange = () => {
                if (t.id === 'show-clients') {
                    if (window.UI) UI.applyClientFilters();
                } else if (t.id === 'color-freq') {
                    if (this.map && this.map.getLayer('clients-points')) {
                        const colorProp = cb.checked ? 'FrecuenciaColor' : 'SupervisorColor';
                        this.map.setPaintProperty('clients-points', 'circle-color', ['get', colorProp]);
                    }
                }
            };
            
            body.appendChild(row);
        });

        // Collapse / expand
        let collapsed = false;
        headerBtn.onclick = () => {
            collapsed = !collapsed;
            body.style.display = collapsed ? 'none' : '';
            headerBtn.querySelector('.layer-chevron').style.transform = collapsed ? 'rotate(180deg)' : '';
            container.classList.toggle('collapsed', collapsed);
        };

        this.map.getContainer().appendChild(container);
    },

    clearAll() {
        if (!this.map || !this.isLoaded) return;
        const layers = ['clients-points'];
        layers.forEach(l => { if (this.map.getLayer(l)) this.map.removeLayer(l); });
        
        const sources = ['clients'];
        sources.forEach(s => { if (this.map.getSource(s)) this.map.removeSource(s); });
    },

    renderAll() {
        if (!this.map || !this.isLoaded) return;
        this.clearAll();

        const clientes = DataService.data.clientes;

        // --- 1. Prepare GeoJSON for Clients ---
        const clientFeatures = [];
        clientes.forEach(c => {
            if (isNaN(c.Latitud) || isNaN(c.Longitud)) return;
            const sup = DataService.getSupervisor(c.SupervisorID);
            const prom = DataService.getPromotor(c.PromotorID);
            
            clientFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [c.Longitud, c.Latitud] }, // LngLat
                properties: {
                    ID: c.ID,
                    Codigo: c.Codigo,
                    Nombre: c.Nombre,
                    Direccion: c.Direccion,
                    Localidad: c.Localidad,
                    Zona: c.Zona,
                    Vendedor: c.Vendedor,
                    SupervisorID: c.SupervisorID,
                    SupervisorName: sup ? sup.Nombre : '',
                    SupervisorColor: sup ? sup.Color : '#666',
                    PromotorID: c.PromotorID,
                    PromotorName: prom ? prom.Nombre : '',
                    PromotorColor: prom ? prom.Color : '#666',
                    FrecuenciaColor: c.FrecuenciaColor,
                    FrecuenciaGrupo: c.FrecuenciaGrupo,
                    CodeLabel: (c.Codigo || c.ID).toString()
                }
            });
        });











        // --- Add Source & Layer ---
        this.map.addSource('clients', { type: 'geojson', data: { type: 'FeatureCollection', features: clientFeatures }});





        this.map.addLayer({
            id: 'clients-points',
            type: 'circle',
            source: 'clients',
            layout: { visibility: 'visible' },
            paint: {
                'circle-radius': 6,
                'circle-color': ['get', 'SupervisorColor'],
                'circle-opacity': 1.0
            }
        });



        if (clientFeatures.length > 0 && !this._hasAutoCentered) {
            const bounds = new maplibregl.LngLatBounds();
            clientFeatures.forEach(f => bounds.extend(f.geometry.coordinates));
            this.map.fitBounds(bounds, { padding: 50, duration: 1000 });
            this._hasAutoCentered = true;
        }
    },



    updateClientVisibility(visibleClientIds, globalShowClients) {
        if (!this.map || !this.map.getLayer('clients-points')) return;
        
        if (!globalShowClients) {
            this.map.setLayoutProperty('clients-points', 'visibility', 'none');
            return;
        }

        this.map.setLayoutProperty('clients-points', 'visibility', 'visible');

        const idsArray = Array.from(visibleClientIds);
        
        if (idsArray.length === 0) {
            this.map.setFilter('clients-points', ['==', 'ID', 'NONE']);
        } else {
            const filter = ['in', 'ID', ...idsArray];
            this.map.setFilter('clients-points', filter);
        }
    },



    generatePopupHtml(c) {
        let popupHtml = `<div class="popup-content">`;
        popupHtml += `<div class="popup-client-code">#${c.Codigo || c.ID}</div>`;
        popupHtml += `<h3>${c.Nombre}</h3>`;
        if (c.Direccion) popupHtml += `<div class="popup-row"><i class="fas fa-map-marker-alt"></i> ${c.Direccion}</div>`;
        if (c.Localidad) popupHtml += `<div class="popup-row"><i class="fas fa-map-pin"></i> ${c.Localidad}</div>`;
        if (c.Zona) popupHtml += `<div class="popup-row"><i class="fas fa-th-large"></i> Zona ${c.Zona}</div>`;
        if (c.Vendedor) popupHtml += `<div class="popup-row"><i class="fas fa-user"></i> Vendedor: ${c.Vendedor}</div>`;
        popupHtml += `<div class="popup-divider"></div>`;
        if (c.SupervisorName) popupHtml += `<span class="popup-tag" style="background:${c.SupervisorColor}">${c.SupervisorName}</span>`;
        if (c.PromotorName) popupHtml += `<span class="popup-tag" style="background:${c.PromotorColor}">${c.PromotorName}</span>`;
        if (c.FrecuenciaGrupo) popupHtml += `<span class="popup-tag" style="background:${c.FrecuenciaColor}; text-shadow: 0px 1px 2px rgba(0,0,0,0.4);">${c.FrecuenciaGrupo}</span>`;
        popupHtml += `</div>`;
        return popupHtml;
    },

    flyToClient(c) {
        if (!this.map || isNaN(c.Latitud) || isNaN(c.Longitud)) return;
        this.map.flyTo({ center: [c.Longitud, c.Latitud], zoom: 17, duration: 800 });
        
        new maplibregl.Popup({ offset: 15, className: 'client-popup' })
            .setLngLat([c.Longitud, c.Latitud])
            .setHTML(this.generatePopupHtml(c))
            .addTo(this.map);
    }
};

window.MapManager = MapManager;
