// ROADMAP 1.11 — decisión pura miniatura-vs-placeholder (diseño D5;
// arbitraje obs #175, escenario (iii)). Extraída como función pura para que
// el escenario del spec "sin miniatura es un estado normal" sea
// falsificable en node plano, sin renderizar ningún componente —
// `apps/web/vitest.config.ts` sigue sin jsdom (arbitraje, RULING).
import { operationLabel, propertyTypeLabel } from '@/lib/search-labels';

export type ThumbnailSource = { readonly kind: 'thumbnail'; readonly url: string } | { readonly kind: 'placeholder' };

export function resolveThumbnailSource(thumbnailUrl: string | null | undefined): ThumbnailSource {
  if (thumbnailUrl === null || thumbnailUrl === undefined) {
    return { kind: 'placeholder' };
  }
  return { kind: 'thumbnail', url: thumbnailUrl };
}

const FALLBACK_ALT = 'Foto de la vivienda';

export interface ThumbnailAltInput {
  readonly propertyType: string | null;
  readonly operation: string | null;
  readonly address: string | null;
}

// D.6b (decisión 152) — alt vacío solo cuando el texto de la fila ya identifica
// la vivienda (rótulo de tipo, de operación y una dirección no en blanco): la
// foto sería entonces decorativa. Si falta cualquiera, el alt fijo evita que el
// enlace quede sin nombre accesible. No se deriva del contenido de la foto, que
// no se conoce.
export function resolveThumbnailAlt(result: ThumbnailAltInput): string {
  const identified =
    propertyTypeLabel(result.propertyType) !== null &&
    operationLabel(result.operation) !== null &&
    result.address !== null &&
    result.address.trim() !== '';
  return identified ? '' : FALLBACK_ALT;
}
