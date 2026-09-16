// ROADMAP 1.10 — parseReprocessArgs (diseño D9): argumentos de la CLI de
// reproceso de deduplicación. Mismo patrón de tres pasos que
// src/blocking/options.ts (paso 1.8): `parseArgs({strict:true})` rechaza un
// flag desconocido por sí solo; Zod comprueba presencia y forma superficial
// (string no vacía) nombrando el flag exacto; la conversión numérica final
// nombra el flag Y el texto ofensivo. El último paso reutiliza
// `blockingThresholdsSchema` (paso 1.8, `@buscahogar/core`) en vez de
// duplicar su vocabulario: la misma frontera que ya protege la consulta de
// bloqueo protege también esta CLI (D9).
//
// A diferencia de `parseCalibrationArgs` (calibración, rejilla de
// combinaciones separadas por comas), esta CLI recibe UN valor por umbral:
// una corrida de reproceso, no una rejilla (D9 — "Single values, not comma
// lists"). Ningún umbral se sustituye nunca por un valor por defecto
// silencioso: el operador lo leería como un valor medido.
import { parseArgs } from 'node:util';

import { blockingThresholdsSchema } from '@buscahogar/core';
import type { BlockingThresholds } from '@buscahogar/core';
import { z } from 'zod';

export class ReprocessOptionsError extends Error {}

// Solo PRESENCIA y forma superficial — la conversión a número va después,
// campo a campo, para poder nombrar el flag exacto y el elemento ofensivo
// en el mismo mensaje (mismo criterio que parseCalibrationArgs).
const rawOptionsSchema = z.strictObject({
  radius: z.string().min(1),
  'price-band': z.string().min(1),
  'surface-tolerance': z.string().min(1),
});

function parseNumber(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ReprocessOptionsError(`${flag} inválido: "${value}" no es un número.`);
  }
  return parsed;
}

export function parseReprocessArgs(argv: readonly string[]): BlockingThresholds {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        radius: { type: 'string' },
        'price-band': { type: 'string' },
        'surface-tolerance': { type: 'string' },
      },
    });
  } catch (error) {
    // parseArgs({strict:true}) ya nombra el flag desconocido en su propio
    // mensaje — se conserva tal cual (mismo criterio que parseCalibrationArgs).
    throw new ReprocessOptionsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawOptionsSchema.safeParse(parsed.values);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const flagPath = firstIssue?.path[0];
    const flagName = typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
    throw new ReprocessOptionsError(`${flagName} inválido o ausente: ${firstIssue?.message ?? 'sin detalle'}.`);
  }

  const raw = result.data;
  const thresholds = {
    radiusMeters: parseNumber('--radius', raw.radius),
    priceBandCents: parseNumber('--price-band', raw['price-band']),
    surfaceToleranceM2: parseNumber('--surface-tolerance', raw['surface-tolerance']),
  };

  // Última frontera: el MISMO esquema que ya protege la consulta de bloqueo
  // (paso 1.8, core/index.ts) — no una copia de sus reglas (positivo, entero
  // no negativo). Envuelto en ReprocessOptionsError para que todo fallo de
  // este parser tenga un único tipo, nunca un ZodError crudo escapando.
  const validated = blockingThresholdsSchema.safeParse(thresholds);
  if (!validated.success) {
    const firstIssue = validated.error.issues[0];
    throw new ReprocessOptionsError(
      `Umbral inválido (campo: ${String(firstIssue?.path[0] ?? '?')}): ${firstIssue?.message ?? 'sin detalle'}.`
    );
  }
  return validated.data;
}
