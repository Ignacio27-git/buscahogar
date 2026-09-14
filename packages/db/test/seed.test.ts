// Paso 1.7 — seed.ts (diseño D8, confirma COVERAGE-7 y COVERAGE-8). Contra
// PostgreSQL real (Docker-gated, como el resto de la Fase 3): la propiedad
// de idempotencia y la de fallo ruidoso ante una entrada no verificada solo
// se pueden demostrar escribiendo de verdad.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { locations, sources, zones } from '../src/tables.js';
import type { Database } from '../src/db.js';
import { InvalidMunicipalitySeedError, MUNICIPALITY_CATALOGUE } from '../src/seed-data.js';
import type { MunicipalitySeed } from '../src/seed-data.js';
import { MissingDatabaseUrlError, seed, seedReferenceData } from '../src/seed.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

function buildInvalidEntry(overrides: Partial<MunicipalitySeed> = {}): MunicipalitySeed {
  return {
    ineCode: '187',
    municipality: 'Municipio de prueba no verificado',
    province: 'Provincia de prueba',
    provinceCode: '18',
    autonomousCommunity: 'Comunidad de prueba',
    source: 'test',
    ...overrides,
  };
}

describeWithDb('seed — sources/locations/zones (D8, COVERAGE-7, COVERAGE-8)', () => {
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

  it('COVERAGE-7a: sembrar dos veces contra una base vacía es un no-op la segunda vez', async () => {
    await seedReferenceData(db);
    await seedReferenceData(db);

    const sourceRows = await db.select().from(sources).where(eq(sources.key, 'idealista'));
    expect(sourceRows).toHaveLength(1);

    const locationRows = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(locationRows).toHaveLength(1);

    const zoneRows = await db.select().from(zones).where(eq(zones.locationId, locationRows[0]?.id ?? ''));
    expect(zoneRows).toHaveLength(1);
  });

  it('siembra el catálogo real: sources.key="idealista" y locations.ine_code="18087" existen tras una única pasada', async () => {
    await seedReferenceData(db);

    const [source] = await db.select().from(sources).where(eq(sources.key, 'idealista'));
    expect(source?.name).toBe('Idealista');
    expect(source?.kind).toBe('api');

    const [location] = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(location?.municipality).toBe('Granada');
    expect(location?.provinceCode).toBe('18');
  });

  it('COVERAGE-8a: una entrada sin código INE verificado hace fallar el seed entero y no inserta nada de esa entrada', async () => {
    const badCatalogue = [buildInvalidEntry()];

    await expect(seedReferenceData(db, badCatalogue)).rejects.toThrow(InvalidMunicipalitySeedError);
    await expect(seedReferenceData(db, badCatalogue)).rejects.toThrow(/Municipio de prueba no verificado/);

    const locationRows = await db.select().from(locations).where(eq(locations.ineCode, '187'));
    expect(locationRows).toHaveLength(0);
  });

  it('COVERAGE-8a: la validación ocurre antes de escribir nada — un catálogo inválido no siembra ni siquiera sources', async () => {
    const badCatalogue = [buildInvalidEntry()];

    await expect(seedReferenceData(db, badCatalogue)).rejects.toThrow(InvalidMunicipalitySeedError);

    const sourceRows = await db.select().from(sources);
    expect(sourceRows).toHaveLength(0);
  });

  it('un catálogo válido junto a uno inválido tampoco siembra el válido (fallo atómico, sin siembra parcial)', async () => {
    const mixedCatalogue = [...MUNICIPALITY_CATALOGUE, buildInvalidEntry()];

    await expect(seedReferenceData(db, mixedCatalogue)).rejects.toThrow(InvalidMunicipalitySeedError);

    const locationRows = await db.select().from(locations).where(eq(locations.ineCode, '18087'));
    expect(locationRows).toHaveLength(0);
  });

  it('seed(): lanza MissingDatabaseUrlError cuando DATABASE_URL no está definida en el entorno', async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(seed()).rejects.toThrow(MissingDatabaseUrlError);
    } finally {
      if (original !== undefined) {
        process.env.DATABASE_URL = original;
      }
    }
  });
});
