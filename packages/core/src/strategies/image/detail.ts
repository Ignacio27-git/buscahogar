// Codificación determinista y parseable del detalle de una comparación de
// imagen (ROADMAP 2.3, spec "Breakdown Detail Is Deterministic and
// Parseable", design F3/F4). Orden de claves FIJO:
// level, reason, distance, threshold — separadas por `;`, cada una
// `clave=valor`. `distance=n/a` cuando no se calculó ninguna distancia
// (missing/unreadable); entero decimal en cualquier otro caso.
import type { ImageComparison, ImageLevel, ImageReason } from './compare.js';

const DETAIL_KEYS = ['level', 'reason', 'distance', 'threshold'] as const;
type DetailKey = (typeof DETAIL_KEYS)[number];

const VALID_LEVELS: readonly ImageLevel[] = ['strong', 'neutral'];
const VALID_REASONS: readonly ImageReason[] = [
  'match',
  'above-threshold',
  'missing',
  'unreadable',
  'low-entropy',
];
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

export function formatImageDetail(comparison: ImageComparison): string {
  const distancePart = comparison.distance === null ? 'n/a' : String(comparison.distance);
  return `level=${comparison.level};reason=${comparison.reason};distance=${distancePart};threshold=${String(comparison.threshold)}`;
}

function parseField(segment: string, expectedKey: DetailKey, detail: string): string {
  const separatorIndex = segment.indexOf('=');
  if (separatorIndex === -1) {
    throw new RangeError(`parseImageDetail: campo malformado "${segment}" en "${detail}".`);
  }

  const key = segment.slice(0, separatorIndex);
  if (key !== expectedKey) {
    throw new RangeError(
      `parseImageDetail: se esperaba la clave "${expectedKey}", recibido "${key}", en "${detail}".`
    );
  }

  return segment.slice(separatorIndex + 1);
}

function parseNonNegativeInteger(raw: string, fieldName: string, detail: string): number {
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(raw)) {
    throw new RangeError(
      `parseImageDetail: ${fieldName} no es un entero no negativo válido "${raw}", en "${detail}".`
    );
  }
  return Number(raw);
}

export function parseImageDetail(detail: string): ImageComparison {
  const segments = detail.split(';');
  if (segments.length !== DETAIL_KEYS.length) {
    throw new RangeError(
      `parseImageDetail: se esperan exactamente ${String(DETAIL_KEYS.length)} campos, recibido ${String(segments.length)} en "${detail}".`
    );
  }

  const [levelSegment, reasonSegment, distanceSegment, thresholdSegment] = segments as [
    string,
    string,
    string,
    string,
  ];

  const levelRaw = parseField(levelSegment, 'level', detail);
  if (!VALID_LEVELS.includes(levelRaw as ImageLevel)) {
    throw new RangeError(`parseImageDetail: level desconocido "${levelRaw}", en "${detail}".`);
  }

  const reasonRaw = parseField(reasonSegment, 'reason', detail);
  if (!VALID_REASONS.includes(reasonRaw as ImageReason)) {
    throw new RangeError(`parseImageDetail: reason desconocido "${reasonRaw}", en "${detail}".`);
  }

  const distanceRaw = parseField(distanceSegment, 'distance', detail);
  const distance =
    distanceRaw === 'n/a' ? null : parseNonNegativeInteger(distanceRaw, 'distance', detail);

  const thresholdRaw = parseField(thresholdSegment, 'threshold', detail);
  const threshold = parseNonNegativeInteger(thresholdRaw, 'threshold', detail);

  return { level: levelRaw as ImageLevel, reason: reasonRaw as ImageReason, distance, threshold };
}
