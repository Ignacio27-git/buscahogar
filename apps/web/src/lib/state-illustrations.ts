// D.22 (decisión 269) — ilustraciones de línea de los estados (vacío, no encontrado, no disponible).
// Una sola fuente de datos: `components/state-illustration.tsx` las pinta como elementos React y
// `stateIllustrationSvg()` como cadena para las páginas autónomas (`global-error`, 429). La paridad la
// comprueba `test/state-illustration.test.tsx`.
//
// Módulo puro y sin `server-only`: lo alcanza el proxy (`server/rate-limit-page.ts`) fuera del grafo de
// componentes de servidor. Encuadre 96 x 64, dibujo decorativo (`aria-hidden`): el estado lo dice el
// texto. Sin ningún literal de color: los contornos son la clase `state-illustration__ring` (el CSS les da
// `--rule-control`), la figura es `currentColor` (tinta atenuada del contenedor) y la casa, la de la marca,
// recibe `--accent` desde `.state-illustration__house`. Sin CSS el `<svg>` va con `fill="none"` y los
// contornos no se pintan: nunca aparece nada en negro.
import { BRAND_MARK } from './brand-mark';

export const STATE_ILLUSTRATION_KINDS = ['empty', 'not-found', 'unavailable'] as const;

export type StateIllustrationKind = (typeof STATE_ILLUSTRATION_KINDS)[number];

export const VIEW_BOX = '0 0 96 64';

// Atributos en notación SVG y en el orden en que se serializan; el componente los pasa a camelCase.
type ShapeAttributes = Readonly<Record<string, string>>;

export interface Shape {
  readonly tag: 'ellipse' | 'circle' | 'path';
  readonly className: string;
  readonly attributes: ShapeAttributes;
}

const RING_CLASS = 'state-illustration__ring';
const FIGURE_CLASS = 'state-illustration__figure';
const HOUSE_CLASS = 'state-illustration__house';

function ring(cx: number, cy: number, rx: number, ry: number): Shape {
  return {
    tag: 'ellipse',
    className: RING_CLASS,
    attributes: { cx: String(cx), cy: String(cy), rx: String(rx), ry: String(ry) },
  };
}

function figure(tag: 'circle' | 'path', attributes: ShapeAttributes): Shape {
  return { tag, className: FIGURE_CLASS, attributes: { ...attributes, stroke: 'currentColor' } };
}

// Tramo de un contorno roto: dos cuartos de elipse opuestos, con los otros dos sin dibujar.
function broken(d: string): Shape {
  return { tag: 'path', className: RING_CLASS, attributes: { d, 'stroke-linecap': 'round' } };
}

// Tres curvas de nivel concéntricas: el motivo del mapa, a escala de ilustración.
const CONTOURS: readonly Shape[] = [ring(40, 36, 34, 22), ring(40, 36, 24, 15), ring(40, 36, 14, 8)];

// La casa de la marca (32 x 32) ampliada x2,5 y centrada en el encuadre de 96 x 64.
const HOUSE_SCALE = 2.5;
const HOUSE: Shape = {
  tag: 'path',
  className: HOUSE_CLASS,
  attributes: {
    'fill-rule': 'evenodd',
    transform: `translate(14.25 -0.5) scale(${String(HOUSE_SCALE)})`,
    d: BRAND_MARK.house.d,
  },
};

export const STATE_ILLUSTRATIONS: Readonly<Record<StateIllustrationKind, readonly Shape[]>> = {
  // Lupa con la lente vacía sobre las curvas de nivel: no hay nada que mostrar.
  empty: [
    ...CONTOURS,
    figure('circle', { cx: '58', cy: '28', r: '14' }),
    figure('path', { d: 'M68 38l12 12', 'stroke-linecap': 'round' }),
  ],
  // Camino punteado que termina en una parcela vacía: la ruta no lleva a ninguna parte.
  'not-found': [
    ...CONTOURS,
    figure('path', { d: 'M8 54C24 46 32 58 48 46S68 34 72 26', 'stroke-dasharray': '3 4', 'stroke-linecap': 'round' }),
    figure('path', { d: 'M74 10h14v14H74Z', 'stroke-linejoin': 'round' }),
  ],
  // La casa de la marca dentro de un contorno roto: algo ha fallado, la vivienda sigue ahí.
  unavailable: [
    broken('M14 32A34 22 0 0 1 48 10'),
    broken('M82 32A34 22 0 0 1 48 54'),
    HOUSE,
  ],
};

function serializeAttributes(attributes: ShapeAttributes): string {
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
}

// Misma serialización que `renderToStaticMarkup(<StateIllustration kind={kind} />)`.
export function stateIllustrationSvg(kind: StateIllustrationKind): string {
  const shapes = STATE_ILLUSTRATIONS[kind]
    .map(({ tag, className, attributes }) => `<${tag} class="${className}"${serializeAttributes(attributes)}></${tag}>`)
    .join('');
  return `<svg class="state-illustration" viewBox="${VIEW_BOX}" fill="none" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
