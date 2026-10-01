// Paso D.1a (spec e2e-test-database R3/R4, S3.1, S4.1-S4.6; diseño «Seed») — la
// FORMA del dataset e2e se prueba sobre datos puros, sin base de datos: la
// idempotencia y el volcado idéntico (S3.1/S3.2) se comprueban además en
// Docker, pero aquí queda fijado el contrato que lo hace posible (todo es
// constante) y las invariantes de forma que las specs visuales dan por hechas.
import { describe, expect, it } from 'vitest';

import { buildE2eFixture } from '../../src/e2e/fixture-data.js';
import {
  E2E_DETAIL_LISTING_ID,
  E2E_GETAFE,
  E2E_LISTING_IDS,
  E2E_MISSING_LISTING_ID,
  E2E_PROPERTY_IDS,
  E2E_REMOVED_ONLY_LISTING_ID,
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
      fixture.location.id,
      fixture.zone.id,
      ...fixture.properties.map((row) => row.id),
      ...fixture.listings.map((row) => row.id),
      ...fixture.versions.map((row) => row.id),
      ...fixture.propertyListings.map((row) => row.id),
    ];
    expect(ids).toHaveLength(2 + 1 + 1 + 6 + 9 + 9 + 9);
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
    expect(fixture.location.ineCode).toBe(E2E_GETAFE.ineCode);
    expect(fixture.location.searchName).toBe('getafe');
    expect(fixture.location.centroid).toMatch(/^POINT\(-3\.\d+ 40\.\d+\)$/);
    expect(fixture.zone.locationId).toBe(fixture.location.id);
    expect(fixture.zone.state).toBe('covered');
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

  it('S4.6 ninguna miniatura: thumbnail_url es NULL en viviendas y anuncios', () => {
    expect(fixture.properties.every((row) => row.thumbnailUrl === null)).toBe(true);
    expect(fixture.listings.every((row) => row.thumbnailUrl === null)).toBe(true);
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
      const priceOf = (listingId: string | undefined): number =>
        fixture.versions.find((row) => row.listingId === listingId)?.priceCents ?? Number.NaN;
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

  it('cada anuncio tiene una única versión vigente y una única fila de deduplicación con su desglose', () => {
    for (const listing of fixture.listings) {
      const versions = fixture.versions.filter((row) => row.listingId === listing.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.isCurrent).toBe(true);
      const links = fixture.propertyListings.filter((row) => row.listingId === listing.id);
      expect(links).toHaveLength(1);
      expect(links[0]?.scoredListingVersionId).toBe(versions[0]?.id);
      expect(Object.keys(links[0]?.signals ?? {}).length).toBeGreaterThan(0);
    }
  });
});

describe('IDs publicados para las specs', () => {
  it('el detalle de D.1b resuelve a un anuncio sembrado; el inexistente no está en el dataset', () => {
    const ids = fixture.listings.map((listing) => listing.id);
    expect(ids).toContain(E2E_DETAIL_LISTING_ID);
    expect(ids).toContain(E2E_REMOVED_ONLY_LISTING_ID);
    expect(ids).not.toContain(E2E_MISSING_LISTING_ID);
    expect(E2E_MISSING_LISTING_ID).toMatch(UUID_V4);
    expect(Object.values(E2E_LISTING_IDS)).toHaveLength(fixture.listings.length);
  });
});
