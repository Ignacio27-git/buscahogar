// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — cola de verificación
// de presencia: nominación tras un ciclo COMPLETADO (S-LR-1..3), lectura de los
// candidatos vencidos (reintento a 7 días) y aplicación de los veredictos
// (S-LR-5, 7, 12, 16, 18). Contra PostgreSQL real.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import {
  applyPresenceVerdicts,
  listDuePresenceCandidates,
  markAbsenceCandidates,
} from '../../src/presence-checks.js';
import {
  listingPresenceChecks,
  listings,
  listingVersions,
  properties,
  propertyListings,
  zones,
} from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';
import { insertListing, insertLocation, insertSource } from '../helpers/fixtures.js';

const CENTER = { latitude: 40.43, longitude: -3.7 };
const RADIUS_M = 1000;
// ~220 m al norte del centroide: dentro del círculo de 1 km.
const INSIDE = { x: CENTER.longitude, y: CENTER.latitude + 0.002 };
// ~5,5 km al norte: fuera del círculo.
const OUTSIDE = { x: CENTER.longitude, y: CENTER.latitude + 0.05 };
const HOUR_MS = 3_600_000;
// Los valores de la política viven en `packages/core`; `packages/db` los recibe por parámetro.
const BACKOFF_DAYS = 7;
const MAX_ATTEMPTS = 3;

interface Seed {
  readonly sourceId: string;
  readonly zoneId: string;
  readonly jobId: string;
  readonly cycleStartedAt: Date;
}

describeWithDb('presence-checks — nominación, candidatos vencidos y veredictos', () => {
  let db: Database;
  let pool: Pool;
  let seed: Seed;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    seed = await seedZoneWithJob();
  });

  async function seedZoneWithJob(
    cycleStartedAt: Date | null = new Date(Date.now() - 2 * HOUR_MS),
    operation: 'sale' | 'rent' = 'sale'
  ): Promise<Seed> {
    const sourceId = await insertSource(db);
    const locationId = await insertLocation(db);
    await pool.query(
      `update locations set centroid = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, sweep_radius_m = $4 where id = $1`,
      [locationId, CENTER.longitude, CENTER.latitude, RADIUS_M]
    );
    const [zone] = await db.insert(zones).values({ locationId, state: 'covered' }).returning({ id: zones.id });
    if (!zone) {
      throw new Error('No se pudo insertar la zona');
    }
    const { rows } = await pool.query<{ id: string }>(
      `insert into coverage_jobs (zone_id, source_id, operation, status, cycle_started_at) values ($1, $2, $3, 'done', $4) returning id`,
      [zone.id, sourceId, operation, cycleStartedAt]
    );
    const jobId = rows[0]?.id;
    if (!jobId) {
      throw new Error('No se pudo insertar el job');
    }
    return { sourceId, zoneId: zone.id, jobId, cycleStartedAt: cycleStartedAt ?? new Date() };
  }

  interface ListingSeed {
    readonly location?: { x: number; y: number } | null;
    readonly lastSeenAgoHours?: number;
    readonly status?: string;
    readonly operation?: string;
    readonly sourceId?: string;
    readonly rawPropertyType?: string | null;
    readonly priceCents?: number;
  }

  async function makeListing(options: ListingSeed = {}): Promise<{ listingId: string; externalId: string }> {
    const listingId = await insertListing(db, options.sourceId ?? seed.sourceId, {
      ...(options.location === null ? {} : { location: options.location ?? INSIDE }),
      ...(options.status !== undefined
        ? { status: options.status, inactiveSince: new Date(), inactiveReason: 'delisted' }
        : {}),
    });
    await pool.query(`update listings set last_seen_at = now() - ($2::numeric * interval '1 hour') where id = $1`, [
      listingId,
      options.lastSeenAgoHours ?? 5,
    ]);
    await db.insert(listingVersions).values({
      listingId,
      version: 1,
      isCurrent: true,
      priceCents: options.priceCents ?? 100_000,
      operation: options.operation ?? 'sale',
      raw: options.rawPropertyType === null ? null : { propertyType: options.rawPropertyType ?? 'flat' },
    });
    const [row] = await db.select({ externalId: listings.externalId }).from(listings).where(eq(listings.id, listingId));
    if (!row) {
      throw new Error('listing no encontrado');
    }
    return { listingId, externalId: row.externalId };
  }

  async function queueRows(): Promise<readonly { listing_id: string; check_attempts: number; zone_id: string }[]> {
    const { rows } = await pool.query<{ listing_id: string; check_attempts: number; zone_id: string }>(
      'select listing_id, check_attempts, zone_id from listing_presence_checks order by listing_id'
    );
    return rows;
  }

  async function enqueue(listingId: string, options: { attempts?: number; checkedAgoDays?: number | null } = {}): Promise<void> {
    await db.insert(listingPresenceChecks).values({ listingId, zoneId: seed.zoneId, checkAttempts: options.attempts ?? 0 });
    if (options.checkedAgoDays !== undefined && options.checkedAgoDays !== null) {
      await pool.query(
        `update listing_presence_checks set last_checked_at = now() - ($2::numeric * interval '1 day') where listing_id = $1`,
        [listingId, options.checkedAgoDays]
      );
    }
  }

  describe('markAbsenceCandidates (S-LR-1, S-LR-3)', () => {
    it('S-LR-1: nomina el anuncio activo de la zona, de la fuente y la operación, visto antes del inicio del ciclo; sigue activo', async () => {
      const { listingId } = await makeListing();

      const nominated = await markAbsenceCandidates(db, { jobId: seed.jobId });

      expect(nominated).toBe(1);
      expect(await queueRows()).toEqual([{ listing_id: listingId, check_attempts: 0, zone_id: seed.zoneId }]);
      const [row] = await db.select({ status: listings.status }).from(listings).where(eq(listings.id, listingId));
      expect(row?.status).toBe('active');
    });

    it('S-LR-3: no nomina anuncios de otra fuente, de otra operación, fuera del círculo, sin coordenadas ni vistos durante el ciclo', async () => {
      const otherSourceId = await insertSource(db);
      const nominee = await makeListing();
      await makeListing({ sourceId: otherSourceId });
      await makeListing({ operation: 'rent' });
      await makeListing({ location: OUTSIDE });
      await makeListing({ location: null });
      await makeListing({ lastSeenAgoHours: 1 });

      const nominated = await markAbsenceCandidates(db, { jobId: seed.jobId });

      expect(nominated).toBe(1);
      expect((await queueRows()).map((row) => row.listing_id)).toEqual([nominee.listingId]);
    });

    // ROADMAP 3.3 (decisión 250): la operación que se juzga es la del JOB, no la de
    // un proceso worker (ya no hay una operación fija por proceso).
    it('un job de rent nomina solo anuncios de rent, y el de sale de la misma zona solo los de sale', async () => {
      const saleListing = await makeListing({ operation: 'sale' });
      const rentListing = await makeListing({ operation: 'rent' });
      const { rows } = await pool.query<{ id: string }>(
        `insert into coverage_jobs (zone_id, source_id, operation, status, cycle_started_at)
         values ($1, $2, 'rent', 'done', $3) returning id`,
        [seed.zoneId, seed.sourceId, seed.cycleStartedAt]
      );
      const rentJobId = rows[0]?.id;
      if (!rentJobId) {
        throw new Error('No se pudo insertar el job de rent');
      }

      expect(await markAbsenceCandidates(db, { jobId: rentJobId })).toBe(1);
      expect((await queueRows()).map((row) => row.listing_id)).toEqual([rentListing.listingId]);

      expect(await markAbsenceCandidates(db, { jobId: seed.jobId })).toBe(1);
      expect((await queueRows()).map((row) => row.listing_id).sort()).toEqual(
        [saleListing.listingId, rentListing.listingId].sort()
      );
    });

    it('no nomina anuncios que ya no están activos', async () => {
      await makeListing({ status: 'inactive' });
      const active = await makeListing();

      await markAbsenceCandidates(db, { jobId: seed.jobId });

      expect((await queueRows()).map((row) => row.listing_id)).toEqual([active.listingId]);
    });

    it('un job sin ciclo conocido (cycle_started_at NULL) no nomina a nadie (fail-safe)', async () => {
      const legacy = await seedZoneWithJob(null);
      await makeListing({ sourceId: legacy.sourceId, location: INSIDE });

      expect(await markAbsenceCandidates(db, { jobId: legacy.jobId })).toBe(0);
      expect(await queueRows()).toEqual([]);
    });

    it('nominar dos veces no duplica la fila ni reinicia sus intentos (ON CONFLICT DO NOTHING)', async () => {
      const { listingId } = await makeListing();
      await enqueue(listingId, { attempts: 2 });

      const nominated = await markAbsenceCandidates(db, { jobId: seed.jobId });

      expect(nominated).toBe(0);
      expect(await queueRows()).toEqual([{ listing_id: listingId, check_attempts: 2, zone_id: seed.zoneId }]);
    });
  });

  describe('listDuePresenceCandidates (backoff de 7 días)', () => {
    it('devuelve un candidato nunca comprobado con el centro, el radio y el tipo crudo de la zona', async () => {
      const { listingId, externalId } = await makeListing({ rawPropertyType: 'premise' });
      await enqueue(listingId);

      const due = await listDuePresenceCandidates(db, { sourceId: seed.sourceId, limit: 10, retryBackoffDays: BACKOFF_DAYS });

      expect(due).toHaveLength(1);
      expect(due[0]).toMatchObject({
        listingId,
        externalId,
        zoneId: seed.zoneId,
        radiusMeters: RADIUS_M,
        operation: 'sale',
        rawPropertyType: 'premise',
      });
      expect(due[0]?.center.latitude).toBeCloseTo(CENTER.latitude, 6);
      expect(due[0]?.center.longitude).toBeCloseTo(CENTER.longitude, 6);
    });

    it('un intento de hace 6 días aún no vence; de hace 7 días o más sí', async () => {
      const fresh = await makeListing();
      const stale = await makeListing();
      await enqueue(fresh.listingId, { attempts: 1, checkedAgoDays: 6 });
      await enqueue(stale.listingId, { attempts: 1, checkedAgoDays: 7.01 });

      const due = await listDuePresenceCandidates(db, { sourceId: seed.sourceId, limit: 10, retryBackoffDays: BACKOFF_DAYS });

      expect(due.map((candidate) => candidate.listingId)).toEqual([stale.listingId]);
    });

    it('respeta el límite, devuelve ambas operaciones, filtra por fuente y omite anuncios ya inactivos', async () => {
      const otherSourceId = await insertSource(db);
      const first = await makeListing();
      const second = await makeListing();
      const rent = await makeListing({ operation: 'rent' });
      const foreign = await makeListing({ sourceId: otherSourceId });
      const inactive = await makeListing({ status: 'inactive' });
      await Promise.all([first, second, rent, foreign, inactive].map((item) => enqueue(item.listingId)));

      const limited = await listDuePresenceCandidates(db, { sourceId: seed.sourceId, limit: 1, retryBackoffDays: BACKOFF_DAYS });
      const all = await listDuePresenceCandidates(db, { sourceId: seed.sourceId, limit: 10, retryBackoffDays: BACKOFF_DAYS });

      expect(limited).toHaveLength(1);
      // Sin filtro de operación (decisión 250): el worker único verifica las dos.
      expect(all.map((candidate) => candidate.listingId).sort()).toEqual(
        [first.listingId, second.listingId, rent.listingId].sort()
      );
      expect(all.find((candidate) => candidate.listingId === rent.listingId)?.operation).toBe('rent');
      expect(all.find((candidate) => candidate.listingId === first.listingId)?.operation).toBe('sale');
    });

    it('un anuncio sin payload crudo devuelve rawPropertyType null', async () => {
      const { listingId } = await makeListing({ rawPropertyType: null });
      await enqueue(listingId);

      const due = await listDuePresenceCandidates(db, { sourceId: seed.sourceId, limit: 10, retryBackoffDays: BACKOFF_DAYS });

      expect(due[0]?.rawPropertyType).toBeNull();
    });
  });

  describe('applyPresenceVerdicts', () => {
    async function makeProperty(listingIds: readonly string[]): Promise<string> {
      const [property] = await db
        .insert(properties)
        .values({ minPriceCents: 1, listingCount: listingIds.length, activeListingCount: listingIds.length })
        .returning({ id: properties.id });
      if (!property) {
        throw new Error('No se pudo insertar la vivienda');
      }
      await db.insert(propertyListings).values(
        listingIds.map((listingId) => ({
          propertyId: property.id,
          listingId,
          score: 0.9,
          strategyName: 'test',
          strategyVersion: '1',
          signals: { precio: { value: 1, weight: 0.4, detail: 'mismo precio' } },
        }))
      );
      return property.id;
    }

    it('S-LR-16: presente -> last_seen_at = ahora, sigue activo y la fila de la cola se borra', async () => {
      const { listingId } = await makeListing({ lastSeenAgoHours: 100 });
      await enqueue(listingId);

      const result = await applyPresenceVerdicts(db, { present: [listingId], absent: [], ambiguous: [] }, MAX_ATTEMPTS);

      expect(result).toMatchObject({ present: 1, absent: 0, ambiguous: 0 });
      expect(await queueRows()).toEqual([]);
      const { rows } = await pool.query<{ status: string; fresh: boolean }>(
        `select status, (last_seen_at > now() - interval '1 minute') as fresh from listings where id = $1`,
        [listingId]
      );
      expect(rows[0]).toEqual({ status: 'active', fresh: true });
    });

    it('S-LR-5: ausente -> inactivo/delisted con inactive_since = ahora, fila borrada y visibilidad refrescada', async () => {
      const gone = await makeListing({ priceCents: 70_000 });
      const stays = await makeListing({ priceCents: 90_000 });
      const propertyId = await makeProperty([gone.listingId, stays.listingId]);
      await enqueue(gone.listingId);

      const result = await applyPresenceVerdicts(db, { present: [], absent: [gone.listingId], ambiguous: [] }, MAX_ATTEMPTS);

      expect(result).toMatchObject({ absent: 1 });
      expect(await queueRows()).toEqual([]);
      const { rows } = await pool.query<{ status: string; inactive_reason: string; fresh: boolean }>(
        `select status, inactive_reason, (inactive_since > now() - interval '1 minute') as fresh from listings where id = $1`,
        [gone.listingId]
      );
      expect(rows[0]).toEqual({ status: 'inactive', inactive_reason: 'delisted', fresh: true });
      const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
      expect(property).toMatchObject({ activeListingCount: 1, minPriceCents: 90_000 });
    });

    it('S-LR-5: si era el único anuncio activo, la vivienda deja de contar (active_listing_count = 0)', async () => {
      const only = await makeListing();
      const propertyId = await makeProperty([only.listingId]);
      await enqueue(only.listingId);

      await applyPresenceVerdicts(db, { present: [], absent: [only.listingId], ambiguous: [] }, MAX_ATTEMPTS);

      const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
      expect(property?.activeListingCount).toBe(0);
    });

    it('carrera: si la fila de la cola desaparece entre verificar y aplicar (un barrido lo vio), el veredicto ausente NO retira el anuncio', async () => {
      const seen = await makeListing();
      const gone = await makeListing();
      const propertyId = await makeProperty([seen.listingId, gone.listingId]);
      await enqueue(seen.listingId);
      await enqueue(gone.listingId);
      // El escritor de barridos borra la fila de un anuncio visto en una página.
      await pool.query('delete from listing_presence_checks where listing_id = $1', [seen.listingId]);

      const result = await applyPresenceVerdicts(
        db,
        { present: [], absent: [seen.listingId, gone.listingId], ambiguous: [] },
        MAX_ATTEMPTS
      );

      expect(result.absent).toBe(1);
      const { rows } = await pool.query<{ id: string; status: string }>('select id, status from listings');
      const statusById = new Map(rows.map((row) => [row.id, row.status]));
      expect(statusById.get(seen.listingId)).toBe('active');
      expect(statusById.get(gone.listingId)).toBe('inactive');
      const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
      expect(property?.activeListingCount).toBe(1);
    });

    it('S-LR-18: retirar un anuncio no cambia versiones, property_listings ni puntuaciones', async () => {
      const gone = await makeListing();
      const other = await makeListing();
      await makeProperty([gone.listingId, other.listingId]);
      await enqueue(gone.listingId);
      const before = await snapshotProtectedData();

      await applyPresenceVerdicts(db, { present: [], absent: [gone.listingId], ambiguous: [] }, MAX_ATTEMPTS);

      expect(await snapshotProtectedData()).toEqual(before);
    });

    async function snapshotProtectedData(): Promise<unknown> {
      const versions = await db.select().from(listingVersions).orderBy(listingVersions.listingId);
      const links = await db.select().from(propertyListings).orderBy(propertyListings.listingId);
      return { versions, links };
    }

    it('S-LR-7: ambiguo -> sigue activo, check_attempts + 1 y el siguiente intento no antes de 7 días', async () => {
      const { listingId } = await makeListing();
      await enqueue(listingId);

      const result = await applyPresenceVerdicts(db, { present: [], absent: [], ambiguous: [listingId] }, MAX_ATTEMPTS);

      expect(result).toMatchObject({ ambiguous: 1, dropped: 0 });
      expect(await queueRows()).toEqual([{ listing_id: listingId, check_attempts: 1, zone_id: seed.zoneId }]);
      const [row] = await db.select({ status: listings.status }).from(listings).where(eq(listings.id, listingId));
      expect(row?.status).toBe('active');
      expect(await listDuePresenceCandidates(db, { sourceId: seed.sourceId, limit: 10, retryBackoffDays: BACKOFF_DAYS })).toEqual([]);
    });

    it('S-LR-12: tras el 3.er intento ambiguo la fila se descarta y el estado no cambia', async () => {
      const { listingId } = await makeListing();
      await enqueue(listingId, { attempts: 2 });

      const result = await applyPresenceVerdicts(db, { present: [], absent: [], ambiguous: [listingId] }, MAX_ATTEMPTS);

      expect(result).toMatchObject({ ambiguous: 1, dropped: 1 });
      expect(await queueRows()).toEqual([]);
      const [row] = await db
        .select({ status: listings.status, reason: listings.inactiveReason })
        .from(listings)
        .where(eq(listings.id, listingId));
      expect(row).toEqual({ status: 'active', reason: null });
    });

    it('un lote mixto aplica cada veredicto a su anuncio', async () => {
      const present = await makeListing();
      const absent = await makeListing();
      const ambiguous = await makeListing();
      await Promise.all([present, absent, ambiguous].map((item) => enqueue(item.listingId)));

      await applyPresenceVerdicts(
        db,
        { present: [present.listingId], absent: [absent.listingId], ambiguous: [ambiguous.listingId] },
        MAX_ATTEMPTS
      );

      const { rows } = await pool.query<{ id: string; status: string }>('select id, status from listings');
      const statusById = new Map(rows.map((row) => [row.id, row.status]));
      expect(statusById.get(present.listingId)).toBe('active');
      expect(statusById.get(absent.listingId)).toBe('inactive');
      expect(statusById.get(ambiguous.listingId)).toBe('active');
      expect(await queueRows()).toEqual([
        { listing_id: ambiguous.listingId, check_attempts: 1, zone_id: seed.zoneId },
      ]);
    });

    it('sin ids no hace nada y no falla', async () => {
      await expect(applyPresenceVerdicts(db, { present: [], absent: [], ambiguous: [] }, MAX_ATTEMPTS)).resolves.toEqual({
        present: 0,
        absent: 0,
        ambiguous: 0,
        dropped: 0,
      });
    });

    it('un ausente que ya no está activo no se vuelve a marcar (conserva inactive_since) pero sale de la cola', async () => {
      const { listingId } = await makeListing({ status: 'inactive' });
      await enqueue(listingId);
      await pool.query(`update listings set inactive_since = now() - interval '30 days' where id = $1`, [listingId]);

      const result = await applyPresenceVerdicts(db, { present: [], absent: [listingId], ambiguous: [] }, MAX_ATTEMPTS);

      expect(result.absent).toBe(0);
      expect(await queueRows()).toEqual([]);
      const { rows } = await pool.query<{ old: boolean }>(
        `select (inactive_since < now() - interval '29 days') as old from listings where id = $1`,
        [listingId]
      );
      expect(rows[0]?.old).toBe(true);
    });
  });
});
