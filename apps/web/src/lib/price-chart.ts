// D.10 (decisión 178) — geometría pura del gráfico escalonado del histórico de
// precios. Sin React ni Next: el componente `price-history.tsx` solo pinta el
// modelo que devuelve `buildPriceChart`. Todo sale de números y de cadenas ya
// formateadas, así que el marcado es determinista y no puede producir
// NaN/Infinity (el margen del eje de precio nunca es 0).
import { formatUtcDate } from '@/lib/format-date';
import { formatPriceCents } from '@/lib/format-price';
import { sourceLabel } from '@/lib/search-labels';

export interface ChartSeriesInput {
  readonly key: string;
  readonly label: string;
  readonly withdrawn: boolean;
  readonly points: readonly { readonly capturedAt: Date; readonly priceCents: number }[];
}

// D.18 (decisión 222) — el mismo modelo se dibuja en varios diseños, cada uno a escala 1:1 cuando la
// columna mide lo mismo que él, para que el texto no se encoja: `compact` (288 × 160, columna a 320 px)
// y `wide` (544 × 192 = 34rem). Pulido tras la revisión (P3): a esos dos se suman `medium` (416 × 176 =
// 26rem) y `full` (768 × 208 = 48rem, la columna entera de la ficha), porque con solo dos el gráfico se
// quedaba en ~70 % de la columna. En la segunda revisión se añadió `large` (704 × 200 = 44rem, la columna
// con un viewport de 768) para que el texto se vea a 1:1 también ahí. El CSS enseña uno u otro con una consulta de contenedor y lo estira
// al 100 % (entre dos diseños el texto crece como mucho ~1,4×, nunca se encoge); todos salen del servidor.
export type ChartLayout = 'compact' | 'medium' | 'wide' | 'large' | 'full';

export interface PriceChartModel {
  readonly viewBox: string;
  // Posiciones fijas que usa el componente: fechas en `xLabelY`, precios a la izquierda del área
  // útil (`yLabelX`), rejilla hasta `gridX2`.
  readonly xLabelY: number;
  readonly yLabelX: number;
  readonly gridX1: number;
  readonly gridX2: number;
  readonly yLabels: readonly { readonly y: number; readonly text: string }[];
  readonly xLabels: readonly {
    readonly x: number;
    readonly text: string;
    readonly anchor: 'start' | 'middle' | 'end';
  }[];
  readonly series: readonly {
    readonly key: string;
    readonly label: string;
    readonly withdrawn: boolean;
    readonly styleIndex: number;
    readonly linePath: string | null;
    readonly markerPaths: readonly string[];
  }[];
}

const LAYOUTS = {
  compact: { width: 288, height: 160 },
  medium: { width: 416, height: 176 },
  wide: { width: 544, height: 192 },
  large: { width: 704, height: 200 },
  full: { width: 768, height: 208 },
} as const satisfies Record<ChartLayout, { readonly width: number; readonly height: number }>;

const PAD_TOP = 12;
// P3: la rejilla termina 20 antes del borde y las fechas extremas quedan INSET_X dentro de ella, así el
// último punto no toca el borde y su rótulo, centrado en él, cabe en el lienzo (35 de media anchura).
const PAD_RIGHT = 20;
const INSET_X = 16;
const PAD_BOTTOM = 28;
const PAD_LEFT = 72;
// Un rótulo de fecha («dd/mm/aaaa» a 12px) mide unos 70 de ancho; entre dos rótulos queda un hueco.
const X_LABEL_WIDTH = 70;
const X_LABEL_GAP = 8;
// Hueco entre el final del rótulo de precio y el inicio de la rejilla. D.19: con Figtree, «1.234.567 €»
// mide unos 66 a 12px; con un hueco de 8 el rótulo (anclado a la derecha en 64) se salía 2px del lienzo.
const Y_LABEL_GAP = 4;
const MARKER_RADIUS = 3;
const STYLE_COUNT = 4;
// Separación mínima entre dos marcas del eje de precio: un rótulo de 12px y aire.
const Y_TICK_MIN_GAP = 16;

// Coordenadas a 0,1 para un marcado corto y estable.
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function num(value: number): string {
  return String(round1(value));
}

// Marcador por estilo: 0 círculo, 1 cuadrado, 2 triángulo, 3 rombo. Distinta
// forma además de distinto trazo: el color no es el único canal (WCAG 1.4.1).
export function markerPath(styleIndex: number, cx: number, cy: number): string {
  const r = MARKER_RADIUS;
  switch (styleIndex) {
    case 0:
      return `M${num(cx - r)} ${num(cy)}a${String(r)} ${String(r)} 0 1 0 ${String(2 * r)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-2 * r)} 0Z`;
    case 1:
      return `M${num(cx - r)} ${num(cy - r)}H${num(cx + r)}V${num(cy + r)}H${num(cx - r)}Z`;
    case 2:
      return `M${num(cx)} ${num(cy - r - 1)}L${num(cx + r + 1)} ${num(cy + r)}H${num(cx - r - 1)}Z`;
    default:
      return `M${num(cx)} ${num(cy - r - 1)}L${num(cx + r + 1)} ${num(cy)}L${num(cx)} ${num(cy + r + 1)}L${num(cx - r - 1)} ${num(cy)}Z`;
  }
}

interface XLabel {
  readonly x: number;
  readonly text: string;
  readonly anchor: 'start' | 'middle' | 'end';
}

function labelExtent(label: XLabel): readonly [number, number] {
  if (label.anchor === 'start') return [label.x, label.x + X_LABEL_WIDTH];
  if (label.anchor === 'end') return [label.x - X_LABEL_WIDTH, label.x];
  return [label.x - X_LABEL_WIDTH / 2, label.x + X_LABEL_WIDTH / 2];
}

function overlaps(a: XLabel, b: XLabel): boolean {
  const [aLeft, aRight] = labelExtent(a);
  const [bLeft, bRight] = labelExtent(b);
  return aLeft < bRight + X_LABEL_GAP && bLeft < aRight + X_LABEL_GAP;
}

export function buildPriceChart(series: readonly ChartSeriesInput[], layout: ChartLayout): PriceChartModel {
  const { width, height } = LAYOUTS[layout];
  const plotLeft = PAD_LEFT;
  const plotRight = width - PAD_RIGHT;
  // Los puntos y las fechas extremas viven en el área interior; la rejilla llega a `plotLeft`/`plotRight`.
  const pointLeft = plotLeft + INSET_X;
  const pointRight = plotRight - INSET_X;
  const plotTop = PAD_TOP;
  const plotBottom = height - PAD_BOTTOM;

  const prices = series.flatMap((s) => s.points.map((p) => p.priceCents));
  const times = series.flatMap((s) => s.points.map((p) => p.capturedAt.getTime()));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);

  // Margen vertical nunca 0: un rango degenerado (min = max) sigue dando un
  // dominio no nulo y, por tanto, ninguna división por cero.
  const pad = Math.max(Math.round((hi - lo) * 0.1), Math.round(hi * 0.01), 100);
  const domainLo = lo - pad;
  const domainHi = hi + pad;
  const domainSpan = domainHi - domainLo;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = pointRight - pointLeft;

  const yOf = (priceCents: number): number =>
    round1(plotTop + ((domainHi - priceCents) / domainSpan) * plotHeight);
  const xOf = (time: number): number =>
    tMax === tMin
      ? round1(pointLeft + plotWidth / 2)
      : round1(pointLeft + ((time - tMin) / (tMax - tMin)) * plotWidth);

  // Marcas del eje de precio: máximo, mínimo y, si deja aire, una intermedia redondeada al euro (P3).
  // Con un solo precio hay una sola marca.
  const mid = Math.round((hi + lo) / 2 / 100) * 100;
  const midY = yOf(mid);
  const hasMid =
    hi !== lo && mid > lo && mid < hi && midY - yOf(hi) >= Y_TICK_MIN_GAP && yOf(lo) - midY >= Y_TICK_MIN_GAP;
  const yLabels =
    hi === lo
      ? [{ y: yOf(hi), text: formatPriceCents(hi) }]
      : [
          { y: yOf(hi), text: formatPriceCents(hi) },
          ...(hasMid ? [{ y: midY, text: formatPriceCents(mid) }] : []),
          { y: yOf(lo), text: formatPriceCents(lo) },
        ];

  // Rótulos del eje de tiempo por prioridad: inicio, fin y la primera captura de cada serie que
  // empieza después (en orden de fecha, no de entrada). Un candidato que solapa con uno ya aceptado
  // se descarta; dos series que empiezan el mismo día comparten rótulo porque la segunda solapa.
  const xLabels: XLabel[] =
    tMax === tMin
      ? [{ x: xOf(tMin), text: formatUtcDate(new Date(tMin)), anchor: 'middle' }]
      : [
          { x: pointLeft, text: formatUtcDate(new Date(tMin)), anchor: 'middle' },
          { x: pointRight, text: formatUtcDate(new Date(tMax)), anchor: 'middle' },
        ];
  if (tMax !== tMin) {
    const starts = series
      .flatMap((s) => (s.points[0] === undefined ? [] : [s.points[0].capturedAt.getTime()]))
      .filter((time) => time > tMin)
      .sort((a, b) => a - b);
    for (const time of starts) {
      const candidate: XLabel = { x: xOf(time), text: formatUtcDate(new Date(time)), anchor: 'middle' };
      if (!xLabels.some((accepted) => overlaps(accepted, candidate))) {
        xLabels.push(candidate);
      }
    }
  }

  return {
    viewBox: `0 0 ${String(width)} ${String(height)}`,
    xLabelY: height - 8,
    yLabelX: plotLeft - Y_LABEL_GAP,
    gridX1: plotLeft,
    gridX2: plotRight,
    yLabels,
    xLabels,
    series: series.map((s, index) => {
      const styleIndex = index % STYLE_COUNT;
      const coords = s.points.map((p) => ({ x: xOf(p.capturedAt.getTime()), y: yOf(p.priceCents) }));
      const [first, ...rest] = coords;
      // Escalón: horizontal hasta la fecha del cambio y luego vertical al
      // nuevo precio. Una sola observación no tiene línea, solo marcador.
      const linePath =
        first === undefined || rest.length === 0
          ? null
          : `M${num(first.x)} ${num(first.y)}${rest.map((c) => ` H${num(c.x)} V${num(c.y)}`).join('')}`;
      return {
        key: s.key,
        label: s.label,
        withdrawn: s.withdrawn,
        styleIndex,
        linePath,
        markerPaths: coords.map((c) => markerPath(styleIndex, c.x, c.y)),
      };
    }),
  };
}

// Rótulo de cada serie por su fuente (clave desconocida -> «Otra fuente»). Si
// dos anuncios comparten rótulo, del segundo en adelante se numera en el orden
// de las series, para distinguirlos en la leyenda y en la tabla.
export function labelSeries(sourceKeys: readonly string[]): readonly string[] {
  const seen = new Map<string, number>();
  return sourceKeys.map((key) => {
    const base = sourceLabel(key);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (anuncio ${String(count)})`;
  });
}

export function chartAriaLabel(seriesCount: number): string {
  const noun = seriesCount === 1 ? '1 anuncio' : `${String(seriesCount)} anuncios`;
  return `Gráfico escalonado del precio de ${noun}. Los datos detallados están en la tabla de abajo.`;
}

// P3 — las series de trazo continuo (estilo 0) se dibujan primero y las discontinuas encima: si dos
// series coinciden en una vertical, la discontinua deja ver la continua en sus huecos. El quinto anuncio
// repite el estilo 0, así que el orden de entrada no basta. Ordenación estable; no altera la lista.
export function inDrawOrder<T extends { readonly styleIndex: number }>(series: readonly T[]): readonly T[] {
  const rank = (s: T): number => (s.styleIndex === 0 ? 0 : 1);
  return [...series].sort((a, b) => rank(a) - rank(b));
}
