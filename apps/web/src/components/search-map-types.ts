// ROADMAP 2.6 (decisión 119) — forma de los datos que el servidor entrega al
// mapa. Solo tipos: este fichero no importa Leaflet, así que `page.tsx` puede
// importarlo sin arrastrar la librería del mapa.
import type { PolygonRing } from '@buscahogar/core';

import type { RawSearchParams } from '@/lib/search-href';

// Un punto ya listo para pintar: la etiqueta de precio y el enlace de detalle
// se calculan en el servidor (`formatPriceCents`, `buildPropertyDetailHref`).
// `href` es null si la vivienda no tiene anuncio ancla: el popup no enlaza.
export interface MapPointView {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly priceLabel: string;
  readonly href: string | null;
}

export interface SearchMapProps {
  readonly points: readonly MapPointView[];
  // Polígono activo de la URL (ya validado en el servidor), o null.
  readonly polygon: PolygonRing | null;
  // Parámetros crudos de la URL: base de los href de dibujar y quitar zona.
  readonly baseParams: RawSearchParams;
}
