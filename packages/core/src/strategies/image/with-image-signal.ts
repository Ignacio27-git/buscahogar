// withImageSignal (ROADMAP 2.3, decisión 094): decorador que envuelve una
// DedupStrategy existente SIN alterar su cálculo estructurado (spec
// "Decorator Preserves Wrapped Behaviour When Neutral"). Solo compara
// hashes ya calculados (inyectados vía `lookup`, decisión 093) y delega en
// `combiner` cómo esa comparación afecta al score — la propia
// `withImageSignal` nunca decide RB o FS, ese es el trabajo del combinador
// elegido por el llamador (evaluation/image-evaluators.ts, Phase 4).
import type { DedupStrategy } from '../../contracts/dedup-strategy.js';
import type { Listing } from '../../schemas/listing.schema.js';
import type { SimilarityResult } from '../../types/similarity.js';
import type { ImageCombiner } from './combiners.js';
import { compareImageHashes, type ImageComparison } from './compare.js';
import type { ImageHashLookup } from './lookup.js';

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 64;

export interface WithImageSignalOptions {
  readonly lookup: ImageHashLookup;
  readonly threshold: number;
  readonly combiner: ImageCombiner;
}

export type ImageDecoratedStrategy = DedupStrategy & {
  compare(a: Listing, b: Listing): ImageComparison;
};

function assertValidThreshold(threshold: number): void {
  if (!Number.isInteger(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
    throw new RangeError(
      `withImageSignal: threshold debe ser un entero en [${String(MIN_THRESHOLD)},${String(MAX_THRESHOLD)}], recibido ${String(threshold)}.`
    );
  }
}

export function withImageSignal(
  base: DedupStrategy,
  options: WithImageSignalOptions
): ImageDecoratedStrategy {
  const { lookup, threshold, combiner } = options;
  assertValidThreshold(threshold);

  function compare(a: Listing, b: Listing): ImageComparison {
    return compareImageHashes(lookup(a), lookup(b), threshold);
  }

  function score(a: Listing, b: Listing): SimilarityResult {
    return combiner(base.score(a, b), compare(a, b));
  }

  return {
    name: `${base.name}+image-phash`,
    version: `${base.version}+phash-t${String(threshold)}`,
    score,
    compare,
  };
}
