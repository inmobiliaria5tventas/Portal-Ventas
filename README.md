# 5TIERRAS CRM - Portal de Ventas Interactivos

Plataforma GIS interactiva para la gestión y visualización de proyectos inmobiliarios y ventas de lotes.

## Características Principales

- **Mapas Interactivos**: Basados en Leaflet.js con capas de satélite híbridas.
- **Gestión en Tiempo Real**: Sincronización de estados (Disponible, Reservado, Vendido) entre exportaciones de QGIS y el estado local de la aplicación.
- **Diseño 100% Responsivo**: Interfaz optimizada para dispositivos móviles (iOS/Android), tablets y escritorio.
- **Geolocalización GPS**: Función "Ubicarme" con marcador de pulso para navegación en terreno.
- **Búsqueda Inteligente**: Localización rápida de lotes por número.
- **Diseño Premium**: Interfaz oscura con efectos de glassmorphism y animaciones fluidas.

## Estructura del Proyecto

- `/index.html`: Portal principal de acceso a todos los proyectos.
- `/Logos`: Identidad visual de cada proyecto.
- `/[Proyecto]`: Carpetas individuales por proyecto (El Copihue, Los Encinos, etc.)
    - `/app`: Código fuente de la aplicación móvil (HTML/JS/CSS).
    - `/layers`: Capas de datos GeoJSON extraídas de QGIS.

## Tecnologías Utilizadas

- **Frontend**: HTML5, Vanilla CSS3, JavaScript ES6+.
- **Mapping**: Leaflet.js + Esri World Imagery.
- **Iconografía**: Font Awesome 6.
- **Tipografía**: Google Fonts (Inter, Outfit).

## Instalación y Uso

Este es un proyecto estático. Para visualizarlo:
1. Clona el repositorio.
2. Abre `index.html` en cualquier navegador moderno.

*Desarrollado para 5TIERRAS CRM.*
