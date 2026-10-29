// ROADMAP 3.4 (decisión 257, D9; R5.1, R5.2) — siembra del catálogo municipal desde el despliegue:
// idempotente (sin filas duplicadas) y capaz de informar «skipped» cuando ya está completa, para que la
// segunda ejecución del despliegue reporte «seeds skipped». Reutiliza `seedReferenceData` (decisión 039).
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { MUNICIPALITY_CATALOGUE } from '../../src/seed-data.js';
import type { MunicipalitySeed } from '../../src/seed-data.js';
import { seedReferenceDataIfNeeded } from '../../src/seed.js';
import { locations, sources, zones } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';

// Catálogo pequeño de PRUEBA: la forma real de una entrada con códigos que solo existen en este test.
const BASE = MUNICIPALITY_CATALOGUE[0];
if (!BASE) {
  throw new Error('El catálogo hand-cited no puede estar vacío');
}
const CATALOGUE: readonly MunicipalitySeed[] = ['18901', '18902', '18903'].map(
  (ineCode): MunicipalitySeed => ({
    ...BASE,
    ineCode,
    municipality: `Municipio de prueba ${ineCode}`,
    searchName: `municipio de prueba ${ineCode}`,
  })
);

describeWithDb('seedReferenceDataIfNeeded — siembra idempotente del catálogo (decisión 257)', () => {
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

  async function counts(): Promise<{ sources: number; locations: number; zones: number }> {
    return {
      sources: (await db.select().from(sources).where(eq(sources.key, 'idealista'))).length,
      locations: (await db.select().from(locations)).length,
      zones: (await db.select().from(zones)).length,
    };
  }

  it('base vacía: siembra la fuente, las localizaciones y sus zonas; la segunda llamada se omite sin duplicar', async () => {
    expect(await seedReferenceDataIfNeeded(db, CATALOGUE)).toBe('seeded');
    expect(await counts()).toEqual({ sources: 1, locations: 3, zones: 3 });

    expect(await seedReferenceDataIfNeeded(db, CATALOGUE)).toBe('skipped');
    expect(await counts()).toEqual({ sources: 1, locations: 3, zones: 3 });
  });

  it('catálogo incompleto (falta una zona): vuelve a sembrar y no duplica lo que ya estaba', async () => {
    await seedReferenceDataIfNeeded(db, CATALOGUE);
    const [location] = await db.select().from(locations).where(eq(locations.ineCode, '18902'));
    await db.delete(zones).where(eq(zones.locationId, location?.id ?? ''));
    expect((await counts()).zones).toBe(2);

    expect(await seedReferenceDataIfNeeded(db, CATALOGUE)).toBe('seeded');

    expect(await counts()).toEqual({ sources: 1, locations: 3, zones: 3 });
  });

  it('sin la fuente `idealista` no se considera sembrado aunque estén las localizaciones', async () => {
    await seedReferenceDataIfNeeded(db, CATALOGUE);
    await pool.query("delete from sources where key = 'idealista'");

    expect(await seedReferenceDataIfNeeded(db, CATALOGUE)).toBe('seeded');
    expect((await counts()).sources).toBe(1);
  });

  it('un catálogo con una entrada inválida falla sin sembrar nada (misma validación que `seedReferenceData`)', async () => {
    const invalid: MunicipalitySeed = { ...BASE, ineCode: '18' };

    await expect(seedReferenceDataIfNeeded(db, [...CATALOGUE, invalid])).rejects.toThrow(/inválida/);

    expect(await counts()).toEqual({ sources: 0, locations: 0, zones: 0 });
  });
});
