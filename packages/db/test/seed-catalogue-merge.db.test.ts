// ROADMAP 1.13 (diseño DD-2, arbitraje CR-15) — prueba de extremo a extremo
// contra PostgreSQL real: `mergeCatalogues` + `seedReferenceData` juntos.
// Sustituye el escenario original de Granada del spec (obs #214), que
// habría probado a favor de la regresión que CR-15 identificó: aquí Granada
// conserva su cita hand-cited Y gana el centroide importado, nunca uno solo
// de los dos.
import { eq } from 'drizzle-orm';
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
});
