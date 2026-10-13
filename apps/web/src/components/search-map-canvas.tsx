// ROADMAP 2.6 (decisiones 112-114) — lienzo del mapa. Sin `'use client'`: se
// carga solo a través del wrapper `search-map.tsx` (dynamic, ssr:false), así
// que es código de cliente por el grafo de imports. El host de teselas de
// OpenStreetMap vive en `lib/osm-tiles.ts` (decisión 179): el navegador las
// pide directamente (el servidor nunca las descarga ni las proxea, SMV-9).
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

import { stripPrefixTitles } from '@/lib/map-attribution';
import { OSM_TILE_URL_TEMPLATE } from '@/lib/osm-tiles';

import { ZOOM_IN_MARKUP, ZOOM_OUT_MARKUP } from './icon';
import { MapClusterLayer } from './map-cluster-layer';
import { MapDrawControl } from './map-draw-control';
import { makeKeyboardInstant } from './map-instant-keyboard';
import type { SearchMapProps } from './search-map-types';

// Decisión 112 (enmendada por la 179): el host de teselas vive en `lib/osm-tiles.ts`.
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

// D.15 (F7, decisión 199) — el prefijo de la atribución de Leaflet lleva un `title` en inglés. Se
// reescribe el prefijo (Leaflet vuelve a pintar el control con él) en lugar de tocar el DOM, que
// Leaflet regeneraría. El crédito, el enlace y la bandera quedan igual.
function AttributionLanguage(): null {
  const map = useMap();

  useEffect(() => {
    const control = map.attributionControl;
    const prefix = control.options.prefix;
    if (typeof prefix === 'string') control.setPrefix(stripPrefixTitles(prefix));
  }, [map]);

  return null;
}

// D.15 (F2, decisión 194) — el contenedor de Leaflet es lo que recibe el foco (tabindex 0) y no
// tiene rol ni nombre; `react-leaflet` no reenvía atributos ARIA desde `MapContainer`. Se
// ponen aquí, en el elemento que existe solo en el cliente, y se retiran al desmontar. La
// descripción apunta al párrafo de ayuda que el servidor pinta visible junto al mapa.
function ContainerSemantics({ keyboardHelpId }: { readonly keyboardHelpId: string }): null {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Mapa interactivo');
    container.setAttribute('aria-describedby', keyboardHelpId);
    return (): void => {
      container.removeAttribute('role');
      container.removeAttribute('aria-label');
      container.removeAttribute('aria-describedby');
    };
  }, [map, keyboardHelpId]);

  return null;
}

// D.16 (decisión 206) — pan y zoom con las teclas sin animación. Las opciones de `MapContainer`
// apagan las animaciones de zoom y de fundido; el desplazamiento por teclado solo se hace
// instantáneo envolviendo el manejador privado, y ese parche vive en `map-instant-keyboard.ts`.
function InstantKeyboard(): null {
  const map = useMap();

  useEffect(() => makeKeyboardInstant(map), [map]);

  return null;
}

export default function SearchMapCanvas(props: SearchMapProps): ReactElement {
  const bounds = initialBounds(props);
  const view =
    bounds !== null
      ? { bounds, boundsOptions: FIT_OPTIONS }
      : { center: SPAIN_CENTER, zoom: SPAIN_ZOOM };

  return (
    <MapContainer
      {...view}
      className="search-map__canvas"
      scrollWheelZoom
      zoomControl={false}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
    >
      <ZoomControl
        zoomInTitle="Acercar"
        zoomOutTitle="Alejar"
        zoomInText={ZOOM_IN_MARKUP}
        zoomOutText={ZOOM_OUT_MARKUP}
      />
      <InitialFrame bounds={bounds} />
      <AttributionLanguage />
      <ContainerSemantics keyboardHelpId={props.keyboardHelpId} />
      <InstantKeyboard />
      <TileLayer url={OSM_TILE_URL_TEMPLATE} attribution={ATTRIBUTION} maxZoom={19} />
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
