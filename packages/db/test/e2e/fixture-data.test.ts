// Paso D.1a (spec e2e-test-database R3/R4, S3.1, S4.1-S4.6; diseño «Seed») — la
// FORMA del dataset e2e se prueba sobre datos puros, sin base de datos: la
// idempotencia y el volcado idéntico (S3.1/S3.2) se comprueban además en
// Docker, pero aquí queda fijado el contrato que lo hace posible (todo es
// constante) y las invariantes de forma que las specs visuales dan por hechas.
import { describe, expect, it } from 'vitest';

import { buildE2eFixture } from '../../src/e2e/fixture-data.js';
import {
  E2E_COVERAGE_ZONES,
  E2E_DETAIL_LISTING_ID,
  E2E_GALLERY_LISTING_ID,
  E2E_GETAFE,
  E2E_LISTING_IDS,
  E2E_MISSING_LISTING_ID,
  E2E_PROPERTY_IDS,
  E2E_REMOVED_ONLY_LISTING_ID,
  E2E_SOURCE_IDS,
} from '../../src/e2e/fixture-ids.js';

const fixture = buildE2eFixture();
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function listingsOf(propertyId: string): typeof fixture.listings {
  const listingIds = new Set(
    fixture.propertyListings
      .filter((row) => row.propertyId === propertyId)
      .map((row) => row.listingId)
  );
  return fixture.listings.filter((listing) => listingIds.has(listing.id ?? ''));
}

describe('buildE2eFixture — determinismo (R3)', () => {
  it('S3.1 dos construcciones producen exactamente los mismos datos', () => {
    expect(JSON.stringify(buildE2eFixture())).toBe(JSON.stringify(fixture));
  });

  it('todos los identificadores son UUID v4 válidos y no se repiten', () => {
    const ids = [
      ...fixture.sources.map((row) => row.id),
      ...fixture.locations.map((row) => row.id),
      ...fixture.zones.map((row) => row.id),
      ...fixture.properties.map((row) => row.id),
      ...fixture.listings.map((row) => row.id),
      ...fixture.versions.map((row) => row.id),
      ...fixture.propertyListings.map((row) => row.id),
      ...fixture.coverageJobs.map((row) => row.id),
    ];
    expect(ids).toHaveLength(2 + 7 + 7 + 7 + 11 + 14 + 11 + 4);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
    }
  });

  it('ningún anuncio ni vivienda depende de now(): todas las marcas de tiempo vienen fijadas', () => {
    for (const listing of fixture.listings) {
      expect(listing.firstSeenAt).toBeInstanceOf(Date);
      expect(listing.lastSeenAt).toBeInstanceOf(Date);
      expect(listing.createdAt).toBeInstanceOf(Date);
      expect(listing.updatedAt).toBeInstanceOf(Date);
    }
    for (const property of fixture.properties) {
      expect(property.createdAt).toBeInstanceOf(Date);
      expect(property.updatedAt).toBeInstanceOf(Date);
      expect(property.consolidatedAt).toBeInstanceOf(Date);
    }
    // Triangulación: el `updated_at` de las viviendas es distinto en cada una (orden de búsqueda estable).
    const updated = fixture.properties.map((row) => row.updatedAt?.toISOString());
    expect(new Set(updated).size).toBe(fixture.properties.length);
  });
});

describe('buildE2eFixture — forma del dataset (R4)', () => {
  it('S4.1 hay al menos dos fuentes y P1 tiene dos anuncios activos de fuentes distintas', () => {
    expect(fixture.sources.length).toBeGreaterThanOrEqual(2);
    const p1 = listingsOf(E2E_PROPERTY_IDS.p1).filter((listing) => listing.status === 'active');
    expect(p1).toHaveLength(2);
    expect(new Set(p1.map((listing) => listing.sourceId)).size).toBe(2);
  });

  it('S4.2 P2 tiene un anuncio activo y uno retirado; P3 solo retirados', () => {
    const p2 = listingsOf(E2E_PROPERTY_IDS.p2).map((listing) => listing.status);
    expect(p2.sort()).toEqual(['active', 'removed']);
    const p3 = listingsOf(E2E_PROPERTY_IDS.p3);
    expect(p3.length).toBeGreaterThanOrEqual(1);
    expect(p3.every((listing) => listing.status === 'removed')).toBe(true);
  });

  it('S4.2 los anuncios retirados llevan la marca de tombstone con descripción y raw redactados', () => {
    const removed = fixture.listings.filter((listing) => listing.status === 'removed');
    expect(removed.length).toBeGreaterThanOrEqual(3);
    for (const listing of removed) {
      expect(listing.inactiveReason).toBe('delisted');
      expect(listing.tombstonedAt).toBeInstanceOf(Date);
      const version = fixture.versions.find((row) => row.listingId === listing.id);
      expect(version?.description).toBeNull();
      expect(version?.raw).toBeNull();
    }
  });

  it('S4.4 existen Getafe (28065) y su zona cubierta, con centroide y nombre plegado', () => {
    const getafe = fixture.locations.find((row) => row.id === E2E_GETAFE.locationId);
    const zone = fixture.zones.find((row) => row.id === E2E_GETAFE.zoneId);
    expect(getafe?.ineCode).toBe(E2E_GETAFE.ineCode);
    expect(getafe?.searchName).toBe('getafe');
    expect(getafe?.centroid).toMatch(/^POINT\(-3\.\d+ 40\.\d+\)$/);
    expect(zone?.locationId).toBe(getafe?.id);
    expect(zone?.state).toBe('covered');
  });

  it('S4.5 al menos 3 viviendas tienen coordenadas y exactamente una vivienda activa no', () => {
    expect(fixture.properties.filter((row) => row.location != null).length).toBeGreaterThanOrEqual(
      3
    );
    const activeWithoutLocation = fixture.properties.filter(
      (row) => (row.activeListingCount ?? 0) > 0 && row.location == null
    );
    expect(activeWithoutLocation.map((row) => row.id)).toEqual([E2E_PROPERTY_IDS.p6]);
  });

  it('S4.6 solo P7 tiene miniaturas, y son rutas de nuestro origen (decisión 175)', () => {
    const withThumbnail = fixture.listings.filter((row) => row.thumbnailUrl != null);
    expect(withThumbnail.map((row) => row.id).sort()).toEqual(
      [E2E_LISTING_IDS.p7Idealista, E2E_LISTING_IDS.p7Kyero].sort()
    );
    const properties = fixture.properties.filter((row) => row.thumbnailUrl != null);
    expect(properties.map((row) => row.id)).toEqual([E2E_PROPERTY_IDS.p7]);
    for (const url of [...withThumbnail, ...properties].map((row) => row.thumbnailUrl ?? '')) {
      // Ruta absoluta del mismo origen: ni esquema, ni host, ni `//host`.
      expect(url).toMatch(/^\/e2e-fixtures\/[a-z0-9-]+\.png$/);
    }
  });

  it('P7 solo tiene anuncios inactivos SIN redactar, con fotos y datos sin consolidar', () => {
    const p7 = listingsOf(E2E_PROPERTY_IDS.p7);
    expect(p7).toHaveLength(2);
    for (const listing of p7) {
      expect(listing.status).toBe('inactive');
      expect(listing.inactiveReason).toBe('delisted');
      // Decisión 107: sin tombstone, la descripción, `raw` y la miniatura siguen ahí.
      expect(listing.tombstonedAt).toBeNull();
      expect(listing.thumbnailUrl).not.toBeNull();
      const version = fixture.versions.find((row) => row.listingId === listing.id);
      expect(version?.description).not.toBeNull();
      expect(version?.raw).not.toBeNull();
    }
    const property = fixture.properties.find((row) => row.id === E2E_PROPERTY_IDS.p7);
    // Decisión 109: sin activos no aparece en la búsqueda (ni en el mapa).
    expect(property?.activeListingCount).toBe(0);
    expect(property?.description).not.toBeNull();
    expect(property?.bathrooms).toBeNull();
    expect(property?.floor).toBeNull();
    // Triangulación: el resto de datos clave sí está consolidado.
    expect(property?.surfaceM2).not.toBeNull();
    expect(property?.rooms).not.toBeNull();
  });

  it('P7 es la única vivienda con anuncios inactivos y sus inactivos son recientes', () => {
    const inactive = fixture.listings.filter((listing) => listing.status === 'inactive');
    expect(new Set(listingsOf(E2E_PROPERTY_IDS.p7).map((row) => row.id))).toEqual(
      new Set(inactive.map((row) => row.id))
    );
    const dayMs = 24 * 60 * 60 * 1000;
    for (const listing of inactive) {
      const since = listing.inactiveSince?.getTime() ?? Number.NaN;
      // Por debajo de los 180 días del tombstone (decisión 107).
      expect(Date.parse('2026-09-15T10:00:00Z') - since).toBeLessThan(180 * dayMs);
    }
  });

  it('las URL de los anuncios apuntan al dominio reservado .invalid, nunca a un portal real', () => {
    expect(fixture.listings.length).toBeGreaterThan(0);
    for (const listing of fixture.listings) {
      expect(new URL(listing.url).hostname).toBe('e2e.invalid');
    }
  });
});

describe('buildE2eFixture — coherencia de la caché de visibilidad (decisión 109)', () => {
  it('active_listing_count, listing_count y min_price_cents coinciden con sus anuncios', () => {
    for (const property of fixture.properties) {
      const members = listingsOf(property.id ?? '');
      // D.10: un anuncio puede tener varias versiones; el precio vigente es el de la actual.
      const priceOf = (listingId: string | undefined): number =>
        fixture.versions.find((row) => row.listingId === listingId && row.isCurrent === true)
          ?.priceCents ?? Number.NaN;
      const active = members.filter((listing) => listing.status === 'active');
      const pool = active.length > 0 ? active : members;
      expect(property.listingCount).toBe(members.length);
      expect(property.activeListingCount).toBe(active.length);
      expect(property.minPriceCents).toBe(Math.min(...pool.map((listing) => priceOf(listing.id))));
    }
    // Triangulación: P3 (sin activos) muestra el mínimo de todos y no aparece en la búsqueda.
    const p3 = fixture.properties.find((row) => row.id === E2E_PROPERTY_IDS.p3);
    expect(p3?.activeListingCount).toBe(0);
    expect(p3?.minPriceCents).toBeGreaterThan(0);
  });

  it('cada anuncio tiene exactamente una versión vigente, que es la puntuada, y una única fila de deduplicación con su desglose', () => {
    for (const listing of fixture.listings) {
      const versions = fixture.versions.filter((row) => row.listingId === listing.id);
      const current = versions.filter((row) => row.isCurrent === true);
      expect(current).toHaveLength(1);
      const links = fixture.propertyListings.filter((row) => row.listingId === listing.id);
      expect(links).toHaveLength(1);
      expect(links[0]?.scoredListingVersionId).toBe(current[0]?.id);
      expect(Object.keys(links[0]?.signals ?? {}).length).toBeGreaterThan(0);
    }
  });
});

// D.10 (decisión 178): P1 es la única vivienda con histórico de precios.
describe('buildE2eFixture — histórico de precios de P1 (D.10)', () => {
  const versionsOf = (listingId: string): typeof fixture.versions =>
    fixture.versions
      .filter((row) => row.listingId === listingId)
      .sort((a, b) => a.version - b.version);

  it('P1 tiene tres versiones en Idealista y dos en Kyero; el resto, una', () => {
    expect(versionsOf(E2E_LISTING_IDS.p1Idealista)).toHaveLength(3);
    expect(versionsOf(E2E_LISTING_IDS.p1Kyero)).toHaveLength(2);
    const p1 = new Set([E2E_LISTING_IDS.p1Idealista, E2E_LISTING_IDS.p1Kyero]);
    for (const listing of fixture.listings.filter((row) => !p1.has(row.id ?? ''))) {
      expect(versionsOf(listing.id ?? '')).toHaveLength(1);
    }
  });

  it('hay un par consecutivo de igual precio (para ejercitar el colapso)', () => {
    const prices = versionsOf(E2E_LISTING_IDS.p1Idealista).map((row) => row.priceCents);
    expect(prices.some((price, index) => index > 0 && price === prices[index - 1])).toBe(true);
  });

  it('versiones crecientes en número y en fecha, con días UTC distintos; la vigente es la última', () => {
    for (const listingId of [E2E_LISTING_IDS.p1Idealista, E2E_LISTING_IDS.p1Kyero]) {
      const versions = versionsOf(listingId);
      const days = versions.map((row) => row.capturedAt?.toISOString().slice(0, 10));
      expect(new Set(days).size).toBe(versions.length);
      versions.forEach((row, index) => {
        if (index > 0) {
          expect(row.capturedAt?.getTime()).toBeGreaterThan(
            versions[index - 1]?.capturedAt?.getTime() ?? 0
          );
          expect(row.version).toBeGreaterThan(versions[index - 1]?.version ?? 0);
        }
        expect(row.isCurrent).toBe(index === versions.length - 1);
        expect(row.description).not.toBeNull();
        expect(row.raw).not.toBeNull();
      });
    }
  });

  // D.18 (decisión 218): la semilla no puede contradecirse. La primera captura es el
  // `firstSeenAt` del anuncio y ninguna captura es posterior a su `lastSeenAt`.
  it('coherencia temporal: firstSeenAt = primera captura ≤ última captura ≤ lastSeenAt', () => {
    for (const listing of fixture.listings) {
      const captures = versionsOf(listing.id ?? '').map((row) => row.capturedAt?.getTime() ?? NaN);
      const first = Math.min(...captures);
      const last = Math.max(...captures);
      expect(listing.firstSeenAt?.getTime(), `firstSeenAt de ${listing.id ?? '?'}`).toBe(first);
      expect(first).toBeLessThanOrEqual(last);
      expect(last, `última captura de ${listing.id ?? '?'}`).toBeLessThanOrEqual(
        listing.lastSeenAt?.getTime() ?? NaN
      );
    }
  });

  it('la versión vigente de un anuncio no activo se captura en su propio lastSeenAt', () => {
    for (const listing of fixture.listings.filter((row) => row.status !== 'active')) {
      const current = versionsOf(listing.id ?? '').find((row) => row.isCurrent);
      expect(current?.capturedAt?.getTime()).toBe(listing.lastSeenAt?.getTime());
    }
  });

  it('el mínimo de P1 sigue saliendo de las versiones vigentes (85000)', () => {
    const p1 = fixture.properties.find((row) => row.id === E2E_PROPERTY_IDS.p1);
    expect(p1?.minPriceCents).toBe(85000);
  });
});

describe('IDs publicados para las specs', () => {
  it('el detalle de D.1b resuelve a un anuncio sembrado; el inexistente no está en el dataset', () => {
    const ids = fixture.listings.map((listing) => listing.id);
    expect(ids).toContain(E2E_DETAIL_LISTING_ID);
    expect(ids).toContain(E2E_REMOVED_ONLY_LISTING_ID);
    expect(ids).toContain(E2E_GALLERY_LISTING_ID);
    expect(ids).not.toContain(E2E_MISSING_LISTING_ID);
    expect(E2E_MISSING_LISTING_ID).toMatch(UUID_V4);
    expect(Object.values(E2E_LISTING_IDS)).toHaveLength(fixture.listings.length);
  });
});

// D.13 (decisión 181): una zona por estado de aviso de cobertura. Las zonas nuevas no tienen
// viviendas; solo importan su estado, su centroide y su job.
describe('buildE2eFixture — zonas de los avisos de cobertura (D.13)', () => {
  type ZoneKey = keyof typeof E2E_COVERAGE_ZONES;
  const zoneOf = (key: ZoneKey): (typeof fixture.zones)[number] | undefined =>
    fixture.zones.find((row) => row.id === E2E_COVERAGE_ZONES[key].zoneId);
  const locationOf = (key: ZoneKey): (typeof fixture.locations)[number] | undefined =>
    fixture.locations.find((row) => row.id === E2E_COVERAGE_ZONES[key].locationId);
  const jobOf = (zoneId: string): (typeof fixture.coverageJobs)[number] | undefined =>
    fixture.coverageJobs.find((row) => row.zoneId === zoneId);

  it('hay seis zonas de aviso con código INE propio y una zona por localidad', () => {
    const keys = Object.keys(E2E_COVERAGE_ZONES) as ZoneKey[];
    expect(keys).toHaveLength(6);
    expect(fixture.locations).toHaveLength(7);
    expect(fixture.zones).toHaveLength(7);
    expect(new Set(fixture.locations.map((row) => row.ineCode)).size).toBe(7);
    for (const key of keys) {
      expect(locationOf(key)?.ineCode).toBe(E2E_COVERAGE_ZONES[key].ineCode);
      expect(zoneOf(key)?.locationId).toBe(E2E_COVERAGE_ZONES[key].locationId);
    }
  });

  it('cada estado de job tiene su zona: pending, running, done y failed, todos de Idealista', () => {
    expect(fixture.coverageJobs).toHaveLength(4);
    for (const key of ['pending', 'running', 'done', 'failed'] as const) {
      const job = jobOf(E2E_COVERAGE_ZONES[key].zoneId);
      expect(job?.status).toBe(key);
      expect(job?.id).toBe(E2E_COVERAGE_ZONES[key].jobId);
      expect(job?.sourceId).toBe(E2E_SOURCE_IDS.idealista);
    }
  });

  it('el job en curso, el terminado y el fallido llevan startedAt; el pendiente no', () => {
    expect(jobOf(E2E_COVERAGE_ZONES.pending.zoneId)?.startedAt).toBeNull();
    for (const key of ['running', 'done', 'failed'] as const) {
      expect(jobOf(E2E_COVERAGE_ZONES[key].zoneId)?.startedAt).toBeInstanceOf(Date);
    }
    // Triangulación: el fallido lleva un error interno que la página nunca debe enseñar.
    expect(jobOf(E2E_COVERAGE_ZONES.failed.zoneId)?.error).not.toBeNull();
    expect(jobOf(E2E_COVERAGE_ZONES.done.zoneId)?.error).toBeNull();
  });

  it('estados de zona: Leganés sin cubrir, Fuenlabrada cubriendo, Móstoles obsoleta', () => {
    expect(zoneOf('pending')?.state).toBe('uncovered');
    expect(zoneOf('running')?.state).toBe('covering');
    expect(zoneOf('done')?.state).toBe('stale');
  });

  it('Parla no tiene centroide ni job; Pinto tiene centroide y ningún job', () => {
    expect(locationOf('notSweepable')?.centroid).toBeNull();
    expect(locationOf('notSweepable')?.sweepRadiusM).toBeNull();
    expect(jobOf(E2E_COVERAGE_ZONES.notSweepable.zoneId)).toBeUndefined();
    expect(locationOf('cap')?.centroid).toMatch(/^POINT\(-3\.\d+ 40\.\d+\)$/);
    expect(jobOf(E2E_COVERAGE_ZONES.cap.zoneId)).toBeUndefined();
    expect(zoneOf('cap')?.state).toBe('uncovered');
  });
});

// D.13 (decisión 181, enmienda la 135): el tope global exige un job solicitado «hoy» (día UTC
// del servidor). La fecha de siembra se inyecta, así que el dataset es idéntico dentro del
// mismo día UTC y solo ese campo cambia entre días.
describe('buildE2eFixture — fecha de siembra inyectada (D.13)', () => {
  type Built = ReturnType<typeof buildE2eFixture>;
  const pendingJob = (data: Built): Built['coverageJobs'][number] | undefined =>
    data.coverageJobs.find((row) => row.zoneId === E2E_COVERAGE_ZONES.pending.zoneId);

  it('la misma fecha de siembra produce datos idénticos byte a byte', () => {
    const seedNow = new Date('2026-10-08T12:05:00Z');
    expect(JSON.stringify(buildE2eFixture(seedNow))).toBe(JSON.stringify(buildE2eFixture(seedNow)));
  });

  it('dos instantes del mismo día UTC producen datos idénticos', () => {
    const morning = buildE2eFixture(new Date('2026-10-08T00:00:01Z'));
    const night = buildE2eFixture(new Date('2026-10-08T23:59:59Z'));
    expect(JSON.stringify(morning)).toBe(JSON.stringify(night));
  });

  it('el job pendiente se solicita al inicio del día UTC de la siembra', () => {
    const data = buildE2eFixture(new Date('2026-10-08T12:05:00Z'));
    expect(pendingJob(data)?.requestedAt?.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('otro día UTC cambia únicamente el requestedAt del job pendiente', () => {
    const today = buildE2eFixture(new Date('2026-10-08T12:05:00Z'));
    const tomorrow = buildE2eFixture(new Date('2026-10-09T12:05:00Z'));
    expect(JSON.stringify(today)).not.toBe(JSON.stringify(tomorrow));

    const normalised = (data: Built): string => {
      const copy = structuredClone(data);
      const job = pendingJob(copy);
      if (job === undefined) {
        throw new Error('falta el job pendiente');
      }
      job.requestedAt = new Date(0);
      return JSON.stringify(copy);
    };
    expect(normalised(today)).toBe(normalised(tomorrow));
  });

  it('los demás jobs son anteriores al inicio del día de la siembra por defecto', () => {
    const data = buildE2eFixture();
    const dayStart = pendingJob(data)?.requestedAt?.getTime() ?? Number.NaN;
    const others = data.coverageJobs.filter(
      (row) => row.zoneId !== E2E_COVERAGE_ZONES.pending.zoneId
    );
    expect(others).toHaveLength(3);
    for (const job of others) {
      expect(job.requestedAt?.getTime()).toBeLessThan(dayStart);
    }
  });
});
