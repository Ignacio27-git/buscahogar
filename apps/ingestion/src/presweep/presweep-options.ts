// ROADMAP 3.3 (decisión 253; R3, D13) — argumentos de `presweep-top-cities`. `--top`, `--max-requests` (tope de
// peticiones de TODA la ejecución) y `--max-requests-per-sweep` (tope de cada barrido) son OBLIGATORIOS, enteros
// positivos y sin valor por defecto: en un sistema con cuota mensual limitada y de pago, una cifra por defecto
// sería gasto contra un techo que nadie decidió (decisión 066). El total y la reserva mensuales NO son flags de
// este comando: salen únicamente del registro (`set-monthly-quota`). Todo el argv se valida con Zod ANTES de
// abrir ninguna conexión: un argumento inválido no hace ninguna llamada ni escribe nada en el registro.
import { parseArgs } from 'node:util';

import { z } from 'zod';

// Límite de la columna `integer` de Postgres y de los contadores del registro.
const INT4_MAX = 2_147_483_647;

export class PresweepArgsError extends Error {}

export interface PresweepArgs {
  readonly top: number;
  readonly maxRequests: number;
  readonly maxRequestsPerSweep: number;
  readonly dryRun: boolean;
}

// Entero decimal positivo, sin signo, sin ceros a la izquierda, sin separadores ni notación científica.
const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/, 'se espera un entero positivo en notación decimal')
  .transform(Number)
  .pipe(z.number().max(INT4_MAX, `no puede superar ${String(INT4_MAX)}`));

const rawArgsSchema = z.strictObject({
  top: positiveInteger,
  'max-requests': positiveInteger,
  'max-requests-per-sweep': positiveInteger,
  'dry-run': z.boolean().optional(),
});

export function parsePresweepArgs(argv: readonly string[]): PresweepArgs {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        top: { type: 'string' },
        'max-requests': { type: 'string' },
        'max-requests-per-sweep': { type: 'string' },
        'dry-run': { type: 'boolean' },
      },
    }));
  } catch (error) {
    throw new PresweepArgsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawArgsSchema.safeParse(values);
  if (!result.success) {
    const issue = result.error.issues[0];
    const flag = typeof issue?.path[0] === 'string' ? `--${issue.path[0]}` : 'argumento';
    throw new PresweepArgsError(`${flag} inválido o ausente: ${issue?.message ?? 'sin detalle'}.`);
  }

  return {
    top: result.data.top,
    maxRequests: result.data['max-requests'],
    maxRequestsPerSweep: result.data['max-requests-per-sweep'],
    dryRun: result.data['dry-run'] === true,
  };
}
