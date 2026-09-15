// ROADMAP 1.8 — parseCalibrationArgs (diseño D-C1, CLI-1): argumentos de
// línea de comandos de la CLI de calibración de bloqueo. Mismo patrón de
// tres pasos que sweep/options.ts (paso 1.7, read-only): `parseArgs
// ({strict:true})` rechaza por sí solo cualquier flag no declarado
// (CLI-1a); Zod comprueba presencia y forma superficial (string no vacía)
// nombrando el flag exacto (CLI-1b); el split final a números nombra el
// flag Y el elemento ofensivo. Ningún umbral se sustituye nunca por un
// valor por defecto silencioso — el operador lo leería como uno medido.
import { parseArgs } from 'node:util';

import { z } from 'zod';

export class CalibrationOptionsError extends Error {}

export interface CalibrationRawOptions {
  readonly radiusMeters: readonly number[];
  readonly priceBandCents: readonly number[];
  readonly surfaceToleranceM2: readonly number[];
}

// Solo PRESENCIA y forma superficial — el split a números va después, campo
// a campo, para poder nombrar el flag exacto y el elemento ofensivo en el
// mismo mensaje (D-C1).
const rawOptionsSchema = z.strictObject({
  radius: z.string().min(1),
  'price-band': z.string().min(1),
  'surface-tolerance': z.string().min(1),
});

function parseNumberList(flag: string, value: string): readonly number[] {
  return value.split(',').map((element) => {
    const parsed = Number(element);
    if (!Number.isFinite(parsed)) {
      throw new CalibrationOptionsError(`${flag} inválido: el elemento "${element}" no es un número.`);
    }
    return parsed;
  });
}

export function parseCalibrationArgs(argv: readonly string[]): CalibrationRawOptions {
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
    // mensaje — se conserva tal cual (mismo criterio que sweep/options.ts).
    throw new CalibrationOptionsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawOptionsSchema.safeParse(parsed.values);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const flagPath = firstIssue?.path[0];
    const flagName = typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
    throw new CalibrationOptionsError(`${flagName} inválido o ausente: ${firstIssue?.message ?? 'sin detalle'}.`);
  }

  const raw = result.data;
  return {
    radiusMeters: parseNumberList('--radius', raw.radius),
    priceBandCents: parseNumberList('--price-band', raw['price-band']),
    surfaceToleranceM2: parseNumberList('--surface-tolerance', raw['surface-tolerance']),
  };
}
