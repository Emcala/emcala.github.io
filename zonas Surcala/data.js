// ============================================
// DATA SERVICE - Zonas Surcala
// Los clientes se cargan desde clientes.csv (mismo directorio).
// Para actualizar las mesas: reemplazar ese archivo, sin tocar código.
// ============================================


function generateColor(index) {
    // Generate distinct colors for all using HSL and the Golden Ratio
    // This ensures no two colors are identical (which happened with the previous 15-color palette limit)
    const goldenRatioConjugate = 0.618033988749895;
    let h = (index * goldenRatioConjugate) % 1;
    h = Math.floor(h * 360);
    // Vary saturation and lightness slightly to add more contrast between adjacent indices
    let s = 65 + (index % 4) * 10; // 65% to 95%
    let l = 45 + (index % 3) * 10; // 45% to 65%
    return `hsl(${h}, ${s}%, ${l}%)`;
}

function parseCoordinate(coordStr) {
    if (!coordStr) return NaN;
    let str = String(coordStr).trim();
    if (str.includes(',')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else {
        let parts = str.split('.');
        if (parts.length > 2) {
            str = parts[0] + '.' + parts.slice(1).join('');
        }
    }
    let num = parseFloat(str);
    if (!isNaN(num) && (num > 180 || num < -180)) {
        let absStr = String(Math.abs(Math.round(num)));
        if (absStr.length > 2) {
            let recoveredStr = absStr.substring(0, 2) + '.' + absStr.substring(2);
            num = parseFloat(recoveredStr) * (num < 0 ? -1 : 1);
        }
    }
    return num;
}

// BDR y MAYO no son supervisores: cada uno es su propio rol (ver emcala-config.js)
function esRolEspecial(nombre) {
    return (typeof EMCALA_NO_SPV !== 'undefined') &&
           EMCALA_NO_SPV.indexOf(String(nombre || '').trim().toUpperCase()) > -1;
}

const DataService = {
    data: { supervisores: [], promotores: [], clientes: [], localidades: [] },

    async loadData() {
        // cache:'no-cache' evita que GitHub Pages sirva una copia vieja del CSV.
        const res = await fetch('clientes.csv', { cache: 'no-cache' });
        if (!res.ok) throw new Error('No se pudo cargar clientes.csv (HTTP ' + res.status + ')');
        const parsed = this.parseClientesCsv(await res.text());
        if (parsed.length === 0) {
            throw new Error('clientes.csv no tiene filas de datos (¿se rompió el export?)');
        }
        this.processRawClients(parsed);
    },

    // Convierte clientes.csv (delimitador ';') al formato que espera processRawClients().
    parseClientesCsv(text) {
        const lineas = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
        if (lineas.length < 2) return [];

        // Buscar la línea de encabezado en las primeras 5 líneas (por si hay separadores arriba).
        let idxHeader = -1;
        const buscar = Math.min(lineas.length, 5);
        for (let i = 0; i < buscar; i++) {
            if (/codigo/i.test(lineas[i])) { idxHeader = i; break; }
        }
        if (idxHeader === -1) {
            throw new Error('clientes.csv: no se encontró el encabezado esperado (columna "codigo") en las primeras 5 líneas');
        }
        const headers = lineas[idxHeader].split(';').map(h => h.trim().toLowerCase());
        const pos = (nombre) => headers.indexOf(nombre.toLowerCase());

        // Columna del CSV -> campo que usa processRawClients()
        const esperadas = {
            codigo:       pos('codigo'),
            razon_social: pos('razon_social'),
            direccion:    pos('direccion'),
            zona:         pos('zona'),
            vendedor:     pos('vendedor'),
            localidad:    pos('localidad'),
            latitud:      pos('latitud'),
            longitud:     pos('longitud'),
            frecuencia:   pos('dia de visita'),
            promotor:     pos('promotor'),
            supervisor:   pos('supervisor')
        };
        const faltantes = Object.entries(esperadas).filter(([, idx]) => idx === -1).map(([k]) => k);
        if (faltantes.length > 0) {
            console.warn('[Zonas Surcala] Columnas faltantes en clientes.csv (llegarán vacías): ' + faltantes.join(', '));
        }
        const campos = esperadas;

        const out = [];
        for (let i = idxHeader + 1; i < lineas.length; i++) {
            const fila = lineas[i].split(';');
            const obj = {};
            for (const campo in campos) {
                const j = campos[campo];
                obj[campo] = (j >= 0 && fila[j] !== undefined) ? fila[j].trim() : '';
            }
            if (obj.codigo || obj.razon_social) out.push(obj);
        }
        return out;
    },

    buildStructure(rawClients) {
        let sMap = {};
        let pMap = {};
        let supervisores = [];
        let promotores = [];
        let clientes = [];
        let localidadesSet = new Set();

        // Read from localStorage if available (only once)
        let customColors = { 'LU-JU': '#818cf8', 'MA-VI': '#34d399', 'MI-SA': '#fbbf24' };
        try {
            const savedColors = localStorage.getItem('surcala_freq_colors');
            if (savedColors) customColors = JSON.parse(savedColors);
        } catch(e) {}

        rawClients.forEach(row => {
            const getVal = (key) => {
                let v = row[key];
                return (v !== undefined && v !== null) ? String(v).trim() : '';
            };

            const supervisorName = getVal('supervisor') || 'Sin Supervisor';
            const promotorName = getVal('promotor') || 'Sin Promotor';
            const vendedorVal = getVal('vendedor') || '';
            const localidadVal = getVal('localidad') || '';
            const latRaw = getVal('latitud');
            const lngRaw = getVal('longitud');

            // Create Supervisor
            let sId = sMap[supervisorName];
            if (!sId) {
                sId = 'S' + (supervisores.length + 1);
                sMap[supervisorName] = sId;
                supervisores.push({
                    ID: sId,
                    Nombre: supervisorName,
                    Color: generateColor(supervisores.length),
                    EsSpv: !esRolEspecial(supervisorName),
                    Zona: ''
                });
            }

            // Create Promotor
            let pId = pMap[promotorName];
            if (!pId) {
                pId = 'P' + (promotores.length + 1);
                pMap[promotorName] = pId;
                promotores.push({
                    ID: pId,
                    Nombre: promotorName,
                    Color: generateColor(promotores.length),
                    SupervisorID: sId,
                    Zona: ''
                });
            }

            if (localidadVal) localidadesSet.add(localidadVal);

            const codigoVal = getVal('codigo') || ('C' + clientes.length);
            const freqStr = (getVal('frecuencia') || '').toUpperCase().trim();
            let freqGroup = 'Sin Frecuencia';
            let freqColor = '#e2e8f0'; // very light gray

            if (freqStr) {
                // Tokenizar: separar por , / espacio guión y mapear primeros 3 chars
                const dayMap = { LUN: 'LU', MAR: 'MA', MIE: 'MI', MIÉ: 'MI', JUE: 'JU', VIE: 'VI', SAB: 'SA', SÁB: 'SA', DOM: 'DO' };
                const tokens = freqStr.split(/[,\/\s\-]+/).filter(Boolean);
                const dias = new Set();
                tokens.forEach(t => {
                    const prefix = t.substring(0, 3);
                    if (dayMap[prefix]) dias.add(dayMap[prefix]);
                });
                if ((dias.has('LU') || dias.has('JU')) && !dias.has('MA') && !dias.has('MI') && !dias.has('VI') && !dias.has('SA')) {
                    freqGroup = 'LU-JU';
                    freqColor = customColors['LU-JU'] || '#818cf8';
                } else if ((dias.has('MA') || dias.has('VI')) && !dias.has('LU') && !dias.has('MI') && !dias.has('JU') && !dias.has('SA')) {
                    freqGroup = 'MA-VI';
                    freqColor = customColors['MA-VI'] || '#34d399';
                } else if ((dias.has('MI') || dias.has('SA')) && !dias.has('LU') && !dias.has('MA') && !dias.has('JU') && !dias.has('VI')) {
                    freqGroup = 'MI-SA';
                    freqColor = customColors['MI-SA'] || '#fbbf24';
                } else if (dias.size > 0) {
                    freqGroup = freqStr;
                }
            }

            clientes.push({
                ID: codigoVal,
                Codigo: codigoVal,
                Nombre: getVal('razon_social') || 'Cliente sin nombre',
                Direccion: getVal('direccion') + (localidadVal ? ' - ' + localidadVal : ''),
                Latitud: parseCoordinate(latRaw),
                Longitud: parseCoordinate(lngRaw),
                SupervisorID: sId,
                PromotorID: pId,
                Supervisor: supervisorName,
                Promotor: promotorName,
                Vendedor: vendedorVal,
                Zona: getVal('zona'),
                Localidad: localidadVal,
                Frecuencia: freqStr,
                FrecuenciaGrupo: freqGroup,
                FrecuenciaColor: freqColor
            });
        });

        // Diagnóstico: promotores que figuran bajo más de un supervisor.
        const spvPorPromotor = {};
        rawClients.forEach(row => {
            const prom = (row.promotor || '').trim();
            const sup = (row.supervisor || '').trim();
            if (!prom || !sup) return;
            (spvPorPromotor[prom] = spvPorPromotor[prom] || new Set()).add(sup);
        });
        Object.keys(spvPorPromotor).forEach(prom => {
            if (spvPorPromotor[prom].size > 1) {
                console.warn('[Zonas Surcala] El promotor "' + prom + '" figura bajo varios supervisores: '
                    + Array.from(spvPorPromotor[prom]).join(' / ') + '. Se agrupa bajo el primero que aparece.');
            }
        });

        // Build localidades array for filters
        const localidades = [...localidadesSet].sort().map((l, i) => ({ Nombre: l, Color: generateColor(i + 7) }));

        const validCoords = clientes.filter(c => !isNaN(c.Latitud) && !isNaN(c.Longitud));
        console.log('Datos cargados: ' + supervisores.length + ' supervisores, ' + promotores.length + ' promotores, ' + clientes.length + ' clientes (' + validCoords.length + ' con coordenadas)');

        // Tarea 9: detectar acentos corruptos (mojibake)
        let mojibakeCount = 0;
        rawClients.forEach(row => {
            ['razon_social', 'direccion', 'localidad'].forEach(campo => {
                const v = row[campo] || '';
                if (/[\u00C3\u00C2]/.test(v)) mojibakeCount++;
            });
        });
        if (mojibakeCount > 0) {
            console.warn('[Zonas Surcala] La base parece tener el encoding roto: ' + mojibakeCount
                + ' registros con secuencias "Ã"/"Â" (probablemente se abrió el CSV en Excel). Volvé a exportar desde Google Sheets como "CSV UTF-8".');
        }

        // Tarea 11: resumen de calidad por consola (solo si hay problemas)
        const sinCoords = clientes.length - validCoords.length;
        if (sinCoords > 0) {
            console.warn('[Zonas Surcala] ' + sinCoords + ' clientes sin coordenadas válidas.');
        }
        const sinPromotor = clientes.filter(c => c.Promotor === 'Sin Promotor').length;
        if (sinPromotor > 0) {
            console.warn('[Zonas Surcala] ' + sinPromotor + ' clientes sin promotor asignado.');
        }
        const sinSupervisor = clientes.filter(c => c.Supervisor === 'Sin Supervisor').length;
        if (sinSupervisor > 0) {
            console.warn('[Zonas Surcala] ' + sinSupervisor + ' clientes sin supervisor asignado.');
        }
        const codigosVistos = {};
        const duplicados = [];
        clientes.forEach(c => {
            if (codigosVistos[c.Codigo]) duplicados.push(c.Codigo);
            else codigosVistos[c.Codigo] = true;
        });
        if (duplicados.length > 0) {
            const uniq = [...new Set(duplicados)];
            console.warn('[Zonas Surcala] ' + duplicados.length + ' clientes con código duplicado (' + uniq.slice(0, 10).join(', ') + (uniq.length > 10 ? '...' : '') + ').');
        }

        return { supervisores, promotores, clientes, localidades }; // Sin vendedores porque la version en Google Drive no lo declara
    },

    // Carga inicial: guarda las filas crudas (para la simulación) y arma la estructura REAL.
    processRawClients(rawClients) {
        this.rawRows = rawClients;
        this.dataReal = this.buildStructure(rawClients);
        this.data = this.dataReal;
        this.byId = new Map(this.data.clientes.map(c => [c.ID, c]));
        this.isLoaded = true;
    },

    // ============================================================
    // SIMULACIÓN — cambios "what-if" sin tocar la base real
    // ============================================================
    escenario: null,       // { activo: bool, reglas: [...] }

    getEscenario() {
        if (!this.escenario) {
            try { this.escenario = JSON.parse(localStorage.getItem('surcala_escenario') || 'null'); }
            catch (e) { this.escenario = null; }
        }
        if (!this.escenario || !Array.isArray(this.escenario.reglas)) {
            this.escenario = { activo: false, reglas: [] };
        }
        return this.escenario;
    },

    persistirEscenario() {
        try { localStorage.setItem('surcala_escenario', JSON.stringify(this.getEscenario())); } catch (e) {}
    },

    // A qué clientes aplica una regla (siempre evaluado sobre la base REAL)
    clientesDeRegla(regla) {
        const codigos = new Set();
        const base = this.dataReal || this.data;
        if (!base) return codigos;
        if (regla.tipo === 'zona') {
            const zona = this.getCustomZones().find(z => z.id === regla.zonaId);
            if (zona) this.getClientsInGeometry(zona.geometry).forEach(c => codigos.add(String(c.Codigo || c.ID)));
        } else if (regla.tipo === 'seleccion') {
            (regla.clienteIds || []).forEach(id => codigos.add(String(id)));
        } else if (regla.tipo === 'promotor') {
            base.clientes.filter(c => c.Promotor === regla.promotorOrigen)
                .forEach(c => codigos.add(String(c.Codigo || c.ID)));
        }
        return codigos;
    },

    // Aplica las reglas a una copia de las filas crudas y reconstruye la estructura
    aplicarEscenario() {
        if (!this.rawRows) return;
        const escenario = this.getEscenario();
        const rows = this.rawRows.map(r => Object.assign({}, r));

        if (escenario.activo && escenario.reglas.length) {
            const idx = new Map();
            rows.forEach((r, i) => idx.set(String(r.codigo), i));
            escenario.reglas.forEach(regla => {
                this.clientesDeRegla(regla).forEach(cod => {
                    const i = idx.get(String(cod));
                    if (i === undefined) return;
                    if (regla.nuevoSupervisor) rows[i].supervisor = regla.nuevoSupervisor;
                    if (regla.nuevoPromotor)   rows[i].promotor   = regla.nuevoPromotor;
                    if (regla.nuevaFrecuencia) rows[i].frecuencia = regla.nuevaFrecuencia;
                });
            });
        }

        this.dataSim = this.buildStructure(rows);
        this.data = escenario.activo ? this.dataSim : this.dataReal;
        this.byId = new Map(this.data.clientes.map(c => [c.ID, c]));
    },

    // Comparativo real vs simulado
    compararEscenario() {
        const contar = (d) => {
            if (!d) return { spv: 0, bdr: 0, mayo: 0, promotores: 0, clientes: 0 };
            const spv = new Set(), esp = new Set();
            d.clientes.forEach(c => {
                const s = d.supervisores.find(x => x.ID === c.SupervisorID);
                if (!s) return;
                if (s.EsSpv) spv.add(c.SupervisorID); else esp.add(s.Nombre);
            });
            return {
                spv: spv.size,
                bdr: esp.has('BDR') ? 1 : 0,
                mayo: esp.has('MAYO') ? 1 : 0,
                promotores: new Set(d.clientes.map(c => c.PromotorID)).size,
                clientes: d.clientes.length
            };
        };
        const antes = contar(this.dataReal);
        const despues = contar(this.dataSim || this.dataReal);

        let movidos = 0;
        if (this.dataReal && this.dataSim) {
            const realPorCod = new Map(this.dataReal.clientes.map(c => [String(c.Codigo), c]));
            this.dataSim.clientes.forEach(c => {
                const r = realPorCod.get(String(c.Codigo));
                if (!r) return;
                if (r.Promotor !== c.Promotor || r.Supervisor !== c.Supervisor || r.FrecuenciaGrupo !== c.FrecuenciaGrupo) movidos++;
            });
        }
        return { antes, despues, movidos };
    },

    getSupervisor(id) { return this.data.supervisores.find(s => s.ID === id); },
    getPromotor(id) { return this.data.promotores.find(p => p.ID === id); },
    getClientsByPromotor(pid) { return this.data.clientes.filter(c => c.PromotorID === pid); },
    // Clientes que caen dentro de una geometría (polígono) dibujada
    getClientsInGeometry(geometry) {
        if (!geometry) return [];
        return this.data.clientes.filter(c =>
            !isNaN(c.Latitud) && !isNaN(c.Longitud) &&
            turf.booleanPointInPolygon(
                turf.point([c.Longitud, c.Latitud]),
                { type: 'Feature', geometry: geometry, properties: {} }
            )
        );
    },
    // `filtroIds` (opcional): limita el conteo a los clientes que pasan
    // la herramienta de selección (UI.activeClients).
    getZoneStats(geometry, filtroIds) {
        let clientes = this.getClientsInGeometry(geometry);
        if (filtroIds) clientes = clientes.filter(c => filtroIds.has(c.ID));

        const spvIds = new Set();
        const especiales = new Set();
        clientes.forEach(c => {
            const sup = this.getSupervisor(c.SupervisorID);
            if (!sup) return;
            if (sup.EsSpv) spvIds.add(c.SupervisorID);
            else especiales.add(sup.Nombre);
        });

        return {
            clientes: clientes.length,
            promotores: new Set(clientes.map(c => c.PromotorID)).size,
            supervisores: spvIds.size,
            especiales: [...especiales].sort()
        };
    },

    searchClients(query) {
        const q = query.toLowerCase().trim();
        if (!q) return this.data.clientes;
        
        const terms = q.split(/\s+/);
        return this.data.clientes.filter(c => {
            const searchString = [
                c.Nombre,
                c.Codigo,
                c.Direccion,
                c.Localidad,
                c.Promotor,
                c.Supervisor
            ].filter(Boolean).join(' ').toLowerCase();
            
            return terms.every(term => searchString.includes(term));
        });
    },

    // Custom Zones Management
    getCustomZones() {
        const zonesStr = localStorage.getItem('surcala_custom_zones');
        if (zonesStr) {
            try {
                return JSON.parse(zonesStr);
            } catch(e) {
                console.error("Error parsing custom zones", e);
                return [];
            }
        }
        return [];
    },

    saveCustomZone(zone) {
        const zones = this.getCustomZones();
        // Give it an ID if it doesn't have one
        if (!zone.id) {
            zone.id = 'zone_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        }
        // default visibility
        if (typeof zone.visible === 'undefined') {
            zone.visible = true;
        }
        zones.push(zone);
        localStorage.setItem('surcala_custom_zones', JSON.stringify(zones));
        return zone;
    },

    deleteCustomZone(id) {
        const zones = this.getCustomZones();
        const updatedZones = zones.filter(z => z.id !== id);
        localStorage.setItem('surcala_custom_zones', JSON.stringify(updatedZones));
    },

    toggleCustomZoneVisibility(id) {
        const zones = this.getCustomZones();
        const zone = zones.find(z => z.id === id);
        if (zone) {
            zone.visible = !zone.visible;
            localStorage.setItem('surcala_custom_zones', JSON.stringify(zones));
        }
    }
};

