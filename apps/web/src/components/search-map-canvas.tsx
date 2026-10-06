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

import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import type { ReactElement } from 'react';
import { MapContainer, Polygon, TileLayer } from 'react-leaflet';

import { MapClusterLayer } from './map-cluster-layer';
import { MapDrawControl } from './map-draw-control';
import type { SearchMapProps } from './search-map-types';

// Decisión 112: un solo host, sin subdominios a/b/c.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// SMV-9 (ODbL): literal exacto con enlace a la página de copyright.
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

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

export default function SearchMapCanvas(props: SearchMapProps): ReactElement {
  const bounds = initialBounds(props);
  const view =
    bounds !== null
      ? { bounds, boundsOptions: { padding: [24, 24] as [number, number], maxZoom: 16 } }
      : { center: SPAIN_CENTER, zoom: SPAIN_ZOOM };

  return (
    <MapContainer {...view} className="search-map__canvas" scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      {props.polygon !== null ? (
        <Polygon positions={props.polygon.map((vertex): LatLngTuple => [vertex.lat, vertex.lon])} />
      ) : null}
      <MapClusterLayer points={props.points} />
      <MapDrawControl baseParams={props.baseParams} hasPolygon={props.polygon !== null} />
    </MapContainer>
  );
}
