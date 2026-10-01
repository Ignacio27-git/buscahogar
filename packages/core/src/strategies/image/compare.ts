// Comparador de hashes de imagen (ROADMAP 2.3, decisión 094): mapeo
// POSITIVO-SOLO a un único nivel y una única razón, con la precedencia fija
// missing > unreadable > low-entropy > distance (spec "Positive-Only Level
// Mapping"). Nunca negativo: todo lo que no es `strong/match` es `neutral`,
// contribución exactamente cero — el llamador (with-image-signal.ts) decide
// qué hacer con eso, este módulo solo clasifica.
import { hammingDistance64 } from './hamming.js';

// Dato ya computado por apps/ingestion (decisión 093): el hash llega
// siempre precalculado, nunca se decodifica ni se lee ningún fichero aquí —
// packages/core no tiene dependencias nativas ni de I/O (spec "No Native or
// I-O Dependencies").
export type ImageHashEntry =
  | { readonly kind: 'hashed'; readonly hash: string; readonly lowEntropy: boolean }
  | { readonly kind: 'unreadable' };

export type ImageLevel = 'strong' | 'neutral';
export type ImageReason = 'match' | 'above-threshold' | 'missing' | 'unreadable' | 'low-entropy';

export interface ImageComparison {
  readonly level: ImageLevel;
  readonly reason: ImageReason;
  // `n/a` (representado como `null`) cuando no se calculó ninguna distancia
  // (missing/unreadable); numérica en low-entropy y above-threshold — spec
  // "Breakdown Detail Is Deterministic and Parseable".
  readonly distance: number | null;
  readonly threshold: number;
}

function neutral(reason: ImageReason, distance: number | null, threshold: number): ImageComparison {
  return { level: 'neutral', reason, distance, threshold };
}

export function compareImageHashes(
  a: ImageHashEntry | undefined,
  b: ImageHashEntry | undefined,
  threshold: number
): ImageComparison {
  // 1. missing — referencia ausente en cualquiera de los dos lados, máxima
  // precedencia.
  if (a === undefined || b === undefined) {
    return neutral('missing', null, threshold);
  }

  // 2. unreadable — el decodificador de apps/ingestion no pudo leer la
  // imagen en alguno de los dos lados; sin hash que comparar.
  if (a.kind === 'unreadable' || b.kind === 'unreadable') {
    return neutral('unreadable', null, threshold);
  }

  // A partir de aquí ambos lados tienen `kind: 'hashed'` — TypeScript ya lo
  // sabe por el narrowing de los dos `if` anteriores.
  const distance = hammingDistance64(a.hash, b.hash);

  // 3. low-entropy — la spec exige que NUNCA produzca `strong`, aunque la
  // distancia calculada sea <= threshold; la distancia SÍ se reporta
  // (spec "Preprocessing Before Hashing": "regardless of any computed
  // distance").
  if (a.lowEntropy || b.lowEntropy) {
    return neutral('low-entropy', distance, threshold);
  }

  // 4. distance — el único caso que puede producir `strong`.
  if (distance <= threshold) {
    return { level: 'strong', reason: 'match', distance, threshold };
  }

  return neutral('above-threshold', distance, threshold);
}
