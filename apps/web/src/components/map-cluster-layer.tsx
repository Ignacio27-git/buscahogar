// ROADMAP 2.6 (decisiones 113 y 119; SMV-6) — capa imperativa de marcadores
// agrupados. Sin `'use client'` (código de cliente por el grafo de imports).
//
// XSS: etiquetas y popups se construyen con nodos DOM y `textContent`; jamás
// se compone HTML de cadena con datos (lo fija `map-guards.test.ts`).
// `L.divIcon` acepta un `HTMLElement` en su campo de contenido (verificado en
// @types/leaflet 1.9.22 y en DivIcon.js de leaflet 1.9.4).
import L from 'leaflet';
// Efecto lateral: registra `L.markerClusterGroup` (UMD sobre el `L` global).
import 'leaflet.markercluster';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

import type { MapPointView } from './search-map-types';

const LABEL_SIZE: L.PointTuple = [96, 24];

function buildPriceLabel(text: string): HTMLElement {
  const label = document.createElement('div');
  label.textContent = text;
  label.style.cssText =
    'box-sizing:border-box;width:100%;height:100%;padding:2px 6px;background:#fff;border:1px solid #1d4ed8;' +
    'border-radius:4px;font:600 12px/18px sans-serif;color:#1e3a8a;text-align:center;white-space:nowrap;' +
    'overflow:hidden;text-overflow:ellipsis;';
  return label;
}

// Popup: precio + enlace plano de misma pestaña. Sin href, sin enlace.
function buildPopup(point: MapPointView): HTMLElement {
  const box = document.createElement('div');
  const price = document.createElement('p');
  price.textContent = point.priceLabel;
  box.appendChild(price);
  if (point.href !== null) {
    const link = document.createElement('a');
    link.href = point.href;
    link.textContent = 'Ver vivienda';
    box.appendChild(link);
  }
  return box;
}

export function MapClusterLayer({ points }: { readonly points: readonly MapPointView[] }): null {
  const map = useMap();

  useEffect(() => {
    const group = L.markerClusterGroup();
    for (const point of points) {
      const icon = L.divIcon({
        html: buildPriceLabel(point.priceLabel),
        className: '',
        iconSize: LABEL_SIZE,
        iconAnchor: [LABEL_SIZE[0] / 2, LABEL_SIZE[1] / 2],
      });
      const marker = L.marker([point.lat, point.lon], { icon });
      marker.bindPopup(buildPopup(point));
      group.addLayer(marker);
    }
    map.addLayer(group);
    return (): void => {
      map.removeLayer(group);
    };
  }, [map, points]);

  return null;
}
