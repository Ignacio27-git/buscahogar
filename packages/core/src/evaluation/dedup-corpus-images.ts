// IMAGE_REFS/withCorpusImages (ROADMAP 2.3, decisión 093, spec "Corpus
// Carries Image References Without Changing Truth"): adjunta a cada `Listing`
// del corpus etiquetado un `thumbnailUrl` con la referencia no-fetchable
// `fixture-image:eval/<pairId>-<a|b>` — el mismo esquema que
// `apps/ingestion/src/image-hash/manifest.ts` sigue de forma independiente
// (packages/core no importa nada de apps/ingestion: la relación es
// unidireccional, apps -> packages, nunca al revés). `dedup-corpus.ts` NO se
// toca — `withCorpusImages` trabaja siempre sobre COPIAS, nunca muta el
// corpus original ni su `truth`.
//
// `md-3` lado b es la ÚNICA excepción deliberada del corpus actual (spec:
// "EXCEPT for a deliberately enumerated set of pairs/sides ... including at
// minimum md-3 side b"). Codificada como un Set literal, no inferida de
// ningún dato — un cambio accidental en `dedup-corpus.ts` que añadiera otra
// ausencia pasaría desapercibido aquí; ese riesgo ya lo cubre
// `dedup-corpus-images.test.ts` al recorrer las 24 entradas reales.
import type { CorpusEntry } from './dedup-corpus.js';
import { dedupCorpus } from './dedup-corpus.js';

const MISSING_SIDE_B: ReadonlySet<string> = new Set(['md-3-direccion-ausente-ambos-lados']);

function imageRefFor(pairId: string, side: 'a' | 'b'): string {
  return `fixture-image:eval/${pairId}-${side}`;
}

export interface ImageRefPair {
  readonly a: string;
  readonly b: string | undefined;
}

// Tabla de refs derivada del corpus real (una entrada por `id`), construida
// una sola vez a partir de `dedupCorpus` — nunca de un literal paralelo que
// pudiera desincronizarse si el corpus cambia.
export const IMAGE_REFS: Readonly<Record<string, ImageRefPair>> = Object.fromEntries(
  dedupCorpus.map((entry) => [
    entry.id,
    {
      a: imageRefFor(entry.id, 'a'),
      b: MISSING_SIDE_B.has(entry.id) ? undefined : imageRefFor(entry.id, 'b'),
    },
  ])
);

export function withCorpusImages(corpus: readonly CorpusEntry[]): CorpusEntry[] {
  return corpus.map((entry) => {
    const refs = IMAGE_REFS[entry.id];
    return {
      ...entry,
      a: { ...entry.a, thumbnailUrl: refs?.a },
      b: refs?.b === undefined ? { ...entry.b } : { ...entry.b, thumbnailUrl: refs.b },
    };
  });
}
