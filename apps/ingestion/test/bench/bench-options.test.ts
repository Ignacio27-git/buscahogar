// ROADMAP 2.4 (search-indexing-performance) — bench-options.ts (diseño D4:
// guard de aislamiento; "both argument schemas, cold mode"). Mismo patrón de
// tres pasos que src/blocking/options.ts y src/dedup/options.ts:
// parseArgs({strict:true}) rechaza un flag desconocido por sí solo; Zod
// comprueba presencia y forma superficial nombrando el flag exacto; la
// conversión final nombra el flag Y el valor ofensivo. Ningún argumento se
// sustituye nunca por un valor por defecto que oculte un fallo de guard.
import { describe, expect, it } from 'vitest';

import {
  assertBenchDatabaseUrl,
  BenchSearchOptionsError,
  DevDatabaseGuardError,
  GenerateCorpusOptionsError,
  MissingBenchDatabaseUrlError,
  parseBenchSearchArgs,
  parseGenerateCorpusArgs,
} from '../../src/bench/bench-options.js';

const DEV_URL = 'postgres://buscahogar:secret@localhost:5432/buscahogar_dev';
const BENCH_URL = 'postgres://buscahogar:secret@localhost:5432/buscahogar_bench';

describe('assertBenchDatabaseUrl (diseño D4)', () => {
  it('--database-url ausente se rechaza con un error nombrado, sin resolver contra DATABASE_URL', () => {
    expect(() => {
      assertBenchDatabaseUrl(undefined, DEV_URL);
    }).toThrow(MissingBenchDatabaseUrlError);
  });

  it('--database-url vacío se rechaza igual que ausente', () => {
    expect(() => {
      assertBenchDatabaseUrl('', DEV_URL);
    }).toThrow(MissingBenchDatabaseUrlError);
  });

  it('--database-url igual a DATABASE_URL (host+puerto+nombre) se rechaza (fail-safe ante un override residual)', () => {
    expect(() => {
      assertBenchDatabaseUrl(DEV_URL, DEV_URL);
    }).toThrow(DevDatabaseGuardError);
  });

  it('un nombre de base de datos que no termina en "_bench" se rechaza, aunque no coincida con DATABASE_URL', () => {
    const otherUrl = 'postgres://buscahogar:secret@localhost:5432/some_other_db';
    expect(() => {
      assertBenchDatabaseUrl(otherUrl, DEV_URL);
    }).toThrow(DevDatabaseGuardError);
  });

  it('un --database-url válido, distinto de DATABASE_URL y con sufijo _bench, se acepta sin lanzar', () => {
    expect(() => {
      assertBenchDatabaseUrl(BENCH_URL, DEV_URL);
    }).not.toThrow();
  });

  it('se acepta también cuando no hay DATABASE_URL ambiental (devUrl undefined) y el nombre termina en _bench', () => {
    expect(() => {
      assertBenchDatabaseUrl(BENCH_URL, undefined);
    }).not.toThrow();
  });
});

describe('parseGenerateCorpusArgs (generate-search-corpus.ts)', () => {
  it('--rows no numérico se rechaza nombrando el flag y el valor ofensivo', () => {
    expect(() => parseGenerateCorpusArgs(['--database-url', BENCH_URL, '--rows', 'abc'])).toThrow(/--rows.*abc/);
  });

  it('--rows negativo se rechaza', () => {
    expect(() => parseGenerateCorpusArgs(['--database-url', BENCH_URL, '--rows', '-5'])).toThrow(GenerateCorpusOptionsError);
  });

  it('--database-url ausente se rechaza nombrando el flag, antes de tocar ninguna base de datos', () => {
    expect(() => parseGenerateCorpusArgs(['--rows', '1000'])).toThrow(/--database-url/);
  });

  it('con argumentos válidos, aplica los valores por defecto documentados (diseño) y parsea el resto', () => {
    const options = parseGenerateCorpusArgs(['--database-url', BENCH_URL, '--rows', '2000', '--seed', '7']);
    expect(options.databaseUrl).toBe(BENCH_URL);
    expect(options.rows).toBe(2000);
    expect(options.seed).toBe(7);
    expect(options.batchSize).toBeGreaterThan(0);
    expect(options.truncate).toBe(false);
  });

  it('--truncate se refleja como true cuando se pasa como flag', () => {
    const options = parseGenerateCorpusArgs(['--database-url', BENCH_URL, '--truncate']);
    expect(options.truncate).toBe(true);
  });

  it('--anchor que no es una fecha/hora ISO válida se rechaza nombrando el flag, antes de tocar ninguna base de datos', () => {
    expect(() =>
      parseGenerateCorpusArgs(['--database-url', BENCH_URL, '--anchor', 'no-es-una-fecha'])
    ).toThrow(/--anchor/);
  });

  it('--anchor con una fecha/hora ISO válida se acepta y se propaga tal cual', () => {
    const options = parseGenerateCorpusArgs(['--database-url', BENCH_URL, '--anchor', '2026-01-01T00:00:00.000Z']);
    expect(options.anchorIso).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('parseBenchSearchArgs (bench-search.ts)', () => {
  it('--runs por debajo del mínimo (10) se rechaza nombrando el flag', () => {
    expect(() => parseBenchSearchArgs(['--database-url', BENCH_URL, '--runs', '5'])).toThrow(/--runs/);
  });

  it('un --only desconocido se rechaza nombrando el id ofensivo', () => {
    expect(() => parseBenchSearchArgs(['--database-url', BENCH_URL, '--only', 'no-existe'])).toThrow(/--only.*no-existe/);
  });

  it('--cold-mode restart exige exactamente un --only: cero --only se rechaza', () => {
    expect(() => parseBenchSearchArgs(['--database-url', BENCH_URL, '--cold-mode', 'restart'])).toThrow(BenchSearchOptionsError);
  });

  it('--cold-mode restart exige exactamente un --only: dos --only también se rechaza', () => {
    expect(() =>
      parseBenchSearchArgs(['--database-url', BENCH_URL, '--cold-mode', 'restart', '--only', 'default', '--only', 'price-desc'])
    ).toThrow(BenchSearchOptionsError);
  });

  it('--cold-mode restart con exactamente un --only se acepta', () => {
    const options = parseBenchSearchArgs(['--database-url', BENCH_URL, '--cold-mode', 'restart', '--only', 'default']);
    expect(options.coldMode).toBe('restart');
    expect(options.only).toEqual(['default']);
  });

  it('sin --cold-mode, usa "evict" por defecto y --runs por defecto cumple el mínimo', () => {
    const options = parseBenchSearchArgs(['--database-url', BENCH_URL]);
    expect(options.coldMode).toBe('evict');
    expect(options.runs).toBeGreaterThanOrEqual(10);
    expect(options.only).toEqual([]);
  });
});
