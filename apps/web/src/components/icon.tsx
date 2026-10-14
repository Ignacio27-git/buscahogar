// D.13b (decisión 185) — conjunto de iconos dibujados: sustituye a los glifos ×, ↗, + y −.
// Server Component sin `'use client'`: lo usan la lista de fuentes y los chips (servidor) y el
// mapa (cliente). Trazo 2 sobre una rejilla de 24, `currentColor` y decorativo (`aria-hidden`):
// el nombre accesible lo da siempre el texto del control que lo contiene.
import type { ReactElement } from 'react';

export type IconName = 'close' | 'external-link' | 'plus' | 'minus' | 'sun' | 'moon' | 'monitor';

const ICON_PATHS: Record<IconName, string> = {
  close: 'M18 6 6 18M6 6l12 12',
  'external-link': 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  // D.18 (decisión 223) — selector de tema: sol (claro), luna (oscuro) y monitor (sistema).
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  monitor: 'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 21h8M12 17v4',
};

export function Icon({ name, className }: { readonly name: IconName; readonly className?: string }): ReactElement {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// Leaflet inserta `zoomInText`/`zoomOutText` como HTML, así que se pasan cadenas de
// confianza sin datos; `icon.test.tsx` prueba que son exactamente el render del componente.
function markup(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${ICON_PATHS[name]}"></path></svg>`;
}

export const ZOOM_IN_MARKUP = markup('plus');
export const ZOOM_OUT_MARKUP = markup('minus');

// El cierre del popup lo crea Leaflet y no admite texto propio: se sustituye su glifo por un
// nodo SVG hecho con la API del DOM (sin HTML de cadena), con los mismos atributos que el componente.
export function createIconElement(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attributes: Record<string, string> = {
    class: 'icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}
