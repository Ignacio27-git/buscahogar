// ROADMAP 3.3 (decisión 248; R3, D13) — lógica de `set-monthly-quota`, el ÚNICO camino para
// fijar el total mensual de peticiones y la reserva. `--total` y `--reserve` son OBLIGATORIOS,
// sin valor por defecto: en un sistema con cuota mensual limitada y de pago, una cifra por
// defecto sería gasto contra un techo que nadie decidió (decisión 066). Todo el argv se valida con
// Zod ANTES de abrir ninguna conexión: un argumento inválido deja el registro intacto.
//
// Regla: `total` entero > 0, `reserve` entero >= 0 y `reserve < total` (la reserva 0 solo se
// acepta si se pasa explícita). `--month YYYY-MM` es opcional (por defecto, el mes UTC en curso).
// Solo se escriben total y reserva: los contadores de gasto nunca se tocan.
import { parseArgs } from 'node:util';

import { setMonthlyQuota } from '@buscahogar/db';
import type { Database, StoredMonthlyQuota } from '@buscahogar/db';
import { z } from 'zod';

// Límite de la columna `integer` de Postgres: un valor mayor fallaría en la base con un mensaje opaco.
const INT4_MAX = 2_147_483_647;

export class SetMonthlyQuotaArgsError extends Error {}

export interface SetMonthlyQuotaArgs {
  readonly totalCap: number;
  readonly reserve: number;
  // 'YYYY-MM-DD' del primer día del mes UTC.
  readonly month: string;
}

// Entero decimal sin signo, sin ceros a la izquierda, sin separadores ni notación científica.
const nonNegativeInteger = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'se espera un entero no negativo en notación decimal')
  .transform(Number)
  .pipe(z.number().max(INT4_MAX, `no puede superar ${String(INT4_MAX)}`));

const rawArgsSchema = z
  .strictObject({
    total: nonNegativeInteger.refine((value) => value > 0, 'se espera un entero positivo'),
    reserve: nonNegativeInteger,
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'se espera YYYY-MM')
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.reserve >= value.total) {
      context.addIssue({
        code: 'custom',
        path: ['reserve'],
        message: `la reserva (${String(value.reserve)}) debe ser menor que el total (${String(value.total)})`,
      });
    }
  });

function currentUtcMonth(now: Date): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${String(now.getUTCFullYear())}-${month}`;
}

export function parseSetMonthlyQuotaArgs(argv: readonly string[], now: Date): SetMonthlyQuotaArgs {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        total: { type: 'string' },
        reserve: { type: 'string' },
        month: { type: 'string' },
      },
    }));
  } catch (error) {
    throw new SetMonthlyQuotaArgsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawArgsSchema.safeParse(values);
  if (!result.success) {
    const issue = result.error.issues[0];
    const flag = typeof issue?.path[0] === 'string' ? `--${issue.path[0]}` : 'argumento';
    throw new SetMonthlyQuotaArgsError(`${flag} inválido o ausente: ${issue?.message ?? 'sin detalle'}.`);
  }

  return {
    totalCap: result.data.total,
    reserve: result.data.reserve,
    month: `${result.data.month ?? currentUtcMonth(now)}-01`,
  };
}

export interface SetMonthlyQuotaIo {
  log(line: string): void;
}

// Aplica el ajuste y informa. Código de salida 0 si se guardó; 1 si la base lo rechazó (un CHECK:
// por ejemplo, un total por debajo de lo ya gastado en ese mes), con el registro como estaba.
export async function runSetMonthlyQuota(
  db: Database,
  sourceId: string,
  args: SetMonthlyQuotaArgs,
  io: SetMonthlyQuotaIo
): Promise<number> {
  let stored: StoredMonthlyQuota;
  try {
    stored = await setMonthlyQuota(db, sourceId, { month: args.month, totalCap: args.totalCap, reserve: args.reserve });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    io.log(
      `No se pudo fijar la cuota de ${args.month}; el registro queda como estaba: ${cause ?? (error instanceof Error ? error.message : String(error))}`
    );
    return 1;
  }
  io.log(
    `Cuota de ${stored.month}: total=${String(stored.totalCap)}, reserva=${String(stored.reserve)}, ` +
      `techo del batch=${String(Math.max(0, stored.totalCap - stored.reserve - stored.searchRequests))} ` +
      `(gastado en el mes=${String(stored.searchRequests)}).`
  );
  return 0;
}
