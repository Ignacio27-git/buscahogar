// Paso 1.7 — LISTING_FIELD_POLICY (PERSIST-10, R2): el conjunto de campos
// comparables se DERIVA del tipo `Listing`, nunca se mantiene a mano. Este
// test fija la mitad en tiempo de EJECUCIÓN del pareo esquema↔política — la
// mitad de COMPILACIÓN (TS2741 al añadir un campo a `Listing` sin
// clasificarlo aquí) se verifica con `pnpm typecheck`, no en este archivo
// (tarea 1.16 / nota de ordenación 7 del checklist).
import { describe, expect, it } from 'vitest';

import { listingSchema, type Listing } from '@buscahogar/core';

import { LISTING_FIELD_POLICY, VERSION_COLUMN_FIELDS } from '../src/sweep/listing-field-policy.js';
import { projectToVersionColumns } from '../src/sweep/version-columns.js';

describe('LISTING_FIELD_POLICY — PERSIST-10a: pinning contra el esquema', () => {
  it('cubre exactamente las mismas claves que listingSchema.shape', () => {
    expect(Object.keys(LISTING_FIELD_POLICY).sort()).toEqual(Object.keys(listingSchema.shape).sort());
  });
});

describe('LISTING_FIELD_POLICY — clasificación exacta de cada campo (diseño D4)', () => {
  const VERSION_COLUMNS = [
    'operation',
    'propertyType',
    'priceCents',
    'surfaceM2',
    'rooms',
    'bathrooms',
    'floor',
    'title',
    'description',
    'address',
  ] as const;

  it.each(VERSION_COLUMNS)('clasifica "%s" como version-column', (field) => {
    expect(LISTING_FIELD_POLICY[field]).toEqual({ kind: 'version-column', column: field });
  });

  it('el conjunto derivado VERSION_COLUMN_FIELDS son exactamente estos 10 campos (R2)', () => {
    expect([...VERSION_COLUMN_FIELDS].sort()).toEqual([...VERSION_COLUMNS].sort());
  });

  it.each(['sourceId', 'externalId'] as const)('clasifica "%s" como identity-key', (field) => {
    expect(LISTING_FIELD_POLICY[field]).toEqual({ kind: 'identity-key' });
  });

  it('clasifica "url" como identity-column apuntando a "url"', () => {
    expect(LISTING_FIELD_POLICY.url).toEqual({ kind: 'identity-column', column: 'url' });
  });

  it('clasifica "coordinates" como identity-column apuntando a "location" (listings.location)', () => {
    expect(LISTING_FIELD_POLICY.coordinates).toEqual({ kind: 'identity-column', column: 'location' });
  });

  it('clasifica "location" como identity-column apuntando a "locationId" (listings.location_id FK)', () => {
    expect(LISTING_FIELD_POLICY.location).toEqual({ kind: 'identity-column', column: 'locationId' });
  });

  it('clasifica "coordinatesObfuscated" como identity-column apuntando a "coordinatesObfuscated"', () => {
    expect(LISTING_FIELD_POLICY.coordinatesObfuscated).toEqual({
      kind: 'identity-column',
      column: 'coordinatesObfuscated',
    });
  });

  it('clasifica "features" como not-persisted, con motivo explícito', () => {
    const policy = LISTING_FIELD_POLICY.features;
    expect(policy.kind).toBe('not-persisted');
    if (policy.kind === 'not-persisted') {
      expect(policy.reason.length).toBeGreaterThan(0);
    }
  });

  it('clasifica "thumbnailUrl" como identity-column apuntando a "thumbnailUrl" (ROADMAP 1.11, decisión 059)', () => {
    expect(LISTING_FIELD_POLICY.thumbnailUrl).toEqual({ kind: 'identity-column', column: 'thumbnailUrl' });
  });

  it('clasifica "numPhotos" como identity-column apuntando a "numPhotos" (ROADMAP 1.12, decisión 062)', () => {
    expect(LISTING_FIELD_POLICY.numPhotos).toEqual({ kind: 'identity-column', column: 'numPhotos' });
  });

  it('el objeto cubre las 19 claves de Listing sin huecos ni duplicados', () => {
    const keys = Object.keys(LISTING_FIELD_POLICY) as (keyof Listing)[];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(19);
  });
});

describe('numPhotos nunca entra en la detección de cambio (ROADMAP 1.12, decisión 062)', () => {
  const base = {
    sourceId: 'idealista',
    externalId: 'ext-1',
    url: 'https://example.test/1',
    operation: 'sale' as const,
    propertyType: 'flat' as const,
    priceCents: 100_000_00,
    features: [] as const,
  };

  it('VERSION_COLUMN_FIELDS no contiene "numPhotos"', () => {
    expect(VERSION_COLUMN_FIELDS).not.toContain('numPhotos');
  });

  it('projectToVersionColumns produce el mismo resultado para dos Listing que solo difieren en numPhotos', () => {
    const listingA: Listing = { ...base, numPhotos: 30 };
    const listingB: Listing = { ...base, numPhotos: 32 };
    expect(projectToVersionColumns(listingA)).toEqual(projectToVersionColumns(listingB));
  });
});

describe('thumbnailUrl nunca entra en la detección de cambio (A-7, ROADMAP 1.11)', () => {
  const base = {
    sourceId: 'idealista',
    externalId: 'ext-1',
    url: 'https://example.test/1',
    operation: 'sale' as const,
    propertyType: 'flat' as const,
    priceCents: 100_000_00,
    features: [] as const,
  };

  it('VERSION_COLUMN_FIELDS no contiene "thumbnailUrl"', () => {
    expect(VERSION_COLUMN_FIELDS).not.toContain('thumbnailUrl');
  });

  it('projectToVersionColumns produce el mismo resultado para dos Listing que solo difieren en thumbnailUrl', () => {
    const listingA: Listing = { ...base, thumbnailUrl: 'https://example.test/a.webp' };
    const listingB: Listing = { ...base, thumbnailUrl: 'https://example.test/b.webp' };
    expect(projectToVersionColumns(listingA)).toEqual(projectToVersionColumns(listingB));
  });
});
