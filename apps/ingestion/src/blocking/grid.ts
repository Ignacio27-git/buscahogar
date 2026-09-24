// ROADMAP 1.8 — expandGrid (diseño D-C1, CLI-2): producto cartesiano de la
// rejilla de calibración. D4 fija una consulta por combinación de umbrales
// (`countCandidatePairs` se invoca una vez por tupla) — el tamaño de la
// rejilla ES el coste, así que `MAX_COMBINATIONS` RECHAZA en vez de
// truncar en silencio: una lista mal escrita (p. ej. un valor de más) no
// debe disparar cientos de consultas sin que el operador lo pida. Cada
// tupla se valida con `blockingThresholdsSchema` — el mismo esquema que
// guarda la consulta guarda la CLI, ningún umbral se define dos veces.
//
// Bucle plano (`for`/`flatMap`), no vetado: `eslint.config.mjs` limita el
// ban de bucles a los tres ficheros que emiten peticiones HTTP
// (`scripts/probe-idealista.ts`, `src/sources/idealista/http-client.ts`,
// `src/sources/idealista/idealista-source.ts`) — este módulo no está en
// esa lista y no hace ninguna petición.
import { blockingThresholdsSchema } from '@buscahogar/core';
import type { BlockingThresholds } from '@buscahogar/core';

import type { CalibrationRawOptions } from './options.js';

export const MAX_COMBINATIONS = 64;

export class GridSizeError extends Error {}

export function expandGrid(options: CalibrationRawOptions): readonly BlockingThresholds[] {
  const total = options.radiusMeters.length * options.priceBandCents.length * options.surfaceToleranceM2.length;
  if (total > MAX_COMBINATIONS) {
    throw new GridSizeError(
      `La rejilla solicitada tiene ${String(total)} combinaciones, por encima del tope de ` +
        `${String(MAX_COMBINATIONS)}. Reduce la cantidad de valores por flag y vuelve a ejecutar.`
    );
  }

  const combinations: BlockingThresholds[] = [];
  for (const radiusMeters of options.radiusMeters) {
    for (const priceBandCents of options.priceBandCents) {
      for (const surfaceToleranceM2 of options.surfaceToleranceM2) {
        combinations.push(blockingThresholdsSchema.parse({ radiusMeters, priceBandCents, surfaceToleranceM2 }));
      }
    }
  }
  return combinations;
}
