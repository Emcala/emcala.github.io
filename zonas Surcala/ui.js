// ============================================
// UI CONTROLLER - Zonas Surcala
// Sidebar, filters, print, config (read-only, no CRUD)
// ============================================

// Helper para escapar datos del CSV / localStorage antes de innerHTML
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UI = {
    activeClients: new Set(),
    mapSelection: null,

    init() {
        this.initTheme();
        this.bindEvents();
        this.loadConfig();
    },

    initTheme() {
        const saved = localStorage.getItem('surcala_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        this.updateThemeIcon(saved);
    },

    updateThemeIcon(theme) {
        const btn = document.getElementById('btn-theme');
        if (!btn) return;
        btn.innerHTML = theme === 'dark' 
            ? '<i class="fas fa-sun"></i>' 
            : '<i class="fas fa-moon"></i>';
        btn.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('surcala_theme', next);
        this.updateThemeIcon(next);
        if (MapManager.setTheme) MapManager.setTheme(next);
    },

    bindEvents() {
        // Sidebar toggle
        document.getElementById('sidebar-toggle').onclick = () => {
            document.getElementById('sidebar').classList.toggle('sidebar-open');
            setTimeout(() => MapManager.map && MapManager.map.invalidateSize(), 300);
        };
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');

                // Si salimos de la pestaña de impresión, limpiamos el polígono del mapa para que no moleste
                if (btn.dataset.tab !== 'tab-print') {
                    this.clearMapSelection();
                }
            };
        });
        // Search
        const searchInput = document.getElementById('search-clients');
        const clearBtn = document.getElementById('clear-search');
        searchInput.oninput = () => {
            clearBtn.classList.toggle('visible', searchInput.value.length > 0);
            this.filterClients(searchInput.value);
        };
        clearBtn.onclick = () => { searchInput.value = ''; clearBtn.classList.remove('visible'); this.filterClients(''); };
        // Filtro en cascada: "Ver Todos"
        const btnCascadeReset = document.getElementById('cascade-reset');
        if (btnCascadeReset) {
            btnCascadeReset.onclick = () => {
                this.cascadeActivos = null;               // null = todo activo, se recalcula al renderizar
                this.cascadeAbiertas = new Set();
                this.cascadeSupsAbiertos = new Set();
                this.cascadePromsAbiertos = new Set();
                this.renderCascadeFilters();
                this.applyCascadeFilters();
            };
        }
        // Config
        document.getElementById('btn-config').onclick = () => document.getElementById('config-modal').classList.add('active');
        document.getElementById('modal-close').onclick = () => document.getElementById('config-modal').classList.remove('active');
        document.getElementById('config-modal').onclick = (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); };
        document.getElementById('save-config').onclick = () => this.saveConfig();
        document.getElementById('btn-refresh').onclick = () => this.refreshData();
        // Print
        document.getElementById('print-supervisor').onchange = () => this.updatePrintPreview();
        document.getElementById('print-promotor').onchange = () => this.updatePrintPreview();
        document.getElementById('print-localidad').onchange = () => this.updatePrintPreview();
        document.getElementById('btn-print').onclick = () => this.printReport();
        document.getElementById('btn-export-csv').onclick = () => this.exportCSV();
        // Theme toggle
        document.getElementById('btn-theme').onclick = () => this.toggleTheme();
        
        // Map Selection Cancel
        const btnClearSelection = document.getElementById('btn-clear-map-selection');
        if (btnClearSelection) {
            btnClearSelection.onclick = () => this.clearMapSelection();
        }

        this.bindCustomZoneEvents();
    },

    bindCustomZoneEvents() {
        // Draw Button
        const btnDraw = document.getElementById('btn-draw-custom-zone');
        if (btnDraw) {
            btnDraw.onclick = () => {
                if (window.MapManager) {
                    MapManager.startDrawingCustomZone();
                }
            };
        }

        // Modal close/cancel
        const modal = document.getElementById('custom-zone-modal');
        const closeModal = () => {
            modal.classList.remove('active');
            if (window.MapManager) MapManager.cancelPendingCustomZone();
        };

        if (document.getElementById('custom-zone-modal-close')) {
            document.getElementById('custom-zone-modal-close').onclick = closeModal;
        }
        if (document.getElementById('btn-cancel-zone')) {
            document.getElementById('btn-cancel-zone').onclick = closeModal;
        }
        if (modal) {
            modal.onclick = (e) => { if (e.target === modal) closeModal(); };
        }

        // Modal Save
        const btnSave = document.getElementById('btn-save-zone');
        if (btnSave) {
            btnSave.onclick = () => {
                const nameInput = document.getElementById('custom-zone-name');
                const colorInput = document.getElementById('custom-zone-color');
                const name = nameInput.value.trim() || 'Zona sin nombre';
                const color = colorInput.value || '#3b82f6';

                const existe = DataService.getCustomZones()
                    .some(z => (z.name || '').trim().toLowerCase() === name.trim().toLowerCase());

                if (existe && !confirm(`Ya existe una zona llamada "${name}". ¿Guardarla igual?`)) {
                    return; // no cierra el modal, no descarta el polígono pendiente
                }

                if (window.MapManager) MapManager.savePendingCustomZone(name, color);
                nameInput.value = '';
                modal.classList.remove('active');
                this.renderCustomZonesList();
            };
        }
    },

    showCustomZoneModal() {
        const modal = document.getElementById('custom-zone-modal');
        if (modal) {
            modal.classList.add('active');
            document.getElementById('custom-zone-name').focus();
        }
    },

    renderCustomZonesList() {
        const list = document.getElementById('custom-zones-list');
        if (!list) return;

        const zones = DataService.getCustomZones();
        if (zones.length === 0) {
            list.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); text-align:center; padding: 20px;">No hay zonas guardadas.</div>';
            return;
        }

        let html = '';
        zones.forEach(z => {
            const isVis = z.visible !== false;
            const stats = DataService.getZoneStats(z.geometry);
            html += `
            <div class="tree-node level-1" style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:8px; padding: 8px; border-bottom: 1px solid var(--border-color);">
                <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:16px; height:16px; border-radius:3px; background:${esc(z.color)}"></div>
                        <span style="font-size:13px; font-weight:500;">${esc(z.name)}</span>
                    </div>
                    <span style="font-size:11px; color:var(--text-secondary); padding-left:26px;">${stats.clientes} clientes · ${stats.promotores} promotores · ${stats.supervisores} supervisores</span>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button class="link-btn toggle-zone-vis" data-id="${esc(z.id)}" style="color:var(--text-secondary);" title="${isVis ? 'Ocultar' : 'Mostrar'}">
                        <i class="fas ${isVis ? 'fa-eye' : 'fa-eye-slash'}"></i>
                    </button>
                    <button class="link-btn delete-zone" data-id="${esc(z.id)}" style="color:var(--danger-color);" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
        });

        list.innerHTML = html;

        // Bind events
        list.querySelectorAll('.toggle-zone-vis').forEach(btn => {
            btn.onclick = () => {
                DataService.toggleCustomZoneVisibility(btn.dataset.id);
                this.renderCustomZonesList();
                if (window.MapManager) MapManager.renderCustomZones();
            };
        });

        list.querySelectorAll('.delete-zone').forEach(btn => {
            btn.onclick = () => {
                if (confirm('¿Estás seguro de eliminar esta zona?')) {
                    DataService.deleteCustomZone(btn.dataset.id);
                    this.renderCustomZonesList();
                    if (window.MapManager) MapManager.renderCustomZones();
                }
            };
        });
    },
    // ============================================
    // FILTRO EN CASCADA: Día > Supervisor > Promotor > Cliente
    // Estado: claves "FREC|SUPERVISORID|PROMOTORID|CLIENTEID" activas.
    // ============================================
    cascadeAbiertas: null,        // Set de frecuencias con el panel desplegado
    cascadeSupsAbiertos: null,    // Set de "SUPERVISORID@FREC"
    cascadePromsAbiertos: null,   // Set de "PROMOTORID@SUPERVISORID@FREC"
    cascadeActivos: null,         // Set de claves activas
    cascadeJerarquia: null,       // Map FREC -> Map(SUP -> Map(PROM -> [idsCliente]))

    // Se arma desde los CLIENTES (no desde supervisores[]/promotores[]), para que cada
    // combinación sea independiente y no reaparezca el bug de promotores compartidos.
    buildCascadeJerarquia() {
        const jer = new Map();
        DataService.data.clientes.forEach(c => {
            const f = c.FrecuenciaGrupo || 'Sin Frecuencia';
            if (!jer.has(f)) jer.set(f, new Map());
            if (!jer.get(f).has(c.SupervisorID)) jer.get(f).set(c.SupervisorID, new Map());
            if (!jer.get(f).get(c.SupervisorID).has(c.PromotorID)) jer.get(f).get(c.SupervisorID).set(c.PromotorID, []);
            jer.get(f).get(c.SupervisorID).get(c.PromotorID).push(c.ID);
        });
        return jer;
    },

    cascadeClave(f, s, p, id) { return f + '|' + s + '|' + p + '|' + id; },

    cascadeTodasLasClaves() {
        const claves = [];
        this.cascadeJerarquia.forEach((sups, f) => {
            sups.forEach((proms, s) => proms.forEach((ids, p) => ids.forEach(id => claves.push(this.cascadeClave(f, s, p, id)))));
        });
        return claves;
    },

    // Devuelve las claves de un alcance: (f) | (f,s) | (f,s,p)
    cascadeClaves(f, s, p) {
        const claves = [];
        const sups = this.cascadeJerarquia.get(f);
        if (!sups) return claves;
        const agregarProm = (sid, pid, ids) => ids.forEach(id => claves.push(this.cascadeClave(f, sid, pid, id)));
        if (s === undefined) {
            sups.forEach((proms, sid) => proms.forEach((ids, pid) => agregarProm(sid, pid, ids)));
        } else if (p === undefined) {
            const proms = sups.get(s);
            if (proms) proms.forEach((ids, pid) => agregarProm(s, pid, ids));
        } else {
            const proms = sups.get(s);
            const ids = proms && proms.get(p);
            if (ids) agregarProm(s, p, ids);
        }
        return claves;
    },

    renderCascadeFilters() {
        const cont = document.getElementById('cascade-chips');
        const panel = document.getElementById('cascade-panel');
        if (!cont || !panel) return;

        this.cascadeJerarquia = this.buildCascadeJerarquia();
        if (!this.cascadeActivos) this.cascadeActivos = new Set(this.cascadeTodasLasClaves());
        if (!this.cascadeAbiertas) this.cascadeAbiertas = new Set();
        if (!this.cascadeSupsAbiertos) this.cascadeSupsAbiertos = new Set();
        if (!this.cascadePromsAbiertos) this.cascadePromsAbiertos = new Set();

        const ORDEN = ['LU-JU', 'MA-VI', 'MI-SA'];
        const freqs = [...this.cascadeJerarquia.keys()].sort((a, b) => {
            const ia = ORDEN.indexOf(a), ib = ORDEN.indexOf(b);
            if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            return a.localeCompare(b);
        });

        // ---- Nivel 1: chips de Día de Visita ----
        cont.innerHTML = '';
        freqs.forEach(f => {
            const sups = this.cascadeJerarquia.get(f);
            const claves = this.cascadeClaves(f);
            const activos = claves.filter(k => this.cascadeActivos.has(k)).length;
            const st = activos === 0 ? 'none' : (activos === claves.length ? 'all' : 'partial');
            const abierta = this.cascadeAbiertas.has(f);

            const chip = document.createElement('div');
            chip.className = 'chip ' + st;

            const sel = document.createElement('button');
            sel.type = 'button';
            sel.className = 'chip-sel';
            sel.textContent = f + ' (' + sups.size + ')';   // nº de supervisores
            sel.title = 'Seleccionar / deseleccionar todo ' + f;
            sel.onclick = () => {
                const todas = claves.every(k => this.cascadeActivos.has(k));
                claves.forEach(k => { if (todas) this.cascadeActivos.delete(k); else this.cascadeActivos.add(k); });
                this.renderCascadeFilters();
                this.applyCascadeFilters();
            };
            chip.appendChild(sel);

            const abr = document.createElement('button');
            abr.type = 'button';
            abr.className = 'chip-open' + (abierta ? ' open' : '');
            abr.innerHTML = '<i class="fas fa-chevron-down"></i>';
            abr.title = 'Desplegar / cerrar';
            abr.onclick = () => {
                if (abierta) this.cascadeAbiertas.delete(f); else this.cascadeAbiertas.add(f);
                this.renderCascadeFilters();
            };
            chip.appendChild(abr);

            cont.appendChild(chip);
        });

        // ---- Niveles 2, 3 y 4 ----
        panel.innerHTML = '';
        freqs.filter(f => this.cascadeAbiertas.has(f)).forEach(f => {
            const sups = this.cascadeJerarquia.get(f);

            const seccion = document.createElement('div');
            seccion.className = 'chip-section';

            const titulo = document.createElement('div');
            titulo.className = 'chip-section-title';
            titulo.textContent = f;
            seccion.appendChild(titulo);

            sups.forEach((proms, sid) => {
                const sup = DataService.getSupervisor(sid);
                const clavesS = this.cascadeClaves(f, sid);
                const activasS = clavesS.filter(k => this.cascadeActivos.has(k)).length;
                const abiertoSup = this.cascadeSupsAbiertos.has(sid + '@' + f);

                const fila = document.createElement('div');
                fila.className = 'chip-row';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = activasS === clavesS.length;
                cb.indeterminate = activasS > 0 && activasS < clavesS.length;
                cb.onchange = () => {
                    clavesS.forEach(k => { if (cb.checked) this.cascadeActivos.add(k); else this.cascadeActivos.delete(k); });
                    this.renderCascadeFilters();
                    this.applyCascadeFilters();
                };
                fila.appendChild(cb);

                const col = document.createElement('span');
                col.className = 'chip-color';
                col.style.background = sup ? sup.Color : '#666';
                fila.appendChild(col);

                const nom = document.createElement('span');
                nom.className = 'chip-name';
                nom.textContent = sup ? sup.Nombre : sid;
                fila.appendChild(nom);

                const cnt = document.createElement('span');
                cnt.className = 'chip-count';
                cnt.textContent = proms.size;              // nº de promotores
                fila.appendChild(cnt);

                const chev = document.createElement('button');
                chev.className = 'chip-chevron' + (abiertoSup ? ' open' : '');
                chev.innerHTML = '<i class="fas fa-chevron-down"></i>';
                chev.onclick = () => {
                    if (abiertoSup) this.cascadeSupsAbiertos.delete(sid + '@' + f);
                    else this.cascadeSupsAbiertos.add(sid + '@' + f);
                    this.renderCascadeFilters();
                };
                fila.appendChild(chev);

                seccion.appendChild(fila);
                if (!abiertoSup) return;

                proms.forEach((ids, pid) => {
                    const prom = DataService.getPromotor(pid);
                    const clavesP = this.cascadeClaves(f, sid, pid);
                    const activasP = clavesP.filter(k => this.cascadeActivos.has(k)).length;
                    const abiertoProm = this.cascadePromsAbiertos.has(pid + '@' + sid + '@' + f);

                    const sub = document.createElement('div');
                    sub.className = 'chip-subrow';

                    const cb2 = document.createElement('input');
                    cb2.type = 'checkbox';
                    cb2.checked = activasP === clavesP.length;
                    cb2.indeterminate = activasP > 0 && activasP < clavesP.length;
                    cb2.onchange = () => {
                        clavesP.forEach(k => { if (cb2.checked) this.cascadeActivos.add(k); else this.cascadeActivos.delete(k); });
                        this.renderCascadeFilters();
                        this.applyCascadeFilters();
                    };
                    sub.appendChild(cb2);

                    const col2 = document.createElement('span');
                    col2.className = 'chip-color';
                    col2.style.background = prom ? prom.Color : '#666';
                    sub.appendChild(col2);

                    const nom2 = document.createElement('span');
                    nom2.className = 'chip-name';
                    nom2.textContent = prom ? prom.Nombre : pid;
                    sub.appendChild(nom2);

                    const cnt2 = document.createElement('span');
                    cnt2.className = 'chip-count';
                    cnt2.textContent = ids.length;          // nº de clientes
                    sub.appendChild(cnt2);

                    const chev2 = document.createElement('button');
                    chev2.className = 'chip-chevron' + (abiertoProm ? ' open' : '');
                    chev2.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    chev2.onclick = () => {
                        if (abiertoProm) this.cascadePromsAbiertos.delete(pid + '@' + sid + '@' + f);
                        else this.cascadePromsAbiertos.add(pid + '@' + sid + '@' + f);
                        this.renderCascadeFilters();
                    };
                    sub.appendChild(chev2);

                    seccion.appendChild(sub);
                    if (!abiertoProm) return;

                    ids.forEach(id => {
                        const cli = DataService.byId ? DataService.byId.get(id) : null;
                        const clave = this.cascadeClave(f, sid, pid, id);

                        const filaCli = document.createElement('div');
                        filaCli.className = 'chip-clientrow';

                        const cb3 = document.createElement('input');
                        cb3.type = 'checkbox';
                        cb3.checked = this.cascadeActivos.has(clave);
                        cb3.onchange = () => {
                            if (cb3.checked) this.cascadeActivos.add(clave);
                            else this.cascadeActivos.delete(clave);
                            this.renderCascadeFilters();
                            this.applyCascadeFilters();
                        };
                        filaCli.appendChild(cb3);

                        const nom3 = document.createElement('span');
                        nom3.className = 'chip-name';
                        nom3.textContent = cli ? ('#' + (cli.Codigo || cli.ID) + ' - ' + cli.Nombre) : id;
                        filaCli.appendChild(nom3);

                        seccion.appendChild(filaCli);
                    });
                });
            });

            panel.appendChild(seccion);
        });
    },

    applyCascadeFilters() {
        if (!this.cascadeJerarquia) this.cascadeJerarquia = this.buildCascadeJerarquia();
        if (!this.cascadeActivos) this.cascadeActivos = new Set(this.cascadeTodasLasClaves());

        const visibles = new Set();
        DataService.data.clientes.forEach(c => {
            const f = c.FrecuenciaGrupo || 'Sin Frecuencia';
            if (this.cascadeActivos.has(this.cascadeClave(f, c.SupervisorID, c.PromotorID, c.ID))) visibles.add(c.ID);
        });
        this.activeClients = visibles;

        const checkbox = document.getElementById('floating-show-clients');
        const globalShow = checkbox ? checkbox.checked : true;
        MapManager.updateClientVisibility(visibles, globalShow);
    },

    // --- DATA RENDERING ---
    renderUI() {
        this.renderCascadeFilters();
        this.renderClientList(DataService.data.clientes);
        this.renderPrintDropdowns();
        this.updatePrintPreview();
        this.renderCustomZonesList();
    },

    renderClientList(clients) {
        const list = document.getElementById('clients-list');
        document.getElementById('client-count').textContent = `${clients.length} clientes`;
        if (clients.length === 0) { list.innerHTML = '<div class="loading-placeholder">No se encontraron clientes</div>'; return; }
        
        // Limit rendering to avoid browser freeze with 5000+ items
        const displayClients = clients.slice(0, 200);
        const hasMore = clients.length > 200;
        
        list.innerHTML = displayClients.map(c => {
            const supervisor = DataService.getSupervisor(c.SupervisorID);
            const promotor = DataService.getPromotor(c.PromotorID);
            return `<div class="client-item" data-id="${esc(c.ID)}" data-lat="${c.Latitud}" data-lng="${c.Longitud}">
                <div class="client-item-header">
                    <span class="client-item-code">#${esc(c.Codigo || c.ID)}</span>
                    <span class="client-item-name">${esc(c.Nombre)}</span>
                </div>
                <div class="client-item-addr">${esc(c.Direccion || '')}</div>
                <div class="client-item-tags">
                    ${supervisor ? `<span class="client-tag" style="background:${supervisor.Color}">${esc(supervisor.Nombre)}</span>` : ''}
                    ${promotor ? `<span class="client-tag" style="background:${promotor.Color}">${esc(promotor.Nombre)}</span>` : ''}
                </div>
            </div>`;
        }).join('');
        
        if (hasMore) {
            list.innerHTML += `<div class="loading-placeholder" style="color: var(--accent-secondary);">Mostrando ${displayClients.length} de ${clients.length} clientes. Usá el buscador para filtrar.</div>`;
        }
        
        list.querySelectorAll('.client-item').forEach(el => {
            el.onclick = () => {
                const c = DataService.byId ? DataService.byId.get(el.dataset.id) : null;
                if (c) MapManager.flyToClient(c);
            };
        });
    },

    applyClientFilters() {
        // Usado por el panel de capas del mapa y por app.js/map.js
        this.applyCascadeFilters();
    },

    filterClients(query) {
        const filtered = DataService.searchClients(query);
        this.renderClientList(filtered);
    },

    // --- PRINT ---
    renderPrintDropdowns() {
        const sSelect = document.getElementById('print-supervisor');
        const pSelect = document.getElementById('print-promotor');
        const lSelect = document.getElementById('print-localidad');
        sSelect.innerHTML = '<option value="">-- Todos los supervisores --</option>' +
            DataService.data.supervisores.map(s => `<option value="${esc(s.ID)}">${esc(s.Nombre)}</option>`).join('');
        pSelect.innerHTML = '<option value="">-- Todos los promotores --</option>' +
            DataService.data.promotores.map(p => `<option value="${esc(p.ID)}">${esc(p.Nombre)}</option>`).join('');
        lSelect.innerHTML = '<option value="">-- Todas las localidades --</option>' +
            DataService.data.localidades.map(l => `<option value="${esc(l.Nombre)}">${esc(l.Nombre)}</option>`).join('');
    },

    getFilteredPrintClients() {
        // Si hay una selección de mapa activa, usamos esa selección
        if (this.mapSelection !== null) {
            return DataService.data.clientes.filter(c => this.mapSelection.includes(c.ID));
        }

        const sid = document.getElementById('print-supervisor').value;
        const pid = document.getElementById('print-promotor').value;
        const loc = document.getElementById('print-localidad').value;
        let clients = DataService.data.clientes;
        if (sid) clients = clients.filter(c => c.SupervisorID === sid);
        if (pid) clients = clients.filter(c => c.PromotorID === pid);
        if (loc) clients = clients.filter(c => c.Localidad === loc);
        return clients;
    },

    handleMapSelection(ids) {
        this.mapSelection = ids;
        
        // Mostrar el banner de selección y ocultar los filtros
        document.getElementById('print-map-selection-banner').classList.remove('hidden');
        document.getElementById('print-dropdown-filters').style.display = 'none';
        
        // Cambiar a la pestaña de impresión automáticamente
        document.getElementById('tab-btn-print').click();
        
        this.updatePrintPreview();
    },

    clearMapSelection() {
        this.mapSelection = null;
        
        // Limpiar el dibujo del mapa si existe
        if (window.MapManager && MapManager.clearDrawSelection) {
            MapManager.clearDrawSelection();
        }
        
        // Ocultar banner y mostrar filtros
        document.getElementById('print-map-selection-banner').classList.add('hidden');
        document.getElementById('print-dropdown-filters').style.display = 'block';
        
        this.updatePrintPreview();
    },

    updatePrintPreview() {
        const clients = this.getFilteredPrintClients();
        document.getElementById('print-count').textContent = `${clients.length} clientes`;
        const list = document.getElementById('print-client-list');
        if (clients.length === 0) {
            list.innerHTML = '<div class="loading-placeholder">No hay clientes con los filtros seleccionados</div>';
            return;
        }
        // Compact table preview (show first 100)
        const previewClients = clients.slice(0, 100);
        let html = '<table class="preview-table"><thead><tr>';
        html += '<th>Código</th><th>Razón Social</th><th>Dirección</th><th>Loc.</th><th>Zona</th>';
        html += '</tr></thead><tbody>';
        previewClients.forEach((c) => {
            html += `<tr>
                <td>${esc(c.Codigo || c.ID)}</td>
                <td>${esc(c.Nombre)}</td>
                <td>${esc(c.Direccion || '')}</td>
                <td>${esc(c.Localidad || '')}</td>
                <td>${esc(c.Zona || '')}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        if (clients.length > 100) {
            html += `<div class="loading-placeholder" style="font-size:10px;">Mostrando 100 de ${clients.length}</div>`;
        }
        list.innerHTML = html;
    },

    printReport() {
        const clients = this.getFilteredPrintClients();
        if (clients.length === 0) { alert('No hay clientes para imprimir con los filtros seleccionados.'); return; }

        document.getElementById('print-date').textContent = `Generado: ${new Date().toLocaleString('es-AR')}`;
        let info = '';
        if (this.mapSelection !== null) {
            info = `<strong>Selección en mapa</strong> | <strong>Total:</strong> ${clients.length} clientes`;
        } else {
            const sid = document.getElementById('print-supervisor').value;
            const pid = document.getElementById('print-promotor').value;
            const loc = document.getElementById('print-localidad').value;
            if (sid) { const s = DataService.getSupervisor(sid); info += `<strong>Supervisor:</strong> ${esc(s ? s.Nombre : sid)} | `; }
            if (pid) { const p = DataService.getPromotor(pid); info += `<strong>Promotor:</strong> ${esc(p ? p.Nombre : pid)} | `; }
            if (loc) { info += `<strong>Localidad:</strong> ${loc} | `; }
            info += `<strong>Total:</strong> ${clients.length} clientes`;
        }
        document.getElementById('print-filters-info').innerHTML = info;

        const tbody = document.getElementById('print-table-body');
        tbody.innerHTML = clients.map(c => {
            return `<tr>
                <td>${esc(c.Codigo || c.ID)}</td>
                <td>${esc(c.Nombre)}</td>
                <td>${esc(c.Direccion || '')}</td>
                <td>${esc(c.Localidad || '')}</td>
                <td>${esc(c.Zona || '')}</td>
                <td>${esc(c.Vendedor || '')}</td>
                <td>${esc(c.Promotor || '')}</td>
                <td>${esc(c.Supervisor || '')}</td>
            </tr>`;
        }).join('');

        window.print();
    },

    exportCSV() {
        const clients = this.getFilteredPrintClients();
        if (clients.length === 0) { alert('No hay clientes para exportar.'); return; }

        const headers = ['Código', 'Razón Social', 'Dirección', 'Localidad', 'Zona', 'Vendedor', 'Promotor', 'Supervisor', 'Latitud', 'Longitud'];
        const rows = clients.map(c => [
            c.Codigo || c.ID,
            c.Nombre,
            c.Direccion || '',
            c.Localidad || '',
            c.Zona || '',
            c.Vendedor || '',
            c.Promotor || '',
            c.Supervisor || '',
            c.Latitud || '',
            c.Longitud || ''
        ]);

        // BOM for UTF-8 + CSV content
        let csv = '\uFEFF' + headers.join(';') + '\n';
        rows.forEach(row => {
            csv += row.map(cell => {
                let text = String(cell).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
                return `"${text}"`;
            }).join(';') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SURCALA_Clientes_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // --- CONFIG ---
    loadConfig() {
        let config = {};
        let freqColors = {
            'LU-JU': '#818cf8',
            'MA-VI': '#34d399',
            'MI-SA': '#fbbf24'
        };
        try {
            config = JSON.parse(localStorage.getItem('surcala_config') || '{}');
            freqColors = JSON.parse(localStorage.getItem('surcala_freq_colors')) || freqColors;
        } catch (e) {
            console.warn('No se pudo acceder a localStorage', e);
        }
        if (config.lat) document.getElementById('map-center-lat').value = config.lat;
        if (config.lng) document.getElementById('map-center-lng').value = config.lng;
        if (config.zoom) document.getElementById('map-zoom').value = config.zoom;
        
        document.getElementById('color-luju').value = freqColors['LU-JU'];
        document.getElementById('color-mavi').value = freqColors['MA-VI'];
        document.getElementById('color-misa').value = freqColors['MI-SA'];
    },

    saveConfig() {
        const config = {
            lat: parseFloat(document.getElementById('map-center-lat').value),
            lng: parseFloat(document.getElementById('map-center-lng').value),
            zoom: parseInt(document.getElementById('map-zoom').value)
        };
        const freqColors = {
            'LU-JU': document.getElementById('color-luju').value,
            'MA-VI': document.getElementById('color-mavi').value,
            'MI-SA': document.getElementById('color-misa').value
        };
        try {
            localStorage.setItem('surcala_config', JSON.stringify(config));
            localStorage.setItem('surcala_freq_colors', JSON.stringify(freqColors));
        } catch (e) {
            console.warn('No se pudo guardar en localStorage', e);
            alert('No se pudieron guardar los ajustes (puede deberse a permisos del navegador).');
        }
        document.getElementById('config-modal').classList.remove('active');
        localStorage.removeItem('surcala_map_lat');
        localStorage.removeItem('surcala_map_lng');
        localStorage.removeItem('surcala_map_zoom');
        window.location.reload(); // Recargar para aplicar colores en todo el sistema
    },

    async refreshData() {
        try {
            await DataService.loadData();
        } catch (e) {
            console.error('[Zonas Surcala] No se pudieron recargar los clientes:', e);
            alert('No se pudieron recargar los clientes (clientes.csv).');
            return;
        }
        MapManager.renderAll();
        this.renderUI();
    }
};

window.UI = UI;
