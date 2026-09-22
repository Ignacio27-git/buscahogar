// ROADMAP 1.10 — reproceso completo de deduplicación (diseño, "Data flow";
// D9): bloqueo → clasificación → agrupación → consolidación, sobre datos YA
// ingeridos. ÚNICO lector de `process.env`/argv de este cambio (D9, mismo
// contrato que scripts/calibrate-blocking.ts, paso 1.8): `readEnv` y
// `parseReprocessArgs` son puros; ninguna función de `@buscahogar/db`
// invocada aquí lee el entorno. Este fichero NO importa nada de
// `src/sources/**` — frontera reforzada estructuralmente por
// eslint.config.mjs (D11, CHK-NOSOURCES-LINT) y probada en ejecución por
// test/db/reprocess-dedup.db.test.ts (D12): cero peticiones de red, cero
// cuota (REPRO-1, ROADMAP 1.10, criterio de revisión propio del paso).
//
// ROADMAP 1.13 Unit C (diseño DD-10, CR-2): el núcleo del reproceso
// (bloqueo → clasificación → agrupación → consolidación → informe) vive
// ahora en `src/dedup/reprocess-core.ts` (`runReprocessCore`), reutilizado
// SIN CAMBIOS por `src/sweep/coverage-worker-ports.ts` sobre el pool
// compartido del worker. Este fichero queda como el composition root: abre
// y cierra su propio pool por invocación, exactamente igual que antes.
//
// Sin test dedicado dentro de este propio fichero — mismo precedente que
// scripts/calibrate-blocking.ts (paso 1.8, comentario de cabecera): es el
// shell de orquestación de módulos que YA están testeados por separado
// (options, report, reprocess-core — cada uno con su suite propia). La
// única prueba que ejercita ESTE fichero es test/db/reprocess-dedup.db.test.ts
// (D12): cubre a la vez REPRO-1 (cero red) y, extremo a extremo, que la
// composición entera no revienta.
import { fileURLToPath } from 'node:url';

import { createDb } from '@buscahogar/db';
import { z } from 'zod';

import { parseReprocessArgs } from '../src/dedup/options.js';
import { runReprocessCore } from '../src/dedup/reprocess-core.js';
import type { ReprocessIo } from '../src/dedup/reprocess-core.js';

export class ReprocessEnvError extends Error {}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export interface ReprocessEnv {
  readonly databaseUrl: string;
}

// Nunca lee `process.env` directamente (mismo contrato que
// scripts/calibrate-blocking.ts): recibe el entorno como parámetro, para
// que el fallo se pueda testear sin tocar el proceso real. `main()` es el
// único llamador con `process.env` de verdad.
export function readEnv(env: Readonly<Record<string, string | undefined>>): ReprocessEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ReprocessEnvError('Falta la variable de entorno DATABASE_URL: debe estar definida y no vacía.');
  }
  return { databaseUrl: parsed.data.DATABASE_URL };
}

export type { ReprocessIo };

export async function runReprocess(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: ReprocessIo
): Promise<number> {
  let thresholds: ReturnType<typeof parseReprocessArgs>;
  try {
    thresholds = parseReprocessArgs(argv);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 2;
  }

  let databaseUrl: string;
  try {
    ({ databaseUrl } = readEnv(env));
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Variables de entorno inválidas.');
    return 2;
  }

  const { db, pool } = createDb(databaseUrl);
  try {
    await runReprocessCore(db, thresholds, io);
    return 0;
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const io: ReprocessIo = {
    log: (line: string): void => {
      console.log(line);
    },
  };

  process.exitCode = await runReprocess(process.argv.slice(2), process.env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/calibrate-blocking.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
