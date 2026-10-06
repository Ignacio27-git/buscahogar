// ROADMAP 2.6 (decisiones 112-114) — lienzo del mapa. Sin `'use client'`: se
// carga solo a través del wrapper `search-map.tsx` (dynamic, ssr:false), así
// que es código de cliente por el grafo de imports. Único fichero de `src/`
// que conoce el host de teselas de OpenStreetMap: el navegador las pide
// directamente (el servidor nunca las descarga ni las proxea, SMV-9).
//
// CSS de Leaflet: se importa aquí, junto al componente que lo necesita, y no
// en `layout.tsx`, para que la hoja de estilos tampoco viaje con la lista.
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
// D.8a (decisión 165): la hoja propia va la ÚLTIMA, para ganar a las de terceros.
import './search-map-canvas.css';

import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { MapContainer, Polygon, TileLayer, ZoomControl, useMap } from 'react-leaflet';

import { MapClusterLayer } from './map-cluster-layer';
import { MapDrawControl } from './map-draw-control';
import type { SearchMapProps } from './search-map-types';

// Decisión 112: un solo host, sin subdominios a/b/c.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// SMV-9 (ODbL): literal exacto con enlace a la página de copyright.
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Márgenes y zoom máximo del encuadre, compartidos por el montaje y el reajuste.
const FIT_OPTIONS = { padding: [24, 24] as [number, number], maxZoom: 16 };

const SPAIN_CENTER: LatLngTuple = [40.2, -3.7];
const SPAIN_ZOOM = 6;

// Encuadre inicial (solo al montar: `MapContainer` no reacciona a cambios de
// `bounds`): el polígono, si no los puntos, si no España entera.
function initialBounds(props: SearchMapProps): LatLngBoundsExpression | null {
  if (props.polygon !== null) {
    return L.latLngBounds(props.polygon.map((vertex): LatLngTuple => [vertex.lat, vertex.lon]));
  }
  if (props.points.length > 0) {
    return L.latLngBounds(props.points.map((point): LatLngTuple => [point.lat, point.lon]));
  }
  return null;
}

// D.8a (decisión 167) — encuadre de un mapa montado oculto. La sección del mapa lleva
// `display: none` bajo 64rem en la vista de lista, así que el mapa nace con tamaño 0×0 y
// `getBoundsZoom` lo deja en el zoom máximo sobre el centro. Se observa el tamaño del
// contenedor: al primer tamaño distinto de cero (cruzar 64rem o pasar a «Ver mapa», que es
// una navegación sin evento de ventana) se recalcula el tamaño y se vuelve a encuadrar. Leaflet
// solo escucha el `resize` de la ventana, de ahí el `ResizeObserver`.
function InitialFrame({ bounds }: { readonly bounds: LatLngBoundsExpression | null }): null {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let pending = bounds !== null && (container.clientWidth === 0 || container.clientHeight === 0);
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (pending && bounds !== null && container.clientWidth > 0 && container.clientHeight > 0) {
        pending = false;
        map.fitBounds(bounds, FIT_OPTIONS);
      }
    });
    observer.observe(container);
    return (): void => {
      observer.disconnect();
    };
    // El encuadre inicial solo cuenta al montar; los puntos nuevos no recolocan el mapa.
  }, [map]);

  return null;
}

export default function SearchMapCanvas(props: SearchMapProps): ReactElement {
  const bounds = initialBounds(props);
  const view =
    bounds !== null
      ? { bounds, boundsOptions: FIT_OPTIONS }
      : { center: SPAIN_CENTER, zoom: SPAIN_ZOOM };

  return (
    <MapContainer {...view} className="search-map__canvas" scrollWheelZoom zoomControl={false}>
      <ZoomControl zoomInTitle="Acercar" zoomOutTitle="Alejar" />
      <InitialFrame bounds={bounds} />
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      {props.polygon !== null ? (
        <Polygon
          positions={props.polygon.map((vertex): LatLngTuple => [vertex.lat, vertex.lon])}
          className="map-area"
        />
      ) : null}
      <MapClusterLayer points={props.points} baseParams={props.baseParams} />
      <MapDrawControl baseParams={props.baseParams} hasPolygon={props.polygon !== null} />
    </MapContainer>
  );
}
