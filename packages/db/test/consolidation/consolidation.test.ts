// ROADMAP 1.10 (diseño D5, D6, D8) — RED primero: `writeConsolidation` no
// existe todavía. Respaldada por PostgreSQL real (D10, fail-loud).
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import type { SignalBreakdown } from '../../src/types.js';
import type { ConsolidationInput } from '../../src/consolidation.js';
import { writeConsolidation } from '../../src/consolidation.js';
import { listingVersions, listings, properties, propertyListings } from '../../src/tables.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { insertListingWithVersion, insertSourceWithKey, orderPair } from './helpers.js';
import { eq } from 'drizzle-orm';

const STRATEGY = { strategyName: 'rule-based-structured', strategyVersion: '1.0.0' };
const THRESHOLDS = { radiusMeters: 300, priceBandCents: 2_500_000, surfaceToleranceM2: 10 };

function baseInput(overrides: Partial<ConsolidationInput> = {}): ConsolidationInput {
  return {
    ...STRATEGY,
    ...THRESHOLDS,
    listingsConsidered: 0,
    pairs: [],
    groups: [],
    refusedComponentsCount: 0,
    ...overrides,
  };
}

const SIGNALS_A: SignalBreakdown = { exactAddress: { value: 1, weight: 0.7, detail: 'misma dirección' } };
const SIGNALS_B: SignalBreakdown = { priceProximity: { value: 0.4, weight: 0.3 } };

describe('writeConsolidation (D5, D6, D8)', () => {
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

  describe('EVID-1: toda la evidencia persiste, cualquiera que sea la banda', () => {
    it('EVID-1a/EVID-1b: accept, undecided y reject conservan puntuación, desglose completo y banda', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId: l1 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 100_000_00,
        propertyType: 'flat',
      });
      const { listingId: l2 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 100_500_00,
        propertyType: 'flat',
      });
      const { listingId: l3 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 300_000_00,
        propertyType: 'house',
      });
      const [acceptA, acceptB] = orderPair(l1, l2);
      const [rejectA, rejectB] = orderPair(l1, l3);

      const outcome = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 3,
          pairs: [
            { listingAId: acceptA, listingBId: acceptB, band: 'accept', score: 0.95, signals: SIGNALS_A },
            { listingAId: rejectA, listingBId: rejectB, band: 'reject', score: 0.1, signals: SIGNALS_B },
          ],
        })
      );

      // Consulta directa por SQL (no la API `db.select().from(...)`, ya
      // ejercida en otros tests de esta suite): confirma que la fila
      // llegó tal cual a la tabla real, no solo a través del tipado de
      // Drizzle.
      const { rows } = await pool.query<{
        band: string;
        score: string;
        signals: SignalBreakdown;
      }>('SELECT band, score, signals FROM dedup_pair_evidence WHERE run_id = $1 ORDER BY band', [
        outcome.runId,
      ]);

      expect(rows).toHaveLength(2);
      const accept = rows.find((row) => row.band === 'accept');
      const reject = rows.find((row) => row.band === 'reject');
      expect(accept?.signals).toEqual(SIGNALS_A);
      expect(Number(accept?.score)).toBeCloseTo(0.95);
      expect(reject?.signals).toEqual(SIGNALS_B);
      expect(Number(reject?.score)).toBeCloseTo(0.1);
    });
  });

  describe('D6/EVID-3/CONS-4/PROP-3: cada listing recibe exactamente una propiedad, singletons incluidos', () => {
    it('un grupo de dos + dos singletons undecided + dos singletons reject: seis property_listings, cinco properties', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      // Grupo real: L1-L2 aceptados.
      const { listingId: l1, versionId: v1 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 200_000_00,
        propertyType: 'flat',
        title: 'Piso ganador',
      });
      const { listingId: l2, versionId: v2 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 180_000_00,
        propertyType: 'flat',
      });
      // Solo undecided entre sí, sin relación con nada más.
      const { listingId: l3 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 90_000_00,
        propertyType: 'studio',
      });
      const { listingId: l4 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 95_000_00,
        propertyType: 'studio',
      });
      // Solo reject entre sí, sin relación con nada más.
      const { listingId: l5 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 400_000_00,
        propertyType: 'house',
      });
      const { listingId: l6 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 410_000_00,
        propertyType: 'house',
      });

      const [acceptA, acceptB] = orderPair(l1, l2);
      const [undecidedA, undecidedB] = orderPair(l3, l4);
      const [rejectA, rejectB] = orderPair(l5, l6);

      const outcome = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 6,
          pairs: [
            {
              listingAId: acceptA,
              listingBId: acceptB,
              band: 'accept',
              score: 0.92,
              signals: SIGNALS_A,
              scoredListingVersionIdA: acceptA === l1 ? v1 : v2,
              scoredListingVersionIdB: acceptA === l1 ? v2 : v1,
            },
            { listingAId: undecidedA, listingBId: undecidedB, band: 'undecided', score: 0.5, signals: SIGNALS_B },
            { listingAId: rejectA, listingBId: rejectB, band: 'reject', score: 0.05, signals: SIGNALS_B },
          ],
          groups: [
            { listingIds: [acceptA, acceptB], winnerId: l1 },
            { listingIds: [l3], winnerId: l3 },
            { listingIds: [l4], winnerId: l4 },
            { listingIds: [l5], winnerId: l5 },
            { listingIds: [l6], winnerId: l6 },
          ],
        })
      );

      expect(outcome.propertiesCreated).toBe(5);

      const allPropertyListings = await db.select().from(propertyListings);
      expect(allPropertyListings).toHaveLength(6); // EVID-2a/EVID-3: uno por listing, sin excepción

      const allProperties = await db.select().from(properties);
      expect(allProperties).toHaveLength(5);

      // PROP-3a: el grupo de dos.
      const groupProperty = allProperties.find((property) => property.listingCount === 2);
      expect(groupProperty).toBeDefined();
      expect(groupProperty?.title).toBe('Piso ganador'); // CONS-1: atributo del ganador

      // PROP-3b: cada singleton, listingCount=1 y consolidatedAt fijado.
      const singletons = allProperties.filter((property) => property.listingCount === 1);
      expect(singletons).toHaveLength(4);
      for (const singleton of singletons) {
        expect(singleton.consolidatedAt).not.toBeNull();
      }

      // EVID-3a/EVID-3b: los cuatro singletons llevan el marcador selfGroup,
      // consultable vía el operador `?` del índice GIN (D6).
      const { rows: selfGroupRows } = await pool.query<{ count: string }>(
        "SELECT count(*) FROM property_listings WHERE signals ? 'selfGroup'"
      );
      expect(Number(selfGroupRows[0]?.count)).toBe(4);

      const selfGroupScores = allPropertyListings.filter((row) =>
        [l3, l4, l5, l6].includes(row.listingId)
      );
      expect(selfGroupScores).toHaveLength(4);
      for (const row of selfGroupScores) {
        expect(row.score).toBe(1);
      }

      // CONS-4: los dos miembros del grupo real siguen enlazados
      // individualmente al MISMO property.
      const l1Link = allPropertyListings.find((row) => row.listingId === l1);
      const l2Link = allPropertyListings.find((row) => row.listingId === l2);
      expect(l1Link?.propertyId).toBe(l2Link?.propertyId);
      expect(l1Link?.propertyId).toBe(groupProperty?.id);
    });
  });

  describe('PROP-1/PROP-2: la caché se rellena del ganador, salvo el precio', () => {
    it('PROP-1b: una vivienda insertada directamente (sin reprocesar) no tiene atributos consolidados', async () => {
      const [property] = await db.insert(properties).values({}).returning();
      expect(property?.propertyType).toBeNull();
      expect(property?.operation).toBeNull();
      expect(property?.title).toBeNull();
      expect(property?.listingCount).toBe(0);
      expect(property?.consolidatedAt).toBeNull();
    });

    it('PROP-1a/PROP-2a/CONS-1a: el precio es el mínimo del grupo, el resto de atributos son del ganador (no el más barato)', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId: winnerId, versionId: winnerVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 300_000_00, // el ganador NO es el más barato (PROP-2a)
        propertyType: 'flat',
        address: 'Calle del Ganador 1',
        title: 'Título del ganador',
        bathrooms: 2,
        floor: '4',
      });
      const { listingId: cheapestId, versionId: cheapestVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 200_000_00, // el más barato del grupo
        propertyType: 'flat',
        address: 'Calle del Barato 2',
        title: 'Título del barato',
        bathrooms: 1,
        floor: '1',
      });
      const { listingId: middleId, versionId: middleVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 250_000_00,
        propertyType: 'flat',
        address: 'Calle intermedia 3',
      });

      const listingIds = [winnerId, cheapestId, middleId].sort();
      const pairFor = (
        x: string,
        y: string,
        versionForA: string,
        versionForB: string
      ): ConsolidationInput['pairs'][number] => {
        const [a, b] = orderPair(x, y);
        return {
          listingAId: a,
          listingBId: b,
          band: 'accept' as const,
          score: 0.9,
          signals: SIGNALS_A,
          scoredListingVersionIdA: a === x ? versionForA : versionForB,
          scoredListingVersionIdB: a === x ? versionForB : versionForA,
        };
      };

      const outcome = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 3,
          pairs: [
            pairFor(winnerId, cheapestId, winnerVersionId, cheapestVersionId),
            pairFor(winnerId, middleId, winnerVersionId, middleVersionId),
            pairFor(cheapestId, middleId, cheapestVersionId, middleVersionId),
          ],
          groups: [{ listingIds, winnerId }],
        })
      );

      expect(outcome.propertiesCreated).toBe(1);
      const [property] = await db.select().from(properties);
      expect(property?.minPriceCents).toBe(200_000_00); // el más barato, no el del ganador
      expect(property?.address).toBe('Calle del Ganador 1'); // del ganador
      expect(property?.title).toBe('Título del ganador');
      expect(property?.bathrooms).toBe(2);
      expect(property?.floor).toBe('4');
      expect(property?.listingCount).toBe(3);
    });
  });

  // ROADMAP 2.5 (S2, decisión 109; S-PS-8): la caché de visibilidad se
  // reconstruye junto con la vivienda. La agrupación sigue siendo ajena al
  // estado (decisión 068): el anuncio inactivo SÍ es miembro del grupo.
  describe('S-PS-8: active_listing_count y precio solo de los anuncios activos', () => {
    it('un grupo con un anuncio inactivo más barato: precio del activo, un activo, ambos miembros enlazados', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId: activeId, versionId: activeVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 300_000_00,
        propertyType: 'flat',
      });
      const { listingId: inactiveId, versionId: inactiveVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 200_000_00,
        propertyType: 'flat',
      });
      await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(), inactiveReason: 'delisted' })
        .where(eq(listings.id, inactiveId));
      const [a, b] = orderPair(activeId, inactiveId);

      await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 2,
          pairs: [
            {
              listingAId: a,
              listingBId: b,
              band: 'accept',
              score: 0.9,
              signals: SIGNALS_A,
              scoredListingVersionIdA: a === activeId ? activeVersionId : inactiveVersionId,
              scoredListingVersionIdB: a === activeId ? inactiveVersionId : activeVersionId,
            },
          ],
          groups: [{ listingIds: [activeId, inactiveId].sort(), winnerId: activeId }],
        })
      );

      const [property] = await db.select().from(properties);
      expect(property?.listingCount).toBe(2);
      expect(property?.activeListingCount).toBe(1);
      expect(property?.minPriceCents).toBe(300_000_00);
      expect(await db.select().from(propertyListings)).toHaveLength(2);
    });

    it('todos los anuncios activos: active_listing_count = listing_count y precio mínimo del grupo', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId: idA, versionId: versionA } = await insertListingWithVersion(db, sourceId, {
        priceCents: 300_000_00,
        propertyType: 'flat',
      });
      const { listingId: idB, versionId: versionB } = await insertListingWithVersion(db, sourceId, {
        priceCents: 200_000_00,
        propertyType: 'flat',
      });
      const [a, b] = orderPair(idA, idB);

      await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 2,
          pairs: [
            {
              listingAId: a,
              listingBId: b,
              band: 'accept',
              score: 0.9,
              signals: SIGNALS_A,
              scoredListingVersionIdA: a === idA ? versionA : versionB,
              scoredListingVersionIdB: a === idA ? versionB : versionA,
            },
          ],
          groups: [{ listingIds: [idA, idB].sort(), winnerId: idA }],
        })
      );

      const [property] = await db.select().from(properties);
      expect(property?.activeListingCount).toBe(2);
      expect(property?.minPriceCents).toBe(200_000_00);
    });

    it('un singleton inactivo: active_listing_count 0 y precio de su versión vigente (visible solo en el detalle)', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 180_000_00,
        propertyType: 'flat',
      });
      await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(), inactiveReason: 'zone_purged' })
        .where(eq(listings.id, listingId));

      await writeConsolidation(
        db,
        baseInput({ listingsConsidered: 1, groups: [{ listingIds: [listingId], winnerId: listingId }] })
      );

      const [property] = await db.select().from(properties);
      expect(property?.activeListingCount).toBe(0);
      expect(property?.minPriceCents).toBe(180_000_00);
      expect(property?.listingCount).toBe(1);
    });

    it('reejecutar la consolidación tras reactivar el anuncio recalcula la visibilidad', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 180_000_00,
        propertyType: 'flat',
      });
      await db
        .update(listings)
        .set({ status: 'inactive', inactiveSince: new Date(), inactiveReason: 'delisted' })
        .where(eq(listings.id, listingId));
      const input = baseInput({ listingsConsidered: 1, groups: [{ listingIds: [listingId], winnerId: listingId }] });
      await writeConsolidation(db, input);

      await db
        .update(listings)
        .set({ status: 'active', inactiveSince: null, inactiveReason: null })
        .where(eq(listings.id, listingId));
      await writeConsolidation(db, input);

      const [property] = await db.select().from(properties);
      expect(property?.activeListingCount).toBe(1);
    });
  });

  describe('D8: transacción atómica', () => {
    it('un fallo a mitad de la transacción deja properties/property_listings exactamente como estaban antes', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 150_000_00,
        propertyType: 'flat',
      });

      const successfulOutcome = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 1,
          groups: [{ listingIds: [listingId], winnerId: listingId }],
        })
      );

      const propertiesBefore = await db.select().from(properties);
      const linksBefore = await db.select().from(propertyListings);
      expect(propertiesBefore).toHaveLength(1);

      // Grupo con un winnerId inexistente: `fetchWinnerAttributes` lanza a
      // mitad de la transacción, después de ya haber insertado dedup_runs
      // y dedup_pair_evidence dentro de ELLA MISMA — la prueba real de D8
      // es que ese trabajo se revierte también, no solo el de properties.
      await expect(
        writeConsolidation(
          db,
          baseInput({
            listingsConsidered: 1,
            groups: [{ listingIds: ['00000000-0000-0000-0000-000000000000'], winnerId: '00000000-0000-0000-0000-000000000000' }],
          })
        )
      ).rejects.toThrow();

      const propertiesAfter = await db.select().from(properties);
      const linksAfter = await db.select().from(propertyListings);
      expect(propertiesAfter).toEqual(propertiesBefore);
      expect(linksAfter).toEqual(linksBefore);

      const { rows: runCountRows } = await pool.query<{ count: string }>('SELECT count(*) FROM dedup_runs');
      expect(Number(runCountRows[0]?.count)).toBe(1); // el run fallido NO dejó cabecera

      // REPRO-3a: una corrida posterior exitosa asigna un id nuevo.
      const secondOutcome = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 1,
          groups: [{ listingIds: [listingId], winnerId: listingId }],
        })
      );
      const [propertyAfterSecondRun] = await db.select().from(properties);
      const [propertyAfterFirstRun] = propertiesBefore;
      expect(propertyAfterSecondRun?.id).not.toBe(propertyAfterFirstRun?.id);
      expect(secondOutcome.runId).not.toBe(successfulOutcome.runId);
    });
  });

  describe('N1/D1: el ledger sobrevive a la corrida siguiente sin bloquearla', () => {
    it('un reject de la corrida 1 no bloquea un accept en la corrida 2 sobre el mismo par, y la evidencia de la corrida 1 sigue intacta', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId: l1 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 100_000_00,
        propertyType: 'flat',
      });
      const { listingId: l2 } = await insertListingWithVersion(db, sourceId, {
        priceCents: 105_000_00,
        propertyType: 'flat',
      });
      const [a, b] = orderPair(l1, l2);

      const run1 = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 2,
          pairs: [{ listingAId: a, listingBId: b, band: 'reject', score: 0.2, signals: SIGNALS_B }],
          groups: [
            { listingIds: [l1], winnerId: l1 },
            { listingIds: [l2], winnerId: l2 },
          ],
        })
      );

      const run2 = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 2,
          pairs: [{ listingAId: a, listingBId: b, band: 'accept', score: 0.9, signals: SIGNALS_A }],
          groups: [{ listingIds: [a, b], winnerId: l1 }],
        })
      );

      expect(run2.propertiesCreated).toBe(1); // la corrida 2 SÍ pudo fusionarlos

      const { rows: run1EvidenceRows } = await pool.query<{ band: string }>(
        'SELECT band FROM dedup_pair_evidence WHERE run_id = $1',
        [run1.runId]
      );
      expect(run1EvidenceRows).toHaveLength(1);
      expect(run1EvidenceRows[0]?.band).toBe('reject'); // intacta, no reescrita ni borrada

      const { rows: totalEvidenceRows } = await pool.query<{ count: string }>(
        'SELECT count(*) FROM dedup_pair_evidence'
      );
      expect(Number(totalEvidenceRows[0]?.count)).toBe(2); // ambas corridas conviven
    });
  });

  describe('REPRO-4: listings/listing_versions nunca se tocan', () => {
    it('el recuento y el contenido de listings/listing_versions no cambian tras escribir la consolidación', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const { listingId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 175_000_00,
        propertyType: 'flat',
        title: 'No debe cambiar',
      });

      const listingsBefore = await db.select().from(listings);
      const versionsBefore = await db.select().from(listingVersions);

      await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 1,
          groups: [{ listingIds: [listingId], winnerId: listingId }],
        })
      );

      const listingsAfter = await db.select().from(listings);
      const versionsAfter = await db.select().from(listingVersions);

      expect(listingsAfter).toEqual(listingsBefore);
      expect(versionsAfter).toEqual(versionsBefore);
    });
  });

  // Hueco detectado por `sdd-verify` (obs #182, hallazgo CRÍTICO 3): el
  // escenario «Consolidated Thumbnail Selection» de la especificación no tenía
  // ningún test, pese a que `consolidation.ts` se modificó justo para proyectar
  // esa columna. El ganador NO es el más barato a propósito: si la
  // consolidación tomara el thumbnail del anuncio del precio mínimo —el mismo
  // del que sí toma `minPriceCents`— este test fallaría.
  describe('PROP-4: el thumbnail consolidado es el del ganador, no el del más barato', () => {
    it('PROP-4a: `properties.thumbnailUrl` sale del anuncio ganador aunque otro del grupo sea más barato', async () => {
      const sourceId = await insertSourceWithKey(db, 'idealista');
      const winnerThumbnail = 'https://img4.idealista.com/blur/ganador.webp';
      const cheapestThumbnail = 'https://img4.idealista.com/blur/barato.webp';

      const { listingId: winnerId, versionId: winnerVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 300_000_00, // el ganador NO es el más barato
        propertyType: 'flat',
        address: 'Calle del Ganador 1',
      });
      const { listingId: cheapestId, versionId: cheapestVersionId } = await insertListingWithVersion(db, sourceId, {
        priceCents: 200_000_00,
        propertyType: 'flat',
        address: 'Calle del Barato 2',
      });

      // `thumbnailUrl` es columna de identidad de `listings` (decisión 059), no
      // de `listing_versions`, así que se fija aquí y no en la versión.
      await db.update(listings).set({ thumbnailUrl: winnerThumbnail }).where(eq(listings.id, winnerId));
      await db.update(listings).set({ thumbnailUrl: cheapestThumbnail }).where(eq(listings.id, cheapestId));

      const [a, b] = orderPair(winnerId, cheapestId);
      const outcome = await writeConsolidation(
        db,
        baseInput({
          listingsConsidered: 2,
          pairs: [
            {
              listingAId: a,
              listingBId: b,
              band: 'accept' as const,
              score: 0.9,
              signals: SIGNALS_A,
              scoredListingVersionIdA: a === winnerId ? winnerVersionId : cheapestVersionId,
              scoredListingVersionIdB: a === winnerId ? cheapestVersionId : winnerVersionId,
            },
          ],
          groups: [{ listingIds: [winnerId, cheapestId].sort(), winnerId }],
        })
      );

      expect(outcome.propertiesCreated).toBe(1);
      const [property] = await db.select().from(properties);
      expect(property?.thumbnailUrl).toBe(winnerThumbnail);
      // Control: el precio sí es el mínimo del grupo, así que el ganador y el
      // origen del precio son anuncios distintos y la aserción de arriba no
      // puede cumplirse por casualidad.
      expect(property?.minPriceCents).toBe(200_000_00);
    });
  });
});
