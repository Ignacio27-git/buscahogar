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

export interface PriceChartModel {
  readonly viewBox: string;
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

const WIDTH = 320;
const HEIGHT = 160;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 28;
const PAD_LEFT = 72;
const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = WIDTH - PAD_RIGHT;
const PLOT_TOP = PAD_TOP;
const PLOT_BOTTOM = HEIGHT - PAD_BOTTOM;
// Posición fija de los rótulos (la usa el componente): fechas en y = 152, precios a la izquierda del área útil.
export const X_LABEL_Y = HEIGHT - 8;
export const Y_LABEL_X = PLOT_LEFT - 8;
const MARKER_RADIUS = 3;
const STYLE_COUNT = 4;

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

export function buildPriceChart(series: readonly ChartSeriesInput[]): PriceChartModel {
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
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;
  const plotWidth = PLOT_RIGHT - PLOT_LEFT;

  const yOf = (priceCents: number): number =>
    round1(PLOT_TOP + ((domainHi - priceCents) / domainSpan) * plotHeight);
  const xOf = (time: number): number =>
    tMax === tMin
      ? round1(PLOT_LEFT + plotWidth / 2)
      : round1(PLOT_LEFT + ((time - tMin) / (tMax - tMin)) * plotWidth);

  const yLabels =
    hi === lo
      ? [{ y: yOf(hi), text: formatPriceCents(hi) }]
      : [
          { y: yOf(hi), text: formatPriceCents(hi) },
          { y: yOf(lo), text: formatPriceCents(lo) },
        ];

  const xLabels: PriceChartModel['xLabels'] =
    tMax === tMin
      ? [{ x: xOf(tMin), text: formatUtcDate(new Date(tMin)), anchor: 'middle' }]
      : [
          { x: PLOT_LEFT, text: formatUtcDate(new Date(tMin)), anchor: 'start' },
          { x: PLOT_RIGHT, text: formatUtcDate(new Date(tMax)), anchor: 'end' },
        ];

  return {
    viewBox: `0 0 ${String(WIDTH)} ${String(HEIGHT)}`,
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
