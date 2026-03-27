/**
 * DATA.JS - Data Management Module (Normalized)
 * Project: El Copihue
 */

const DataModule = (() => {
    const STORAGE_KEY = 'hacienda_copihue_lotes';
    const PROJECT_NAME = 'El Copihue';

    const MAPPING = {
        id_lote: ['Lote', 'name', 'fid'],
        area: ['Area', 'Hectareas', 'superficie'],
        estado: ['Estado', 'status']
    };

    let lotesData = {
        type: "FeatureCollection",
        features: []
    };

    function init() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            lotesData = JSON.parse(saved);
            // Always sync status from raw files to handle fresh exports
            syncStatus(window.json_Vendidas_3, 'Vendida');
            syncStatus(window.json_Reservadas_4, 'Reservada');
            save();
        } else {
            // Merge raw GeoJSON from Global variables (OpenLayers export style)
            processBatch(window.json_Disponibles_2, 'Disponible');
            processBatch(window.json_Vendidas_3, 'Vendida');
            processBatch(window.json_Reservadas_4, 'Reservada');
            save();
        }
    }

    function syncStatus(geoJson, newEstado) {
        if (!geoJson || !geoJson.features) return;
        geoJson.features.forEach(f => {
            const id = findProp(f.properties, MAPPING.id_lote);
            const lote = getLoteById(id);
            if (lote) {
                // Only override if the new status is "Vendida" or if it advances from Disponible to Reservada
                if (newEstado === 'Vendida' || (newEstado === 'Reservada' && lote.properties.estado === 'Disponible')) {
                    if (lote.properties.estado !== newEstado) {
                        lote.properties.estado = newEstado;
                        lote.properties.ultima_modificacion = new Date().toISOString();
                    }
                }
            }
        });
    }

    function processBatch(geoJson, defaultEstado) {
        if (!geoJson || !geoJson.features) return;

        geoJson.features.forEach(f => {
            const id_lote = findProp(f.properties, MAPPING.id_lote) || 'S/N';
            const area = findProp(f.properties, MAPPING.area) || '5.000 m²';
            const estado = findProp(f.properties, MAPPING.estado) || defaultEstado;

            const normalizedFeature = {
                type: "Feature",
                geometry: f.geometry,
                properties: {
                    ...f.properties,
                    id_lote: id_lote,
                    area: area,
                    estado: estado,
                    precio: f.properties.Precio || 33000000,
                    ultima_modificacion: new Date().toISOString()
                }
            };
            lotesData.features.push(normalizedFeature);
        });
    }

    function findProp(props, alternates) {
        for (const key of alternates) {
            if (props[key] !== undefined && props[key] !== null) return props[key];
        }
        return null;
    }

    function getAll() { return lotesData; }

    function getLoteById(id) {
        return lotesData.features.find(f => String(f.properties.id_lote) === String(id));
    }

    function updateLote(id, newData) {
        const lote = getLoteById(id);
        if (lote) {
            lote.properties = { ...lote.properties, ...newData, ultima_modificacion: new Date().toISOString() };
            save();
            addToSyncQueue(id, newData);
        }
    }

    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(lotesData)); }

    function reset() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + '_sync');
        location.reload();
    }

    function addToSyncQueue(id, data) {
        let queue = JSON.parse(localStorage.getItem(STORAGE_KEY + '_sync') || '[]');
        queue.push({ id, data, timestamp: new Date().toISOString() });
        localStorage.setItem(STORAGE_KEY + '_sync', JSON.stringify(queue));
    }

    function getSyncQueue() { return JSON.parse(localStorage.getItem(STORAGE_KEY + '_sync') || '[]'); }
    function clearSyncQueue() { localStorage.setItem(STORAGE_KEY + '_sync', '[]'); }
    function formatPrice(val) {
        if (!val && val !== 0) return '$ 0';
        if (typeof val === 'string' && val.includes('$')) return val;
        const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g,""));
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-CL', { 
            style: 'currency', 
            currency: 'CLP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num).replace('CLP', '$');
    }

    function getStats() {
        const stats = { disponible: 0, reservada: 0, vendida: 0 };
        lotesData.features.forEach(f => {
            const e = f.properties.estado.toLowerCase();
            if (e.includes('disp')) stats.disponible++;
            else if (e.includes('res')) stats.reservada++;
            else if (e.includes('vend')) stats.vendida++;
        });
        return stats;
    }

    return { init, getAll, getLoteById, updateLote, getStats, reset, getSyncQueue, clearSyncQueue, formatPrice };
})();
