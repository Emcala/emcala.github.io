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

// ── Supabase (refresca el access_token antes de cada llamada al GAS) ──
const SUPABASE_URL = 'https://tdwdqgtnyqnsigzhhxsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2RxZ3RueXFuc2lnemhoeHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwOTE3NDcsImV4cCI6MjA5ODY2Nzc0N30.aiYnQ3g1HIk1e4G89sODitBqtPlzva_akCz5ruvLw-8';
const supabaseClient = (typeof window !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const DataService = {
    data: { supervisores: [], promotores: [], clientes: [], localidades: [] },

    // ── Escenarios online (GAS_escenarios.js) ──
    // PEGAR ACÁ la URL /exec del despliegue del script de escenarios:
    ESCENARIOS_URL: 'https://script.google.com/macros/s/AKfycbzWsns5rhzsPNjoMkIogCYgKByn2YuXy9LTwahFWXndZ_uluqmTFpfQzqECvpd0Y9dF/exec',

    // Devuelve { accessToken } siempre vigente.
    // supabase-js lee la sesión que guardó el login hub (localStorage 'sb-<ref>-auth-token')
    // y, si el JWT venció, lo renueva solo con el refresh_token.
    async _simAuth() {
        let token = '';
        if (supabaseClient) {
            try {
                const { data } = await supabaseClient.auth.getSession();
                token = (data && data.session && data.session.access_token) || '';
            } catch (e) { token = ''; }
        }
        let raw = {};
        try { raw = JSON.parse(localStorage.getItem('user_session') || '{}'); } catch (e) { raw = {}; }
        if (token) {
            // Mantener sincronizada la copia de user_session (la usan otras herramientas)
            if (raw && raw.usuario && raw.accessToken !== token) {
                raw.accessToken = token;
                localStorage.setItem('user_session', JSON.stringify(raw));
            }
            return { accessToken: token };
        }
        // Fallback: supabase-js no cargó (CDN caído) → token guardado (puede estar vencido)
        if (!supabaseClient && raw.accessToken) return { accessToken: raw.accessToken };
        throw new Error('Tu sesión expiró. Volvé a iniciar sesión.');
    },

    async _escenariosApi(action, extra) {
        if (!this.ESCENARIOS_URL || this.ESCENARIOS_URL.indexOf('http') !== 0) {
            throw new Error('Falta configurar ESCENARIOS_URL en data.js.');
        }
        const auth = await this._simAuth();
        const payload = Object.assign({ action: action }, auth, extra || {});
        let res;
        try {
            res = await fetch(this.ESCENARIOS_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
        } catch (e) { throw new Error('Sin conexión con el servidor de escenarios.'); }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'Error desconocido');
        return json;
    },

    async escenariosListar() {
        const r = await this._escenariosApi('escenarios_listar');
        return r.escenarios || [];
    },

    // Guarda el escenario actual. Las reglas por zona llevan la geometría adentro
    // (las zonas dibujadas viven en el navegador de cada usuario).
    async escenarioGuardar(nombre) {
        const esc = this.getEscenario();
        const zonas = this.getCustomZones();
        const reglas = esc.reglas.map(r => {
            const copia = JSON.parse(JSON.stringify(r));
            if (copia.tipo === 'zona' && !copia.zonaGeometry) {
                const z = zonas.find(x => x.id === copia.zonaId);
                if (z) { copia.zonaGeometry = z.geometry; copia.zonaNombre = z.name; }
            }
            return copia;
        });
        const clientes = new Set();
        reglas.forEach(r => this.clientesDeRegla(r).forEach(c => clientes.add(c)));
        return this._escenariosApi('escenario_guardar', {
            nombre: nombre,
            clientes: clientes.size,
            n_reglas: reglas.length,
            escenario: JSON.stringify({ activo: true, reglas: reglas })
        });
    },

    async escenarioObtener(id) {
        const r = await this._escenariosApi('escenario_obtener', { id: id });
        return JSON.parse(r.escenario);
    },

    async escenarioBorrar(id) {
        return this._escenariosApi('escenario_borrar', { id: id });
    },

    // ── Venta (Planificador): clientes con compra de cerveza en el mes ──
    // Usa el endpoint req=cobertura del Planificador (hoja KPIs, columna CCC-IDS-CERVEZA).
    PLANIFICADOR_URL: 'https://script.google.com/macros/s/AKfycbzePqSmRPZhZJ9LPg6dWr50lf_uGvX8Tt09hbwqKiYJVOa8jt85lyGKRReZ-c_OxMcAcg/exec',
    ventas: null,        // { cMonth, codes: Set, cccTotal, source, lastDate, cargadoEl }
    _ventasCache: {},    // { [cMonth]: ventas }
    _ventasTTL: 5 * 60 * 1000,

    // Normaliza un código de cliente para cruzar Planificador <-> base geolocalizada
    normalizeCodigoCliente(v) {
        let s = String(v === undefined || v === null ? '' : v).trim();
        if (!s) return '';
        if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
        if (/^\d+$/.test(s)) s = String(parseInt(s, 10));
        return s.toUpperCase();
    },

    // Trae los códigos de clientes con compra de cerveza del mes (YYYY-MM) desde el Planificador
    async loadVentas(cMonth, force) {
        if (!/^\d{4}-\d{2}$/.test(String(cMonth || ''))) throw new Error('Mes inválido (formato YYYY-MM).');
        const cached = this._ventasCache[cMonth];
        if (!force && cached && (Date.now() - cached.cargadoEl) < this._ventasTTL) {
            return cached;
        }
        // El endpoint cobertura no exige token: si no hay sesión igual se consulta
        let token = '';
        try { token = (await this._simAuth()).accessToken || ''; } catch (e) { token = ''; }
        const url = this.PLANIFICADOR_URL + '?req=cobertura&cMonth=' + encodeURIComponent(cMonth)
            + '&token=' + encodeURIComponent(token) + '&t=' + Date.now();
        let res;
        try {
            res = await fetch(url, { cache: 'no-store' });
        } catch (e) {
            throw new Error('Sin conexión con el Planificador.');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status + ' al consultar el Planificador.');
        let json;
        try {
            json = JSON.parse(await res.text());
        } catch (e) {
            throw new Error('El Planificador devolvió una respuesta no válida.');
        }
        if (!json || json.status !== 'success') {
            throw new Error((json && json.message) || 'El Planificador devolvió un error.');
        }

        const codes = new Set();
        const codesNabs = new Set();
        let cccTotal = 0;
        let cccNabsTotal = 0;
        const promotores = json.promotores || {};
        Object.keys(promotores).forEach(k => {
            const p = promotores[k] || {};
            cccTotal += Number(p.ccc) || 0;
            cccNabsTotal += Number(p.cccNabs) || 0;
            (p.clientIds || []).forEach(id => {
                const n = this.normalizeCodigoCliente(id);
                if (n) codes.add(n);
            });
            (p.clientIdsNabs || []).forEach(id => {
                const n = this.normalizeCodigoCliente(id);
                if (n) codesNabs.add(n);
            });
        });

        const ventas = {
            cMonth: cMonth,
            codes: codes,
            codesNabs: codesNabs,
            cccTotal: cccTotal,
            cccNabsTotal: cccNabsTotal,
            source: json.source || '',
            lastDate: json.lastDate || '',
            cargadoEl: Date.now()
        };
        this._ventasCache[cMonth] = ventas;
        return ventas;
    },

    // Cruce de la venta con la base geolocalizada
    // ¿El código de cliente compró cerveza en la venta cargada?
    // unidad: 'cerveza' (default) o 'nabs'
    isVentaCliente(codigo, unidad) {
        const v = this.ventas;
        if (!v) return false;
        const set = (unidad === 'nabs') ? v.codesNabs : v.codes;
        return !!(set && set.has(this.normalizeCodigoCliente(codigo)));
    },

    // Códigos de clientes con compra según las unidades activas (cerveza y/o nabs → unión)
    getVentaCodes(venta, unidades) {
        const v = venta || this.ventas;
        if (!v) return new Set();
        const u = unidades || { cerveza: true, nabs: false };
        if (u.cerveza && u.nabs) {
            const set = new Set(v.codes || []);
            (v.codesNabs || new Set()).forEach(c => set.add(c));
            return set;
        }
        return (u.nabs ? (v.codesNabs || new Set()) : (v.codes || new Set()));
    },

    // Stats de la capa Venta para una o dos unidades (CVZA / NABS)
    getVentasStatsUnidades(venta, unidades) {
        const v = venta || this.ventas;
        if (!v) return null;
        const set = this.getVentaCodes(v, unidades);
        const enBase = new Set();
        let conCoords = 0;
        (this.data.clientes || []).forEach(c => {
            const cod = this.normalizeCodigoCliente(c.Codigo);
            if (!set.has(cod)) return;
            enBase.add(cod);
            if (!isNaN(c.Latitud) && !isNaN(c.Longitud)) conCoords++;
        });
        const u = unidades || { cerveza: true, nabs: false };
        const cccTotal = (u.cerveza && u.nabs)
            ? (v.cccTotal || 0) + (v.cccNabsTotal || 0)
            : (u.nabs ? (v.cccNabsTotal || 0) : (v.cccTotal || 0));
        return {
            cMonth: v.cMonth,
            total: set.size,
            enBase: enBase.size,
            sinMatch: set.size - enBase.size,
            conCoords: conCoords,
            cccTotal: cccTotal
        };
    },

    // Compatibilidad: stats de una sola unidad ('cerveza' por defecto o 'nabs')
    getVentasStats(venta, unidad) {
        return this.getVentasStatsUnidades(venta, {
            cerveza: unidad !== 'nabs',
            nabs: unidad === 'nabs'
        });
    },

    baseMeta: { origen: 'local', actualizado_por: null, actualizado_el: null, total_clientes: 0 },

    async loadData() {
        // 1) Intentar cargar la base general desde Supabase (tabla zonas_surcala_base)
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('zonas_surcala_base')
                    .select('csv_text, total_clientes, actualizado_por, actualizado_el')
                    .eq('id', 'actual')
                    .maybeSingle();

                if (!error && data && data.csv_text) {
                    const parsedCloud = this.parseClientesCsv(data.csv_text);
                    if (parsedCloud.length > 0) {
                        this.baseMeta = {
                            origen: 'supabase',
                            actualizado_por: data.actualizado_por || 'Usuario',
                            actualizado_el: data.actualizado_el || null,
                            total_clientes: parsedCloud.length
                        };
                        this.processRawClients(parsedCloud);
                        return;
                    }
                }
            } catch (err) {
                console.warn('[Zonas Surcala] No se pudo leer zonas_surcala_base de Supabase, usando clientes.csv local:', err);
            }
        }

        // 2) Fallback: cargar clientes.csv local
        const res = await fetch('clientes.csv', { cache: 'no-cache' });
        if (!res.ok) throw new Error('No se pudo cargar clientes.csv (HTTP ' + res.status + ')');
        const parsed = this.parseClientesCsv(await res.text());
        if (parsed.length === 0) {
            throw new Error('clientes.csv no tiene filas de datos (¿se rompió el export?)');
        }
        this.baseMeta = { origen: 'local', actualizado_por: null, actualizado_el: null, total_clientes: parsed.length };
        this.processRawClients(parsed);
    },

    // Reemplaza la base general en Supabase (valida formato antes de subir)
    async guardarBaseEnSupabase(csvText) {
        if (!supabaseClient) throw new Error('El cliente de Supabase no está disponible.');
        const parsed = this.parseClientesCsv(csvText);
        if (parsed.length === 0) {
            throw new Error('El archivo no contiene filas válidas de clientes.');
        }
        const conCoords = parsed.filter(r => !isNaN(parseCoordinate(r.latitud)) && !isNaN(parseCoordinate(r.longitud))).length;
        if (conCoords === 0) {
            throw new Error('Ninguna fila tiene Latitud y Longitud válidas. Verificá las columnas del archivo.');
        }

        // Asegurar sesión activa en Supabase antes del RPC
        await this._simAuth();

        const { data, error } = await supabaseClient.rpc('actualizar_base_zonas_surcala', {
            p_csv_text: csvText,
            p_total: parsed.length
        });
        if (error) throw new Error(error.message || 'Error al guardar en Supabase');

        this.baseMeta = {
            origen: 'supabase',
            actualizado_por: (data && data.actualizado_por) || 'Usuario',
            actualizado_el: (data && data.actualizado_el) || new Date().toISOString(),
            total_clientes: parsed.length
        };
        this.processRawClients(parsed);
        // Si había una simulación activa, re-aplicarla sobre la nueva base
        if (this.getEscenario().activo) {
            this.aplicarEscenario();
        }
        return { total: parsed.length, conCoords };
    },

    // Convierte CSV (delimitador ';', ',' o tab) al formato que espera processRawClients().
    parseClientesCsv(text) {
        const filas = this.parseCsvTabla(text);
        if (filas.length < 2) return [];

        const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

        // Buscar la línea de encabezado en las primeras 5 líneas
        let idxHeader = -1;
        const buscar = Math.min(filas.length, 5);
        for (let i = 0; i < buscar; i++) {
            if (filas[i].some(c => norm(c) === 'codigo' || norm(c) === 'cod')) { idxHeader = i; break; }
        }
        if (idxHeader === -1) {
            throw new Error('No se encontró el encabezado esperado (columna "codigo") en las primeras 5 líneas del CSV');
        }
        const headers = filas[idxHeader].map(norm);
        const pos = (aliases) => headers.findIndex(h => aliases.indexOf(h) > -1);

        // Columna del CSV -> campo que usa processRawClients()
        const esperadas = {
            codigo: pos(['codigo', 'cod']),
            razon_social: pos(['razon social', 'nombre', 'cliente']),
            direccion: pos(['direccion', 'domicilio']),
            zona: pos(['zona']),
            vendedor: pos(['vendedor']),
            localidad: pos(['localidad']),
            latitud: pos(['latitud', 'lat']),
            longitud: pos(['longitud', 'lng', 'lon', 'long']),
            frecuencia: pos(['dia de visita', 'dia visita', 'frecuencia', 'dias de visita']),
            promotor: pos(['promotor']),
            supervisor: pos(['supervisor', 'spv'])
        };
        const faltantes = Object.entries(esperadas).filter(([, idx]) => idx === -1).map(([k]) => k);
        if (faltantes.length > 0) {
            console.warn('[Zonas Surcala] Columnas faltantes en el CSV (llegarán vacías): ' + faltantes.join(', '));
        }

        const out = [];
        for (let i = idxHeader + 1; i < filas.length; i++) {
            const fila = filas[i];
            const obj = {};
            for (const campo in esperadas) {
                const j = esperadas[campo];
                obj[campo] = (j >= 0 && fila[j] !== undefined) ? String(fila[j]).trim() : '';
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
        } catch (e) { }

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
        try { localStorage.setItem('surcala_escenario', JSON.stringify(this.getEscenario())); } catch (e) { }
    },

    // A qué clientes aplica una regla (siempre evaluado sobre la base REAL)
    clientesDeRegla(regla) {
        const codigos = new Set();
        const base = this.dataReal || this.data;
        if (!base) return codigos;
        if (regla.tipo === 'zona') {
            // Escenarios guardados online traen la geometría adentro; si no, se busca la zona local
            const zona = this.getCustomZones().find(z => z.id === regla.zonaId);
            const geom = regla.zonaGeometry || (zona && zona.geometry);
            if (geom) this.getClientsInGeometry(geom).forEach(c => codigos.add(String(c.Codigo || c.ID)));
        } else if (regla.tipo === 'csv') {
            Object.keys(regla.cambios || {}).forEach(cod => codigos.add(String(cod)));
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
                // Regla importada desde CSV: cambios puntuales por código de cliente
                if (regla.tipo === 'csv') {
                    Object.keys(regla.cambios || {}).forEach(cod => {
                        const i = idx.get(String(cod));
                        if (i === undefined) return;
                        Object.assign(rows[i], regla.cambios[cod]);
                    });
                    return;
                }
                this.clientesDeRegla(regla).forEach(cod => {
                    const i = idx.get(String(cod));
                    if (i === undefined) return;
                    if (regla.nuevoSupervisor) rows[i].supervisor = regla.nuevoSupervisor;
                    if (regla.nuevoPromotor) rows[i].promotor = regla.nuevoPromotor;
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

    // ============================================================
    // Importar CSV modificado como escenario
    // ============================================================
    // Parser genérico: detecta delimitador (; , tab), respeta comillas y saltos de línea entre comillas.
    parseCsvTabla(text) {
        text = String(text || '').replace(/^\uFEFF/, '');
        const primera = (text.split(/\r?\n/).find(l => l.trim() !== '') || '');
        const cuenta = (ch) => primera.split(ch).length - 1;
        let delim = ';';
        if (cuenta('\t') > cuenta(delim)) delim = '\t';
        if (cuenta(',') > cuenta(delim)) delim = ',';

        const filas = [];
        let fila = [], campo = '', enComillas = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (enComillas) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { campo += '"'; i++; }
                    else enComillas = false;
                } else campo += ch;
            } else if (ch === '"') {
                enComillas = true;
            } else if (ch === delim) {
                fila.push(campo); campo = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                fila.push(campo); campo = '';
                if (fila.some(c => c.trim() !== '')) filas.push(fila);
                fila = [];
            } else {
                campo += ch;
            }
        }
        fila.push(campo);
        if (fila.some(c => c.trim() !== '')) filas.push(fila);
        return filas;
    },

    // Compara el CSV contra la base REAL (rawRows) y guarda solo las diferencias como una regla 'csv'.
    // Reemplaza cualquier importación CSV anterior y activa la simulación.
    importarCsvEscenario(text, etiqueta) {
        if (!this.rawRows) throw new Error('Todavía no se cargaron los clientes.');
        const filas = this.parseCsvTabla(text);
        const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

        const aliasCodigo = ['codigo', 'cod', 'codigo cliente', 'cod cliente'];
        let idxH = -1;
        for (let i = 0; i < Math.min(filas.length, 5); i++) {
            if (filas[i].some(c => aliasCodigo.indexOf(norm(c)) > -1)) { idxH = i; break; }
        }
        if (idxH === -1) throw new Error('No encontré la columna "Código" en las primeras filas del CSV.');

        const headers = filas[idxH].map(norm);
        const buscar = (alias) => headers.findIndex(h => alias.indexOf(h) > -1);
        const cols = {
            codigo: buscar(aliasCodigo),
            supervisor: buscar(['supervisor', 'spv']),
            promotor: buscar(['promotor']),
            frecuencia: buscar(['dia de visita', 'dia visita', 'frecuencia']),
            zona: buscar(['zona']),
            vendedor: buscar(['vendedor'])
        };
        const editables = ['supervisor', 'promotor', 'frecuencia', 'zona', 'vendedor'].filter(k => cols[k] >= 0);
        if (!editables.length) {
            throw new Error('El CSV no tiene ninguna columna para simular (Supervisor, Promotor, Día de visita, Zona o Vendedor).');
        }

        const porCodigo = new Map(this.rawRows.map(r => [String(r.codigo).trim(), r]));
        const vacios = { supervisor: 'sin supervisor', promotor: 'sin promotor' };
        const cambios = {};
        let filasLeidas = 0, sinMatch = 0;

        for (let i = idxH + 1; i < filas.length; i++) {
            const fila = filas[i];
            const cod = String(fila[cols.codigo] === undefined ? '' : fila[cols.codigo]).trim();
            if (!cod) continue;
            filasLeidas++;
            const raw = porCodigo.get(cod);
            if (!raw) { sinMatch++; continue; }
            const diff = {};
            editables.forEach(k => {
                const nuevo = String(fila[cols[k]] === undefined ? '' : fila[cols[k]]).trim();
                if (!nuevo) return;                                   // celda vacía = sin cambio
                const actual = String(raw[k] || '').trim();
                if (nuevo.toUpperCase() === actual.toUpperCase()) return;
                if (!actual && vacios[k] && nuevo.toLowerCase() === vacios[k]) return;
                diff[k] = nuevo;
            });
            if (Object.keys(diff).length) cambios[cod] = diff;
        }

        const modificados = Object.keys(cambios).length;
        const escenario = this.getEscenario();
        escenario.reglas = escenario.reglas.filter(r => r.tipo !== 'csv');
        if (modificados) escenario.reglas.push({ tipo: 'csv', etiqueta: etiqueta || '', cambios: cambios });
        escenario.activo = escenario.reglas.length > 0;
        return { filasLeidas, sinMatch, modificados, columnas: editables };
    },

    // ============================================================
    // BASE STOCK HELADERAS (EDF) — equipos por cliente (PDV)
    // ============================================================
    heladeras: null,                       // { porCodigo: Map(codigo -> {total, grupos[]}), totalEquipos, totalClientes, meta }
    HELADERAS_TABLE: 'zonas_surcala_heladeras',

    _normHeladera(s) {
        return String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    },

    // Filas crudas (arrays) de la exportación de Stock Heladeras → registros reducidos.
    // Conserva sólo Ubicación = PDV y Cod. Cliente distinto de 0.
    // Si no hay encabezado reconocible, usa el orden fijo de la exportación (32 columnas).
    parseHeladerasFilas(filas) {
        const norm = (s) => this._normHeladera(s);
        const rows = (filas || []).filter(f => Array.isArray(f) && f.some(c => String(c ?? '').trim() !== ''));
        let idxH = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const h = rows[i].map(norm);
            if (h.indexOf('ubicacion') > -1 && h.indexOf('cod cliente') > -1) { idxH = i; break; }
        }

        let pos;
        if (idxH > -1) {
            const h = rows[idxH].map(norm);
            pos = {
                ubic: h.indexOf('ubicacion'),
                cli: h.indexOf('cod cliente'),
                desc: h.indexOf('desc producto'),
                cod: h.indexOf('cod producto'),
                serie: h.indexOf('nro serie')
            };
            const faltan = Object.keys(pos).filter(k => pos[k] === -1);
            if (faltan.length) throw new Error('No encuentro las columnas: ' + faltan.join(', ') + '.');
        } else {
            // Posiciones 0-based de la exportación: Ubicación=4, Cod. Cliente=8, Cod. Producto=15, Desc. Producto=16, Nro. Serie=24
            if (!rows.length || rows[0].length < 25) {
                throw new Error('El archivo no tiene el formato esperado de Stock Heladeras (32 columnas).');
            }
            pos = { ubic: 4, cli: 8, cod: 15, desc: 16, serie: 24 };
        }

        const stats = { filasLeidas: 0, descartadasUbicacion: 0, descartadasCliente: 0, ubicaciones: {}, registros: [] };
        for (let i = idxH + 1; i < rows.length; i++) {
            const f = rows[i];
            const get = (j) => String(f[j] === undefined || f[j] === null ? '' : f[j]).trim();
            stats.filasLeidas++;
            const ubic = get(pos.ubic);
            stats.ubicaciones[ubic] = (stats.ubicaciones[ubic] || 0) + 1;
            if (norm(ubic) !== 'pdv') { stats.descartadasUbicacion++; continue; }
            const cod = this.normalizeCodigoCliente(get(pos.cli));
            if (!cod || cod === '0' || !/^\d+$/.test(cod)) { stats.descartadasCliente++; continue; }
            stats.registros.push({
                codigo: cod,
                producto: get(pos.desc),
                codProducto: get(pos.cod),
                serie: get(pos.serie)
            });
        }
        return stats;
    },

    // Armado del índice por cliente: quita duplicados (mismo cliente + mismo Nro. Serie)
    buildHeladerasIndex(registros) {
        const porCodigo = new Map();
        const unicos = [];
        const vistos = new Set();
        (registros || []).forEach(r => {
            if (r.serie) {
                const k = r.codigo + '|' + r.serie;
                if (vistos.has(k)) return;
                vistos.add(k);
            }
            unicos.push(r);
            if (!porCodigo.has(r.codigo)) porCodigo.set(r.codigo, { total: 0, gruposMap: new Map() });
            const cli = porCodigo.get(r.codigo);
            cli.total++;
            const gKey = (r.codProducto || '') + '|' + (r.producto || '');
            if (!cli.gruposMap.has(gKey)) {
                cli.gruposMap.set(gKey, { producto: r.producto || '(sin descripción)', codProducto: r.codProducto || '', cantidad: 0, series: [] });
            }
            const g = cli.gruposMap.get(gKey);
            g.cantidad++;
            if (r.serie) g.series.push(r.serie);
        });
        porCodigo.forEach(cli => { cli.grupos = [...cli.gruposMap.values()]; delete cli.gruposMap; });
        return { porCodigo, registrosUnicos: unicos, totalEquipos: unicos.length, totalClientes: porCodigo.size };
    },

    // Datos de heladeras de un cliente: { total, grupos:[{producto, codProducto, cantidad, series[]}] } o null
    getHeladerasCliente(codigo) {
        if (!this.heladeras) return null;
        return this.heladeras.porCodigo.get(this.normalizeCodigoCliente(codigo)) || null;
    },

    // Estadísticas de cruce contra la base geolocalizada
    getHeladerasStats() {
        const h = this.heladeras;
        if (!h || !h.totalEquipos) return null;
        const base = new Map((this.data.clientes || []).map(c => [this.normalizeCodigoCliente(c.Codigo), c]));
        let enBase = 0, conCoords = 0;
        h.porCodigo.forEach((v, cod) => {
            const c = base.get(cod);
            if (!c) return;
            enBase++;
            if (!isNaN(c.Latitud) && !isNaN(c.Longitud)) conCoords++;
        });
        return {
            equipos: h.totalEquipos,
            clientes: h.totalClientes,
            enBase: enBase,
            sinMatch: h.totalClientes - enBase,
            conCoords: conCoords
        };
    },


    // Reconstruye el índice desde el CSV reducido guardado en Supabase (codigo;producto;cod_producto;nro_serie)
    setHeladerasFromCsv(text, meta) {
        const filas = this.parseCsvTabla(text).slice(1);
        const registros = filas
            .filter(f => f[0])
            .map(f => ({ codigo: String(f[0]).trim(), producto: f[1] || '', codProducto: f[2] || '', serie: f[3] || '' }));
        const idx = this.buildHeladerasIndex(registros);
        this.heladeras = {
            porCodigo: idx.porCodigo,
            totalEquipos: idx.totalEquipos,
            totalClientes: idx.totalClientes,
            meta: meta || { origen: 'supabase', actualizado_por: null, actualizado_el: null }
        };
    },

    // Carga la base de heladeras desde Supabase. Nunca lanza error: si falla, el mapa sigue sin estrellas.
    async loadHeladeras() {
        this.heladeras = { porCodigo: new Map(), totalEquipos: 0, totalClientes: 0, meta: { origen: 'vacio', actualizado_por: null, actualizado_el: null } };
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient
                .from(this.HELADERAS_TABLE)
                .select('csv_text, actualizado_por, actualizado_el')
                .eq('id', 'actual')
                .maybeSingle();
            if (error || !data || !data.csv_text) return;
            this.setHeladerasFromCsv(data.csv_text, {
                origen: 'supabase',
                actualizado_por: data.actualizado_por || 'Usuario',
                actualizado_el: data.actualizado_el || null
            });
        } catch (err) {
            console.warn('[Zonas Surcala] No se pudo leer la base de heladeras de Supabase:', err);
        }
    },

    _csvCell(v) {
        const s = String(v === undefined || v === null ? '' : v);
        return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },

    // Reemplaza la base de heladeras en Supabase (solo registros PDV con cliente válido, sin duplicados)
    async guardarHeladerasEnSupabase(registros) {
        if (!supabaseClient) throw new Error('El cliente de Supabase no está disponible.');
        const idx = this.buildHeladerasIndex(registros);
        if (idx.totalEquipos === 0) throw new Error('No hay equipos en PDV con código de cliente válido.');

        const csv = 'codigo;producto;cod_producto;nro_serie\n' + idx.registrosUnicos
            .map(r => [r.codigo, r.producto, r.codProducto, r.serie].map(v => this._csvCell(v)).join(';'))
            .join('\n');

        await this._simAuth();
        const { data, error } = await supabaseClient.rpc('actualizar_heladeras_zonas_surcala', {
            p_csv_text: csv,
            p_equipos: idx.totalEquipos,
            p_clientes: idx.totalClientes
        });
        if (error) throw new Error(error.message || 'Error al guardar en Supabase');

        this.heladeras = {
            porCodigo: idx.porCodigo,
            totalEquipos: idx.totalEquipos,
            totalClientes: idx.totalClientes,
            meta: {
                origen: 'supabase',
                actualizado_por: (data && data.actualizado_por) || 'Usuario',
                actualizado_el: (data && data.actualizado_el) || new Date().toISOString()
            }
        };
        return { equipos: idx.totalEquipos, clientes: idx.totalClientes };
    },

    // Carga SheetJS sólo cuando hace falta (archivo Excel)
    _cargarSheetJs() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            s.onload = () => resolve(window.XLSX);
            s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel. Revisá la conexión.'));
            document.head.appendChild(s);
        });
    },

    // Filas (arrays) de un .xlsx/.xls (primera hoja) o de un CSV/TXT
    async leerArchivoHeladeras(file) {
        const buf = await file.arrayBuffer();
        if (/\.xlsx?$/i.test(file.name || '')) {
            const XLSX = await this._cargarSheetJs();
            const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        }
        let texto;
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
        return this.parseCsvTabla(texto);
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
            } catch (e) {
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
            zone.id = 'zone_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
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
