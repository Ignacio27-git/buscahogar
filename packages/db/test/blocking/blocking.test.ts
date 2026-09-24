// ROADMAP 1.8 — suite de corrección del bloqueo de candidatos (diseño,
// Testing Strategy). Respaldada por PostgreSQL real (D-T1): `setup-require-db.ts`
// LANZA sin `DATABASE_URL`, nunca omite en silencio.
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db.js';
import { buildCandidatePairsQuery, corpusSummary, countCandidatePairs, findCandidatePairs } from '../../src/blocking.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { insertListingWithCurrentVersion, insertSource } from '../helpers/fixtures.js';

// Dos puntos de Madrid a ~80 m de distancia real, dentro de cualquier radio
// razonable de bloqueo (bien por debajo de 300 m).
const POINT_A = { x: -3.7038, y: 40.4168 };
const POINT_B = { x: -3.7038, y: 40.4176 };
// A ~190 m — sigue dentro de un radio de 300 m, fuera de uno de 100 m.
const POINT_FAR = { x: -3.7038, y: 40.4187 };

const THRESHOLDS = { radiusMeters: 300, priceBandCents: 2_500_000, surfaceToleranceM2: 10 };

describe('bloqueo de candidatos: findCandidatePairs / countCandidatePairs / corpusSummary', () => {
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

  describe('CBQ-2: sin auto-pares, cada par sin ordenar una única vez', () => {
    it('CBQ-2a: un único anuncio no produce ningún par (no se empareja consigo mismo)', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_A, priceCents: 100_000_00 });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(0);
    });

    it('CBQ-2b: un par especular (A,B)/(B,A) se emite exactamente una vez', async () => {
      const sourceId = await insertSource(db);
      const { listingId: listingIdA } = await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
      });
      const { listingId: listingIdB } = await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 101_000_00,
      });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
      const [pair] = pairs;
      const ids = [pair?.listingAId, pair?.listingBId].sort();
      expect(ids).toEqual([listingIdA, listingIdB].sort());
    });
  });

  describe('CBQ-3: radio geográfico uniforme, agnóstico a la ofuscación', () => {
    it('CBQ-3a: un par dentro del radio se emite, ofuscado o no', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        coordinatesObfuscated: true,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
        coordinatesObfuscated: false,
      });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
    });

    it('CBQ-3b: un par fuera del radio configurado se excluye', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_A, priceCents: 100_000_00 });
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_FAR, priceCents: 100_500_00 });

      const pairs = await findCandidatePairs(db, { ...THRESHOLDS, radiusMeters: 100 });
      expect(pairs).toHaveLength(0);
    });
  });

  describe('CBQ-4: solo participa la versión is_current', () => {
    it('CBQ-4a: el precio de una versión desmontada no afecta al bloqueo', async () => {
      const sourceId = await insertSource(db);
      const { listingId } = await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
      });
      // Versión histórica (no vigente) con un precio muy fuera de banda —
      // si el bloqueo la leyera por error, el par de abajo no se emitiría.
      await db.insert((await import('../../src/tables.js')).listingVersions).values({
        listingId,
        version: 0,
        isCurrent: false,
        priceCents: 900_000_00,
        surfaceM2: 40,
        operation: 'sale',
      });
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_B, priceCents: 100_500_00 });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
    });
  });

  describe('CBQ-5: una superficie NULL no descarta el par en silencio', () => {
    it('CBQ-5a: un par con un lado surface_m2 NULL se emite, con surfaceDeltaM2: null', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        surfaceM2: null,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
        surfaceM2: 80,
      });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.surfaceDeltaM2).toBeNull();
    });

    it('un par con surface_m2 presente en ambos lados, dentro del margen, expone el delta real', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        surfaceM2: 80,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
        surfaceM2: 85,
      });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.surfaceDeltaM2).toBe(5);
    });
  });

  describe('CBQ-6: un par ya agrupado en property_listings se sigue emitiendo', () => {
    it('CBQ-6a: agrupar dos anuncios en la misma vivienda no los excluye del bloqueo', async () => {
      const sourceId = await insertSource(db);
      const { listingId: listingIdA } = await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
      });
      const { listingId: listingIdB } = await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
      });

      const { properties, propertyListings } = await import('../../src/tables.js');
      const [property] = await db.insert(properties).values({}).returning({ id: properties.id });
      if (!property) {
        throw new Error('No se pudo insertar la vivienda canónica de prueba');
      }
      await db.insert(propertyListings).values([
        {
          propertyId: property.id,
          listingId: listingIdA,
          score: 0.9,
          strategyName: 'test',
          strategyVersion: '1',
          signals: {},
        },
        {
          propertyId: property.id,
          listingId: listingIdB,
          score: 0.9,
          strategyName: 'test',
          strategyVersion: '1',
          signals: {},
        },
      ]);

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
    });
  });

  describe('CBQ-7: un par del mismo source se sigue emitiendo', () => {
    it('CBQ-7a: dos anuncios de la misma fuente, dentro de los umbrales, se emiten', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_A, priceCents: 100_000_00 });
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_B, priceCents: 100_500_00 });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.sourceAId).toBe(sourceId);
      expect(pairs[0]?.sourceBId).toBe(sourceId);
    });
  });

  describe('CBQ-8: negativo difícil del mismo bloque — el bloqueo NO rechaza, 1.9 sí', () => {
    // A propósito invierte la instrucción de CLAUDE.md sobre "negativos
    // difíciles, mismo bloque": esa instrucción está escrita para el paso
    // 1.9 (la puntuación), no para 1.8. Un par que el bloqueo nunca emite no
    // puede recuperarse después — si esto rechazara, un duplicado real justo
    // fuera de la ventana se perdería sin recuperación (D-T3).
    it('CBQ-8a: dos anuncios ~15 m aparte, precio y superficie casi idénticos, se emiten', async () => {
      const sourceId = await insertSource(db);
      const sameBlockB = { x: POINT_A.x, y: POINT_A.y + 0.00013 }; // ~14-15 m
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 150_000_00,
        surfaceM2: 70,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: sameBlockB,
        priceCents: 151_000_00,
        surfaceM2: 71,
      });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
    });
  });

  describe('CBQ-9: la generación de candidatos es agnóstica a listings.status', () => {
    it('CBQ-9a: un anuncio inactive sigue formando pares con uno active', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        status: 'inactive',
      });
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_B, priceCents: 100_500_00 });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);
    });
  });

  describe('CBQ-1: countCandidatePairs y findCandidatePairs concuerdan (A1)', () => {
    it('CBQ-1a: countCandidatePairs().total === findCandidatePairs().length bajo los mismos umbrales', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_A, priceCents: 100_000_00 });
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_B, priceCents: 100_500_00 });
      await insertListingWithCurrentVersion(db, sourceId, { location: POINT_FAR, priceCents: 100_200_00 });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      const counts = await countCandidatePairs(db, THRESHOLDS);
      expect(counts.total).toBe(pairs.length);
    });
  });

  describe('CLI-3: desglose de countCandidatePairs por superficie ausente y ofuscación', () => {
    it('cuenta pairsWithMissingSurface y el desglose neither/one/both de coordinatesObfuscated', async () => {
      const sourceId = await insertSource(db);
      // Par 1: ambos sin ofuscar, ambos con superficie.
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        surfaceM2: 80,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
        surfaceM2: 82,
      });

      const counts = await countCandidatePairs(db, THRESHOLDS);
      expect(counts.total).toBe(1);
      expect(counts.withMissingSurface).toBe(0);
      expect(counts.neitherObfuscated).toBe(1);
      expect(counts.oneObfuscated).toBe(0);
      expect(counts.bothObfuscated).toBe(0);
    });

    it('un par con un lado ofuscado y superficie ausente se cuenta en oneObfuscated y withMissingSurface', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        surfaceM2: null,
        coordinatesObfuscated: true,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
        surfaceM2: 82,
        coordinatesObfuscated: false,
      });

      const counts = await countCandidatePairs(db, THRESHOLDS);
      expect(counts.total).toBe(1);
      expect(counts.withMissingSurface).toBe(1);
      expect(counts.oneObfuscated).toBe(1);
      expect(counts.neitherObfuscated).toBe(0);
      expect(counts.bothObfuscated).toBe(0);
    });

    // BT-2a a nivel de fila, no de agregado: los conteos de arriba pasarían
    // igual aunque `findCandidatePairs` emitiera los campos de diagnóstico
    // mal cableados, porque `countCandidatePairs` los calcula por su cuenta.
    it('un par devuelto expone surfaceDeltaM2 nulo y el lado ofuscado correcto', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        surfaceM2: null,
        coordinatesObfuscated: true,
      });
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_B,
        priceCents: 100_500_00,
        surfaceM2: 82,
        coordinatesObfuscated: false,
      });

      const pairs = await findCandidatePairs(db, THRESHOLDS);
      expect(pairs).toHaveLength(1);

      const pair = pairs[0];
      if (pair === undefined) throw new Error('se esperaba exactamente un par');

      // Superficie ausente en un lado: el par se rescata y el delta viaja
      // como null, no como 0 (D-Q3). Un 0 sería indistinguible de dos
      // viviendas con la misma superficie.
      expect(pair.surfaceDeltaM2).toBeNull();
      expect(pair.priceDeltaCents).toBe(500_00);
      expect(pair.distanceMeters).toBeGreaterThan(0);

      // El orden de `a`/`b` lo fija `lt(a.id, b.id)` sobre uuid, así que no
      // se puede saber de antemano qué lado es el ofuscado: se afirma que
      // exactamente uno lo está, que es la propiedad que importa.
      const obfuscatedSides = [pair.coordinatesObfuscatedA, pair.coordinatesObfuscatedB];
      expect(obfuscatedSides.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('CLI-3a: corpusSummary reporta la población de geometría, independiente de cualquier combinación', () => {
    it('cuenta listings, withGeometry, obfuscated, currentVersions y currentWithSurface', async () => {
      const sourceId = await insertSource(db);
      await insertListingWithCurrentVersion(db, sourceId, {
        location: POINT_A,
        priceCents: 100_000_00,
        surfaceM2: 80,
      });
      // Sin geometría — insertListing (no with-version) para simular un
      // anuncio sin location, contado aparte.
      const { listingId: noGeomId } = await insertListingWithCurrentVersion(db, sourceId, {
        priceCents: 90_000_00,
        surfaceM2: null,
      });
      expect(noGeomId).toBeDefined();

      const summary = await corpusSummary(db);
      expect(summary.listings).toBe(2);
      expect(summary.withGeometry).toBe(1);
      expect(summary.obfuscated).toBe(0);
      expect(summary.currentVersions).toBe(2);
      expect(summary.currentWithSurface).toBe(1);
    });
  });

  describe('CHK-PARTIAL-IDX (D-Q2): is_current se emite como columna booleana desnuda, sin parámetro ligado', () => {
    it('query.toSQL().sql contiene "is_current" sin un $n inmediatamente adyacente', () => {
      const query = buildCandidatePairsQuery(db, THRESHOLDS);
      const { sql: queryText } = query.toSQL();

      expect(queryText).toContain('is_current');

      // Pass criterion: ninguna ocurrencia de "is_current" tiene un "$" de
      // parámetro ligado inmediatamente después (con hasta 3 caracteres de
      // cierre de paréntesis/comilla entre medias) — si is_current fuera
      // `eq(v.isCurrent, true)`, el patrón sería "is_current" = $n.
      const occurrences = [...queryText.matchAll(/is_current/g)];
      expect(occurrences.length).toBeGreaterThan(0);
      for (const occurrence of occurrences) {
        const tail = queryText.slice(occurrence.index, occurrence.index + 30);
        expect(tail).not.toMatch(/is_current"?\s*=\s*\$\d/);
      }
    });
  });
});
