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
                    "attribution": "&copy; OpenStreetMap contributors"
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
                    "tiles": ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap contributors &copy; CARTO"
                }
            },
            "layers": [{
                "id": "carto",
                "type": "raster",
                "source": "carto",
                "minzoom": 0,
                "maxzoom": 19
            }]
        },
        'carto-light': {
            "version": 8,
            "sources": {
                "carto-light": {
                    "type": "raster",
                    "tiles": ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap contributors &copy; CARTO"
                }
            },
            "layers": [{
                "id": "carto-light",
                "type": "raster",
                "source": "carto-light",
                "minzoom": 0,
                "maxzoom": 19
            }]
        },
        'carto-dark': {
            "version": 8,
            "sources": {
                "carto-dark": {
                    "type": "raster",
                    "tiles": ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
                    "tileSize": 256,
                    "attribution": "&copy; OpenStreetMap contributors &copy; CARTO"
                }
            },
            "layers": [{
                "id": "carto-dark",
                "type": "raster",
                "source": "carto-dark",
                "minzoom": 0,
                "maxzoom": 19
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

        // Capa Venta (CVZA / NABS del mes desde el Planificador): estado persistido
        this.ventaVisible = localStorage.getItem('surcala_venta_visible') === '1';
        this._ventaReq = 0;
        // Sub-capas: ambas encendidas por defecto (verde = compró CVZA o NABS)
        let ventaUnidades = null;
        try { ventaUnidades = JSON.parse(localStorage.getItem('surcala_venta_unidades') || 'null'); } catch (e) { ventaUnidades = null; }
        this.ventaUnidades = {
            cerveza: !ventaUnidades || ventaUnidades.cerveza !== false,
            nabs: !ventaUnidades || ventaUnidades.nabs !== false
        };

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
        
        // Solo OpenStreetMap: sin selector de estilo y sin cambio por tema
        this._currentBaseMap = 'osm';

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
            if (this.ventaVisible) this.reloadVentas(false);
            
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

        // Popup hover
        this.hoverPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'hover-tooltip',
            offset: 15
        });

        // Computadora: click normal. Celular: mantener apretado (ver abajo), así no se abre nada al mover el mapa
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.map.on('click', (e) => {
            if (isTouch) return;
            this.openClientAt(e.point);
        });

        const canvas = this.map.getCanvas();
        canvas.style.webkitTouchCallout = 'none';
        canvas.style.userSelect = 'none';
        canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

        let pressTimer = null;
        let pressStart = null;
        const cancelPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        };
        canvas.addEventListener('touchstart', (ev) => {
            cancelPress();
            if (!ev.touches || ev.touches.length !== 1) return;
            const rect = canvas.getBoundingClientRect();
            const tp = ev.touches[0];
            pressStart = { x: tp.clientX - rect.left, y: tp.clientY - rect.top };
            pressTimer = setTimeout(() => {
                pressTimer = null;
                this.openClientAt(pressStart, true);
            }, 500);
        }, { passive: true });
        canvas.addEventListener('touchmove', (ev) => {
            if (!pressTimer || !ev.touches || ev.touches.length !== 1) { cancelPress(); return; }
            const rect = canvas.getBoundingClientRect();
            const tp = ev.touches[0];
            const dx = (tp.clientX - rect.left) - pressStart.x;
            const dy = (tp.clientY - rect.top) - pressStart.y;
            if (Math.sqrt(dx * dx + dy * dy) > 10) cancelPress();
        }, { passive: true });
        canvas.addEventListener('touchend', cancelPress, { passive: true });
        canvas.addEventListener('touchcancel', cancelPress, { passive: true });
        this.map.on('movestart', cancelPress);
        this.map.on('zoomstart', cancelPress);
        this.map.on('rotatestart', cancelPress);

        this.map.on('mousemove', 'clients-points', (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
            if (!e.features || e.features.length === 0) return;
            
            const feature = e.features[0];
            const c = feature.properties;
            
            // Hover Tooltip Promotor
            const html = `<div style="font-weight:600; font-size:12px; color:var(--text-primary); text-align:center;">${esc(c.PromotorName || 'Sin Promotor')}</div>`;
            this.hoverPopup.setLngLat(feature.geometry.coordinates)
                .setHTML(html)
                .addTo(this.map);
        });

        this.map.on('mouseleave', 'clients-points', () => {
            this.map.getCanvas().style.cursor = '';
            this.hoverPopup.remove();
        });

    },

    setTheme(theme) {
        // Automatically switch base map to dark/light variants if using default
        if (!this.map || !this.isLoaded) return;
        this.switchTileLayer('osm');
    },

    switchTileLayer(key) {
        if (!this.baseMaps[key] || this._currentBaseMap === key) return;
        this._currentBaseMap = key;
        
        // Changing style in MapLibre removes custom sources/layers
        // So we must wait for the new style to load, then re-add our data.
        this.map.setStyle(this.baseMaps[this._currentBaseMap]);
        this.map.once('idle', () => {
            if (!this.map.isStyleLoaded()) {
                // Red de seguridad: reintentar en el próximo idle
                this.map.once('idle', () => {
                    if (DataService.isLoaded) {
                        this.renderAll();
                        if (window.UI) UI.applyClientFilters();
                    }
                });
                return;
            }
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
                <div class="map-search-result-item" data-id="${esc(c.ID)}">
                    <div class="item-title">#${esc(c.Codigo || c.ID)} - ${esc(c.Nombre)}</div>
                    <div class="item-sub"><i class="fas fa-map-marker-alt"></i> ${esc(c.Direccion || 'Sin dirección')}</div>
                </div>
            `).join('');

            resultsDiv.querySelectorAll('.map-search-result-item[data-id]').forEach(item => {
                item.onclick = () => {
                    const c = DataService.byId ? DataService.byId.get(item.dataset.id) : null;
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

    onDrawUpdate(e) {
        const data = this.draw.getAll();
        if (data.features.length === 0) return;

        const lastFeature = data.features[data.features.length - 1];

        // Si estamos en modo de dibujar zona personalizada
        if (this.isDrawingCustomZone) {
            this.pendingCustomZoneFeature = lastFeature;
            this.draw.delete(lastFeature.id); // Remove from draw tools immediately
            this.isDrawingCustomZone = false;
            
            // Trigger UI modal
            if (window.UI) {
                UI.showCustomZoneModal();
            }
            return;
        }

        // --- MODO SELECCIÓN NORMAL (Imprimir) ---
        // Si hay más de un polígono, quedarnos sólo con el último
        if (data.features.length > 1) {
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
        
        // Selector de estilo de mapa desactivado: solo OpenStreetMap

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
                    this.applyClientPaint();
                    if (this.map && this.map.getLayer('promoter-zones-fill')) {
                        const zoneColorProp = cb.checked ? 'FrecuenciaColor' : 'PromotorColor';
                        this.map.setPaintProperty('promoter-zones-fill', 'fill-color', ['get', zoneColorProp]);
                        this.map.setPaintProperty('promoter-zones-line', 'line-color', ['get', zoneColorProp]);
                    }
                } else if (t.id === 'show-promoter-zones') {
                    if (this.map && this.map.getLayer('promoter-zones-fill')) {
                        const visibility = cb.checked ? 'visible' : 'none';
                        this.map.setLayoutProperty('promoter-zones-fill', 'visibility', visibility);
                        this.map.setLayoutProperty('promoter-zones-line', 'visibility', visibility);
                    }
                }
            };
            
            body.appendChild(row);
        });

        // ── Capa Venta: toggle + mes + estado ──
        const ventaWrap = document.createElement('div');
        ventaWrap.className = 'layer-panel-venta';

        const ventaRow = document.createElement('label');
        ventaRow.className = 'layer-panel-row layer-panel-toggle';
        const ventaIcon = document.createElement('i');
        ventaIcon.className = 'fas fa-beer-mug-empty layer-panel-icon';
        const ventaLabel = document.createElement('span');
        ventaLabel.className = 'layer-panel-label';
        ventaLabel.id = 'venta-label';
        ventaLabel.textContent = 'Ventas';
        const ventaSwitch = document.createElement('span');
        ventaSwitch.className = 'layer-panel-switch';
        const ventaCb = document.createElement('input');
        ventaCb.type = 'checkbox';
        ventaCb.id = 'floating-show-venta';
        ventaCb.checked = this.ventaVisible;
        const ventaSlider = document.createElement('span');
        ventaSlider.className = 'layer-panel-slider';
        ventaSwitch.appendChild(ventaCb);
        ventaSwitch.appendChild(ventaSlider);
        ventaRow.appendChild(ventaIcon);
        ventaRow.appendChild(ventaLabel);
        ventaRow.appendChild(ventaSwitch);
        ventaCb.onchange = () => this.setVentaVisible(ventaCb.checked);
        ventaWrap.appendChild(ventaRow);

        // Sub-switches: qué unidades se pintan (CVZA, NABS o ambas)
        const crearVentaUnitRow = (unidad, texto, icono) => {
            const row = document.createElement('label');
            row.className = 'layer-panel-row layer-panel-toggle layer-panel-sub';

            const icon = document.createElement('i');
            icon.className = `fas ${icono} layer-panel-icon`;
            row.appendChild(icon);

            const lbl = document.createElement('span');
            lbl.className = 'layer-panel-label';
            lbl.textContent = texto;
            row.appendChild(lbl);

            const wrap = document.createElement('span');
            wrap.className = 'layer-panel-switch';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = `floating-venta-${unidad}`;
            cb.checked = !!this.getVentaUnidades()[unidad];
            const slider = document.createElement('span');
            slider.className = 'layer-panel-slider';
            wrap.appendChild(cb);
            wrap.appendChild(slider);
            row.appendChild(wrap);

            cb.onchange = () => this.setVentaUnidades({ [unidad]: cb.checked });
            return row;
        };
        ventaWrap.appendChild(crearVentaUnitRow('cerveza', 'CVZA', 'fa-beer-mug-empty'));
        ventaWrap.appendChild(crearVentaUnitRow('nabs', 'NABS', 'fa-bottle-water'));

        // Mes de venta (debajo de los switches de unidad)
        const monthRow = document.createElement('div');
        monthRow.className = 'layer-panel-row layer-panel-style-row';
        const monthLabel = document.createElement('span');
        monthLabel.className = 'layer-panel-label';
        monthLabel.textContent = 'Mes de venta';
        const monthInput = document.createElement('input');
        monthInput.type = 'month';
        monthInput.id = 'venta-month';
        monthInput.className = 'layer-panel-select';
        monthInput.value = this.getDefaultVentaMonth();
        monthInput.onchange = () => {
            if (this.ventaVisible) this.reloadVentas(false);
        };
        monthRow.appendChild(monthLabel);
        monthRow.appendChild(monthInput);
        ventaWrap.appendChild(monthRow);

        // Leyenda: ● CCC = compró (verde) · ● CNC = no compró (rojo)
        const legend = document.createElement('div');
        legend.id = 'venta-legend';
        legend.className = 'layer-panel-legend';
        [['ccc', 'CCC'], ['cnc', 'CNC']].forEach(([cls, txt]) => {
            const item = document.createElement('span');
            item.className = 'layer-panel-legend-item';
            item.title = (cls === 'ccc') ? 'Cliente con compra' : 'Cliente sin compra';
            const dot = document.createElement('span');
            dot.className = 'layer-panel-legend-dot ' + cls;
            const label = document.createElement('span');
            label.textContent = txt;
            item.appendChild(dot);
            item.appendChild(label);
            legend.appendChild(item);
        });
        ventaWrap.appendChild(legend);

        const status = document.createElement('div');
        status.id = 'venta-status';
        status.className = 'layer-panel-status';
        ventaWrap.appendChild(status);

        body.appendChild(ventaWrap);
        this.updateVentaStatus();

        // Collapse / expand
        let collapsed = window.matchMedia('(max-width: 768px)').matches;
        body.style.display = collapsed ? 'none' : '';
        headerBtn.querySelector('.layer-chevron').style.transform = collapsed ? 'rotate(180deg)' : '';
        container.classList.toggle('collapsed', collapsed);
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
        const layers = ['clients-points', 'promoter-zones-line', 'promoter-zones-fill', 'custom-zones-line', 'custom-zones-fill'];
        layers.forEach(l => { if (this.map.getLayer(l)) this.map.removeLayer(l); });
        
        const sources = ['clients', 'promoter-zones', 'custom-zones'];
        sources.forEach(s => { if (this.map.getSource(s)) this.map.removeSource(s); });
    },

    renderAll() {
        if (!this.map || !this.isLoaded) return;
        this.clearAll();

        const clientes = DataService.data.clientes;

        // --- 1. Prepare GeoJSON for Clients ---
        const clientFeatures = this.buildClientFeatures();

        // --- Add Source & Layer for Clients ---
        this.map.addSource('clients', { type: 'geojson', data: { type: 'FeatureCollection', features: clientFeatures }});

        // --- Calculate Promoter Zones using Turf.js ---
        const promoterFeatures = [];
        DataService.data.promotores.forEach(prom => {
            const promClients = DataService.getClientsByPromotor(prom.ID).filter(c => !isNaN(c.Latitud) && !isNaN(c.Longitud));
            
            // Agrupar por frecuencia
            const freqGroups = {};
            promClients.forEach(c => {
                const freq = c.FrecuenciaGrupo || 'Sin Frecuencia';
                if (!freqGroups[freq]) freqGroups[freq] = [];
                freqGroups[freq].push(c);
            });

            for (const [freq, clientsInFreq] of Object.entries(freqGroups)) {
                if (clientsInFreq.length >= 3) {
                    const points = turf.featureCollection(clientsInFreq.map(c => turf.point([c.Longitud, c.Latitud])));
                    try {
                        const hull = turf.convex(points);
                        if (hull) {
                            hull.properties = {
                                PromotorID: prom.ID,
                                PromotorName: prom.Nombre,
                                PromotorColor: prom.Color,
                                FrecuenciaGrupo: freq,
                                FrecuenciaColor: clientsInFreq[0].FrecuenciaColor,
                                PromFreqID: prom.ID + '_' + freq
                            };
                            promoterFeatures.push(hull);
                        }
                    } catch (e) {
                        console.warn('Could not generate convex hull for promotor', prom.ID, 'freq', freq, e);
                    }
                }
            }
        });

        // --- Add Source & Layers for Promoter Zones ---
        this.map.addSource('promoter-zones', { type: 'geojson', data: { type: 'FeatureCollection', features: promoterFeatures }});

        const showZonesInput = document.getElementById('floating-show-promoter-zones');
        const showZones = showZonesInput ? showZonesInput.checked : false;
        const initialVisibility = showZones ? 'visible' : 'none';

        this.map.addLayer({
            id: 'promoter-zones-fill',
            type: 'fill',
            source: 'promoter-zones',
            layout: { visibility: initialVisibility },
            paint: {
                'fill-color': ['get', 'PromotorColor'],
                'fill-opacity': 0.2
            }
        });

        this.map.addLayer({
            id: 'promoter-zones-line',
            type: 'line',
            source: 'promoter-zones',
            layout: { visibility: initialVisibility },
            paint: {
                'line-color': ['get', 'PromotorColor'],
                'line-width': 2,
                'line-dasharray': [2, 2],
                'line-opacity': 0.8
            }
        });

        this.map.addLayer({
            id: 'clients-points',
            type: 'circle',
            source: 'clients',
            layout: { visibility: 'visible' },
            paint: {
                'circle-radius': 6,
                'circle-color': this.getClientColorExpression(),
                'circle-opacity': 1.0
            }
        });
        this.applyClientPaint();



        if (clientFeatures.length > 0 && !this._hasAutoCentered) {
            const bounds = new maplibregl.LngLatBounds();
            clientFeatures.forEach(f => bounds.extend(f.geometry.coordinates));
            this.map.fitBounds(bounds, { padding: 50, duration: 1000 });
            this._hasAutoCentered = true;
        }

        // Capa Venta: el color de los puntos ya refleja verde/rojo; solo actualizamos el estado
        this.updateVentaStatus();

        // Render custom zones
        this.renderCustomZones();
    },

    // ── Capa Venta ─────────────────────────────────────────────
    getDefaultVentaMonth() {
        if (typeof getCommercialMonth === 'function' && typeof emcalaHoy === 'function') {
            return getCommercialMonth(emcalaHoy());
        }
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    },

    getVentaMonth() {
        const el = document.getElementById('venta-month');
        return (el && el.value) ? el.value : this.getDefaultVentaMonth();
    },

    setVentaStatus(text, kind) {
        const el = document.getElementById('venta-status');
        if (!el) return;
        el.textContent = text;
        el.className = 'layer-panel-status' + (kind ? ' ' + kind : '');
    },

    // Unidades activas de la capa Venta (por defecto: CVZA + NABS)
    getVentaUnidades() {
        if (!this.ventaUnidades) this.ventaUnidades = { cerveza: true, nabs: true };
        return this.ventaUnidades;
    },

    // ¿Hay al menos una unidad activa?
    hasVentaUnits() {
        const u = this.getVentaUnidades();
        return !!(u.cerveza || u.nabs);
    },

    // Etiqueta de las unidades activas: "CVZA", "NABS" o "CVZA + NABS"
    getVentaUnitsLabel() {
        const u = this.getVentaUnidades();
        const activas = [];
        if (u.cerveza) activas.push('CVZA');
        if (u.nabs) activas.push('NABS');
        return activas.length ? activas.join(' + ') : 'sin unidades';
    },

    // Cambia las unidades que se pintan (no vuelve a consultar al Planificador)
    setVentaUnidades(cambios) {
        const u = this.getVentaUnidades();
        if (typeof cambios.cerveza === 'boolean') u.cerveza = cambios.cerveza;
        if (typeof cambios.nabs === 'boolean') u.nabs = cambios.nabs;
        try { localStorage.setItem('surcala_venta_unidades', JSON.stringify(u)); } catch (e) { }
        this.refreshClientsVenta();
    },

    updateVentaStatus() {
        const legend = document.getElementById('venta-legend');
        if (legend) legend.style.display = (this.ventaVisible && this.hasVentaUnits()) ? '' : 'none';
        if (!this.ventaVisible) {
            this.setVentaStatus('Capa desactivada.', '');
            return;
        }
        if (!this.hasVentaUnits()) {
            this.setVentaStatus('Elegí CVZA, NABS o ambos para pintar el mapa.', '');
            return;
        }
        const month = this.getVentaMonth();
        const unitsLabel = this.getVentaUnitsLabel();
        const v = DataService.ventas;
        if (!v || v.cMonth !== month) {
            this.setVentaStatus('Activá la capa para cargar la venta de ' + month + '.', '');
            return;
        }
        const s = DataService.getVentasStatsUnidades(v, this.getVentaUnidades());
        if (!s || s.total === 0) {
            const cccTot = s ? (s.cccTotal || 0) : 0;
            if (cccTot > 0) {
                this.setVentaStatus(month + ': el Planificador informa ' + cccTot + ' clientes con compra de ' + unitsLabel + ', pero sin códigos para geolocalizar (datos históricos).', '');
            } else {
                this.setVentaStatus('Sin clientes con compra de ' + unitsLabel + ' en ' + month + '.', '');
            }
            return;
        }
        const sinCoords = s.enBase - s.conCoords;
        let txt = month + ': ' + s.total + ' clientes con compra de ' + unitsLabel + ' · ' + s.conCoords + ' en el mapa';
        if (sinCoords > 0) txt += ' · ' + sinCoords + ' sin coordenadas';
        if (s.sinMatch > 0) txt += ' · ' + s.sinMatch + ' sin match en la base';
        const u = this.getVentaUnidades();
        if (u.cerveza && u.nabs && (!v.codesNabs || v.codesNabs.size === 0) && (v.cccNabsTotal || 0) > 0) {
            txt += ' · NABS sin códigos en este mes';
        }
        this.setVentaStatus(txt, '');
    },

    // Construye los features de clientes con Venta / VentaCvza / VentaNabs (1 = compró, 0 = no compró)
    buildClientFeatures() {
        const features = [];
        const unidades = this.getVentaUnidades();
        DataService.data.clientes.forEach(c => {
            if (isNaN(c.Latitud) || isNaN(c.Longitud)) return;
            const sup = DataService.getSupervisor(c.SupervisorID);
            const prom = DataService.getPromotor(c.PromotorID);
            const comproCvza = DataService.isVentaCliente(c.Codigo, 'cerveza');
            const comproNabs = DataService.isVentaCliente(c.Codigo, 'nabs');
            const compro = (unidades.cerveza && comproCvza) || (unidades.nabs && comproNabs);
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [c.Longitud, c.Latitud] },
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
                    Venta: compro ? 1 : 0,
                    VentaCvza: comproCvza ? 1 : 0,
                    VentaNabs: comproNabs ? 1 : 0
                }
            });
        });
        return features;
    },

    // La capa Venta está activa si el toggle está encendido y los datos son del mes seleccionado
    isVentaActive() {
        const v = DataService.ventas;
        return !!(this.ventaVisible && this.hasVentaUnits() && v && v.cMonth === this.getVentaMonth());
    },

    // Expresión de color del punto: verde/rojo con Venta activa, si no el color de promotor o de frecuencia
    getClientColorExpression() {
        if (this.isVentaActive()) {
            return ['case', ['==', ['get', 'Venta'], 1], '#16a34a', '#dc2626'];
        }
        const colorProp = document.getElementById('floating-color-freq')?.checked ? 'FrecuenciaColor' : 'PromotorColor';
        return ['get', colorProp];
    },

    // Aplica el color de los puntos de clientes según el estado actual
    applyClientPaint() {
        if (!this.map || !this.map.getLayer('clients-points')) return;
        this.map.setPaintProperty('clients-points', 'circle-color', this.getClientColorExpression());
        this.map.setPaintProperty('clients-points', 'circle-stroke-width', 0);
    },

    // Cambia el estado de la capa Venta y carga los datos si hace falta
    async setVentaVisible(on) {
        this.ventaVisible = !!on;
        localStorage.setItem('surcala_venta_visible', on ? '1' : '0');
        if (on) {
            await this.reloadVentas(false);
        } else {
            this._ventaReq = (this._ventaReq || 0) + 1; // invalida cargas en vuelo
            this.refreshClientsVenta();
        }
    },

    // Consulta el Planificador para el mes seleccionado y refresca los colores
    async reloadVentas(force) {
        if (!this.ventaVisible) return;
        const month = this.getVentaMonth();
        const reqId = (this._ventaReq = (this._ventaReq || 0) + 1);
        this.setVentaStatus('Cargando venta de ' + month + '…', 'loading');
        let venta;
        try {
            venta = await DataService.loadVentas(month, force);
        } catch (e) {
            if (reqId !== this._ventaReq) return;
            console.error('[Zonas Surcala] No se pudo cargar la venta:', e);
            DataService.ventas = null;
            this.refreshClientsVenta();
            this.setVentaStatus('No se pudo cargar la venta: ' + e.message, 'error');
            return;
        }
        if (reqId !== this._ventaReq) return;
        DataService.ventas = venta;
        this.refreshClientsVenta();
    },

    // Reescribe los features de clientes (campo Venta) y el color; mantiene los filtros activos
    refreshClientsVenta() {
        if (!this.map || !this.isLoaded) return;
        const src = this.map.getSource('clients');
        if (src) {
            src.setData({ type: 'FeatureCollection', features: this.buildClientFeatures() });
        }
        this.applyClientPaint();
        this.updateVentaStatus();
    },

    startDrawingCustomZone() {
        this.isDrawingCustomZone = true;
        this.draw.changeMode('draw_polygon');
    },

    savePendingCustomZone(name, color) {
        if (!this.pendingCustomZoneFeature) return;
        
        const zone = {
            name: name,
            color: color,
            geometry: this.pendingCustomZoneFeature.geometry
        };
        
        const saved = DataService.saveCustomZone(zone);
        this.pendingCustomZoneFeature = null;
        this.renderCustomZones();
        return saved;
    },

    cancelPendingCustomZone() {
        this.pendingCustomZoneFeature = null;
    },

    renderCustomZones() {
        if (!this.map) return;
        
        const zones = DataService.getCustomZones();
        const features = zones.filter(z => z.visible !== false).map(z => ({
            type: 'Feature',
            geometry: z.geometry,
            properties: {
                id: z.id,
                name: z.name,
                color: z.color
            }
        }));

        const geojsonData = {
            type: 'FeatureCollection',
            features: features
        };

        if (this.map.getSource('custom-zones')) {
            this.map.getSource('custom-zones').setData(geojsonData);
        } else {
            this.map.addSource('custom-zones', {
                type: 'geojson',
                data: geojsonData
            });

            this.map.addLayer({
                id: 'custom-zones-fill',
                type: 'fill',
                source: 'custom-zones',
                layout: {},
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.3
                }
            }, 'clients-points');

            this.map.addLayer({
                id: 'custom-zones-line',
                type: 'line',
                source: 'custom-zones',
                layout: {},
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': 2
                }
            }, 'clients-points');
        }

        // Handlers de custom-zones: registrar una sola vez
        if (!this._customZoneHandlersBound) {
            this._customZoneHandlersBound = true;

            this.map.on('click', 'custom-zones-fill', (e) => {
                const props = e.features[0].properties;
                // Buscar la geometría por id (no confiar en que el evento la incluya)
                const zona = DataService.getCustomZones().find(z => z.id === props.id);
                const stats = DataService.getZoneStats(
                    zona ? zona.geometry : null,
                    (window.UI && window.UI.activeClients) || null
                );
                new maplibregl.Popup({ className: 'custom-popup' })
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="padding:6px; min-width:160px;">
                            <h3 style="margin:0 0 8px 0; font-size:14px; color:var(--accent-primary);">${esc(props.name)}</h3>
                            <div style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-primary);">
                                <span><i class="fas fa-user-shield" style="display:inline-block; width:16px; color:var(--text-muted);"></i> SPV: <strong>${stats.supervisores}</strong></span>
${stats.especiales.map(e => `                                <span><i class="fas fa-user-shield" style="display:inline-block; width:16px; color:var(--text-muted);"></i> ${esc(e)}: <strong>1</strong></span>`).join('\n')}
                                <span><i class="fas fa-user-tie" style="display:inline-block; width:16px; color:var(--text-muted);"></i> Promotores: <strong>${stats.promotores}</strong></span>
                                <span><i class="fas fa-store" style="display:inline-block; width:16px; color:var(--text-muted);"></i> Clientes: <strong>${stats.clientes}</strong></span>
                            </div>
                        </div>
                    `)
                    .addTo(this.map);
            });

            this.map.on('mouseenter', 'custom-zones-fill', () => {
                if (this.draw && this.draw.getMode() !== 'draw_polygon') {
                    this.map.getCanvas().style.cursor = 'pointer';
                }
            });
            this.map.on('mouseleave', 'custom-zones-fill', () => {
                this.map.getCanvas().style.cursor = '';
            });
        }
    },



    updateClientVisibility(visibleClientIds, globalShowClients) {
        if (!this.map || !this.map.getLayer('clients-points')) return;
        
        if (!globalShowClients) {
            this.map.setLayoutProperty('clients-points', 'visibility', 'none');
        } else {
            this.map.setLayoutProperty('clients-points', 'visibility', 'visible');
        }

        const idsArray = Array.from(visibleClientIds);
        const activePromFreqIDs = new Set();
        idsArray.forEach(id => {
            const c = DataService.byId && DataService.byId.get(id);
            if (c) activePromFreqIDs.add(c.PromotorID + '_' + (c.FrecuenciaGrupo || 'Sin Frecuencia'));
        });
        
        if (idsArray.length === 0) {
            this.map.setFilter('clients-points', ['==', 'ID', 'NONE']);
        } else {
            const filter = ['in', 'ID', ...idsArray];
            this.map.setFilter('clients-points', filter);
        }


        if (this.map.getLayer('promoter-zones-fill')) {
            if (activePromFreqIDs.size === 0) {
                this.map.setFilter('promoter-zones-fill', ['==', 'PromFreqID', 'NONE']);
                this.map.setFilter('promoter-zones-line', ['==', 'PromFreqID', 'NONE']);
            } else {
                const promFilter = ['in', 'PromFreqID', ...Array.from(activePromFreqIDs)];
                this.map.setFilter('promoter-zones-fill', promFilter);
                this.map.setFilter('promoter-zones-line', promFilter);
            }
        }
    },



    generatePopupHtml(c) {
        let popupHtml = `<div class="popup-content">`;
        popupHtml += `<div class="popup-client-code">#${esc(c.Codigo || c.ID)}</div>`;
        popupHtml += `<h3>${esc(c.Nombre)}</h3>`;
        if (c.Direccion) popupHtml += `<div class="popup-row"><i class="fas fa-map-marker-alt"></i> ${esc(c.Direccion)}</div>`;
        if (c.Localidad) popupHtml += `<div class="popup-row"><i class="fas fa-map-pin"></i> ${esc(c.Localidad)}</div>`;
        if (c.Zona) popupHtml += `<div class="popup-row"><i class="fas fa-th-large"></i> Zona ${esc(c.Zona)}</div>`;
        if (c.Vendedor) popupHtml += `<div class="popup-row"><i class="fas fa-user"></i> Vendedor: ${esc(c.Vendedor)}</div>`;
        popupHtml += `<div class="popup-divider"></div>`;
        if (c.SupervisorName) popupHtml += `<span class="popup-tag" style="background:${c.SupervisorColor}">${esc(c.SupervisorName)}</span>`;
        if (c.PromotorName) popupHtml += `<span class="popup-tag" style="background:${c.PromotorColor}">${esc(c.PromotorName)}</span>`;
        if (c.FrecuenciaGrupo) popupHtml += `<span class="popup-tag" style="background:${c.FrecuenciaColor}; text-shadow: 0px 1px 2px rgba(0,0,0,0.4);">${esc(c.FrecuenciaGrupo)}</span>`;
        // Solo se listan las unidades compradas (CCC). Si no compró ninguna no se agrega nada:
        // el punto del cliente ya está pintado de rojo (CNC).
        if (this.isVentaActive()) {
            if (Number(c.VentaCvza) === 1) {
                popupHtml += `<span class="popup-tag" style="background:#16a34a">CCC CVZA</span>`;
            }
            if (Number(c.VentaNabs) === 1) {
                popupHtml += `<span class="popup-tag" style="background:#16a34a">CCC NABS</span>`;
            }
        }
        popupHtml += `</div>`;
        return popupHtml;
    },

    // Abre el popup del cliente más cercano al punto tocado (p = {x, y} en píxeles del mapa)
    openClientAt(p, recenter = true) {
        if (!this.map || !this.map.getLayer('clients-points')) return;
        const r = 16;
        const feats = this.map.queryRenderedFeatures(
            [[p.x - r, p.y - r], [p.x + r, p.y + r]],
            { layers: ['clients-points'] }
        );
        if (!feats || feats.length === 0) return;
        let best = feats[0];
        let bestD = Infinity;
        feats.forEach(f => {
            const sp = this.map.project(f.geometry.coordinates);
            const d = Math.pow(sp.x - p.x, 2) + Math.pow(sp.y - p.y, 2);
            if (d < bestD) { bestD = d; best = f; }
        });
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const popupW = Math.min(340, window.innerWidth - 24) + 'px';
        if (this.hoverPopup) this.hoverPopup.remove();
        if (this._clientPopup) this._clientPopup.remove();
        this._clientPopup = new maplibregl.Popup({
            offset: 15,
            className: 'client-popup',
            maxWidth: popupW,
            closeOnClick: false,
            closeButton: true
        })
            .setLngLat(best.geometry.coordinates)
            .setHTML(this.generatePopupHtml(best.properties))
            .addTo(this.map);
        if (isMobile && recenter) {
            this.map.easeTo({
                center: best.geometry.coordinates,
                duration: 300
            });
        }
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
