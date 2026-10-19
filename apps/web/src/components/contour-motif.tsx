// D.20 (decisión 235, enmienda la regla de marginalia de la 132) — el único motivo decorativo de la
// aplicación: cinco curvas de nivel junto al título de la búsqueda. SVG en línea (componente de
// servidor, sin `'use client'`): no hay fichero servido, así que no cambian la CSP ni el matcher del
// proxy ni la regla de `url(` del CSS.
//
// Es decorativo: `aria-hidden`, sin foco, sin rol, título ni descripción. No lleva atributo de trazo
// ni de color: sin CSS el trazo es `none` (invisible) y con CSS lo pone `.contour-motif` con
// `var(--rule)`. Las curvas comparten los puntos de control en x y solo bajan en y, de modo que no
// se cruzan; la segunda es la curva índice (más gruesa, como en un mapa topográfico).
import type { ReactElement } from 'react';

const CONTOUR_PATHS = [
  'M0 46C28 46 46 34 72 34S120 40 164 40S220 44 240 44',
  'M0 39C28 39 46 26 72 26S120 33 164 33S220 37 240 37',
  'M0 32C28 32 46 18 72 18S120 26 164 26S220 30 240 30',
  'M0 25C28 25 46 11 72 11S120 19 164 19S220 23 240 23',
  'M0 18C28 18 46 5 72 5S120 13 164 13S220 16 240 16',
] as const;

const INDEX_CONTOUR = 1;

export function ContourMotif(): ReactElement {
  return (
    <svg
      className="contour-motif"
      viewBox="0 0 240 48"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {CONTOUR_PATHS.map((path, index) => (
        <path key={path} d={path} className={index === INDEX_CONTOUR ? 'contour-motif__index' : undefined} />
      ))}
    </svg>
  );
}
