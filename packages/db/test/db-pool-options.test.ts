// ROADMAP 3.4 (decisión 256, D6; R2.1) — `createDb` acepta opciones de pool para que `apps/web` acote su
// tamaño detrás del pooler de conexiones. El paquete NUNCA lee `process.env` (decisión 024): las opciones
// llegan siempre como parámetro. `pg.Pool` conecta de forma perezosa, así que no hace falta base de datos.
import { afterEach, describe, expect, it } from 'vitest';

import { createDb } from '../src/db.js';

const URL = 'postgresql://user:pass@localhost:5432/example';

describe('createDb — opciones de pool (decisión 256)', () => {
  const pools: Array<ReturnType<typeof createDb>['pool']> = [];

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  function open(options?: Parameters<typeof createDb>[1]): ReturnType<typeof createDb>['pool'] {
    const { pool } = createDb(URL, options);
    pools.push(pool);
    return pool;
  }

  it('sin opciones conserva el comportamiento anterior (el máximo por defecto de pg)', () => {
    expect(open().options.max).toBe(10);
  });

  it('respeta el máximo del pool de lectura de apps/web', () => {
    expect(open({ max: 5 }).options.max).toBe(5);
  });

  it('respeta el máximo del pool de escritura restringida de apps/web', () => {
    expect(open({ max: 2 }).options.max).toBe(2);
  });

  it('propaga los plazos del limitador (acquire y consulta) sin tocar el resto', () => {
    const pool = open({ max: 4, connectionTimeoutMillis: 150, query_timeout: 150 });

    expect(pool.options.max).toBe(4);
    expect(pool.options.connectionTimeoutMillis).toBe(150);
    expect(pool.options.query_timeout).toBe(150);
    expect(pool.options.connectionString).toBe(URL);
  });
});
