// ROADMAP 2.4 (search-indexing-performance) — runBench (diseño D4/decisión
// 8; fase 2, tarea 2.7). Invariantes que NO requieren PostgreSQL real,
// probadas con un `createDb`/pool falsos inyectados (mismo espíritu de DI
// que `test/generate-search-corpus.test.ts`, fase 1): (a) el guard de
// aislamiento corre ANTES de construir ningún pool, (b) el preflight de
// `--cold-mode evict` (rolsuper, pg_buffercache disponible y la firma
// pg_buffercache_evict(integer)) rechaza ANTES de ejecutar ninguna
// combinación de la matriz, (c) `evictBuffers` emite la consulta de
// eliminación acotada a la base de datos actual (corrección: PG17 NO tiene
// `pg_buffercache_evict()` sin argumentos, solo la forma `(integer)`), y (d)
// el orden guard→preflight→[evict]→SELECT 1 sin cronometrar→corrida en frío
// (corrección: la corrida en frío no debe incluir el coste de conectar).
// El resto del flujo (medir de verdad contra Postgres) no tiene test
// dedicado — mismo precedente que
// `scripts/calibrate-blocking.ts`/`scripts/sweep-zone.ts`: es el shell que
// compone módulos ya testeados por separado (bench-options, query-matrix,
// measure, report).
import { describe, expect, it } from 'vitest';

import type { createDb } from '@buscahogar/db';
import type { Pool } from 'pg';

import { evictBuffers, runBench } from '../scripts/bench-search.js';

const BENCH_URL = 'postgres://buscahogar:secret@localhost:5432/buscahogar_bench';
const DEV_URL = 'postgres://buscahogar:secret@localhost:5432/buscahogar_dev';

function createRejectingCreateDb(reason: string): typeof createDb {
  return () => {
    throw new Error(reason);
  };
}

describe('runBench — invariantes sin PostgreSQL real (diseño D4 y decisión 8)', () => {
  it('el guard de aislamiento corre ANTES de construir ningún pool: createDb no se invoca si el guard rechaza', async () => {
    const fakeCreateDb = createRejectingCreateDb('runBench no debería llamar a createDb si assertBenchDatabaseUrl ya rechazó.');
    const logs: string[] = [];
    const io = { log: (line: string): void => void logs.push(line), writeFile: (): Promise<void> => Promise.resolve() };

    const exitCode = await runBench(['--database-url', DEV_URL], { DATABASE_URL: DEV_URL }, io, fakeCreateDb);

    expect(exitCode).not.toBe(0);
    expect(logs.some((line) => /_bench/.test(line))).toBe(true);
  });

  it('el preflight de --cold-mode evict rechaza sin rolsuper, sin ejecutar ninguna combinación de la matriz', async () => {
    const queries: string[] = [];
    const fakePool = {
      query: (text: string): Promise<{ rows: { rolsuper: boolean }[] }> => {
        queries.push(text);
        if (/rolsuper/i.test(text)) {
          return Promise.resolve({ rows: [{ rolsuper: false }] });
        }
        return Promise.reject(new Error(`consulta inesperada en el fake pool: ${text}`));
      },
      end: (): Promise<void> => Promise.resolve(),
    };
    const fakeCreateDb = ((): { db: unknown; pool: typeof fakePool } => ({ db: {}, pool: fakePool })) as unknown as typeof createDb;

    const logs: string[] = [];
    const io = { log: (line: string): void => void logs.push(line), writeFile: (): Promise<void> => Promise.resolve() };

    const exitCode = await runBench(['--database-url', BENCH_URL, '--cold-mode', 'evict'], {}, io, fakeCreateDb);

    expect(exitCode).not.toBe(0);
    expect(logs.some((line) => /rolsuper|superusuario/i.test(line))).toBe(true);
    // Solo la comprobación de rolsuper debería haberse ejecutado: ninguna
    // consulta de la matriz de búsqueda llega a lanzarse.
    expect(queries).toHaveLength(1);
  });

  it('el preflight rechaza cuando pg_buffercache está instalada pero no expone pg_buffercache_evict(integer) (versión antigua, p. ej. PG17 sin actualizar), sin medir ninguna combinación', async () => {
    const queries: string[] = [];
    const fakePool = {
      query: (text: string): Promise<{ rows: Record<string, unknown>[] }> => {
        queries.push(text);
        if (/rolsuper/i.test(text)) return Promise.resolve({ rows: [{ rolsuper: true }] });
        if (/pg_available_extensions/i.test(text)) return Promise.resolve({ rows: [{ name: 'pg_buffercache' }] });
        if (/CREATE EXTENSION/i.test(text)) return Promise.resolve({ rows: [] });
        if (/to_regprocedure/i.test(text)) return Promise.resolve({ rows: [{ exists: false }] });
        return Promise.reject(new Error(`consulta inesperada en el fake pool: ${text}`));
      },
      end: (): Promise<void> => Promise.resolve(),
    };
    const fakeCreateDb = ((): { db: unknown; pool: typeof fakePool } => ({ db: {}, pool: fakePool })) as unknown as typeof createDb;

    const logs: string[] = [];
    const io = { log: (line: string): void => void logs.push(line), writeFile: (): Promise<void> => Promise.resolve() };

    const exitCode = await runBench(['--database-url', BENCH_URL, '--cold-mode', 'evict'], {}, io, fakeCreateDb);

    expect(exitCode).not.toBe(0);
    expect(logs.some((line) => /ALTER EXTENSION pg_buffercache UPDATE/.test(line))).toBe(true);
    // rolsuper, pg_available_extensions, CREATE EXTENSION, to_regprocedure —
    // nunca una consulta de eliminación de búferes ni de la matriz.
    expect(queries).toHaveLength(4);
  });

  it('evictBuffers emite una eliminación de búferes por fila acotada a la base de datos ACTUAL (corrección: PG17 no tiene pg_buffercache_evict() sin argumentos, solo la forma (integer); evict-all/relation llegan en PG18)', async () => {
    const queries: string[] = [];
    const fakePool: Pick<Pool, 'query'> = {
      query: ((text: string): Promise<{ rows: { count: number }[] }> => {
        queries.push(text);
        return Promise.resolve({ rows: [{ count: 0 }] });
      }) as unknown as Pool['query'],
    };

    await evictBuffers(fakePool);

    expect(queries).toHaveLength(1);
    const [issued] = queries;
    expect(issued).toContain('pg_buffercache_evict(bufferid)');
    expect(issued).toContain('FROM pg_buffercache');
    expect(issued).toContain('reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())');
    // Nunca la forma sin argumentos (no existe en PG17) ni evict-all/relation
    // (llegan en PG18).
    expect(issued).not.toMatch(/pg_buffercache_evict\(\)/);
  });

  it('en modo restart, emite un SELECT 1 sin cronometrar ANTES de la corrida en frío (corrección: evita que el tiempo "frío" incluya la conexión TCP/arranque de backend tras `docker compose restart db`)', async () => {
    const queries: string[] = [];
    const fakePool = {
      query: (text: string): Promise<{ rows: unknown[] }> => {
        queries.push(text);
        return Promise.resolve({ rows: [] });
      },
      end: (): Promise<void> => Promise.resolve(),
    };
    const fakeCreateDb = ((): { db: unknown; pool: typeof fakePool } => ({ db: {}, pool: fakePool })) as unknown as typeof createDb;

    const logs: string[] = [];
    const io = { log: (line: string): void => void logs.push(line), writeFile: (): Promise<void> => Promise.resolve() };

    // `db = {}` hace que la construcción real de la consulta falle en cuanto
    // se invoca (no hay PostgreSQL real en este test) — eso es justo lo que
    // demuestra el orden: si el SELECT 1 se emitiera DESPUÉS de la corrida
    // cronometrada (o no se emitiera), `queries` seguiría vacío aquí.
    await expect(
      runBench(['--database-url', BENCH_URL, '--cold-mode', 'restart', '--only', 'default'], {}, io, fakeCreateDb)
    ).rejects.toThrow();

    expect(queries).toEqual(['SELECT 1']);
  });

  it('en modo evict, emite el SELECT 1 sin cronometrar DESPUÉS del preflight y de vaciar búferes, pero ANTES de la corrida en frío', async () => {
    const queries: string[] = [];
    const fakePool = {
      query: (text: string): Promise<{ rows: Record<string, unknown>[] }> => {
        queries.push(text);
        if (/rolsuper/i.test(text)) return Promise.resolve({ rows: [{ rolsuper: true }] });
        if (/pg_available_extensions/i.test(text)) return Promise.resolve({ rows: [{ name: 'pg_buffercache' }] });
        if (/CREATE EXTENSION/i.test(text)) return Promise.resolve({ rows: [] });
        if (/to_regprocedure/i.test(text)) return Promise.resolve({ rows: [{ exists: true }] });
        if (/pg_buffercache_evict\(bufferid\)/i.test(text)) return Promise.resolve({ rows: [{ count: 0 }] });
        if (/^SELECT 1$/i.test(text)) return Promise.resolve({ rows: [] });
        return Promise.reject(new Error(`consulta inesperada en el fake pool: ${text}`));
      },
      end: (): Promise<void> => Promise.resolve(),
    };
    const fakeCreateDb = ((): { db: unknown; pool: typeof fakePool } => ({ db: {}, pool: fakePool })) as unknown as typeof createDb;

    const logs: string[] = [];
    const io = { log: (line: string): void => void logs.push(line), writeFile: (): Promise<void> => Promise.resolve() };

    await expect(
      runBench(['--database-url', BENCH_URL, '--cold-mode', 'evict', '--only', 'default'], {}, io, fakeCreateDb)
    ).rejects.toThrow();

    const evictAndWarmup = queries.filter((text) => /pg_buffercache_evict\(bufferid\)/i.test(text) || /^SELECT 1$/i.test(text));
    expect(evictAndWarmup).toEqual([expect.stringContaining('pg_buffercache_evict(bufferid)'), 'SELECT 1']);
  });
});
