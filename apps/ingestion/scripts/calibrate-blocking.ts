// ROADMAP 1.8 — comando de CLI para calibrar los umbrales de bloqueo de
// candidatos (diseño, "Data flow"). ÚNICO lector de `process.env` de este
// cambio: `parseCalibrationArgs`, `expandGrid` y `buildCalibrationReport`
// son puros; `corpusSummary`/`countCandidatePairs` (packages/db) tampoco
// leen el entorno. Operación de solo lectura, cero peticiones de red
// (CLI-4) — este fichero no importa nada de `src/sources/**`.
//
// Sin test dedicado, mismo precedente que `scripts/sweep-zone.ts` (paso
// 1.7) y `sdd/zone-sweep-persistence/tasks` (obs #118) tarea 4.5: es el
// shell de orquestación de módulos que YA están testeados por separado
// (options, grid, report — cada uno con su propia suite offline). Cubrir
// este fichero exigiría un contenedor PostgreSQL real, que no añade nada
// sobre lo que esos tests ya demuestran por separado.
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { corpusSummary, countCandidatePairs, createDb } from '@buscahogar/db';
import type { BlockingThresholds } from '@buscahogar/core';

import { expandGrid } from '../src/blocking/grid.js';
import { parseCalibrationArgs } from '../src/blocking/options.js';
import { buildCalibrationReport } from '../src/blocking/report.js';
import type { CalibrationCombinationInput } from '../src/blocking/report.js';

export class CalibrationEnvError extends Error {}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export interface CalibrationEnv {
  readonly databaseUrl: string;
}

// Nunca lee `process.env` directamente: recibe el entorno como parámetro,
// igual que `readEnv` de `scripts/sweep-zone.ts` — permite testear el
// fallo sin tocar el proceso real. `main()` es el único llamador con
// `process.env` de verdad.
export function readEnv(env: Readonly<Record<string, string | undefined>>): CalibrationEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new CalibrationEnvError('Falta la variable de entorno DATABASE_URL: debe estar definida y no vacía.');
  }
  return { databaseUrl: parsed.data.DATABASE_URL };
}

export interface CalibrationIo {
  log(line: string): void;
}

export async function runCalibration(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: CalibrationIo
): Promise<number> {
  let grid: readonly BlockingThresholds[];
  try {
    const options = parseCalibrationArgs(argv);
    grid = expandGrid(options);
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
    // D-C3: se ejecuta UNA vez por invocación, independiente de la rejilla.
    const corpus = await corpusSummary(db);

    // D4/CLI-2: exactamente una consulta de conteo POR combinación de la
    // rejilla, nunca colapsada en una sola consulta multi-combinación.
    const combinations: CalibrationCombinationInput[] = [];
    for (const thresholds of grid) {
      const counts = await countCandidatePairs(db, thresholds);
      combinations.push({ thresholds, counts });
    }

    const report = buildCalibrationReport(corpus, combinations);
    io.log(JSON.stringify(report, null, 2));
    return 0;
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  const io: CalibrationIo = {
    log: (line: string): void => {
      console.log(line);
    },
  };

  process.exitCode = await runCalibration(process.argv.slice(2), process.env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/sweep-zone.ts y scripts/probe-idealista.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
