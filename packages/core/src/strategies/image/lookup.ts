// createImageHashLookup (ROADMAP 2.3, decisión 093): construye un
// ImageHashLookup a partir de una tabla en memoria indexada por
// `thumbnailUrl` — el campo opcional ya existente en `Listing` (ROADMAP
// 1.11), ignorado por las dos estrategias estructuradas. Nunca lanza: una
// clave ausente, o un `Listing` sin `thumbnailUrl`, resuelve a `undefined`,
// que `compareImageHashes` ya interpreta como `neutral/missing`.
import type { Listing } from '../../schemas/listing.schema.js';
import type { ImageHashEntry } from './compare.js';

export type ImageHashLookup = (listing: Listing) => ImageHashEntry | undefined;

export function createImageHashLookup(
  table: Readonly<Record<string, ImageHashEntry>>
): ImageHashLookup {
  return (listing: Listing): ImageHashEntry | undefined => {
    if (listing.thumbnailUrl === undefined) {
      return undefined;
    }
    return table[listing.thumbnailUrl];
  };
}
