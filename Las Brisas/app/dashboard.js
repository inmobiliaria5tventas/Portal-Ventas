/**
 * DASHBOARD.JS - Hacienda El Copihue - Public Dashboard
 * Read-only client-facing viewer that syncs with the mobile app.
 */

(() => {
    let map;
    let lotesLayer;

    const ESTADO_COLORS = {
        'Disponible': { fill: '#22c55e', stroke: '#16a34a', opacity: 0.55 },
        'Reservada': { fill: '#eab308', stroke: '#ca8a04', opacity: 0.55 },
        'Vendida': { fill: '#ef4444', stroke: '#dc2626', opacity: 0.45 },
    };

    function init() {
        DataModule.init();
        initMap();
        renderAll();
        startAutoRefresh();
    }

    function initMap() {
        map = L.map('dash-map', {
            zoomControl: true,
            maxZoom: 20,
            minZoom: 13,
        });

        // Satellite
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20,
            maxNativeZoom: 18
        }).addTo(map);

        // Labels
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            opacity: 0.7
        }).addTo(map);

        map.fitBounds([
            [-36.12444471346862, -71.78580864753636],
            [-36.116548455464, -71.76787489077763]
        ]);
    }

    function renderAll() {
        renderMap();
        renderStats();
        renderLotesList();
        renderProgress();
        updateTimestamp();
    }

    function renderMap() {
        if (lotesLayer) map.removeLayer(lotesLayer);

        const collection = DataModule.getAll();

        lotesLayer = L.geoJSON(collection, {
            style: (feature) => {
                const colors = ESTADO_COLORS[feature.properties.estado] || ESTADO_COLORS['Disponible'];
                return {
                    fillColor: colors.fill,
                    fillOpacity: colors.opacity,
                    color: colors.stroke,
                    weight: 2,
                    opacity: 0.9
                };
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const priceStr = p.precio ? DataModule.formatPrice(p.precio) : 'Consultar';

                layer.bindTooltip(
                    `<div style="text-align:center">
                        <strong>Lote ${p.id_lote}</strong><br>
                        <span style="font-size:11px;color:#64748b">${p.area}</span>
                    </div>`,
                    { direction: 'center', className: 'dash-tooltip', permanent: true }
                );

                layer.bindPopup(
                    `<div style="font-family:'Inter',sans-serif;min-width:180px">
                        <div style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;margin-bottom:6px">Lote ${p.id_lote}</div>
                        <div style="font-size:12px;color:#64748b;margin-bottom:8px">${p.area}</div>
                        <div style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;
                            background:${p.estado === 'Disponible' ? '#f0fdf4' : p.estado === 'Reservada' ? '#fefce8' : '#fef2f2'};
                            color:${p.estado === 'Disponible' ? '#22c55e' : p.estado === 'Reservada' ? '#eab308' : '#ef4444'};
                            margin-bottom:8px">${p.estado}</div>
                        <div style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:#22c55e">${priceStr}</div>
                    </div>`,
                    { maxWidth: 250 }
                );
            }
        }).addTo(map);
    }

    function renderStats() {
        const stats = DataModule.getStats();
        document.getElementById('dash-stat-disponible').textContent = stats.disponible;
        document.getElementById('dash-stat-reservada').textContent = stats.reservada;
        document.getElementById('dash-stat-vendida').textContent = stats.vendida;
    }

    function renderProgress() {
        const stats = DataModule.getStats();
        const total = stats.total || 1;
        const vendidaPct = ((stats.vendida / total) * 100).toFixed(1);
        const reservadaPct = ((stats.reservada / total) * 100).toFixed(1);

        document.getElementById('dash-progress-vendida').style.width = vendidaPct + '%';
        document.getElementById('dash-progress-reservada').style.width = reservadaPct + '%';
        document.getElementById('dash-progress-text').textContent =
            `${vendidaPct}% vendido · ${reservadaPct}% reservado · ${(100 - parseFloat(vendidaPct) - parseFloat(reservadaPct)).toFixed(1)}% disponible`;
    }

    function renderLotesList() {
        const collection = DataModule.getAll();
        const list = document.getElementById('dash-lotes-list');
        list.innerHTML = '';

        // Show available and reserved lotes
        const visibleLotes = collection.features
            .filter(f => f.properties.estado !== 'Vendida')
            .sort((a, b) => {
                if (a.properties.estado === 'Disponible' && b.properties.estado !== 'Disponible') return -1;
                if (a.properties.estado !== 'Disponible' && b.properties.estado === 'Disponible') return 1;
                return parseInt(a.properties.id_lote) - parseInt(b.properties.id_lote);
            });

        document.getElementById('dash-lotes-count').textContent = visibleLotes.length;

        visibleLotes.forEach(f => {
            const p = f.properties;
            const priceStr = p.precio ? DataModule.formatPrice(p.precio) : 'Consultar';
            const statusClass = p.estado.toLowerCase();

            const item = document.createElement('div');
            item.className = 'dash-lote-item';
            item.innerHTML = `
                <div>
                    <div class="dash-lote-item__name">Lote ${p.id_lote}</div>
                    <div class="dash-lote-item__area">${p.area}</div>
                </div>
                <div style="text-align:right">
                    <div class="dash-lote-item__price">${priceStr}</div>
                    <div class="dash-lote-item__status dash-lote-item__status--${statusClass}">${p.estado}</div>
                </div>
            `;

            // Click to zoom on map
            item.addEventListener('click', () => {
                const latLng = getCentroid(f.geometry);
                if (latLng) {
                    map.flyTo(latLng, 18, { duration: 0.8 });
                    // Open popup
                    lotesLayer.eachLayer(layer => {
                        if (layer.feature && layer.feature.properties.id_lote === p.id_lote) {
                            layer.openPopup();
                        }
                    });
                }
            });

            list.appendChild(item);
        });
    }

    function getCentroid(geometry) {
        try {
            const coords = geometry.type === 'MultiPolygon'
                ? geometry.coordinates[0][0]
                : geometry.coordinates[0];
            let lat = 0, lng = 0;
            coords.forEach(c => { lng += c[0]; lat += c[1]; });
            return [lat / coords.length, lng / coords.length];
        } catch {
            return null;
        }
    }

    function updateTimestamp() {
        const lastUpdate = DataModule.getLastUpdate();
        const date = new Date(lastUpdate);
        document.getElementById('dash-last-update').textContent =
            `Actualizado: ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    // Auto-refresh every 5 seconds (simulating realtime)
    function startAutoRefresh() {
        setInterval(() => {
            renderAll();
        }, 5000);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
