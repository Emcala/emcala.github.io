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
        // Tree Toggle all
        document.getElementById('toggle-all-tree').onclick = (e) => this.toggleAllTree(e.target);
        // Tree Group Mode
        const groupModeSelect = document.getElementById('tree-group-mode');
        if (groupModeSelect) {
            groupModeSelect.onchange = () => {
                this.renderTreeFilters();
                this.applyTreeFilters();
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
            html += `
            <div class="tree-node level-1" style="display:flex; align-items:center; justify-content:space-between; padding: 8px; border-bottom: 1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div style="width:16px; height:16px; border-radius:3px; background:${esc(z.color)}"></div>
                    <span style="font-size:13px; font-weight:500;">${esc(z.name)}</span>
                </div>
                <div style="display:flex; gap: 8px;">
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

    // --- DATA RENDERING ---
    renderUI() {
        this.renderTreeFilters();
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
                const id = el.dataset.id;
                const c = DataService.data.clientes.find(cli => cli.ID == id);
                if (c) MapManager.flyToClient(c);
            };
        });
    },


    // --- TREE FILTERS ---
    renderTreeFilters() {
        const { supervisores, promotores, clientes } = DataService.data;
        const treeList = document.getElementById('tree-filters-list');
        
        // Initialize active clients with all clients
        this.activeClients = new Set(clientes.map(c => c.ID));

        const groupModeSelect = document.getElementById('tree-group-mode');
        const mode = groupModeSelect ? groupModeSelect.value : 'supervisor';

        let html = '';
        
        if (mode === 'supervisor') {
            supervisores.forEach(sup => {
                const supClientes = clientes.filter(c => c.SupervisorID === sup.ID);
                const promIds = new Set(supClientes.map(c => c.PromotorID));
                const supPromotores = promotores.filter(p => promIds.has(p.ID));
                if (supClientes.length === 0) return;

                html += `
                <div class="tree-node level-1">
                    <div class="tree-header">
                        <div class="tree-toggle"><i class="fas fa-chevron-right"></i></div>
                        <div class="tree-checkbox-wrap">
                            <input type="checkbox" class="tree-checkbox" data-level="sup" value="${sup.ID}" checked>
                        </div>
                        <div class="tree-color" style="background:${sup.Color}"></div>
                        <div class="tree-name">${esc(sup.Nombre)}</div>
                        <div class="tree-count">${supClientes.length}</div>
                    </div>
                    <div class="tree-children">
                `;

                supPromotores.forEach(prom => {
                    const promClientes = supClientes.filter(c => c.PromotorID === prom.ID);
                    if (promClientes.length === 0) return;

                    // Group by Frecuencia
                    const freqGroups = {};
                    promClientes.forEach(c => {
                        const f = c.FrecuenciaGrupo;
                        if(!freqGroups[f]) freqGroups[f] = { clients: [], color: c.FrecuenciaColor, name: c.Frecuencia || f };
                        freqGroups[f].clients.push(c);
                    });

                    html += `
                    <div class="tree-node level-2">
                        <div class="tree-header">
                            <div class="tree-toggle"><i class="fas fa-chevron-right"></i></div>
                            <div class="tree-checkbox-wrap">
                                <input type="checkbox" class="tree-checkbox" data-level="prom" value="${prom.ID}" checked>
                            </div>
                            <div class="tree-color" style="background:${prom.Color}"></div>
                            <div class="tree-name">${esc(prom.Nombre)}</div>
                            <div class="tree-count">${promClientes.length}</div>
                        </div>
                        <div class="tree-children">
                    `;

                    for (const [freq, groupData] of Object.entries(freqGroups)) {
                        html += `
                        <div class="tree-node level-3">
                            <div class="tree-header">
                                <div class="tree-toggle"><i class="fas fa-chevron-right"></i></div>
                                <div class="tree-checkbox-wrap">
                                    <input type="checkbox" class="tree-checkbox" data-level="freq" value="${prom.ID}-${freq}" checked>
                                </div>
                                <div class="tree-color" style="background:${groupData.color}"></div>
                                <div class="tree-name">${freq}</div>
                                <div class="tree-count">${groupData.clients.length}</div>
                            </div>
                            <div class="tree-children">
                        `;

                        groupData.clients.forEach(c => {
                            html += `
                            <div class="tree-node empty level-4">
                                <div class="tree-header">
                                    <div class="tree-toggle"></div>
                                    <div class="tree-checkbox-wrap">
                                        <input type="checkbox" class="tree-checkbox" data-level="cli" value="${c.ID}" checked>
                                    </div>
                                    <div class="tree-name">#${esc(c.Codigo || c.ID)} - ${esc(c.Nombre)}</div>
                                </div>
                            </div>
                            `;
                        });

                        html += `</div></div>`; // End Freq
                    }

                    html += `</div></div>`; // End Promotor
                });

                html += `</div></div>`; // End Supervisor
            });
        } else if (mode === 'frecuencia') {
            const freqGroups = {};
            clientes.forEach(c => {
                const f = c.FrecuenciaGrupo || 'Sin Frecuencia';
                if (!freqGroups[f]) freqGroups[f] = { clients: [], color: c.FrecuenciaColor, name: f };
                freqGroups[f].clients.push(c);
            });

            for (const [freq, groupData] of Object.entries(freqGroups)) {
                if (groupData.clients.length === 0) continue;

                html += `
                <div class="tree-node level-1">
                    <div class="tree-header">
                        <div class="tree-toggle"><i class="fas fa-chevron-right"></i></div>
                        <div class="tree-checkbox-wrap">
                            <input type="checkbox" class="tree-checkbox" data-level="freq-top" value="${freq}" checked>
                        </div>
                        <div class="tree-color" style="background:${groupData.color}"></div>
                        <div class="tree-name">${freq}</div>
                        <div class="tree-count">${groupData.clients.length}</div>
                    </div>
                    <div class="tree-children">
                `;

                const promGroups = {};
                groupData.clients.forEach(c => {
                    const p = c.PromotorID;
                    const prom = DataService.getPromotor(p);
                    if (!promGroups[p]) promGroups[p] = { 
                        clients: [], 
                        color: prom ? prom.Color : '#666', 
                        name: prom ? prom.Nombre : 'Sin Promotor' 
                    };
                    promGroups[p].clients.push(c);
                });

                for (const [promId, promData] of Object.entries(promGroups)) {
                    if (promData.clients.length === 0) continue;

                    html += `
                    <div class="tree-node level-2">
                        <div class="tree-header">
                            <div class="tree-toggle"><i class="fas fa-chevron-right"></i></div>
                            <div class="tree-checkbox-wrap">
                                <input type="checkbox" class="tree-checkbox" data-level="prom-sub" value="${promId}-${freq}" checked>
                            </div>
                            <div class="tree-color" style="background:${promData.color}"></div>
                            <div class="tree-name">${promData.name}</div>
                            <div class="tree-count">${promData.clients.length}</div>
                        </div>
                        <div class="tree-children">
                    `;

                    promData.clients.forEach(c => {
                        html += `
                        <div class="tree-node empty level-3">
                            <div class="tree-header">
                                <div class="tree-toggle"></div>
                                <div class="tree-checkbox-wrap">
                                    <input type="checkbox" class="tree-checkbox" data-level="cli" value="${c.ID}" checked>
                                </div>
                                <div class="tree-name">#${esc(c.Codigo || c.ID)} - ${esc(c.Nombre)}</div>
                            </div>
                        </div>
                        `;
                    });

                    html += `</div></div>`; // End Promotor
                }

                html += `</div></div>`; // End Frecuencia
            }
        }

        treeList.innerHTML = html;
        this.bindTreeEvents();
    },

    bindTreeEvents() {
        const treeList = document.getElementById('tree-filters-list');
        
        // Accordion toggle
        treeList.querySelectorAll('.tree-header').forEach(header => {
            header.onclick = (e) => {
                // Don't toggle accordion if clicking on checkbox
                if (e.target.tagName.toLowerCase() === 'input') return;
                const node = header.closest('.tree-node');
                if (!node.classList.contains('empty')) {
                    node.classList.toggle('expanded');
                }
            };
        });

        // Checkbox cascade
        treeList.querySelectorAll('.tree-checkbox').forEach(cb => {
            cb.onchange = (e) => {
                const checked = e.target.checked;
                const node = e.target.closest('.tree-node');
                
                // Cascade DOWN: check/uncheck all children
                node.querySelectorAll('.tree-checkbox').forEach(childCb => {
                    childCb.checked = checked;
                });

                // Cascade UP: if a child is unchecked, uncheck parents. If checked, check if all siblings are checked
                this.updateParentCheckboxes(node);
                
                this.applyTreeFilters();
            };
        });
    },

    updateParentCheckboxes(node) {
        let parentNode = node.parentElement.closest('.tree-node');
        while (parentNode) {
            const parentCb = parentNode.querySelector(':scope > .tree-header .tree-checkbox');
            if (parentCb) {
                const siblingCbs = parentNode.querySelectorAll(':scope > .tree-children > .tree-node > .tree-header .tree-checkbox');
                let allChecked = true;
                let someChecked = false;
                siblingCbs.forEach(cb => {
                    if (cb.checked) someChecked = true;
                    else allChecked = false;
                });
                parentCb.checked = allChecked;
                // We could add indeterminate state here if someChecked && !allChecked, but simple true/false works for now.
            }
            parentNode = parentNode.parentElement.closest('.tree-node');
        }
    },

    applyTreeFilters() {
        this.activeClients.clear();
        const clientCbs = document.querySelectorAll('.tree-checkbox[data-level="cli"]');
        clientCbs.forEach(cb => {
            if (cb.checked) {
                this.activeClients.add(cb.value);
            }
        });
        
        const checkbox = document.getElementById('floating-show-clients');
        const globalShow = checkbox ? checkbox.checked : true;
        
        MapManager.updateClientVisibility(this.activeClients, globalShow);
    },

    toggleAllTree(btn) {
        const checkAll = btn.textContent === 'Marcar Todos';
        document.querySelectorAll('.tree-checkbox').forEach(cb => cb.checked = checkAll);
        btn.textContent = checkAll ? 'Desmarcar Todos' : 'Marcar Todos';
        this.applyTreeFilters();
    },

    applyClientFilters() {
        // Kept for floating layer backwards compatibility
        this.applyTreeFilters();
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
        previewClients.forEach((c, i) => {
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

        return config;
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
