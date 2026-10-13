// ROADMAP 2.6 (decisiones 113 y 119; SMV-6) — capa imperativa de marcadores
// agrupados. Sin `'use client'` (código de cliente por el grafo de imports).
//
// XSS: etiquetas y popups se construyen con nodos DOM y `textContent`; jamás
// se compone HTML de cadena con datos (lo fija `map-guards.test.ts`).
// `L.divIcon` acepta un `HTMLElement` en su campo de contenido (verificado en
// @types/leaflet 1.9.22 y en DivIcon.js de leaflet 1.9.4).
//
// D.8a (decisiones 165 y 166): el aspecto vive en `search-map-canvas.css` por
// clases (`map-marker`, `map-price`, `map-cluster`, `map-popup`); aquí no hay
// estilos en línea ni colores.
import L from 'leaflet';
// Efecto lateral: registra `L.markerClusterGroup` (UMD sobre el `L` global).
import 'leaflet.markercluster';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

import { appendSearchReturn } from '@/lib/property-href';
import type { RawSearchParams } from '@/lib/search-href';
import { formatClusterUnit, formatMarkerTitle } from '@/lib/search-labels';
import { pickSearchReturnParams } from '@/lib/search-return-params';
import type { SearchReturnParams } from '@/lib/search-return-params';

import { createIconElement } from './icon';
import type { MapPointView } from './search-map-types';

const LABEL_SIZE: L.PointTuple = [96, 24];
const CLUSTER_SIZE: L.PointTuple = [40, 40];

function buildPriceLabel(text: string): HTMLElement {
  const label = document.createElement('div');
  label.className = 'map-price';
  label.textContent = text;
  return label;
}

// Clúster: el número y, solo para lectores de pantalla, la unidad («12 viviendas»).
function buildClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const content = document.createElement('span');
  content.textContent = String(count);
  const unit = document.createElement('span');
  unit.className = 'sr-only';
  unit.textContent = ` ${formatClusterUnit(count)}`;
  content.appendChild(unit);
  return L.divIcon({ html: content, className: 'map-cluster', iconSize: CLUSTER_SIZE });
}

// Popup: precio + enlace plano de misma pestaña. Sin href, sin enlace. D.9: el enlace
// añade los parámetros de la búsqueda (sin `page`) para que la ficha pueda volver.
function buildPopup(point: MapPointView, returnParams: SearchReturnParams): HTMLElement {
  const box = document.createElement('div');
  const price = document.createElement('p');
  price.className = 'map-popup__price';
  price.textContent = point.priceLabel;
  box.appendChild(price);
  if (point.href !== null) {
    const link = document.createElement('a');
    link.className = 'map-popup__link';
    link.href = appendSearchReturn(point.href, returnParams);
    link.textContent = 'Ver vivienda';
    box.appendChild(link);
  }
  return box;
}

// Leaflet rotula el cierre del popup en inglés («Close») y lo dibuja con un glifo ×: se pasa al
// español y se sustituye por el icono dibujado al abrirlo (WCAG 3.1.2, decisión 166). Leaflet crea
// el botón una vez por popup y conserva su manejador de clic; la comprobación de svg hace el
// cambio idempotente si el popup se reabre.
function labelPopupClose(event: L.PopupEvent): void {
  const close = event.popup.getElement()?.querySelector('.leaflet-popup-close-button');
  if (close === null || close === undefined) return;
  close.setAttribute('aria-label', 'Cerrar');
  if (close.querySelector('svg') === null) close.replaceChildren(createIconElement('close'));
}

export function MapClusterLayer({
  points,
  baseParams,
}: {
  readonly points: readonly MapPointView[];
  readonly baseParams: RawSearchParams;
}): null {
  const map = useMap();

  useEffect(() => {
    // Una sola vez por efecto: el mapa no pagina, así que sin `page` (decisión 171).
    const returnParams = pickSearchReturnParams(baseParams, { includePage: false });
    const group = L.markerClusterGroup({ iconCreateFunction: buildClusterIcon, animate: false });
    for (const point of points) {
      const icon = L.divIcon({
        html: buildPriceLabel(point.priceLabel),
        className: 'map-marker',
        iconSize: LABEL_SIZE,
        iconAnchor: [LABEL_SIZE[0] / 2, LABEL_SIZE[1] / 2],
      });
      const marker = L.marker([point.lat, point.lon], {
        icon,
        title: formatMarkerTitle(point.priceLabel),
      });
      marker.bindPopup(buildPopup(point, returnParams), { className: 'map-popup' });
      group.addLayer(marker);
    }
    map.addLayer(group);
    map.on('popupopen', labelPopupClose);
    return (): void => {
      map.off('popupopen', labelPopupClose);
      map.removeLayer(group);
    };
  }, [map, points, baseParams]);

  return null;
}
