// ROADMAP 3.3 (decisión 248; D13) — composition root de `set-monthly-quota`: fija el total
// mensual de peticiones y la reserva en el registro (`monthly_request_budget`), que es la ÚNICA
// fuente de la cuota para el worker, el barrido manual y el presweep. Uso (el responsable del
// proyecto, tras aplicar la migración 0019):
//   pnpm --filter @buscahogar/ingestion set-monthly-quota --total 1000 --reserve 200 [--month 2026-10]
//
// ÚNICO lector de `process.env` de esta herramienta (como scripts/sweep-zone.ts). Sin test propio
// (mismo precedente que sweep-zone.ts y coverage-worker.ts): es el shell de orquestación de piezas
// ya probadas por separado — el argv en `test/set-monthly-quota-options.test.ts` y la escritura en
// `test/db/set-monthly-quota.db.test.ts`. No usa credenciales de Idealista ni hace llamadas de red.
import { fileURLToPath } from 'node:url';

import { createDb } from '@buscahogar/db';
import { z } from 'zod';

import { parseSetMonthlyQuotaArgs, runSetMonthlyQuota } from '../src/quota/set-monthly-quota.js';
import type { SetMonthlyQuotaArgs } from '../src/quota/set-monthly-quota.js';
import { resolveSourceUuid } from '../src/sweep/reference-store.js';

const EnvSchema = z.object({ DATABASE_URL: z.string().min(1) });

export async function main(): Promise<void> {
  const log = (line: string): void => {
    console.log(line);
  };

  let args: SetMonthlyQuotaArgs;
  try {
    args = parseSetMonthlyQuotaArgs(process.argv.slice(2), new Date());
  } catch (error) {
    log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    log('Uso: set-monthly-quota --total <entero > 0> --reserve <entero >= 0, menor que el total> [--month YYYY-MM]');
    process.exitCode = 2;
    return;
  }

  const env = EnvSchema.safeParse(process.env);
  if (!env.success) {
    log('Falta la variable de entorno DATABASE_URL (definida y no vacía).');
    process.exitCode = 2;
    return;
  }

  const { db, pool } = createDb(env.data.DATABASE_URL);
  try {
    const sourceId = await resolveSourceUuid(db, 'idealista');
    process.exitCode = await runSetMonthlyQuota(db, sourceId, args, { log });
  } catch (error) {
    log(error instanceof Error ? error.message : 'No se pudo fijar la cuota mensual.');
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
