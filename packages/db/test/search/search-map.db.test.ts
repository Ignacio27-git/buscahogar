// ROADMAP 2.6 (decisiones 116 y 117) — polígono y puntos del mapa contra
// PostgreSQL real. Se ejecuta contra la base `<dev>_db_test` que `test/setup-env.ts`
// deja en `DATABASE_URL` (ver `test/helpers/test-db-gate.ts`): esta suite hace TRUNCATE y
// nunca debe alcanzar la base de desarrollo (decisiones 046 y 245). Sin `DATABASE_URL`
// se omite.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { PolygonRing, PropertySearchCriteria } from '@buscahogar/core';

import { createDb } from '../../src/db.js';
import type { Database } from '../../src/db.js';
import { searchProperties } from '../../src/search.js';
import { MAP_POINT_CAP, searchMapPoints } from '../../src/search-map.js';
import { properties } from '../../src/tables.js';
import { truncateAll } from '../helpers/db-client.js';
import { describeWithTestDb } from '../helpers/test-db-gate.js';

const BASE: PropertySearchCriteria = { sort: 'updated', dir: 'desc', page: 1 };

// Cuadrado de ~1 km en Madrid, en sentido antihorario (lat, lon).
const SQUARE_CCW: PolygonRing = [
  { lat: 40.4, lon: -3.71 },
  { lat: 40.4, lon: -3.7 },
  { lat: 40.41, lon: -3.7 },
  { lat: 40.41, lon: -3.71 },
];
const SQUARE_CW: PolygonRing = [...SQUARE_CCW].reverse();

// Forma en L: el hueco (muesca) es el cuadrante superior derecho.
const L_SHAPE: PolygonRing = [
  { lat: 40.4, lon: -3.71 },
  { lat: 40.4, lon: -3.69 },
  { lat: 40.405, lon: -3.69 },
  { lat: 40.405, lon: -3.7 },
  { lat: 40.41, lon: -3.7 },
  { lat: 40.41, lon: -3.71 },
];

describeWithTestDb('búsqueda por polígono y puntos del mapa contra Postgres real', (url) => {
  let db: Database;
  let pool: Pool;

  async function seed(lat: number | null, lon: number | null, values: Partial<typeof properties.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(properties)
      .values({ activeListingCount: 1, ...(lat !== null && lon !== null ? { location: { x: lon, y: lat } } : {}), ...values })
      .returning({ id: properties.id });
    if (!row) {
      throw new Error('No se pudo sembrar la vivienda');
    }
    return row.id;
  }

  async function idsIn(polygon: PolygonRing): Promise<string[]> {
    const { points } = await searchMapPoints(db, { ...BASE, polygon });
    return points.map((point) => point.id);
  }

  beforeAll(() => {
    ({ db, pool } = createDb(url));
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('incluye un punto dentro y excluye uno fuera', async () => {
    const inside = await seed(40.405, -3.705);
    await seed(40.5, -3.705);
    expect(await idsIn(SQUARE_CCW)).toEqual([inside]);
  });

  it('un punto EN un vértice cuenta como cubierto (ST_Covers incluye el borde)', async () => {
    const onVertex = await seed(40.4, -3.71);
    expect(await idsIn(SQUARE_CCW)).toEqual([onVertex]);
  });

  it('un punto apenas fuera del vértice queda excluido', async () => {
    await seed(40.39999, -3.71);
    expect(await idsIn(SQUARE_CCW)).toEqual([]);
  });

  it('una forma cóncava excluye un punto en la muesca y cubre uno en el brazo', async () => {
    const inArm = await seed(40.402, -3.695);
    await seed(40.407, -3.695);
    expect(await idsIn(L_SHAPE)).toEqual([inArm]);
  });

  it('el sentido horario y el antihorario dan el mismo resultado', async () => {
    const inside = await seed(40.405, -3.705);
    await seed(40.5, -3.705);
    expect(await idsIn(SQUARE_CW)).toEqual([inside]);
    expect(await idsIn(SQUARE_CCW)).toEqual([inside]);
  });

  it('excluye las viviendas sin ubicación del mapa y del polígono', async () => {
    await seed(null, null);
    expect(await idsIn(SQUARE_CCW)).toEqual([]);
    const { total } = await searchMapPoints(db, BASE);
    expect(total).toBe(0);
  });

  it('excluye las viviendas sin anuncios activos (decisión 109)', async () => {
    await seed(40.405, -3.705, { activeListingCount: 0 });
    expect(await idsIn(SQUARE_CCW)).toEqual([]);
  });

  // Las siembras masivas van al INTERIOR del cuadrado, no sobre el borde sur: el borde
  // de `geography` es geodésico y se curva hacia el polo, así que un punto en mitad
  // de un borde de latitud constante queda fuera (DAS-9 solo garantiza los vértices).
  it('501 viviendas: 500 puntos, total 501 y truncado', async () => {
    await db.insert(properties).values(Array.from({ length: 501 }, (_, i) => ({ activeListingCount: 1, location: { x: -3.705, y: 40.401 + i * 1e-6 } })));
    const result = await searchMapPoints(db, { ...BASE, polygon: SQUARE_CCW });
    expect(result.points).toHaveLength(MAP_POINT_CAP);
    expect(result.total).toBe(501);
    expect(result.truncated).toBe(true);
  });

  it('120 viviendas: total 120, sin truncar', async () => {
    await db.insert(properties).values(Array.from({ length: 120 }, (_, i) => ({ activeListingCount: 1, location: { x: -3.705, y: 40.401 + i * 1e-6 } })));
    const result = await searchMapPoints(db, { ...BASE, polygon: SQUARE_CCW });
    expect(result.points).toHaveLength(120);
    expect(result.total).toBe(120);
    expect(result.truncated).toBe(false);
  });

  it('la lista con polígono coincide con los puntos del mapa', async () => {
    const inside = await seed(40.405, -3.705);
    await seed(40.5, -3.705);
    const page = await searchProperties(db, { ...BASE, polygon: SQUARE_CCW });
    expect(page.results.map((row) => row.id)).toEqual([inside]);
  });

  it('buscar por polígono no escribe en coverage_jobs ni zone_query_signals', async () => {
    await seed(40.405, -3.705);
    await searchMapPoints(db, { ...BASE, polygon: SQUARE_CCW });
    await searchProperties(db, { ...BASE, polygon: SQUARE_CCW });
    const jobs = await pool.query('SELECT count(*)::int AS n FROM coverage_jobs');
    const signals = await pool.query('SELECT count(*)::int AS n FROM zone_query_signals');
    expect(jobs.rows[0]).toEqual({ n: 0 });
    expect(signals.rows[0]).toEqual({ n: 0 });
  });
});
