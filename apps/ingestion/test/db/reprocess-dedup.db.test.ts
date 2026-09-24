// ROADMAP 1.10 — prueba comprometida y repetible de cero red / cero cuota
// (REPRO-1a, diseño D12): sustituye el grep manual que cerró el paso 1.9
// (ver docs/ROADMAP.md) por un test que falla si el control alguna vez se
// cae en silencio, en vez de una comprobación manual que no deja rastro.
// Corre bajo vitest.db.config.ts (paso 1.7): `test/setup-no-network.ts` YA
// hace que `globalThis.fetch` lance, y `test/db/setup-db-env.ts` YA borró
// ambas credenciales de Idealista del proceso antes de que este fichero se
// ejecute — ambos controles activos antes de que empiece ningún `it`.
//
// Llama SIEMPRE a la `runReprocess` EXPORTADA, nunca a `main()`: `main()` es
// el único lector de `process.env` de este cambio (D9) y no debe ejecutarse
// dentro de un test — el entorno se pasa como parámetro.
//
// Límite honesto (D12, y anotado también en el diseño para las notas de
// ROADMAP): esto prueba la RUTA EJECUTADA, no cualquier import muerto que
// solo el lint puede alcanzar (D11, CHK-NOSOURCES-LINT) — ninguna de las dos
// pruebas basta por sí sola, juntas sí.
import { randomUUID } from 'node:crypto';

import { dedupRuns, listings, listingVersions, properties, propertyListings } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runReprocess } from '../../scripts/reprocess-dedup.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertSource } from './helpers/seed-fixtures.js';

// Un único anuncio, deliberadamente SIN ninguna pareja posible: el bloqueo
// (`blocking.ts`) exige al menos dos filas (`lt(a.id, b.id)`), así que un
// corpus de un solo anuncio produce cero pares candidatos por construcción.
// Esto hace la prueba determinista sin depender de los umbrales de la
// estrategia de puntuación — el objetivo de este fichero es la ausencia de
// red, no volver a probar la agrupación (ya cubierta en Unit B/C).
async function insertSingleListing(db: Database, sourceId: string): Promise<string> {
  const [listing] = await db
    .insert(listings)
    .values({
      sourceId,
      externalId: `ext-${randomUUID()}`,
      url: 'https://example.test/anuncio',
      location: { x: -3.7038, y: 40.4168 }, // Puerta del Sol — x=longitud, y=latitud
    })
    .returning({ id: listings.id });
  if (!listing) {
    throw new Error('No se pudo insertar el anuncio de prueba');
  }
  await db.insert(listingVersions).values({
    listingId: listing.id,
    version: 1,
    isCurrent: true,
    priceCents: 200_000_00,
    operation: 'sale',
    propertyType: 'flat',
    surfaceM2: 80,
  });
  return listing.id;
}

describe('runReprocess — REPRO-1a, D12: cero red y cero credencial', () => {
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

  it('completa con fetch lanzando y sin credenciales de Idealista en el proceso, y escribe las filas esperadas', async () => {
    // Aserción 3 primero (D12): confirma que el control sigue vivo ANTES de
    // apoyarse en él para interpretar el resto de aserciones — sin esto, un
    // futuro cambio a vitest.db.config.ts que dejara caer
    // setup-no-network.ts en silencio dejaría pasar este test en verde sin
    // que nada se pusiera en rojo.
    expect(() => globalThis.fetch('https://api.idealista.com/oauth/token')).toThrow(/red deshabilitada/);
    expect(process.env['IDEALISTA_API_KEY']).toBeUndefined();
    expect(process.env['IDEALISTA_API_SECRET']).toBeUndefined();

    const sourceId = await insertSource(db);
    const listingId = await insertSingleListing(db, sourceId);

    const logged: string[] = [];
    const exitCode = await runReprocess(
      ['--radius', '300', '--price-band', '2500000', '--surface-tolerance', '10'],
      { DATABASE_URL: process.env['DATABASE_URL'] },
      { log: (line) => logged.push(line) }
    );

    // Aserción 1 (D12): la finalización EXITOSA con fetch lanzando es en sí
    // misma la prueba de que nunca lo llamó — no hay ninguna otra forma de
    // completar con esa sustitución activa.
    expect(exitCode).toBe(0);

    const runs = await db.select().from(dedupRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.listingsConsidered).toBe(1);
    expect(runs[0]?.candidatePairs).toBe(0);
    expect(runs[0]?.propertiesCreated).toBe(1);

    const propertyRows = await db.select().from(properties);
    expect(propertyRows).toHaveLength(1);
    expect(propertyRows[0]?.listingCount).toBe(1);

    const linkRows = await db.select().from(propertyListings).where(eq(propertyListings.listingId, listingId));
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0]?.signals).toEqual({
      selfGroup: {
        value: 1,
        weight: 0,
        detail: 'vivienda sin duplicado detectado: grupo de un solo anuncio',
      },
    });

    // REPRO-2, extremo a extremo: el informe que sale por stdout describe
    // exactamente esta corrida, no solo lo que la base de datos terminó
    // guardando.
    expect(logged).toHaveLength(1);
    const report: unknown = JSON.parse(logged[0] ?? '{}');
    expect(report).toMatchObject({
      listingsConsidered: 1,
      candidatePairs: 0,
      bandCounts: { accept: 0, undecided: 0, reject: 0 },
      propertiesCreated: 1,
      multiMemberGroups: [],
      refusedComponents: [],
    });
  });
});
