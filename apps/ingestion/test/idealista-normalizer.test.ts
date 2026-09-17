// Paso 1.6 — IdealistaListingNormalizer: función pura y total sobre los dos
// fixtures reales (100 elementos), más la Reconciliación #2 de las tareas
// (obs #106): `normalize()` conserva el throw de price del spec como
// contrato propio y directamente testeado, porque el tipo TS de
// IdealistaElement no expresa en compilación la comprobación en runtime de
// `.positive()` — un elemento construido a mano que bypasea rawElementSchema
// y llega con price inválido debe seguir fallando aquí.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { listingSchema } from '@buscahogar/core';

import { IdealistaListingNormalizer, NormalizationError } from '../src/sources/idealista/normalizer.js';
import { rawElementSchema, type IdealistaElement } from '../src/sources/idealista/raw-element.schema.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/idealista/', import.meta.url));

function loadElements(name: string): readonly IdealistaElement[] {
  const raw = JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, 'utf8')) as { elementList: readonly unknown[] };
  return raw.elementList.map((element) => rawElementSchema.parse(element));
}

const normalizer = new IdealistaListingNormalizer();
const FIXTURE_NAMES = ['search-homes-2026-09-10.json', 'search-premises-2026-09-10.json'] as const;

describe('IdealistaListingNormalizer — sobre datos reales (ambas fixtures, D3 caveat)', () => {
  it.each(FIXTURE_NAMES)('normaliza los 50 elementos de %s a Listings válidos, sin ningún throw', (fixtureName) => {
    const elements = loadElements(fixtureName);
    expect(elements).toHaveLength(50);

    for (const element of elements) {
      const listing = normalizer.normalize(element);
      expect(listingSchema.safeParse(listing).success).toBe(true);
    }
  });

  it('location y coordinatesObfuscated son siempre undefined (sin señal fiable en esta fuente)', () => {
    for (const element of loadElements('search-homes-2026-09-10.json')) {
      const listing = normalizer.normalize(element);
      expect(listing.location).toBeUndefined();
      expect(listing.coordinatesObfuscated).toBeUndefined();
    }
  });

  it('thumbnailUrl se mapea desde raw.thumbnail (ROADMAP 1.11, decisión 059)', () => {
    for (const element of loadElements('search-homes-2026-09-10.json')) {
      const listing = normalizer.normalize(element);
      expect(listing.thumbnailUrl).toBe(element.thumbnail);
      expect(typeof listing.thumbnailUrl).toBe('string');
    }
  });

  it('features es siempre un array vacío (D8, catálogo diferido a un paso posterior)', () => {
    const [element] = loadElements('search-homes-2026-09-10.json');
    expect(element).toBeDefined();
    const listing = normalizer.normalize(element as IdealistaElement);
    expect(listing.features).toEqual([]);
  });

  it('es determinista: la misma entrada produce el mismo resultado en dos llamadas', () => {
    const [element] = loadElements('search-premises-2026-09-10.json');
    expect(element).toBeDefined();
    expect(normalizer.normalize(element as IdealistaElement)).toEqual(normalizer.normalize(element as IdealistaElement));
  });
});

describe('IdealistaListingNormalizer — Reconciliación #2: price es el ÚNICO throw', () => {
  function malformedElement(overrides: Record<string, unknown>): IdealistaElement {
    const base: Record<string, unknown> = {
      propertyCode: '999',
      price: 100000,
      propertyType: 'flat',
      operation: 'sale',
      url: 'https://example.test/999',
      ...overrides,
    };
    return base as unknown as IdealistaElement;
  }

  it('price ausente lanza NormalizationError', () => {
    expect(() => normalizer.normalize(malformedElement({ price: undefined }))).toThrow(NormalizationError);
  });

  it('price cero lanza NormalizationError', () => {
    expect(() => normalizer.normalize(malformedElement({ price: 0 }))).toThrow(NormalizationError);
  });

  it('price negativo lanza NormalizationError', () => {
    expect(() => normalizer.normalize(malformedElement({ price: -50 }))).toThrow(NormalizationError);
  });

  it('price no numérico lanza NormalizationError', () => {
    expect(() => normalizer.normalize(malformedElement({ price: 'gratis' }))).toThrow(NormalizationError);
  });

  it('cualquier otro campo opcional ausente degrada sin lanzar (size, rooms, bathrooms, floor, address, coordenadas, título, descripción)', () => {
    const element = malformedElement({});
    expect(() => normalizer.normalize(element)).not.toThrow();
    const listing = normalizer.normalize(element);
    expect(listing.surfaceM2).toBeUndefined();
    expect(listing.rooms).toBeUndefined();
    expect(listing.bathrooms).toBeUndefined();
    expect(listing.floor).toBeUndefined();
    expect(listing.address).toBeUndefined();
    expect(listing.coordinates).toBeUndefined();
    expect(listing.title).toBeUndefined();
    expect(listing.description).toBeUndefined();
  });
});
