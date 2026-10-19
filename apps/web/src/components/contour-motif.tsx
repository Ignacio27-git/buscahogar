// D.20 (decisión 235, enmienda la regla de marginalia de la 132) — el único motivo decorativo de la
// aplicación: curvas de nivel junto al título de la búsqueda. SVG en línea (componente de servidor,
// sin `'use client'`): no hay fichero servido, así que no cambian la CSP ni el matcher del proxy ni la
// regla de `url(` del CSS.
//
// Son cinco anillos cerrados e irregulares alrededor de una misma cima, como un fragmento de mapa
// topográfico. Cada anillo contiene al anterior en todo su contorno, así que no se cruzan; el tercero
// es la curva índice (más gruesa).
//
// D.21 (decisión 243, M7) — en D.20 la caja era 240×48 y los anillos exteriores se salían de ella: el
// borde del SVG los cortaba en plano. Ahora el svg interior encuadra todos los anillos con margen
// (`-40 -7 330 66`, 5:1, centrado en la cima) y, como la caja de CSS se recorta con `slice` en anchos
// estrechos, el borde visible se desvanece con una máscara de alfa dibujada EN el svg exterior, que no
// tiene viewBox: sus unidades son los píxeles de la caja, así que el degradado cae siempre en los
// bordes visibles y no en los del dibujo. Tras la revisión (P1) el degradado es radial —una elipse
// inscrita en la caja—: con el lineal horizontal los anillos exteriores se apagaban solo por los lados y
// quedaban como arcos sueltos; con el radial cada anillo se apaga por igual. La máscara es de alfa (`mask-type: alpha` en el CSS), por lo
// que no necesita ningún color; las referencias son fragmentos `url(#…)` del propio documento, sin
// recurso servido ni `url(` en el CSS.
//
// Es decorativo: `aria-hidden`, sin foco, sin rol, título ni descripción. No lleva atributo de trazo
// ni de color: sin CSS el trazo es `none` (invisible) y con CSS lo pone `.contour-motif` con un token.
import type { ReactElement } from 'react';

const CONTOUR_PATHS = [
  'M126.3 25C126.6 26 125.3 27.6 123.6 28.4C121.8 29.1 118.4 29.5 115.8 29.7C113.2 29.9 110.6 30 108.2 29.7C105.8 29.4 102.6 28.9 101.2 28.1C99.9 27.3 99.8 25.9 100.2 25C100.7 24.1 102.7 23.3 104.2 22.7C105.6 22.1 107.2 21.6 109 21.3C110.9 21.1 113.1 20.9 115.2 21C117.3 21.2 119.9 21.5 121.7 22.2C123.5 22.8 126 24 126.3 25Z',
  'M143.4 25C144.1 27.3 141.2 30.7 137.3 32.4C133.5 34.1 125.8 34.7 120.2 35.1C114.7 35.6 109.1 35.5 103.9 35C98.7 34.4 92.1 33.3 89.2 31.6C86.4 30 85.9 26.9 86.8 25C87.8 23.1 91.8 21.4 94.9 20C98.1 18.7 101.5 17.6 105.5 17C109.5 16.4 114.4 16 119 16.3C123.7 16.6 129.2 17.4 133.3 18.8C137.3 20.3 142.7 22.7 143.4 25Z',
  'M163.4 25C164.5 28.7 159.7 34.3 153.3 37C147 39.7 134.2 40.7 125.2 41.3C116.2 41.9 107.4 41.7 99.2 40.7C91.1 39.7 80.7 38 76.2 35.4C71.6 32.8 70.5 28.1 71.9 25C73.2 21.9 79.3 19.1 84.3 16.9C89.2 14.7 94.8 12.9 101.3 11.9C107.9 10.8 115.9 10.3 123.5 10.8C131.1 11.4 140.1 12.5 146.7 14.9C153.4 17.3 162.3 21.3 163.4 25Z',
  'M186.1 25C187.7 30.3 180.7 38.4 171.5 42.3C162.3 46.2 143.7 47.4 130.8 48.1C117.9 48.9 105.7 48.3 94.2 46.9C82.8 45.5 68.6 43.2 62.1 39.5C55.6 35.9 53.7 29.4 55.4 25C57 20.6 65.1 16.6 72 13.4C78.8 10.2 87 7.4 96.5 5.9C105.9 4.4 117.7 3.7 128.7 4.5C139.6 5.3 152.5 7 162.1 10.4C171.7 13.9 184.6 19.7 186.1 25Z',
  'M214.1 25C216.3 32.3 206.6 43.5 193.8 48.8C181 54 155.1 55.5 137.5 56.4C119.9 57.3 103.6 56.2 88.3 54.2C73 52.2 54.3 49.2 45.5 44.3C36.7 39.5 33.6 30.9 35.4 25C37.3 19.1 47.5 13.4 56.6 8.9C65.8 4.5 77.2 0.4 90.3 -1.7C103.4 -3.8 120 -4.5 135.1 -3.4C150.2 -2.3 167.9 0.2 181.1 4.9C194.3 9.7 212 17.7 214.1 25Z',
] as const;

const INDEX_CONTOUR = 2;

// Clase de cada anillo: el tercero es la curva índice y los dos exteriores se retiran en pantallas
// estrechas (CSS), donde `slice` los dejaba como arcos sueltos.
function ringClass(index: number): string | undefined {
  if (index === INDEX_CONTOUR) return 'contour-motif__index';
  return index > INDEX_CONTOUR ? 'contour-motif__outer' : undefined;
}

export function ContourMotif(): ReactElement {
  return (
    <svg className="contour-motif" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="contour-motif-fade">
          <stop offset="0" stopOpacity="1" />
          <stop offset="0.5" stopOpacity="1" />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
        <mask
          id="contour-motif-mask"
          className="contour-motif__mask"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <rect className="contour-motif__fade" width="100%" height="100%" fill="url(#contour-motif-fade)" />
        </mask>
      </defs>
      <g mask="url(#contour-motif-mask)">
        <svg viewBox="-40 -7 330 66" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
          {CONTOUR_PATHS.map((path, index) => (
            <path key={path} d={path} className={ringClass(index)} />
          ))}
        </svg>
      </g>
    </svg>
  );
}
