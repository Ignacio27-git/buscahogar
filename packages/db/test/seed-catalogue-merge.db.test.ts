// ROADMAP 1.13 (diseño DD-2, arbitraje CR-15) — prueba de extremo a extremo
// contra PostgreSQL real: `mergeCatalogues` + `seedReferenceData` juntos.
// Sustituye el escenario original de Granada del spec (obs #214), que
// habría probado a favor de la regresión que CR-15 identificó: aquí Granada
// conserva su cita hand-cited Y gana el centroide importado, nunca uno solo
// de los dos.
import { eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { mergeCatalogues } from '../src/catalogue-merge.js';
import type { Database } from '../src/db.js';
import { MUNICIPALITY_CATALOGUE } from '../src/seed-data.js';
import type { MunicipalitySeed } from '../src/seed-data.js';
import { seedReferenceData } from '../src/seed.js';
import { locations, sources, zones } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

const IMPORTED_GRANADA: MunicipalitySeed = {
  ineCode: '18087',
  municipality: 'Granada',
  province: 'Granada',
  provinceCode: '18',
  autonomousCommunity: 'Andalucía',
  searchName: 'granada',
  centroid: { latitude: 37.177336, longitude: -3.598557 },
  sweepRadiusM: 4500,
  source: 'NGMEP/INE, tier=tier-1, importado 2026-09-20',
};

describeWithDb('seedReferenceData(mergeCatalogues(...)) — Granada conserva su cita Y gana el centroide (DD-2, CR-15)', () => {
  let db: Database;
  let pool: Pool;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('siembra Granada con su cita hand-cited Y su centroide importado en una sola pasada', async () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, [IMPORTED_GRANADA]);
    await seedReferenceData(db, merged);

    const [granada] = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(granada?.municipality).toBe('Granada');
    expect(granada?.centroid).not.toBeNull();
    expect(granada?.sweepRadiusM).toBe(4500);
  });

  it('re-sembrar tras Granada ya sembrada es idempotente: N locations → N zones, todas "uncovered", sin fila duplicada', async () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, [IMPORTED_GRANADA]);
    await seedReferenceData(db, merged);
    await seedReferenceData(db, merged);

    const locationRows = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(locationRows).toHaveLength(1);

    const zoneRows = await db.select().from(zones).where(eq(zones.locationId, locationRows[0]?.id ?? ''));
    expect(zoneRows).toHaveLength(1);
    expect(zoneRows[0]?.state).toBe('uncovered');
  });

  it('re-sembrar con la lista hand-cited SOLA (sin el importado) tras ya haber sembrado con el centroide NO borra el centroide previamente escrito — ON CONFLICT DO NOTHING nunca actualiza, así que el segundo INSERT simplemente no toca la fila existente', async () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, [IMPORTED_GRANADA]);
    await seedReferenceData(db, merged); // primera pasada: Granada YA tiene centroide

    await seedReferenceData(db, MUNICIPALITY_CATALOGUE); // segunda pasada: solo hand-cited, sin centroide

    const [granada] = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(granada?.centroid).not.toBeNull(); // el centroide de la primera pasada sigue ahí
  });

  it('sources.key="idealista" sigue sembrándose una sola vez junto al catálogo fusionado', async () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, [IMPORTED_GRANADA]);
    await seedReferenceData(db, merged);

    const sourceRows = await db.select().from(sources).where(eq(sources.key, 'idealista'));
    expect(sourceRows).toHaveLength(1);
  });

  // ROADMAP 3.3 (decisión 249, migración 0017) — `locations.population`.
  it('3.3: la migración 0017 añade locations.population como integer NULLABLE', async () => {
    const result = await pool.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'locations' AND column_name = 'population'`
    );

    expect(result.rows).toEqual([{ data_type: 'integer', is_nullable: 'YES' }]);
  });

  it('3.3: re-sembrar con población rellena las filas YA existentes sin cambiar sus ids ni sus zonas', async () => {
    await seedReferenceData(db, [IMPORTED_GRANADA]); // estado previo a la migración: sin población
    const [before] = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(before?.population).toBeNull();
    const zonesBefore = await db.select().from(zones).where(eq(zones.locationId, before?.id ?? ''));

    await seedReferenceData(db, [{ ...IMPORTED_GRANADA, population: 232462 }]);

    const [after] = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(after?.id).toBe(before?.id);
    expect(after?.population).toBe(232462);
    const zonesAfter = await db.select().from(zones).where(eq(zones.locationId, after?.id ?? ''));
    expect(zonesAfter.map((zone) => zone.id)).toEqual(zonesBefore.map((zone) => zone.id));
    const total = await db.select({ n: sql<number>`count(*)::int` }).from(locations);
    expect(total[0]?.n).toBe(1);
  });

  it('3.3: un municipio sin población en el catálogo queda NULL (desconocida), nunca 0', async () => {
    await seedReferenceData(db, [IMPORTED_GRANADA, { ...IMPORTED_GRANADA, ineCode: '18088', municipality: 'Otro' }]);

    const rows = await db.select().from(locations);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.population === null)).toBe(true);
  });

  it('3.3: re-sembrar con un catálogo SIN población no borra la población ya guardada', async () => {
    await seedReferenceData(db, [{ ...IMPORTED_GRANADA, population: 232462 }]);

    await seedReferenceData(db, [IMPORTED_GRANADA]);

    const [granada] = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(granada?.population).toBe(232462);
  });
});
