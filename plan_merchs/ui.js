// ============================================
// UI CONTROLLER - Sidebar, filters, print, config
// ============================================

const UI = {
    activePromotores: new Set(),
    activeMerchs: new Set(),
    activeFrequencies: new Set(),

    init() {
        this.initTheme();
        this.bindEvents();
        this.loadConfig();
    },

    initTheme() {
        const saved = localStorage.getItem('emcala_theme') || 'light';
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
        localStorage.setItem('emcala_theme', next);
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
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
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
        // Toggle all
        document.getElementById('toggle-all-promotores').onclick = () => this.toggleAllPromotores();
        document.getElementById('toggle-all-merchs').onclick = () => this.toggleAllMerchs();
        document.getElementById('toggle-all-frecuencias').onclick = () => this.toggleAllFrecuencias();
        // Config
        document.getElementById('btn-config').onclick = () => document.getElementById('config-modal').classList.add('active');
        document.getElementById('modal-close').onclick = () => document.getElementById('config-modal').classList.remove('active');
        document.getElementById('config-modal').onclick = (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); };
        document.getElementById('show-instructions').onclick = (e) => {
            e.preventDefault();
            const s = document.getElementById('instructions-section');
            s.style.display = s.style.display === 'none' ? 'block' : 'none';
        };
        document.getElementById('save-config').onclick = () => this.saveConfig();
        document.getElementById('load-demo').onclick = () => this.loadDemoData();
        document.getElementById('test-connection').onclick = () => this.testConnection();
        document.getElementById('btn-refresh').onclick = () => this.refreshData();
        // Print
        document.getElementById('print-promotor').onchange = () => this.updatePrintPreview();
        document.getElementById('print-merch').onchange = () => this.updatePrintPreview();
        document.getElementById('print-frecuencia').onchange = () => this.updatePrintPreview();
        document.getElementById('btn-print').onclick = () => this.printReport();
        document.getElementById('btn-export-csv').onclick = () => this.exportCSV();
        // Theme toggle
        document.getElementById('btn-theme').onclick = () => this.toggleTheme();
        // CRUD Modals
        document.getElementById('btn-new-client').onclick = () => this.openClientModal();
        document.getElementById('client-modal-close').onclick = () => this.closeClientModal();
        document.getElementById('client-form').onsubmit = (e) => this.submitClientForm(e);
    },

    // --- DATA RENDERING ---
    renderUI() {
        const { promotores, merchandisers, clientes } = DataService.data;
        // Stats
        document.querySelector('#stat-promotores span').textContent = promotores.length;
        document.querySelector('#stat-merchs span').textContent = merchandisers.length;
        document.querySelector('#stat-clientes span').textContent = clientes.length;
        // Activate all
        this.activePromotores = new Set(promotores.map(p => p.ID));
        this.activeMerchs = new Set(merchandisers.map(m => m.ID));
        this.activeFrequencies = new Set(DataService.data.frecuencias.map(f => f.Nombre));
        // Promotor filters
        const pList = document.getElementById('promotores-list');
        pList.innerHTML = promotores.map(p => {
            const count = clientes.filter(c => c.PromotorID === p.ID).length;
            return `<label class="filter-item active" data-id="${p.ID}">
                <input type="checkbox" checked data-type="promotor" data-id="${p.ID}">
                <span class="filter-color" style="background:${p.Color}"></span>
                <span class="filter-name">${p.Nombre}</span>
                <span class="filter-count">${count}</span>
            </label>`;
        }).join('');
        pList.querySelectorAll('input').forEach(cb => { cb.onchange = () => this.onPromotorToggle(cb.dataset.id, cb.checked); });
        // Merch filters
        const mList = document.getElementById('merchs-list');
        mList.innerHTML = merchandisers.map(m => {
            const count = clientes.filter(c => c.MerchID === m.ID).length;
            return `<label class="filter-item active" data-id="${m.ID}">
                <input type="checkbox" checked data-type="merch" data-id="${m.ID}">
                <span class="filter-color" style="background:${m.Color}"></span>
                <span class="filter-name">${m.Nombre}</span>
                <span class="filter-count">${count}</span>
            </label>`;
        }).join('');
        mList.querySelectorAll('input').forEach(cb => { cb.onchange = () => this.onMerchToggle(cb.dataset.id, cb.checked); });
        
        // Frecuencia filters
        const fList = document.getElementById('frecuencias-list');
        fList.innerHTML = DataService.data.frecuencias.map(f => {
            const count = clientes.filter(c => c.Frecuencia === f.Nombre).length;
            return `<label class="filter-item active" data-id="freq-${f.Nombre}">
                <input type="checkbox" checked data-type="frecuencia" data-id="${f.Nombre}">
                <span class="filter-color" style="background:${f.Color}"></span>
                <span class="filter-name">${f.Nombre}</span>
                <span class="filter-count">${count}</span>
            </label>`;
        }).join('');
        fList.querySelectorAll('input').forEach(cb => { cb.onchange = () => this.onFrecuenciaToggle(cb.dataset.id, cb.checked); });
        // Client list
        this.renderClientList(clientes);
        // Print dropdowns
        this.renderPrintDropdowns();
        this.updatePrintPreview();
    },

    renderClientList(clients) {
        const list = document.getElementById('clients-list');
        document.getElementById('client-count').textContent = `${clients.length} clientes`;
        if (clients.length === 0) { list.innerHTML = '<div class="loading-placeholder">No se encontraron clientes</div>'; return; }
        list.innerHTML = clients.map(c => {
            const merch = DataService.getMerch(c.MerchID);
            const promotor = DataService.getPromotor(c.PromotorID);
            return `<div class="client-item" data-lat="${c.Latitud}" data-lng="${c.Longitud}">
                <div class="client-item-header">
                    <span class="client-item-code">#${c.ID}</span>
                    <span class="client-item-name">${c.Nombre}</span>
                </div>
                <div class="client-item-addr">${c.Direccion || ''}</div>
                <div class="client-item-tags">
                    ${promotor ? `<span class="client-tag" style="background:${promotor.Color}">${promotor.Nombre}</span>` : ''}
                    ${merch ? `<span class="client-tag" style="background:${merch.Color}">${merch.Nombre}</span>` : ''}
                </div>
            </div>`;
        }).join('');
        list.querySelectorAll('.client-item').forEach(el => {
            el.onclick = () => {
                const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
                if (!isNaN(lat) && !isNaN(lng)) MapManager.flyToClient(lat, lng);
            };
        });
    },



    // --- FILTERS ---
    onPromotorToggle(id, checked) {
        checked ? this.activePromotores.add(id) : this.activePromotores.delete(id);
        const item = document.querySelector(`.filter-item[data-id="${id}"]`);
        item && item.classList.toggle('active', checked);
        MapManager.togglePromotorZone(id, checked);
        // Toggle associated merchs
        DataService.getMerchsByPromotor(id).forEach(m => {
            this.onMerchToggle(m.ID, checked);
            const cb = document.querySelector(`input[data-id="${m.ID}"]`);
            if (cb) cb.checked = checked;
            const mi = document.querySelector(`.filter-item[data-id="${m.ID}"]`);
            if (mi) mi.classList.toggle('active', checked);
        });
    },

    onMerchToggle(id, checked) {
        checked ? this.activeMerchs.add(id) : this.activeMerchs.delete(id);
        const item = document.querySelector(`.filter-item[data-id="${id}"]`);
        item && item.classList.toggle('active', checked);
        MapManager.toggleMerchZone(id, checked);
        this.applyClientFilters();
    },

    onFrecuenciaToggle(freq, checked) {
        checked ? this.activeFrequencies.add(freq) : this.activeFrequencies.delete(freq);
        const item = document.querySelector(`.filter-item[data-id="freq-${freq}"]`);
        item && item.classList.toggle('active', checked);
        this.applyClientFilters();
    },

    applyClientFilters() {
        const visibleIds = new Set();
        DataService.data.clientes.forEach(c => {
            if (this.activePromotores.has(c.PromotorID) && 
                this.activeMerchs.has(c.MerchID) && 
                this.activeFrequencies.has(c.Frecuencia)) {
                visibleIds.add(c.ID);
            }
        });
        const checkbox = document.getElementById('floating-show-clients');
        const globalShow = checkbox ? checkbox.checked : true;
        MapManager.updateClientVisibility(visibleIds, globalShow);
    },

    toggleAllPromotores() {
        const allActive = this.activePromotores.size === DataService.data.promotores.length;
        DataService.data.promotores.forEach(p => this.onPromotorToggle(p.ID, !allActive));
        document.querySelectorAll('input[data-type="promotor"]').forEach(cb => cb.checked = !allActive);
    },

    toggleAllMerchs() {
        const allActive = this.activeMerchs.size === DataService.data.merchandisers.length;
        DataService.data.merchandisers.forEach(m => {
            this.onMerchToggle(m.ID, !allActive);
            const cb = document.querySelector(`input[data-id="${m.ID}"]`);
            if (cb) cb.checked = !allActive;
        });
    },

    toggleAllFrecuencias() {
        const allActive = this.activeFrequencies.size === DataService.data.frecuencias.length;
        DataService.data.frecuencias.forEach(f => {
            this.onFrecuenciaToggle(f.Nombre, !allActive);
            const cb = document.querySelector(`input[data-type="frecuencia"][data-id="${f.Nombre}"]`);
            if (cb) cb.checked = !allActive;
        });
    },

    filterClients(query) {
        const q = query.toLowerCase().trim();
        const filtered = q ? DataService.data.clientes.filter(c =>
            c.Nombre.toLowerCase().includes(q) || (c.Direccion && c.Direccion.toLowerCase().includes(q))
        ) : DataService.data.clientes;
        this.renderClientList(filtered);
    },

    // --- PRINT ---
    renderPrintDropdowns() {
        const pSelect = document.getElementById('print-promotor');
        const mSelect = document.getElementById('print-merch');
        const fSelect = document.getElementById('print-frecuencia');
        pSelect.innerHTML = '<option value="">-- Todos los promotores --</option>' +
            DataService.data.promotores.map(p => `<option value="${p.ID}">${p.Nombre}</option>`).join('');
        mSelect.innerHTML = '<option value="">-- Todos los merchandisers --</option>' +
            DataService.data.merchandisers.map(m => `<option value="${m.ID}">${m.Nombre}</option>`).join('');
        fSelect.innerHTML = '<option value="">-- Todas las frecuencias --</option>' +
            DataService.data.frecuencias.map(f => `<option value="${f.Nombre}">${f.Nombre}</option>`).join('');
    },

    getFilteredPrintClients() {
        const pid = document.getElementById('print-promotor').value;
        const mid = document.getElementById('print-merch').value;
        const freq = document.getElementById('print-frecuencia').value;
        let clients = DataService.data.clientes;
        if (pid) clients = clients.filter(c => c.PromotorID === pid);
        if (mid) clients = clients.filter(c => c.MerchID === mid);
        if (freq) clients = clients.filter(c => c.Frecuencia === freq);
        return clients;
    },

    updatePrintPreview() {
        const clients = this.getFilteredPrintClients();
        document.getElementById('print-count').textContent = `${clients.length} clientes`;
        const list = document.getElementById('print-client-list');
        if (clients.length === 0) {
            list.innerHTML = '<div class="loading-placeholder">No hay clientes con los filtros seleccionados</div>';
            return;
        }
        // Compact table preview
        let html = '<table class="preview-table"><thead><tr>';
        html += '<th>Nro</th><th>Razón Social</th><th>Dirección</th><th>Frec.</th><th>Prio.</th>';
        html += '</tr></thead><tbody>';
        clients.forEach((c, i) => {
            html += `<tr>
                <td>${c.ID}</td>
                <td>${c.Nombre}</td>
                <td>${c.Direccion || ''}</td>
                <td>${c.Frecuencia !== 'Sin Frecuencia' ? c.Frecuencia : ''}</td>
                <td>${c.Prioridad || ''}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
    },

    printReport() {
        const clients = this.getFilteredPrintClients();
        if (clients.length === 0) { alert('No hay clientes para imprimir con los filtros seleccionados.'); return; }

        const pid = document.getElementById('print-promotor').value;
        const mid = document.getElementById('print-merch').value;
        const freq = document.getElementById('print-frecuencia').value;

        document.getElementById('print-date').textContent = `Generado: ${new Date().toLocaleString('es-AR')}`;
        let info = '';
        if (pid) { const p = DataService.getPromotor(pid); info += `<strong>Promotor:</strong> ${p ? p.Nombre : pid} | `; }
        if (mid) { const m = DataService.getMerch(mid); info += `<strong>Merch:</strong> ${m ? m.Nombre : mid} | `; }
        if (freq) { info += `<strong>Frecuencia:</strong> ${freq} | `; }
        info += `<strong>Total:</strong> ${clients.length} clientes`;
        document.getElementById('print-filters-info').innerHTML = info;

        const tbody = document.getElementById('print-table-body');
        tbody.innerHTML = clients.map(c => {
            return `<tr>
                <td>${c.ID}</td>
                <td>${c.Nombre}</td>
                <td>${c.Direccion || ''}</td>
                <td>${c.Frecuencia !== 'Sin Frecuencia' ? c.Frecuencia : ''}</td>
                <td>${c.Prioridad || ''}</td>
                <td>${c.Promotor !== 'Sin Promotor' ? c.Promotor : ''}</td>
                <td>${c.VentaPromedio || ''}</td>
                <td>${c.EDFs || ''}</td>
            </tr>`;
        }).join('');

        window.print();
    },

    exportCSV() {
        const clients = this.getFilteredPrintClients();
        if (clients.length === 0) { alert('No hay clientes para exportar.'); return; }

        const headers = ['Nro', 'Razón Social', 'Dirección', 'Frecuencia', 'Prioridad', 'Promotor', 'Merch', 'Venta Promedio', 'EDFs'];
        const rows = clients.map(c => [
            c.ID,
            c.Nombre,
            c.Direccion || '',
            c.Frecuencia !== 'Sin Frecuencia' ? c.Frecuencia : '',
            c.Prioridad || '',
            c.Promotor !== 'Sin Promotor' ? c.Promotor : '',
            c.Merch !== 'Sin Merch' ? c.Merch : '',
            c.VentaPromedio || '',
            c.EDFs || ''
        ]);

        // BOM for UTF-8 + CSV content
        let csv = '\uFEFF' + headers.join(';') + '\n';
        rows.forEach(row => {
            csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EMCALA_Clientes_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // --- CONFIG ---
    loadConfig() {
        let config = {};
        try {
            config = JSON.parse(localStorage.getItem('emcala_config') || '{}');
        } catch (e) {
            console.warn('No se pudo acceder a localStorage', e);
        }
        if (config.sheetsUrl) document.getElementById('sheets-url').value = config.sheetsUrl;
        if (config.lat) document.getElementById('map-center-lat').value = config.lat;
        if (config.lng) document.getElementById('map-center-lng').value = config.lng;
        if (config.zoom) document.getElementById('map-zoom').value = config.zoom;
        return config;
    },

    saveConfig() {
        const config = {
            sheetsUrl: document.getElementById('sheets-url').value.trim(),
            lat: parseFloat(document.getElementById('map-center-lat').value),
            lng: parseFloat(document.getElementById('map-center-lng').value),
            zoom: parseInt(document.getElementById('map-zoom').value)
        };
        try {
            localStorage.setItem('emcala_config', JSON.stringify(config));
        } catch (e) {
            console.warn('No se pudo guardar en localStorage', e);
            alert('No se pudieron guardar los ajustes (puede deberse a permisos del navegador).');
        }
        document.getElementById('config-modal').classList.remove('active');
        this.refreshData();
    },

    async testConnection() {
        const url = document.getElementById('sheets-url').value.trim();
        const status = document.getElementById('connection-status');
        if (!url) { status.className = 'connection-status error'; status.textContent = 'Ingresá una URL'; return; }
        status.className = 'connection-status'; status.style.display = 'block';
        status.textContent = 'Probando conexión...'; status.style.color = 'var(--text-muted)';
        const ok = await DataService.loadFromAPI(url);
        if (ok) {
            status.className = 'connection-status success';
            status.textContent = `✓ Conectado - ${DataService.data.promotores.length} promotores, ${DataService.data.merchandisers.length} merchs, ${DataService.data.clientes.length} clientes`;
        } else {
            status.className = 'connection-status error';
            status.textContent = '✗ Error de conexión. Verificá la URL y que el script esté desplegado.';
        }
    },

    async refreshData() {
        let config = {};
        try {
            config = JSON.parse(localStorage.getItem('emcala_config') || '{}');
        } catch (e) {}
        if (config.sheetsUrl) {
            const ok = await DataService.loadFromAPI(config.sheetsUrl);
            if (!ok) {
                alert('No se pudo cargar la base de datos desde Google Sheets. Verificá la URL o los permisos. Se cargarán datos de prueba.');
                DataService.loadDemo();
            }
        } else {
            DataService.loadDemo();
        }
        MapManager.renderAll();
        this.renderUI();
    },

    loadDemoData() {
        DataService.loadDemo();
        MapManager.renderAll();
        this.renderUI();
        document.getElementById('config-modal').classList.remove('active');
    },
    
    // --- CRUD OPERATIONS ---
    openClientModal(clientId = null) {
        const modal = document.getElementById('client-modal');
        const form = document.getElementById('client-form');
        form.reset();
        
        if (clientId) {
            const client = DataService.data.clientes.find(c => c.ID === clientId);
            if (client) {
                document.getElementById('client-modal-title').textContent = 'Editar Cliente';
                document.getElementById('client-original-codigo').value = client.Codigo || client.ID;
                document.getElementById('client-original-nombre').value = client.Nombre;
                
                document.getElementById('client-codigo').value = client.Codigo || client.ID;
                document.getElementById('client-nombre').value = client.Nombre || '';
                document.getElementById('client-direccion').value = client.Direccion || '';
                document.getElementById('client-lat').value = client.Latitud || '';
                document.getElementById('client-lng').value = client.Longitud || '';
                document.getElementById('client-promotor').value = client.Promotor === 'Sin Promotor' ? '' : client.Promotor;
                document.getElementById('client-merch').value = client.Merch === 'Sin Merch' ? '' : client.Merch;
                document.getElementById('client-frecuencia').value = client.Frecuencia === 'Sin Frecuencia' ? '' : client.Frecuencia;
                document.getElementById('client-prioridad').value = client.Prioridad || '';
                document.getElementById('client-telefono').value = client.Telefono || '';
                document.getElementById('client-notas').value = client.Notas || '';
            }
        } else {
            document.getElementById('client-modal-title').textContent = 'Nuevo Cliente';
            document.getElementById('client-original-codigo').value = '';
            document.getElementById('client-original-nombre').value = '';
        }
        
        modal.style.display = 'flex';
    },
    
    closeClientModal() {
        document.getElementById('client-modal').style.display = 'none';
    },
    
    async submitClientForm(e) {
        e.preventDefault();
        const originalCodigo = document.getElementById('client-original-codigo').value;
        const originalNombre = document.getElementById('client-original-nombre').value;
        const isEdit = !!originalNombre;
        
        const data = {
            codigo: document.getElementById('client-codigo').value,
            razon_social: document.getElementById('client-nombre').value,
            direccion: document.getElementById('client-direccion').value,
            latitud: document.getElementById('client-lat').value,
            longitud: document.getElementById('client-lng').value,
            promotor: document.getElementById('client-promotor').value,
            merch: document.getElementById('client-merch').value,
            frecuencia: document.getElementById('client-frecuencia').value,
            prioridad: document.getElementById('client-prioridad').value,
            telefono: document.getElementById('client-telefono').value,
            notas: document.getElementById('client-notas').value
        };
        
        if (isEdit) {
            data.original_codigo = originalCodigo;
            data.original_nombre = originalNombre;
        }
        
        document.getElementById('global-loader').style.display = 'flex';
        this.closeClientModal();
        
        try {
            await DataService.saveClient(isEdit ? 'edit' : 'add', data);
            await this.refreshData(); // Recargar datos para mostrar los cambios
        } catch (error) {
            alert(error.message);
        } finally {
            document.getElementById('global-loader').style.display = 'none';
        }
    },
    
    async deleteClient(clientId) {
        const client = DataService.data.clientes.find(c => c.ID === clientId);
        if (!client) return;
        
        if (!confirm(`¿Estás seguro de eliminar a "${client.Nombre}"?`)) return;
        
        document.getElementById('global-loader').style.display = 'flex';
        try {
            await DataService.saveClient('delete', {
                original_codigo: client.Codigo || client.ID,
                original_nombre: client.Nombre
            });
            await this.refreshData();
        } catch (error) {
            alert(error.message);
        } finally {
            document.getElementById('global-loader').style.display = 'none';
        }
    }
};

window.UI = UI;
