/**
 * DATA MODULE - Hacienda Las Brisas
 * Unifies all GeoJSON layers into a single collection with enriched schema.
 * Persists changes to localStorage.
 */

const DataModule = (() => {
    const STORAGE_KEY = 'hacienda_naranjos_lotes';
    const SYNC_QUEUE_KEY = 'hacienda_naranjos_sync_queue';
    const LAST_UPDATE_KEY = 'hacienda_naranjos_last_update';
    const DATA_VERSION_KEY = 'hacienda_naranjos_data_version';
    const DATA_VERSION = '2'; // Increment this when raw GeoJSON files change

    // ── Raw GeoJSON from qgis2web (loaded in index.html) ──
    const rawDisponibles = typeof json_Disponibles_3 !== 'undefined' ? json_Disponibles_3 : { "type": "FeatureCollection", "features": [] };
    const rawReservadas = typeof json_Reservadas_4 !== 'undefined' ? json_Reservadas_4 : { "type": "FeatureCollection", "features": [] };
    const rawVendidas = typeof json_Vendidas_2 !== 'undefined' ? json_Vendidas_2 : { "type": "FeatureCollection", "features": [] };

    // ── Parse price string to number ──
    function parsePrice(priceStr) {
        if (!priceStr) return 0;
        if (typeof priceStr === 'number') return priceStr;
        return parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0;
    }

    // ── Format number to CLP ──
    function formatPrice(num) {
        if (!num) return '$ 0';
        return '$ ' + num.toLocaleString('es-CL');
    }

    // ── Normalize geometry to simple Polygon ──
    function normalizeGeometry(geometry) {
        if (geometry.type === 'MultiPolygon') {
            return {
                type: 'Polygon',
                coordinates: geometry.coordinates[0]
            };
        }
        return geometry;
    }

    // ── Build unified lotes collection ──
    function buildUnifiedCollection() {
        const allFeatures = [];

        const processBatch = (fc, defaultEstado) => {
            if (!fc || !fc.features) return;
            fc.features.forEach(f => {
                const props = f.properties;
                allFeatures.push({
                    type: 'Feature',
                    properties: {
                        id_lote: props.Lote || props.name || props.fid || '?',
                        fid: props.fid,
                        area: props.Area || props.Hectareas || '', // Soporte para Area y Hectareas
                        estado: props.Estado || defaultEstado,
                        precio: parsePrice(props.Precio),
                        precio_display: props.Precio || formatPrice(parsePrice(props.Precio)),
                        ultima_modificacion: new Date().toISOString(),
                    },
                    geometry: normalizeGeometry(f.geometry)
                });
            });
        };

        processBatch(rawDisponibles, 'Disponible');
        processBatch(rawReservadas, 'Reservada');
        processBatch(rawVendidas, 'Vendida');

        return {
            type: 'FeatureCollection',
            features: allFeatures
        };
    }

    // ── Public API ──
    return {
        STORAGE_KEY,
        init() {
            const stored = localStorage.getItem(STORAGE_KEY);
            const storedVersion = localStorage.getItem(DATA_VERSION_KEY);
            
            // Force rebuild if no data or version mismatch
            if (!stored || storedVersion !== DATA_VERSION) {
                const collection = buildUnifiedCollection();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
                localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
                localStorage.setItem(DATA_VERSION_KEY, DATA_VERSION);
            } else {
                this.syncStatus();
            }
            return this.getAll();
        },
        syncStatus() {
            const collection = this.getAll();
            const fresh = buildUnifiedCollection();
            let changed = false;

            collection.features.forEach(f => {
                const freshLote = fresh.features.find(ff => ff.properties.id_lote === f.properties.id_lote);
                if (freshLote && freshLote.properties.estado !== f.properties.estado) {
                    f.properties.estado = freshLote.properties.estado;
                    f.properties.ultima_modificacion = new Date().toISOString();
                    changed = true;
                }
            });

            if (changed) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
                localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
            }
        },
        reset() {
            const collection = buildUnifiedCollection();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
            localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
            return collection;
        },
        getAll() {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : buildUnifiedCollection();
        },
        getLoteById(id_lote) {
            const collection = this.getAll();
            return collection.features.find(f => f.properties.id_lote === id_lote);
        },
        updateLote(id_lote, updates) {
            const collection = this.getAll();
            const feature = collection.features.find(f => f.properties.id_lote === id_lote);
            if (feature) {
                Object.assign(feature.properties, updates);
                feature.properties.ultima_modificacion = new Date().toISOString();
                if (updates.precio !== undefined) {
                    feature.properties.precio_display = formatPrice(updates.precio);
                }
                localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
                localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
                this.addToSyncQueue({ id_lote, updates, timestamp: new Date().toISOString() });
            }
            return feature;
        },
        addToSyncQueue(change) {
            const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
            queue.push(change);
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
        },
        getSyncQueue() {
            return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
        },
        clearSyncQueue() {
            localStorage.setItem(SYNC_QUEUE_KEY, '[]');
        },
        getStats() {
            const collection = this.getAll();
            const stats = { disponible: 0, reservada: 0, vendida: 0, total: 0 };
            collection.features.forEach(f => {
                const estado = String(f.properties.estado).toLowerCase();
                if (estado === 'disponible') stats.disponible++;
                else if (estado === 'reservada') stats.reservada++;
                else if (estado === 'vendida') stats.vendida++;
                stats.total++;
            });
            return stats;
        },
        formatPrice,
        parsePrice
    };
})();
