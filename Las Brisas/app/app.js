/**
 * APP.JS - Hacienda Las Brisas - Mobile Management App
 * Main application logic: Map, BottomSheet, Quick-Tap, Numpad, GPS
 */

(() => {
    // ── State ──
    let map;
    let lotesLayer;
    let selectedLote = null;
    let isOnline = true;
    let highlightedLayer = null;
    let userMarker = null;
    let numpadValue = '';
    let numpadTargetLote = null;

    // ── Color Config ──
    const ESTADO_COLORS = {
        'Disponible': { fill: '#22c55e', stroke: '#16a34a', opacity: 0.45 },
        'Reservada': { fill: '#eab308', stroke: '#ca8a04', opacity: 0.5 },
        'Vendida': { fill: '#ef4444', stroke: '#dc2626', opacity: 0.45 },
    };

    // ── Init ──
    function init() {
        showLoading();
        DataModule.init();
        initMap();
        renderLotes();
        updateStats();
        setupEventListeners();
        simulateOnlineStatus();
        hideLoading();
    }

    // ── Loading Screen ──
    function showLoading() {
        const bar = document.querySelector('.loading-screen__bar-inner');
        if (bar) {
            let w = 0;
            const interval = setInterval(() => {
                w += Math.random() * 30;
                if (w > 100) w = 100;
                bar.style.width = w + '%';
                if (w >= 100) clearInterval(interval);
            }, 150);
        }
    }

    function hideLoading() {
        setTimeout(() => {
            const screen = document.querySelector('.loading-screen');
            if (screen) {
                screen.classList.add('fade-out');
                setTimeout(() => screen.remove(), 500);
            }
        }, 1200);
    }

    // ── Map Init ──
    function initMap() {
        map = L.map('map', {
            zoomControl: false,
            maxZoom: 20,
            minZoom: 13,
            attributionControl: false
        });

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);

        // Satellite hybrid basemap
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20,
            maxNativeZoom: 18
        }).addTo(map);

        // Labels overlay
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            opacity: 0.7
        }).addTo(map);

        // Zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Fit to bounds of Hacienda
        map.setView([-36.387, -71.952], 16);

        // Toggle labels based on zoom level (Scale >= 1:10000 approx)
        function updateLabelsVisibility() {
            if (map.getZoom() < 16) {
                map.getContainer().classList.add('map-low-zoom');
            } else {
                map.getContainer().classList.remove('map-low-zoom');
            }
        }
        map.on('zoomend', updateLabelsVisibility);
        updateLabelsVisibility(); // Initial check

        // Close bottomsheet on map click (no feature)
        map.on('click', (e) => {
            if (!e.originalEvent._loteClicked) {
                closeBottomSheet();
            }
        });
    }

    // ── Render Lotes ──
    function renderLotes() {
        if (lotesLayer) {
            map.removeLayer(lotesLayer);
        }

        const collection = DataModule.getAll();

        lotesLayer = L.geoJSON(collection, {
            style: (feature) => {
                const estado = feature.properties.estado;
                const colors = ESTADO_COLORS[estado] || ESTADO_COLORS['Disponible'];
                return {
                    fillColor: colors.fill,
                    fillOpacity: colors.opacity,
                    color: colors.stroke,
                    weight: 2,
                    opacity: 0.8
                };
            },
            onEachFeature: (feature, layer) => {
                // Tooltip with lote number
                layer.bindTooltip(
                    `<span style="font-size:12px;font-weight:700;">Lote ${feature.properties.id_lote}</span>`,
                    {
                        permanent: true,
                        direction: 'center',
                        className: 'lote-label'
                    }
                );

                // Click handler
                layer.on('click', (e) => {
                    e.originalEvent._loteClicked = true;
                    selectLote(feature, layer);
                });

                // Hover effects
                layer.on('mouseover', () => {
                    if (highlightedLayer !== layer) {
                        layer.setStyle({ weight: 3, fillOpacity: 0.7 });
                    }
                });

                layer.on('mouseout', () => {
                    if (highlightedLayer !== layer) {
                        const colors = ESTADO_COLORS[feature.properties.estado] || ESTADO_COLORS['Disponible'];
                        layer.setStyle({ weight: 2, fillOpacity: colors.opacity });
                    }
                });
            }
        }).addTo(map);
    }

    // ── Select Lote (Open BottomSheet) ──
    function selectLote(feature, layer) {
        selectedLote = feature;

        // Highlight
        if (highlightedLayer) {
            const prevColors = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 2, fillOpacity: prevColors.opacity });
        }
        highlightedLayer = layer;
        layer.setStyle({ weight: 4, fillOpacity: 0.8, color: '#fff' });

        // Center map on lote
        map.flyTo(layer.getBounds().getCenter(), Math.max(map.getZoom(), 17), {
            duration: 0.5
        });

        // Populate bottomsheet
        const props = feature.properties;
        const isVendida = props.estado === 'Vendida';

        document.getElementById('bs-lote-id').textContent = `Lote ${props.id_lote}`;
        document.getElementById('bs-lote-area').textContent = props.area;

        // Status badge
        const statusBadge = document.getElementById('bs-current-status');
        statusBadge.className = `bottomsheet__current-status bottomsheet__current-status--${props.estado.toLowerCase()}`;
        statusBadge.innerHTML = `<span>●</span> ${props.estado}`;

        // Show/hide editing controls
        document.querySelector('.status-buttons').style.display = isVendida ? 'none' : '';
        document.getElementById('price-row').style.display = isVendida ? 'none' : '';
        document.getElementById('comprobante-row').style.display = (props.estado === 'Reservada') ? '' : 'none';
        document.getElementById('bs-vendida-info').style.display = isVendida ? 'block' : 'none';

        // Active status button (only relevant for non-vendida)
        if (!isVendida) {
            document.querySelectorAll('.status-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.estado === props.estado);
            });
        }

        // Price
        document.getElementById('bs-price-value').textContent = props.precio_display || DataModule.formatPrice(props.precio);

        // Last modified
        const date = new Date(props.ultima_modificacion);
        document.getElementById('bs-last-modified').textContent =
            `Última modificación: ${date.toLocaleDateString('es-CL')} ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;

        // Open bottomsheet
        openBottomSheet();
    }

    // ── BottomSheet Controls ──
    function openBottomSheet() {
        document.getElementById('bottomsheet').classList.add('active');
        document.getElementById('bottomsheet-overlay').classList.add('active');
        document.querySelector('.stats-bar').classList.add('hidden');
    }

    function closeBottomSheet() {
        document.getElementById('bottomsheet').classList.remove('active');
        document.getElementById('bottomsheet-overlay').classList.remove('active');
        document.querySelector('.stats-bar').classList.remove('hidden');
        selectedLote = null;

        if (highlightedLayer) {
            const colors = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({
                weight: 2,
                fillOpacity: colors.opacity,
                color: colors.stroke
            });
            highlightedLayer = null;
        }
    }

    // ── Quick-Tap Status Change ──
    function changeStatus(newEstado) {
        if (!selectedLote) return;
        if (selectedLote.properties.estado === 'Vendida') {
            showToast('🔒 Lote vendido — no editable', 'warning');
            return;
        }

        const loteId = selectedLote.properties.id_lote;
        DataModule.updateLote(loteId, { estado: newEstado });

        // Refresh
        renderLotes();
        updateStats();

        // Re-select the lote
        const updatedFeature = DataModule.getLoteById(loteId);
        lotesLayer.eachLayer(layer => {
            if (layer.feature && layer.feature.properties.id_lote === loteId) {
                selectLote(layer.feature, layer);
            }
        });

        showToast(`Lote ${loteId} → ${newEstado}`, 'success');
        updateSyncBadge();
    }

    // ── Price Numpad ──
    function openNumpad() {
        if (!selectedLote) return;
        if (selectedLote.properties.estado === 'Vendida') {
            showToast('🔒 Lote vendido — no editable', 'warning');
            return;
        }
        numpadTargetLote = selectedLote.properties.id_lote;
        numpadValue = String(selectedLote.properties.precio || '');
        updateNumpadDisplay();
        document.getElementById('numpad-overlay').classList.add('active');
    }

    function closeNumpad() {
        document.getElementById('numpad-overlay').classList.remove('active');
        numpadValue = '';
        numpadTargetLote = null;
    }

    function numpadKeyPress(key) {
        if (key === 'back') {
            numpadValue = numpadValue.slice(0, -1);
        } else if (key === 'confirm') {
            confirmPrice();
            return;
        } else if (key === '000') {
            numpadValue += '000';
        } else {
            if (numpadValue.length < 12) {
                numpadValue += key;
            }
        }
        updateNumpadDisplay();
    }

    function updateNumpadDisplay() {
        const display = document.getElementById('numpad-display-value');
        const num = parseInt(numpadValue, 10) || 0;
        display.innerHTML = `<span class="currency">$</span> ${num.toLocaleString('es-CL')}`;
    }

    function confirmPrice() {
        if (!numpadTargetLote) return;
        const newPrice = parseInt(numpadValue, 10) || 0;

        DataModule.updateLote(numpadTargetLote, { precio: newPrice });

        // Refresh bottomsheet price
        document.getElementById('bs-price-value').textContent = DataModule.formatPrice(newPrice);

        // Update last modified
        const now = new Date();
        document.getElementById('bs-last-modified').textContent =
            `Última modificación: ${now.toLocaleDateString('es-CL')} ${now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;

        showToast(`Precio actualizado: ${DataModule.formatPrice(newPrice)}`, 'success');
        updateSyncBadge();
        closeNumpad();
    }

    // ── GPS / Locate ──
    function locateUser() {
        const btn = document.querySelector('.fab--locate');
        btn.classList.add('locating');
        map.locate({ setView: true, maxZoom: 18 });
    }

    function onLocationFound(e) {
        const btn = document.querySelector('.fab--locate');
        btn.classList.remove('locating');
        
        if (userMarker) map.removeLayer(userMarker);
        
        const gpsIcon = L.divIcon({
            className: 'gps-marker',
            html: '<div class="gps-marker__pulse"></div><div class="gps-marker__dot"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        userMarker = L.marker(e.latlng, { icon: gpsIcon }).addTo(map);
        
        // Find nearest lote
        findNearestLote(e.latlng.lat, e.latlng.lng);
    }

    function onLocationError(e) {
        const btn = document.querySelector('.fab--locate');
        btn.classList.remove('locating');
        showToast('No se pudo obtener la ubicación', 'warning');
    }

    function findNearestLote(lat, lng) {
        const point = L.latLng(lat, lng);
        let minDist = Infinity;
        let nearestLayer = null;

        lotesLayer.eachLayer(layer => {
            const center = layer.getBounds().getCenter();
            const dist = point.distanceTo(center);
            if (dist < minDist) {
                minDist = dist;
                nearestLayer = layer;
            }
        });

        if (nearestLayer && minDist < 500) {
            selectLote(nearestLayer.feature, nearestLayer);
        }
    }

    // ── Stats ──
    function updateStats() {
        const stats = DataModule.getStats();
        document.getElementById('stat-disponible').textContent = stats.disponible;
        document.getElementById('stat-reservada').textContent = stats.reservada;
        document.getElementById('stat-vendida').textContent = stats.vendida;
    }

    // ── Sync Badge ──
    function updateSyncBadge() {
        const queue = DataModule.getSyncQueue();
        const badge = document.getElementById('sync-badge');
        const count = document.getElementById('sync-count');

        if (queue.length > 0) {
            badge.classList.remove('hidden');
            count.textContent = queue.length;

            // Simulate auto-sync after 3s
            if (isOnline) {
                setTimeout(() => {
                    badge.classList.add('syncing');
                    setTimeout(() => {
                        DataModule.clearSyncQueue();
                        badge.classList.remove('syncing');
                        badge.classList.add('hidden');
                        showToast('✅ Cambios sincronizados', 'success');
                    }, 1500);
                }, 3000);
            }
        } else {
            badge.classList.add('hidden');
        }
    }

    // ── Online/Offline Simulation ──
    function simulateOnlineStatus() {
        const updateStatus = () => {
            isOnline = navigator.onLine;
            const el = document.getElementById('conn-status');
            if (isOnline) {
                el.className = 'conn-status conn-status--online';
                el.innerHTML = '<span class="conn-status__dot"></span> Online';
            } else {
                el.className = 'conn-status conn-status--offline';
                el.innerHTML = '<span class="conn-status__dot"></span> Offline';
            }
        };

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    }

    // ── Toast ──
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ── Search Lote ──
    function searchLote() {
        const input = document.getElementById('search-input').value.trim();
        if (!input) return;

        let foundLayer = null;
        lotesLayer.eachLayer(layer => {
            // Match input precisely or partially against id_lote
            if (layer.feature && String(layer.feature.properties.id_lote).toLowerCase() === input.toLowerCase()) {
                foundLayer = layer;
            }
        });

        if (foundLayer) {
            selectLote(foundLayer.feature, foundLayer);
            document.getElementById('search-input').value = '';
            document.getElementById('search-input').blur();
        } else {
            showToast(`Lote ${input} no encontrado`, 'warning');
        }
    }

    // ── Reset Data ──
    function resetData() {
        if (confirm('⚠️ ¿Restablecer todos los datos a su estado original?')) {
            DataModule.reset();
            renderLotes();
            updateStats();
            closeBottomSheet();
            showToast('Datos restablecidos', 'info');
        }
    }

    // ── Event Listeners ──
    function setupEventListeners() {
        // BottomSheet close
        document.getElementById('bs-close').addEventListener('click', closeBottomSheet);
        document.getElementById('bottomsheet-overlay').addEventListener('click', closeBottomSheet);

        // Status buttons
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => changeStatus(btn.dataset.estado));
        });

        // Search features
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) searchBtn.addEventListener('click', searchLote);
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchLote();
            });
        }

        // Price editor
        document.getElementById('price-row').addEventListener('click', openNumpad);

        // Numpad keys
        document.querySelectorAll('.numpad__key').forEach(key => {
            key.addEventListener('click', () => numpadKeyPress(key.dataset.key));
        });

        // Numpad cancel
        document.getElementById('numpad-cancel').addEventListener('click', closeNumpad);

        /*
        // GPS button
        document.getElementById('fab-locate').addEventListener('click', locateUser);
        */

        /* 
        // Dashboard button
        document.getElementById('fab-dashboard').addEventListener('click', () => {
            window.open('dashboard.html', '_blank');
        });

        // Reset button
        document.getElementById('fab-reset').addEventListener('click', resetData);
        */

        // Sync badge click
        document.getElementById('sync-badge').addEventListener('click', () => {
            const badge = document.getElementById('sync-badge');
            badge.classList.add('syncing');
            setTimeout(() => {
                DataModule.clearSyncQueue();
                badge.classList.remove('syncing');
                badge.classList.add('hidden');
                showToast('✅ Sincronización forzada', 'success');
            }, 2000);
        });

        // Comprobante (demo)
        document.getElementById('comprobante-row').addEventListener('click', () => {
            showToast('📎 Adjuntar comprobante (demo)', 'info');
        });
    }

    // ── Start ──
    document.addEventListener('DOMContentLoaded', init);
})();
