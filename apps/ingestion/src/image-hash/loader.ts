// loadImageHashLookup (ROADMAP 2.3, Phase 4): valida una `ImageHashTable` ya
// parseada (JSON.parse de hashes.evaluation.json) con `imageHashTableSchema`
// y construye un `ImageHashLookup` vía `createImageHashLookup`
// (@buscahogar/core), keyed por las refs no-fetchables `fixture-image:` de
// `table.entries`. Recibe el objeto YA parseado, no una ruta — mismo
// precedente que `runCalibrateThreshold` (Phase 3, calibrate-image-threshold.ts):
// testable sin tocar ficheros reales; el `readFileSync`/`JSON.parse` real
// vive en el CLI que consume esta función (compare-dedup-strategies.ts,
// tarea 4.18).
import type { ImageHashLookup } from '@buscahogar/core';
import { createImageHashLookup } from '@buscahogar/core';

import { imageHashTableSchema } from './hash-table.schema.js';

export function loadImageHashLookup(raw: unknown): ImageHashLookup {
  const table = imageHashTableSchema.parse(raw);
  return createImageHashLookup(table.entries);
}
