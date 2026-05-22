// ============================================
// DATA SERVICE - Procesamiento de Base Suralnor
// ============================================

const PALETTE = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#0ea5e9', '#d946ef', '#06b6d4', '#eab308', '#f43f5e'
];

function generateColor(index) {
    return PALETTE[index % PALETTE.length];
}

// Limpiar formato raro de coordenadas "-34.485.918.333.333" -> "-34.485918333333"
function parseCoordinate(coordStr) {
    if (!coordStr) return NaN;
    let str = String(coordStr).trim();
    
    // Si tiene coma, asume que es el separador decimal
    if (str.includes(',')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else {
        // Si hay multiples puntos "-34.485.918" -> "-34.485918"
        let parts = str.split('.');
        if (parts.length > 2) {
            str = parts[0] + '.' + parts.slice(1).join('');
        }
    }
    
    let num = parseFloat(str);
    
    // Auto-recuperación para coordenadas aplanadas por Google Sheets (ej: -34485918 -> -34.485918)
    // Si el número está fuera de rango de una coordenada válida (> 180 o < -180)
    if (!isNaN(num) && (num > 180 || num < -180)) {
        let absStr = String(Math.abs(Math.round(num)));
        // Para Argentina (-34, -58), siempre son 2 dígitos iniciales.
        if (absStr.length > 2) {
            let recoveredStr = absStr.substring(0, 2) + '.' + absStr.substring(2);
            num = parseFloat(recoveredStr) * (num < 0 ? -1 : 1);
        }
    }
    
    return num;
}

const DataService = {
    data: { promotores: [], merchandisers: [], clientes: [] },

    async loadFromAPI(url) {
        try {
            const res = await fetch(url + '?action=all');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            
            // Procesamos la lista única de clientes para deducir promotores y merchs
            if (json.clientes) {
                this.processRawClients(json.clientes);
            } else {
                throw new Error("Formato JSON incorrecto. No se encontró la propiedad 'clientes'");
            }
            return true;
        } catch (e) {
            console.error('API Error:', e);
            return false;
        }
    },

    loadDemo() {
        // Demo data adaptada al formato de una sola hoja
        const demoRaw = [
            { codigo: "10504", razon_social: "SUPERMERCADO USPALLATA S.R.L", direccion: "SAN MARTIN 1347", localidad: "GRAND BOURG", Latitud: "-34.485.918.333.333", Longitud: "-58.726.940.000.000", PROMOTOR: "SANCHEZ ROCIO", MERCH: "CRUZ CHRISTIAN" },
            { codigo: "150620", razon_social: "AUTOSERVICIO TEO SRL", direccion: "CARLOS CASARES 2773", localidad: "VICTORIA", Latitud: "-34.460.387.242.972", Longitud: "-58.559.464.388.885", PROMOTOR: "LOPEZ PABLO", MERCH: "DOMINGUEZ NAHUEL" },
            { codigo: "160497", razon_social: "WANG JIN HUI", direccion: "MAIPU 1651", localidad: "SAN FERNANDO", Latitud: "-34.446.753.333.333", Longitud: "-58.557.286.666.667", PROMOTOR: "GALLO JONATHAN", MERCH: "DOMINGUEZ NAHUEL" },
            { codigo: "151557", razon_social: "SUPER TIGRE S.A.", direccion: "STA.MARIA 2546", localidad: "EL NACIONAL", Latitud: "-34.418.500.860.000", Longitud: "-58.595.957.060.000", PROMOTOR: "FERREYRA LEONARDO", MERCH: "TORRES NICOLAS" },
            { codigo: "9489", razon_social: "MERCADO BOUCHARD S. R. L.", direccion: "R.ROJAS 1538", localidad: "PABLO NOGUES", Latitud: "-34.484.421.689.782", Longitud: "-58.725.807.737.820", PROMOTOR: "SANCHEZ ROCIO", MERCH: "CRUZ CHRISTIAN" },
            { codigo: "11313", razon_social: "YAO LIZHEN", direccion: "AV. FRUCTUOSO DIAZ 1767", localidad: "GARIN", Latitud: "-34.428.671.666.667", Longitud: "-58.754.521.666.667", PROMOTOR: "MIÑO RENZO", MERCH: "SMITH RODRIGO" },
            { codigo: "11823", razon_social: "CABAMARI SA", direccion: "MISIONES 75", localidad: "TORTUGUITAS", Latitud: "-34.468.158.300.000", Longitud: "-58.756.833.300.000", PROMOTOR: "LOPEZ PABLO", MERCH: "CRUZ CHRISTIAN" },
            { codigo: "4784", razon_social: "ZHENG YIBAO", direccion: "EL CALLAO 849", localidad: "GRAND BOURG", Latitud: "-34.492.904.098.857", Longitud: "-58.721.250.402.120", PROMOTOR: "MIÑO RENZO", MERCH: "CRUZ CHRISTIAN" },
            { codigo: "160186", razon_social: "ZHANG MINGXIANG", direccion: "JUAN DOMINGO PERON 3485", localidad: "GENERAL PACHECO", Latitud: "-34.446.255.000.000", Longitud: "-58.675.970.000.000", PROMOTOR: "GALLO JONATHAN", MERCH: "SCHNEIDER MIGUEL" },
            { codigo: "13182", razon_social: "LI GUIHUI", direccion: "AV. CONSTITUCION 2260", localidad: "DEL VISO", Latitud: "-34.423.780.000.000", Longitud: "-58.778.148.333.333", PROMOTOR: "FERREYRA LEONARDO", MERCH: "SMITH RODRIGO" }
        ];
        this.processRawClients(demoRaw);
    },

    processRawClients(rawClients) {
        let pMap = {}; // name -> ID
        let mMap = {}; // name -> ID
        let promotores = [];
        let merchandisers = [];
        let clientes = [];

        rawClients.forEach(row => {
            // Normalizar keys por si cambian mayúsculas
            const keys = Object.keys(row);
            const getVal = (possibleKeys) => {
                for(let k of keys) {
                    if (possibleKeys.includes(k.toLowerCase().trim()) && row[k] !== undefined && row[k] !== null) {
                        return String(row[k]).trim();
                    }
                }
                return "";
            };

            const promotorName = getVal(['promotor']) || 'Sin Promotor';
            const merchName = getVal(['merch']) || 'Sin Merch';
            const latRaw = getVal(['latitud', 'lat']);
            const lngRaw = getVal(['longitud', 'lng', 'lon']);

            // Parsear y crear Promotor
            let pId = pMap[promotorName];
            if (!pId) {
                pId = 'P' + (promotores.length + 1);
                pMap[promotorName] = pId;
                promotores.push({
                    ID: pId,
                    Nombre: promotorName,
                    Color: generateColor(promotores.length),
                    Zona: "" // Generaremos con Turf.js
                });
            }

            // Parsear y crear Merch único por nombre
            let mId = mMap[merchName];
            if (!mId) {
                mId = 'M' + (merchandisers.length + 1);
                mMap[merchName] = mId;
                merchandisers.push({
                    ID: mId,
                    Nombre: merchName,
                    Color: generateColor(merchandisers.length + 5), 
                    Zona: ""
                });
            }

            // Crear Cliente
            const frecuenciaVal = getVal(['frecuencia']) || 'Sin Frecuencia';
            const codigoVal = getVal(['codigo', 'id']) || ('C' + clientes.length);
            clientes.push({
                ID: codigoVal,
                Codigo: codigoVal,
                Nombre: getVal(['razon_social', 'nombre', 'cliente']) || 'Cliente sin nombre',
                Direccion: getVal(['direccion', 'domicilio']) + (getVal(['localidad']) ? ' - ' + getVal(['localidad']) : ''),
                Latitud: parseCoordinate(latRaw),
                Longitud: parseCoordinate(lngRaw),
                PromotorID: pId,
                MerchID: mId,
                Promotor: promotorName,
                Merch: merchName,
                Frecuencia: frecuenciaVal,
                Prioridad: getVal(['prioridad', 'orden', 'priority']) || '',
                Telefono: getVal(['telefono', 'tel']),
                VentaPromedio: getVal(['promedio venta hl u3m', 'venta_promedio', 'venta promedio', 'vtaprom', 'vta_promedio', 'venta']) || '',
                EDFs: getVal(['total edfs', 'edfs', 'edf', 'exhi']) || '',
                Notas: getVal(['notas', 'nota', 'observaciones']) || ''
            });
        });

        // Obtener frecuencias únicas y asignarles color
        let frecuenciasNombres = [...new Set(clientes.map(c => c.Frecuencia))];
        frecuenciasNombres.sort();
        
        // Paleta de colores para frecuencias (colores vibrantes para que destaquen)
        const freqPalette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];
        const frecuencias = frecuenciasNombres.map((f, i) => ({
            Nombre: f,
            Color: f === 'Sin Frecuencia' ? '#9ca3af' : freqPalette[i % freqPalette.length]
        }));
        
        this.data = { promotores, merchandisers, clientes, frecuencias };

        // Alerta si se cargaron clientes pero no hay coordenadas válidas
        const validCoords = clientes.filter(c => !isNaN(c.Latitud) && !isNaN(c.Longitud));
        if (clientes.length > 0 && validCoords.length === 0) {
            setTimeout(() => {
                alert('¡Atención! Se cargaron los clientes pero no se detectaron coordenadas válidas. Verificá que existan las columnas "Latitud" y "Longitud" (por separado) en tu Google Sheets y que los datos tengan formato numérico.');
            }, 500);
        }
    },

    getPromotor(id) { return this.data.promotores.find(p => p.ID === id); },
    getMerch(id) { return this.data.merchandisers.find(m => m.ID === id); },
    getFrecuencia(nombre) { return this.data.frecuencias.find(f => f.Nombre === nombre); },
    getMerchsByPromotor(pid) { 
        const merchIds = new Set(this.data.clientes.filter(c => c.PromotorID === pid).map(c => c.MerchID));
        return this.data.merchandisers.filter(m => merchIds.has(m.ID)); 
    },
    getClientsByMerch(mid) { return this.data.clientes.filter(c => c.MerchID === mid); },
    getClientsByPromotor(pid) { return this.data.clientes.filter(c => c.PromotorID === pid); },
    
    async saveClient(action, dataObj) {
        let config = {};
        try { config = JSON.parse(localStorage.getItem('emcala_config') || '{}'); } catch(e) {}
        if (!config.sheetsUrl) throw new Error("No hay URL configurada. Andá a Configuración y pegá la URL del Apps Script.");
        
        const params = new URLSearchParams();
        params.append('action', action);
        for (const key in dataObj) {
            params.append(key, dataObj[key]);
        }
        
        try {
            // POST usando x-www-form-urlencoded para evitar preflight CORS en Google Apps Script
            const response = await fetch(config.sheetsUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            return result;
        } catch (e) {
            throw new Error("Error de conexión: " + e.message);
        }
    }
};
