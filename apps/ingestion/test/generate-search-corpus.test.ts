// ROADMAP 2.4 (search-indexing-performance) — runGenerate (diseño D4/D5): dos
// invariantes que NO requieren PostgreSQL real, probadas aquí con un
// `createDb` falso inyectado (mismo espíritu de DI que ya usa
// src/sweep/sweep-runner.ts con una fuente/almacén falsos): (a) el guard de
// aislamiento (bench-options.ts, diseño D4) se comprueba ANTES de construir
// ningún pool/cliente, y (b) una "properties" no vacía sin --truncate se
// rechaza sin llegar a abrir un cliente dedicado. El resto del flujo (carga
// real de las 4 tablas) lo prueba test/db/search-bench.db.test.ts contra
// BENCH_DATABASE_URL — esta suite es enteramente offline.
import { describe, expect, it } from 'vitest';

import type { createDb } from '@buscahogar/db';

import { GenerateCorpusPreconditionError, runGenerate } from '../scripts/generate-search-corpus.js';

const BENCH_URL = 'postgres://buscahogar:secret@localhost:5432/buscahogar_bench';
const DEV_URL = 'postgres://buscahogar:secret@localhost:5432/buscahogar_dev';

function createRejectingCreateDb(reason: string): typeof createDb {
  return () => {
    throw new Error(reason);
  };
}

describe('runGenerate — invariantes sin PostgreSQL real (diseño D4/D5)', () => {
  it('el guard de aislamiento corre ANTES de construir ningún pool: createDb no se invoca si el guard rechaza', async () => {
    const fakeCreateDb = createRejectingCreateDb(
      'runGenerate no debería llamar a createDb si assertBenchDatabaseUrl ya rechazó.'
    );
    const logs: string[] = [];
    const io = {
      log: (line: string): void => {
        logs.push(line);
      },
    };

    // DEV_URL no termina en "_bench": el guard (bench-options.ts, diseño D4)
    // lo rechaza antes de que runGenerate llegue a llamar a createDbFn. Si el
    // orden fuera al revés, fakeCreateDb lanzaría y esta promesa rechazaría
    // en vez de resolver con el exit code 2 de guard rechazado.
    const exitCode = await runGenerate(['--database-url', DEV_URL, '--rows', '10'], { DATABASE_URL: DEV_URL }, io, fakeCreateDb);

    expect(exitCode).toBe(2);
    expect(logs.some((line) => /_bench/.test(line))).toBe(true);
  });

  it('rechaza generar sobre una "properties" no vacía sin --truncate, sin llegar a abrir un cliente dedicado', async () => {
    const queries: string[] = [];
    const fakePool = {
      query: (text: string): Promise<{ rows: { count: string }[] }> => {
        queries.push(text);
        if (/count\(\*\)/i.test(text)) {
          return Promise.resolve({ rows: [{ count: '3' }] });
        }
        return Promise.reject(new Error(`consulta inesperada en el fake pool: ${text}`));
      },
      connect: (): Promise<never> =>
        Promise.reject(new Error('runGenerate no debería abrir un cliente dedicado antes de superar la precondición.')),
      end: (): Promise<void> => Promise.resolve(),
    };
    const fakeCreateDb = ((): { db: unknown; pool: typeof fakePool } => ({ db: {}, pool: fakePool })) as unknown as typeof createDb;

    const io = { log: (): void => {} };

    // Sin DATABASE_URL ambiental (env vacío): el guard pasa porque BENCH_URL
    // termina en "_bench" y no hay dev-URL con la que coincidir. El único
    // motivo de rechazo posible aquí es la precondición de tabla no vacía.
    await expect(runGenerate(['--database-url', BENCH_URL, '--rows', '10'], {}, io, fakeCreateDb)).rejects.toThrow(
      GenerateCorpusPreconditionError
    );

    // Solo el SELECT count(*) de la precondición debería haberse ejecutado:
    // ni el upsert de fuentes sintéticas ni ninguna tanda llegan a lanzarse.
    expect(queries).toHaveLength(1);
  });
});
