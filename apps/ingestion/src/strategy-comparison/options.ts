// ROADMAP 2.2 — parseComparisonArgs (decisión 091): argumentos de la CLI de
// comparación de estrategias. Mismo patrón de tres pasos que
// blocking/options.ts (paso 1.8, read-only): parseArgs({strict:true})
// rechaza un flag desconocido por sí solo; Zod comprueba presencia y forma
// superficial nombrando el flag exacto; el split final a números nombra el
// flag Y el elemento ofensivo. A diferencia de la calibración de bloqueo,
// TODOS los flags son opcionales aquí — sin `.env` ni base de datos que
// obligue a nada (D6): sin --high/--low, la rejilla usa el DEFAULT_SWEEP de
// @buscahogar/core (decisión 091, resuelto en grid.ts).
import { parseArgs } from 'node:util';

import { z } from 'zod';

export class ComparisonOptionsError extends Error {}

export type ReportFormat = 'markdown' | 'json' | 'csv';

export interface ComparisonRawOptions {
  readonly format: ReportFormat;
  readonly output: string | undefined;
  readonly high: readonly number[] | undefined;
  readonly low: readonly number[] | undefined;
}

// Solo PRESENCIA y forma superficial — el split a números va después, campo
// a campo, para poder nombrar el flag exacto y el elemento ofensivo en el
// mismo mensaje (mismo criterio que parseCalibrationArgs). El `.refine`
// final impone la única regla que cruza dos flags: --high y --low deben
// darse juntos o ninguno de los dos.
const rawOptionsSchema = z
  .strictObject({
    format: z.enum(['markdown', 'json', 'csv']).default('json'),
    output: z.string().min(1).optional(),
    high: z.string().min(1).optional(),
    low: z.string().min(1).optional(),
  })
  .refine((data) => (data.high === undefined) === (data.low === undefined), {
    message: '--high y --low deben darse juntos, o ambos ausentes (se usa DEFAULT_SWEEP)',
  });

function parseNumberList(flag: string, value: string): readonly number[] {
  return value.split(',').map((element) => {
    const parsed = Number(element);
    if (!Number.isFinite(parsed)) {
      throw new ComparisonOptionsError(`${flag} inválido: el elemento "${element}" no es un número.`);
    }
    return parsed;
  });
}

export function parseComparisonArgs(argv: readonly string[]): ComparisonRawOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        format: { type: 'string' },
        output: { type: 'string' },
        high: { type: 'string' },
        low: { type: 'string' },
      },
    });
  } catch (error) {
    // parseArgs({strict:true}) ya nombra el flag desconocido en su propio
    // mensaje — se conserva tal cual (mismo criterio que parseCalibrationArgs).
    throw new ComparisonOptionsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawOptionsSchema.safeParse(parsed.values);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const flagPath = firstIssue?.path[0];
    const flagName = typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
    throw new ComparisonOptionsError(`${flagName} inválido: ${firstIssue?.message ?? 'sin detalle'}.`);
  }

  const raw = result.data;
  return {
    format: raw.format,
    output: raw.output,
    high: raw.high === undefined ? undefined : parseNumberList('--high', raw.high),
    low: raw.low === undefined ? undefined : parseNumberList('--low', raw.low),
  };
}
