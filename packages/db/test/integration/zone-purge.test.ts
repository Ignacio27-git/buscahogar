// ROADMAP 2.5 (refresh-retention-policy, S4; decisión 108) — purga de zona como
// REINICIO de cobertura: por job (zona, fuente), en UNA transacción, retira los
// anuncios que solo cubría esa zona, refresca la visibilidad, borra el job y
// las señales y devuelve la zona a `uncovered`. La fila de `zones` (catálogo
// INE sembrado) nunca se borra. Contra PostgreSQL real.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import {
  listingPresenceChecks,
  listings,
  listingVersions,
  properties,
  propertyListings,
  zones,
} from '../../src/tables.js';
import { purgeZones } from '../../src/zone-purge.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListingWithCurrentVersion, insertLocation, insertSource } from '../helpers/fixtures.js';

const PURGE_AFTER_DAYS = 180;
const CENTER = { latitude: 40.43, longitude: -3.7 };
const RADIUS_M = 1000;
// Un grado de longitud a esta latitud son ~85 km; 0,01º son ~850 m.
const LON_STEP = 0.01;

interface ZoneSeed {
  readonly zoneId: string;
  readonly jobId: string;
}

// Punto dentro del círculo de radio 1 km centrado `offsetLon` grados al este.
function pointNear(offsetLon: number): { x: number; y: number } {
  return { x: CENTER.longitude + offsetLon, y: CENTER.latitude };
}

describeWithDb('purgeZones — reinicio de cobertura por zona (S-RP-1..11, decisión 108)', () => {
  let db: Database;
  let pool: Pool;
  let sourceId: string;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    sourceId = await insertSource(db);
  });

  async function seedZone(
    offsetLon: number,
    options: { requestedDaysAgo?: number; status?: string; source?: string; state?: string } = {}
  ): Promise<ZoneSeed> {
    const locationId = await insertLocation(db);
    await pool.query(
      `update locations set centroid = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, sweep_radius_m = $4 where id = $1`,
      [locationId, CENTER.longitude + offsetLon, CENTER.latitude, RADIUS_M]
    );
    const [zone] = await db
      .insert(zones)
      .values({ locationId, state: options.state ?? 'covered', lastSweptAt: new Date() })
      .returning({ id: zones.id });
    if (!zone) {
      throw new Error('No se pudo insertar la zona');
    }
    const jobId = await seedJob(zone.id, options.source ?? sourceId, options);
    return { zoneId: zone.id, jobId };
  }

  async function seedJob(
    zoneId: string,
    jobSourceId: string,
    options: { requestedDaysAgo?: number; status?: string; operation?: 'sale' | 'rent' } = {}
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into coverage_jobs (zone_id, source_id, operation, status, requested_at)
       values ($1, $2, $3, $4, now() - ($5::integer * interval '1 day')) returning id`,
      [zoneId, jobSourceId, options.operation ?? 'rent', options.status ?? 'done', options.requestedDaysAgo ?? 200]
    );
    const id = rows[0]?.id;
    if (!id) {
      throw new Error('No se pudo insertar el job');
    }
    return id;
  }

  async function seedSignal(zoneId: string, daysAgo: number): Promise<void> {
    await pool.query(
      `insert into zone_query_signals (zone_id, day) values ($1, (now() at time zone 'utc')::date - $2::integer)`,
      [zoneId, daysAgo]
    );
  }

  async function seedListing(location: { x: number; y: number } | undefined, priceCents = 900): Promise<string> {
    const { listingId } = await insertListingWithCurrentVersion(db, sourceId, {
      priceCents,
      ...(location !== undefined ? { location } : {}),
    });
    return listingId;
  }

  async function seedProperty(listingIds: readonly string[]): Promise<string> {
    const [property] = await db
      .insert(properties)
      .values({ minPriceCents: 900, listingCount: listingIds.length, activeListingCount: listingIds.length })
      .returning({ id: properties.id });
    if (!property) {
      throw new Error('No se pudo insertar la vivienda');
    }
    for (const listingId of listingIds) {
      await db.insert(propertyListings).values({
        propertyId: property.id,
        listingId,
        score: 0.9,
        strategyName: 'test',
        strategyVersion: '1',
        signals: { price: { value: 1, weight: 0.5 } },
      });
    }
    return property.id;
  }

  async function readListing(id: string): Promise<{ status: string; reason: string | null; since: Date | null }> {
    const [row] = await db.select().from(listings).where(eq(listings.id, id));
    if (!row) {
      throw new Error('anuncio no encontrado');
    }
    return { status: row.status, reason: row.inactiveReason, since: row.inactiveSince };
  }

  async function count(table: string): Promise<number> {
    const { rows } = await pool.query<{ n: string }>(`select count(*)::text as n from ${table}`);
    return Number(rows[0]?.n);
  }

  async function readZone(zoneId: string): Promise<{ state: string; lastSweptAt: Date | null } | undefined> {
    const [row] = await db.select().from(zones).where(eq(zones.id, zoneId));
    return row && { state: row.state, lastSweptAt: row.lastSweptAt };
  }

  function purge(zoneIds: readonly string[]): ReturnType<typeof purgeZones> {
    return purgeZones(db, { sourceId, zoneIds, purgeAfterDays: PURGE_AFTER_DAYS });
  }

  it('S-RP-1: borra job y señales, la zona vuelve a uncovered con last_swept_at NULL y su fila sigue existiendo', async () => {
    const z = await seedZone(0);
    await seedSignal(z.zoneId, 190);

    const result = await purge([z.zoneId]);

    expect(result.purged).toEqual([z.zoneId]);
    expect(await count('coverage_jobs')).toBe(0);
    expect(await count('zone_query_signals')).toBe(0);
    expect(await readZone(z.zoneId)).toEqual({ state: 'uncovered', lastSweptAt: null });
  });

  it('S-RP-3: A solo en el círculo de Z se retira (zone_purged); B, también dentro del de Y, sigue activo', async () => {
    const z = await seedZone(0);
    await seedZone(LON_STEP, { requestedDaysAgo: 5 });
    const a = await seedListing(pointNear(-0.004));
    const b = await seedListing(pointNear(0.005));

    await purge([z.zoneId]);

    const retired = await readListing(a);
    expect(retired.status).toBe('inactive');
    expect(retired.reason).toBe('zone_purged');
    expect(retired.since).toBeInstanceOf(Date);
    expect(await readListing(b)).toEqual({ status: 'active', reason: null, since: null });
  });

  it('S-RP-4: dos zonas solapadas purgadas en la misma pasada se procesan en secuencia y la última retira el anuncio compartido', async () => {
    const y = await seedZone(LON_STEP);
    const z = await seedZone(0);
    const shared = await seedListing(pointNear(0.005));

    const result = await purge([y.zoneId, z.zoneId]);

    expect(result.purged).toEqual([y.zoneId, z.zoneId]);
    expect((await readListing(shared)).reason).toBe('zone_purged');
    expect(await count('coverage_jobs')).toBe(0);
  });

  it('S-RP-5: un anuncio sin coordenadas no se retira', async () => {
    const z = await seedZone(0);
    const noCoords = await seedListing(undefined);
    const inside = await seedListing(pointNear(0.001));

    await purge([z.zoneId]);

    expect((await readListing(noCoords)).status).toBe('active');
    expect((await readListing(inside)).status).toBe('inactive');
  });

  it('S-RP-6: no borra anuncios, versiones, viviendas ni property_listings; la vivienda deja de ser visible', async () => {
    const z = await seedZone(0);
    const a = await seedListing(pointNear(0.001));
    const propertyId = await seedProperty([a]);
    const before = {
      listings: await count('listings'),
      versions: await count('listing_versions'),
      properties: await count('properties'),
      links: await count('property_listings'),
    };

    await purge([z.zoneId]);

    expect({
      listings: await count('listings'),
      versions: await count('listing_versions'),
      properties: await count('properties'),
      links: await count('property_listings'),
    }).toEqual(before);
    const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
    expect(property?.activeListingCount).toBe(0);
    const [link] = await db.select().from(propertyListings).where(eq(propertyListings.listingId, a));
    expect(link?.score).toBe(0.9);
    expect(link?.signals).toEqual({ price: { value: 1, weight: 0.5 } });
  });

  it('retirar un anuncio borra su fila de la cola de verificación de presencia', async () => {
    const z = await seedZone(0);
    const a = await seedListing(pointNear(0.001));
    await db.insert(listingPresenceChecks).values({ listingId: a, zoneId: z.zoneId });

    await purge([z.zoneId]);

    expect(await count('listing_presence_checks')).toBe(0);
  });

  it('S-RP-7: un fallo entre el marcado y el borrado del job revierte TODO (anuncios, job, señales, zona)', async () => {
    const z = await seedZone(0);
    await seedSignal(z.zoneId, 190);
    const a = await seedListing(pointNear(0.001));
    // Fallo inyectado con un trigger real (no de sesión: el pool usa varias
    // conexiones); se elimina al terminar la prueba.
    await pool.query(`
      create function public.test_fail_job_delete() returns trigger language plpgsql as
      $$ begin raise exception 'fallo inyectado'; end $$;
    `);
    await pool.query(
      `create trigger test_fail_job_delete before delete on coverage_jobs for each row execute function public.test_fail_job_delete()`
    );
    try {
      const result = await purge([z.zoneId]);

      expect(result.purged).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.zoneId).toBe(z.zoneId);
      expect(result.failed[0]?.message).toContain('fallo inyectado');
    } finally {
      await pool.query('drop trigger test_fail_job_delete on coverage_jobs');
      await pool.query('drop function public.test_fail_job_delete()');
    }

    expect((await readListing(a)).status).toBe('active');
    expect(await count('coverage_jobs')).toBe(1);
    expect(await count('zone_query_signals')).toBe(1);
    expect((await readZone(z.zoneId))?.state).toBe('covered');
  });

  it('S-RP-8: una segunda ejecución no hace nada', async () => {
    const z = await seedZone(0);
    await seedListing(pointNear(0.001));

    const first = await purge([z.zoneId]);
    const second = await purge([z.zoneId]);

    expect(first.purged).toEqual([z.zoneId]);
    expect(second.purged).toEqual([]);
    expect(second.skipped).toEqual([z.zoneId]);
  });

  it('S-RP-9: la purga no toca el ledger de presupuesto', async () => {
    const z = await seedZone(0);
    await pool.query(
      `insert into daily_request_budget (source_id, day, search_requests, token_requests, search_cap) values ($1, current_date, 7, 1, 100)`,
      [sourceId]
    );

    await purge([z.zoneId]);

    const { rows } = await pool.query<{ search_requests: number }>('select search_requests from daily_request_budget');
    expect(rows).toEqual([{ search_requests: 7 }]);
  });

  it('guarda de carrera: una señal reciente (d < 180) impide la purga aunque el plan la hubiera elegido', async () => {
    const z = await seedZone(0);
    await seedSignal(z.zoneId, 2);
    const a = await seedListing(pointNear(0.001));

    const result = await purge([z.zoneId]);

    expect(result.purged).toEqual([]);
    expect(result.skipped).toEqual([z.zoneId]);
    expect((await readListing(a)).status).toBe('active');
    expect(await count('coverage_jobs')).toBe(1);
    expect((await readZone(z.zoneId))?.state).toBe('covered');
  });

  it('guarda de carrera: un job en curso (running) no se purga', async () => {
    const z = await seedZone(0, { status: 'running' });

    const result = await purge([z.zoneId]);

    expect(result.skipped).toEqual([z.zoneId]);
    expect(await count('coverage_jobs')).toBe(1);
  });

  it('con un job de OTRA fuente sobre la misma zona, solo se borra el de esta fuente y la zona conserva su estado y señales', async () => {
    const z = await seedZone(0);
    const otherSource = await insertSource(db);
    await seedJob(z.zoneId, otherSource);
    await seedSignal(z.zoneId, 190);

    const result = await purge([z.zoneId]);

    expect(result.purged).toEqual([z.zoneId]);
    const remaining = await pool.query<{ source_id: string }>('select source_id from coverage_jobs');
    expect(remaining.rows).toEqual([{ source_id: otherSource }]);
    expect(await count('zone_query_signals')).toBe(1);
    expect((await readZone(z.zoneId))?.state).toBe('covered');
  });

  // ROADMAP 3.3 (decisión 250): una zona tiene un job por operación. La purga es
  // de la ZONA: borra todos los jobs de la fuente o ninguno.
  it('una zona con jobs de sale y rent se purga entera: se borran los dos jobs y la zona vuelve a uncovered', async () => {
    const z = await seedZone(0);
    await seedJob(z.zoneId, sourceId, { operation: 'sale' });
    const a = await seedListing(pointNear(0.001));

    const result = await purge([z.zoneId]);

    expect(result.purged).toEqual([z.zoneId]);
    expect(await count('coverage_jobs')).toBe(0);
    expect((await readListing(a)).reason).toBe('zone_purged');
    expect(await readZone(z.zoneId)).toEqual({ state: 'uncovered', lastSweptAt: null });
  });

  it('si UNO de los dos jobs de la zona está running, no se purga nada', async () => {
    const z = await seedZone(0);
    await seedJob(z.zoneId, sourceId, { operation: 'sale', status: 'running' });

    const result = await purge([z.zoneId]);

    expect(result.skipped).toEqual([z.zoneId]);
    expect(await count('coverage_jobs')).toBe(2);
    expect((await readZone(z.zoneId))?.state).toBe('covered');
  });

  it('sin señales, la demanda de la zona es el requested_at MÁS RECIENTE de sus jobs: un job de sale nuevo impide la purga', async () => {
    const z = await seedZone(0);
    await seedJob(z.zoneId, sourceId, { operation: 'sale', requestedDaysAgo: 5, status: 'pending' });

    const result = await purge([z.zoneId]);

    expect(result.skipped).toEqual([z.zoneId]);
    expect(await count('coverage_jobs')).toBe(2);
  });

  it('S-RP-11: tras la purga, la zona admite un job nuevo (cobertura a demanda) sin tocar el catálogo', async () => {
    const z = await seedZone(0);

    await purge([z.zoneId]);
    await seedJob(z.zoneId, sourceId, { requestedDaysAgo: 0, status: 'pending' });

    expect(await count('coverage_jobs')).toBe(1);
    expect(await count('zones')).toBe(1);
  });

  it('los datos de versión (precio, historia) no cambian al retirar', async () => {
    const z = await seedZone(0);
    const a = await seedListing(pointNear(0.001), 123_000);

    await purge([z.zoneId]);

    const versions = await db.select().from(listingVersions).where(eq(listingVersions.listingId, a));
    expect(versions.map((v) => v.priceCents)).toEqual([123_000]);
  });
});
