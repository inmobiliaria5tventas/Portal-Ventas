/**
 * APP.JS - Hacienda El Copihue - Mobile Management App
 */

(() => {
    let map;
    let lotesLayer;
    let selectedLote = null;
    let isOnline = true;
    let highlightedLayer = null;
    let userMarker = null;

    const ESTADO_COLORS = {
        'Disponible': { fill: '#22c55e', stroke: '#16a34a', opacity: 0.45 },
        'Reservada': { fill: '#eab308', stroke: '#ca8a04', opacity: 0.5 },
        'Vendida': { fill: '#ef4444', stroke: '#dc2626', opacity: 0.45 },
    };

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

    function showLoading() {
        const bar = document.querySelector('.loading-bar-inner');
        if (bar) bar.style.width = '100%';
    }

    function hideLoading() {
        setTimeout(() => {
            const screen = document.querySelector('.loading-screen');
            if (screen) {
                screen.classList.add('fade-out');
                setTimeout(() => screen.remove(), 500);
            }
        }, 800);
    }

    function initMap() {
        map = L.map('map', {
            zoomControl: false,
            maxZoom: 20,
            minZoom: 13,
            attributionControl: false
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20
        }).addTo(map);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20, opacity: 0.6
        }).addTo(map);

        // Center on El Copihue
        map.setView([-36.1205, -71.7770], 16);

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);

        function updateLabelsVisibility() {
            if (map.getZoom() < 16) map.getContainer().classList.add('map-low-zoom');
            else map.getContainer().classList.remove('map-low-zoom');
        }
        map.on('zoomend', updateLabelsVisibility);
        updateLabelsVisibility();

        map.on('click', (e) => {
            if (!e.originalEvent._loteClicked) closeBottomSheet();
        });
    }

    function renderLotes() {
        if (lotesLayer) map.removeLayer(lotesLayer);
        const collection = DataModule.getAll();

        lotesLayer = L.geoJSON(collection, {
            style: (feature) => {
                const colors = ESTADO_COLORS[feature.properties.estado] || ESTADO_COLORS['Disponible'];
                return { fillColor: colors.fill, fillOpacity: colors.opacity, color: colors.stroke, weight: 2 };
            },
            onEachFeature: (feature, layer) => {
                layer.bindTooltip(`Lote ${feature.properties.id_lote}`, {
                    permanent: true, direction: 'center', className: 'lote-label'
                });
                layer.on('click', (e) => {
                    e.originalEvent._loteClicked = true;
                    selectLote(feature, layer);
                });
            }
        }).addTo(map);
    }

    function selectLote(feature, layer) {
        selectedLote = feature;
        if (highlightedLayer) {
            const prev = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 2, fillOpacity: prev.opacity });
        }
        highlightedLayer = layer;
        layer.setStyle({ weight: 4, fillOpacity: 0.8, color: '#fff' });

        const props = feature.properties;
        const isVendida = props.estado === 'Vendida';

        document.getElementById('bs-lote-id').textContent = `Lote ${props.id_lote}`;
        document.getElementById('bs-lote-area').textContent = props.area;
        document.getElementById('bs-price-value').textContent = props.precio_display || DataModule.formatPrice(props.precio || 33000000);
        
        const badge = document.getElementById('bs-current-status');
        badge.className = `bottomsheet__current-status bottomsheet__current-status--${props.estado.toLowerCase()}`;
        badge.innerHTML = `<span>●</span> ${props.estado}`;

        // Buttons
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.estado === props.estado);
        });

        // Visibility
        document.querySelector('.status-buttons').style.display = isVendida ? 'none' : 'grid';
        document.getElementById('price-row').style.display = isVendida ? 'none' : 'flex';
        document.getElementById('bs-vendida-info').style.display = isVendida ? 'block' : 'none';

        // Last modified
        const date = props.ultima_modificacion ? new Date(props.ultima_modificacion) : new Date();
        document.getElementById('bs-last-modified').textContent = 
            `Última actualización: ${date.toLocaleDateString('es-CL')} ${date.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'})}`;

        openBottomSheet();
        map.flyTo(layer.getBounds().getCenter(), 18, { duration: 0.5 });
    }

    function openBottomSheet() {
        document.getElementById('bottomsheet').classList.add('active');
        document.getElementById('bottomsheet-overlay').classList.add('active');
        document.querySelector('.stats-bar').classList.add('hidden');
    }

    function closeBottomSheet() {
        document.getElementById('bottomsheet').classList.remove('active');
        document.getElementById('bottomsheet-overlay').classList.remove('active');
        document.querySelector('.stats-bar').classList.remove('hidden');
        if (highlightedLayer) {
            const colors = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 2, fillOpacity: colors.opacity, color: colors.stroke });
            highlightedLayer = null;
        }
    }

    function changeStatus(newEstado) {
        if (!selectedLote) return;
        DataModule.updateLote(selectedLote.properties.id_lote, { estado: newEstado });
        renderLotes();
        updateStats();
        
        const updated = DataModule.getLoteById(selectedLote.properties.id_lote);
        selectLote(updated, highlightedLayer);
        showToast(`Lote ${selectedLote.properties.id_lote} → ${newEstado}`, 'success');
    }

    function updateStats() {
        const stats = DataModule.getStats();
        document.getElementById('stat-disponible').textContent = stats.disponible;
        document.getElementById('stat-reservada').textContent = stats.reservada;
        document.getElementById('stat-vendida').textContent = stats.vendida;
    }

    function setupEventListeners() {
        document.getElementById('bs-close').addEventListener('click', closeBottomSheet);
        document.getElementById('bottomsheet-overlay').addEventListener('click', closeBottomSheet);
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => changeStatus(btn.dataset.estado));
        });
        document.getElementById('search-btn').addEventListener('click', searchLote);
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchLote();
        });
        document.getElementById('fab-locate').addEventListener('click', locateUser);
    }

    function locateUser() {
        const btn = document.getElementById('fab-locate');
        btn.classList.add('locating');
        map.locate({ setView: true, maxZoom: 18 });
    }

    function onLocationFound(e) {
        const btn = document.getElementById('fab-locate');
        btn.classList.remove('locating');
        
        if (userMarker) map.removeLayer(userMarker);
        
        const gpsIcon = L.divIcon({
            className: 'gps-marker',
            html: '<div class="gps-marker__pulse"></div><div class="gps-marker__dot"></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        userMarker = L.marker(e.latlng, { icon: gpsIcon }).addTo(map);
    }

    function onLocationError(e) {
        const btn = document.getElementById('fab-locate');
        btn.classList.remove('locating');
        showToast('No se pudo obtener la ubicación', 'warning');
    }

    function searchLote() {
        const val = document.getElementById('search-input').value.trim();
        let found = null;
        lotesLayer.eachLayer(l => {
            if (String(l.feature.properties.id_lote) === val) found = l;
        });
        if (found) selectLote(found.feature, found);
        else showToast('Lote no encontrado', 'warning');
    }

    function showToast(msg, type) {
        const t = document.createElement('div');
        t.className = `toast toast--${type}`;
        t.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${msg}`;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    function simulateOnlineStatus() {
        isOnline = navigator.onLine;
        window.addEventListener('online', () => isOnline = true);
        window.addEventListener('offline', () => isOnline = false);
    }

    init();
})();
