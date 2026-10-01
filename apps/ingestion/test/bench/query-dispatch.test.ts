// ROADMAP 2.6 (diseño, "Bench scenarios") — despacho por `kind`. Offline: la
// base de datos es un `createDb` que NUNCA conecta (mismo patrón que
// packages/db/test/search/search-map.test.ts): solo se inspecciona `.toSQL()`.
// Comprueba que cada kind mide la consulta de producción que le corresponde
// y no una reescrita a mano.
import { createDb } from '@buscahogar/db';
import { describe, expect, it } from 'vitest';

import { benchQuerySql } from '../../src/bench/query-dispatch.js';
import { BENCH_COMBINATIONS } from '../../src/bench/query-matrix.js';

const { db } = createDb('postgres://toSQL-only/no-op');

function sqlOf(id: string): { sql: string; params: unknown[] } {
  const combination = BENCH_COMBINATIONS.find((c) => c.id === id);
  if (combination === undefined) {
    throw new Error(`Escenario desconocido: ${id}`);
  }
  return benchQuerySql(db, combination);
}

describe('benchQuerySql (despacho por kind)', () => {
  it('list: la consulta de la lista, con OFFSET y sin el filtro de ubicación no nula', () => {
    const { sql } = sqlOf('deep-default');
    expect(sql).toMatch(/offset/i);
    expect(sql).not.toMatch(/"location" IS NOT NULL/i);
  });

  it('map-points: LIMIT 501, ubicación no nula y sin OFFSET', () => {
    const { sql, params } = sqlOf('map-points-default');
    expect(sql).toMatch(/"properties"."location" IS NOT NULL/i);
    expect(sql).toMatch(/limit \$\d+/i);
    expect(sql).not.toMatch(/offset/i);
    expect(params).toContain(501);
  });

  it('map-count: count(*) sin LIMIT ni ORDER BY', () => {
    const { sql } = sqlOf('map-count-default');
    expect(sql).toMatch(/count\(\*\)/i);
    expect(sql).not.toMatch(/limit/i);
    expect(sql).not.toMatch(/order by/i);
  });

  it('el polígono viaja como parámetro WKT en list, map-points y map-count (nunca en el texto SQL)', () => {
    for (const id of ['polygon-small', 'map-points-polygon-large', 'map-count-polygon-large']) {
      const { sql, params } = sqlOf(id);
      expect(sql, id).toMatch(/ST_Covers/i);
      expect(sql, id).not.toMatch(/POLYGON\(\(/);
      expect(params.some((p) => typeof p === 'string' && p.startsWith('POLYGON((')), id).toBe(true);
    }
  });

  it('polygon-small usa el predicado sobre location_geography (el que indexa el GiST)', () => {
    expect(sqlOf('polygon-small').sql).toMatch(/location_geography/i);
  });
});
