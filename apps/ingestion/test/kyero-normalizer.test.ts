// Paso 1.14 — KyeroListingNormalizer + mapPropertyType (diseño D5, "Normalizer
// map"/"Type map"). RED inicial: ni property-type-map.ts ni normalizer.ts
// existen todavía.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { listingSchema } from '@buscahogar/core';

import { parseFeed } from '../src/sources/kyero/feed-parser.js';
import { KyeroNormalizationError } from '../src/sources/kyero/errors.js';
import { KyeroListingNormalizer } from '../src/sources/kyero/normalizer.js';
import { describeMapping, mapPropertyType } from '../src/sources/kyero/property-type-map.js';
import { rawPropertySchema, type KyeroProperty } from '../src/sources/kyero/raw-property.schema.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/kyero/feed-sample.xml', import.meta.url));

// "Válida contra el esquema": pasa rawPropertySchema (todo el fixture salvo
// P7, que no tiene <price>). Incluye P4 (GBP) a propósito: es válida como
// FORMA, pero el normalizador la rechaza por moneda (D7).
function loadSchemaValidProperties(): readonly KyeroProperty[] {
  const xml = readFileSync(FIXTURE_PATH, 'utf8');
  return parseFeed(xml)
    .map((raw) => rawPropertySchema.safeParse(raw))
    .filter((result) => result.success)
    .map((result) => result.data);
}

// "Normalizable": además de válida contra el esquema, en EUR (D7 last line
// of defence) — el subconjunto que normalize() acepta sin lanzar.
function loadNormalizableProperties(): readonly KyeroProperty[] {
  return loadSchemaValidProperties().filter((raw) => raw.currency === undefined || raw.currency === 'EUR');
}

const normalizer = new KyeroListingNormalizer();

describe('mapPropertyType — mapa fuente->dominio con fallback other (diseño, tabla de tipos)', () => {
  it.each([
    ['apartment', 'flat'],
    ['Apartment', 'flat'],
    ['flat', 'flat'],
    ['penthouse', 'penthouse'],
    ['duplex', 'duplex'],
    ['studio', 'studio'],
    ['villa', 'house'],
    ['house', 'house'],
    ['townhouse', 'house'],
    ['town house', 'house'],
    ['detached house', 'house'],
    ['semi-detached house', 'house'],
    ['bungalow', 'house'],
    ['country house', 'house'],
    ['finca', 'house'],
    ['cortijo', 'house'],
    ['chalet', 'house'],
    ['land', 'land'],
    ['plot', 'land'],
    ['commercial', 'commercial'],
    ['shop', 'commercial'],
    ['premises', 'commercial'],
    ['business', 'commercial'],
    ['garage', 'garage'],
    ['parking', 'garage'],
    ['storage', 'storage_room'],
    ['building', 'building'],
    ['Yurt', 'other'],
    ['', 'other'],
  ] as const)('mapea "%s" a %s', (rawValue, expected) => {
    expect(mapPropertyType(rawValue)).toBe(expected);
  });

  it('describeMapping marca "Yurt" como no reconocido y degrada a other', () => {
    expect(describeMapping('Yurt')).toEqual({ recognised: false, value: 'other' });
  });

  it('describeMapping marca "flat" como reconocido', () => {
    expect(describeMapping('flat')).toEqual({ recognised: true, value: 'flat' });
  });
});

describe('KyeroListingNormalizer — sobre el fixture hand-authored', () => {
  const all = loadSchemaValidProperties();
  const normalizable = loadNormalizableProperties();

  it('carga exactamente 6 propiedades válidas contra el esquema (todas salvo P7, sin price)', () => {
    expect(all).toHaveLength(6);
  });

  it('de esas 6, exactamente 5 son normalizables (P4/GBP queda fuera, D7)', () => {
    expect(normalizable).toHaveLength(5);
    expect(normalizable.some((raw) => raw.id === '1004')).toBe(false);
  });

  it('cada propiedad normalizable produce un Listing válido según listingSchema', () => {
    normalizable.forEach((raw) => {
      const listing = normalizer.normalize(raw);
      expect(listingSchema.safeParse(listing).success).toBe(true);
    });
  });

  it('los campos requeridos están todos presentes (sourceId, externalId, url, operation, propertyType, priceCents)', () => {
    const first = normalizable.find((raw) => raw.id === '1001');
    expect(first).toBeDefined();
    const listing = normalizer.normalize(first as KyeroProperty);
    expect(listing.sourceId).toBe('kyero');
    expect(listing.externalId).toBe('1001');
    expect(typeof listing.url).toBe('string');
    expect(listing.operation).toBe('sale');
    expect(listing.propertyType).toBe('flat');
    expect(listing.priceCents).toBe(18_500_000);
  });

  it('el id con cero a la izquierda ("00123") se conserva como externalId string', () => {
    const p2 = all.find((raw) => raw.id === '00123');
    expect(p2).toBeDefined();
    const listing = normalizer.normalize(p2 as KyeroProperty);
    expect(listing.externalId).toBe('00123');
    expect(listing.operation).toBe('rent');
  });

  it('"Yurt" (sin mapeo) produce propertyType "other"', () => {
    const p3 = all.find((raw) => raw.id === '1003');
    expect(p3).toBeDefined();
    const listing = normalizer.normalize(p3 as KyeroProperty);
    expect(listing.propertyType).toBe('other');
  });

  it('features es siempre un array vacío (el normalizador no lo puebla)', () => {
    const first = normalizable.find((raw) => raw.id === '1001');
    const listing = normalizer.normalize(first as KyeroProperty);
    expect(listing.features).toEqual([]);
  });

  it('title, address, location y coordinatesObfuscated quedan siempre unset', () => {
    normalizable.forEach((raw) => {
      const listing = normalizer.normalize(raw);
      expect(listing.title).toBeUndefined();
      expect(listing.address).toBeUndefined();
      expect(listing.location).toBeUndefined();
      expect(listing.coordinatesObfuscated).toBeUndefined();
    });
  });

  it('thumbnailUrl queda unset incluso con 3 imágenes (P2, "00123")', () => {
    const p2 = all.find((raw) => raw.id === '00123');
    expect(p2).toBeDefined();
    expect((p2 as { images?: { image?: unknown[] } }).images?.image).toHaveLength(3);
    const listing = normalizer.normalize(p2 as KyeroProperty);
    expect(listing.thumbnailUrl).toBeUndefined();
  });

  it('coordinates se resuelve desde <location> anidado cuando está presente (P1)', () => {
    const p1 = all.find((raw) => raw.id === '1001');
    expect(p1).toBeDefined();
    const listing = normalizer.normalize(p1 as KyeroProperty);
    expect(listing.coordinates).toEqual({ latitude: 36.53, longitude: -4.6495 });
  });

  it('coordinates se resuelve desde latitude/longitude planos cuando no hay <location> (P2)', () => {
    const p2 = all.find((raw) => raw.id === '00123');
    expect(p2).toBeDefined();
    const listing = normalizer.normalize(p2 as KyeroProperty);
    expect(listing.coordinates).toEqual({ latitude: 36.531, longitude: -4.651 });
  });

  it('surfaceM2 toma surface_area.built (P1: 85)', () => {
    const p1 = all.find((raw) => raw.id === '1001');
    const listing = normalizer.normalize(p1 as KyeroProperty);
    expect(listing.surfaceM2).toBe(85);
  });

  it('es determinista: la misma entrada produce el mismo resultado en dos llamadas', () => {
    const first = normalizable.find((raw) => raw.id === '1001');
    expect(normalizer.normalize(first as KyeroProperty)).toEqual(normalizer.normalize(first as KyeroProperty));
  });
});

describe('KyeroListingNormalizer — última línea de defensa de moneda (D7 caveat)', () => {
  it('una moneda distinta de EUR lanza KyeroNormalizationError, incluso si llega hasta el normalizador', () => {
    const raw: KyeroProperty = {
      id: '999',
      price: 1000,
      currency: 'USD',
      type: 'flat',
      url: 'https://example.test/999',
    };
    expect(() => normalizer.normalize(raw)).toThrow(KyeroNormalizationError);
  });

  it('currency ausente (EUR implícito) no lanza', () => {
    const raw: KyeroProperty = { id: '998', price: 1000, type: 'flat', url: 'https://example.test/998' };
    expect(() => normalizer.normalize(raw)).not.toThrow();
  });
});
