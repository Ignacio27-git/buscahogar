// ROADMAP 2.6 (decisiones 116 y 117) — polígono dibujado y consulta de puntos
// del mapa. Mismo patrón que `search.test.ts`: se inspecciona `.toSQL()` de las
// consultas que REALMENTE se ejecutan, sin PostgreSQL. Este fichero es offline
// (no usa `describeWithDb` ni abre conexión): nunca toca ninguna base de datos.
import { describe, expect, it } from 'vitest';

import type { PolygonRing, PropertySearchCriteria } from '@buscahogar/core';

import { createDb } from '../../src/db.js';
import { buildPropertySearchQuery } from '../../src/search.js';
import { buildMapCountQuery, buildMapPointsQuery, MAP_POINT_CAP, truncatedMapTotal } from '../../src/search-map.js';
import { polygonWkt } from '../../src/spatial.js';

const db = createDb('postgres://toSQL-only/no-op').db;

const BASE: PropertySearchCriteria = { sort: 'updated', dir: 'desc', page: 1 };

// Anillo abierto (lat, lon): el WKT invierte el eje a `lon lat` y cierra el anillo.
const RING: PolygonRing = [
  { lat: 40.4, lon: -3.71 },
  { lat: 40.4, lon: -3.7 },
  { lat: 40.41, lon: -3.7 },
  { lat: 40.41, lon: -3.71 },
];
const RING_WKT = 'POLYGON((-3.71 40.4, -3.7 40.4, -3.7 40.41, -3.71 40.41, -3.71 40.4))';

/** Texto del WHERE de nivel superior: entre `from "properties" where` y `order by`/`limit`. */
function whereOf(sql: string): string {
  const match = /from "properties" where (.*?)(?: order by| limit|$)/is.exec(sql);
  if (!match?.[1]) {
    throw new Error(`No se pudo extraer el WHERE de: ${sql}`);
  }
  return match[1];
}

/** Predicados sin el paréntesis exterior de `and(...)` y sin distinguir mayúsculas. */
function predicatesOf(sql: string): string {
  const where = whereOf(sql).toLowerCase();
  return where.startsWith('(') && where.endsWith(')') ? where.slice(1, -1) : where;
}

describe('polygonWkt (decisión 116)', () => {
  it('invierte el eje a lon lat y cierra el anillo repitiendo el primer vértice', () => {
    expect(polygonWkt(RING)).toBe(RING_WKT);
  });

  it('un triángulo produce 3 vértices más el cierre', () => {
    const wkt = polygonWkt([
      { lat: 1, lon: 2 },
      { lat: 3, lon: 4 },
      { lat: 5, lon: 6 },
    ]);
    expect(wkt).toBe('POLYGON((2 1, 4 3, 6 5, 2 1))');
  });
});

describe('predicado de polígono en la consulta de lista', () => {
  it('emite ST_Covers sobre location_geography y liga el WKT como parámetro, nunca en el SQL', () => {
    const { sql, params } = buildPropertySearchQuery(db, { ...BASE, polygon: RING }).toSQL();
    expect(sql).toMatch(/ST_Covers\(ST_GeogFromText\(\$\d+\), "properties"\."location_geography"\)/);
    expect(params).toContain(RING_WKT);
    expect(sql).not.toContain('POLYGON');
    expect(sql).not.toContain('-3.71');
  });

  it('sin polígono no aparece ST_Covers (la consulta de lista no cambia)', () => {
    const { sql } = buildPropertySearchQuery(db, BASE).toSQL();
    expect(sql).not.toMatch(/ST_Covers/i);
    expect(sql).toMatch(/from "properties" where "properties"\."active_listing_count" > 0 order by/i);
  });

  it('un anillo con más vértices sigue siendo un único parámetro ligado', () => {
    const hostile: PolygonRing = [
      { lat: 1, lon: 2 },
      { lat: 3, lon: 4 },
      { lat: 5, lon: 6 },
    ];
    const { sql, params } = buildMapPointsQuery(db, { ...BASE, polygon: hostile }).toSQL();
    expect(sql).not.toContain('POLYGON((2 1');
    expect(params).toContain('POLYGON((2 1, 4 3, 6 5, 2 1))');
  });
});

describe('buildMapPointsQuery (decisión 117)', () => {
  it('MAP_POINT_CAP es 500 y la consulta pide 501 filas (la 501 solo señala truncado)', () => {
    expect(MAP_POINT_CAP).toBe(500);
    const { params } = buildMapPointsQuery(db, BASE).toSQL();
    expect(params).toContain(501);
  });

  it('el WHERE es el de la lista más "location IS NOT NULL", con y sin polígono', () => {
    for (const criteria of [BASE, { ...BASE, operation: 'sale', minPriceCents: 5, polygon: RING }] as const) {
      const list = buildPropertySearchQuery(db, criteria).toSQL().sql;
      const map = buildMapPointsQuery(db, criteria).toSQL().sql;
      expect(predicatesOf(map)).toBe(`${predicatesOf(list)} and "properties"."location" is not null`);
    }
  });

  it('conserva la visibilidad de la decisión 109 (active_listing_count > 0)', () => {
    const { sql } = buildMapPointsQuery(db, BASE).toSQL();
    expect(sql).toMatch(/"properties"\."active_listing_count" > 0/);
  });

  it('usa el MISMO ORDER BY que la lista, para cada orden', () => {
    for (const sort of ['updated', 'price', 'surface'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const criteria: PropertySearchCriteria = { ...BASE, sort, dir };
        const orderList = /order by (.*?) limit/is.exec(buildPropertySearchQuery(db, criteria).toSQL().sql)?.[1];
        const orderMap = /order by (.*?) limit/is.exec(buildMapPointsQuery(db, criteria).toSQL().sql)?.[1];
        expect(orderList).toBeDefined();
        expect(orderMap).toBe(orderList);
      }
    }
  });

  it('no depende de la página: page 1 y page 7 producen el mismo SQL y parámetros, sin OFFSET', () => {
    const first = buildMapPointsQuery(db, { ...BASE, page: 1, polygon: RING }).toSQL();
    const seventh = buildMapPointsQuery(db, { ...BASE, page: 7, polygon: RING }).toSQL();
    expect(seventh).toEqual(first);
    expect(first.sql).not.toMatch(/offset/i);
  });

  it('proyecta id, y/x de location, precio mínimo y el anchor listing id', () => {
    const { sql } = buildMapPointsQuery(db, BASE).toSQL();
    expect(sql).toMatch(/ST_Y\("properties"\."location"\)/);
    expect(sql).toMatch(/ST_X\("properties"\."location"\)/);
    expect(sql).toMatch(/"min_price_cents"/);
    expect(sql).toMatch(/anchor_pl\."listing_id"/);
  });
});

describe('buildMapCountQuery (decisión 117: M solo cuenta viviendas mapeables)', () => {
  it('cuenta con el identico WHERE de la consulta de puntos, sin ORDER BY ni LIMIT', () => {
    for (const criteria of [BASE, { ...BASE, minRooms: 2, polygon: RING }] as const) {
      const points = buildMapPointsQuery(db, criteria).toSQL().sql;
      const count = buildMapCountQuery(db, criteria).toSQL();
      expect(count.sql).toMatch(/count\(\*\)/i);
      expect(predicatesOf(count.sql)).toBe(predicatesOf(points));
      expect(count.sql).not.toMatch(/order by|limit/i);
    }
  });

  it('el WKT del polígono va también como parámetro ligado en el recuento', () => {
    const { sql, params } = buildMapCountQuery(db, { ...BASE, polygon: RING }).toSQL();
    expect(params).toContain(RING_WKT);
    expect(sql).not.toContain('POLYGON');
  });
});

// El recuento corre en su propia sentencia, sin instantánea compartida con la
// consulta de puntos: si la ingesta desactiva viviendas entre ambas, `count(*)`
// puede quedar por debajo de lo ya leído. Con truncado, M nunca baja de CAP + 1
// (se evita un «500 de 498»).
describe('truncatedMapTotal', () => {
  it('devuelve el recuento cuando es coherente con el truncado', () => {
    expect(truncatedMapTotal(12_345)).toBe(12_345);
  });

  it('nunca devuelve menos de CAP + 1 si el recuento llega por debajo', () => {
    expect(truncatedMapTotal(498)).toBe(MAP_POINT_CAP + 1);
  });

  it('sin fila de recuento cae a CAP + 1', () => {
    expect(truncatedMapTotal(undefined)).toBe(MAP_POINT_CAP + 1);
  });
});
