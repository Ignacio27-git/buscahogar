// Paso 1.6 — validación del elemento crudo de Idealista contra ambas
// fixtures grabadas en el paso 1.5 (REQ-NONET: nunca red, solo ficheros ya
// commiteados), más casos sintéticos para el rechazo de `price`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { rawElementSchema } from '../src/sources/idealista/raw-element.schema.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/idealista/', import.meta.url));

interface RawEnvelopeFixture {
  readonly elementList: readonly unknown[];
}

function loadFixture(name: string): RawEnvelopeFixture {
  const raw = readFileSync(`${FIXTURES_DIR}${name}`, 'utf8');
  return JSON.parse(raw) as RawEnvelopeFixture;
}

describe('rawElementSchema — fixtures reales (paso 1.5)', () => {
  it('parsea íntegramente los 50 elementos de la fixture de homes', () => {
    const { elementList } = loadFixture('search-homes-2026-09-10.json');
    expect(elementList).toHaveLength(50);
    for (const element of elementList) {
      expect(rawElementSchema.safeParse(element).success).toBe(true);
    }
  });

  it('parsea íntegramente los 50 elementos de la fixture de premises', () => {
    const { elementList } = loadFixture('search-premises-2026-09-10.json');
    expect(elementList).toHaveLength(50);
    for (const element of elementList) {
      expect(rawElementSchema.safeParse(element).success).toBe(true);
    }
  });

  it('en premises, la clave ausente `rooms` se mapea a undefined, nunca a null', () => {
    const { elementList } = loadFixture('search-premises-2026-09-10.json');
    const result = rawElementSchema.safeParse(elementList[0]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBeUndefined();
    }
  });

  it('preserva claves no modeladas gracias al passthrough laxo (looseObject)', () => {
    const { elementList } = loadFixture('search-homes-2026-09-10.json');
    const result = rawElementSchema.safeParse(elementList[0]);
    expect(result.success).toBe(true);
    if (result.success) {
      // 'district' no está en el esquema, pero sí en la fixture real.
      expect((result.data as Record<string, unknown>).district).toBeDefined();
    }
  });
});

describe('rawElementSchema — thumbnail tipado (ROADMAP 1.11, decisión 059)', () => {
  it('tipa "thumbnail" como string en los 50 elementos de la fixture de homes', () => {
    const { elementList } = loadFixture('search-homes-2026-09-10.json');
    for (const element of elementList) {
      const result = rawElementSchema.safeParse(element);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.thumbnail).toBe('string');
      }
    }
  });

  it('es válido sin thumbnail, y el valor resultante es undefined', () => {
    const base = {
      propertyCode: '12345',
      price: 100000,
      propertyType: 'flat',
      operation: 'sale',
      url: 'https://example.test/12345',
    };
    const result = rawElementSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thumbnail).toBeUndefined();
    }
  });
});

describe('rawElementSchema — validación de price (rechazo, R-PRICE)', () => {
  const base = {
    propertyCode: '12345',
    propertyType: 'flat',
    operation: 'sale',
    url: 'https://example.test/12345',
  };

  it('rechaza price ausente', () => {
    expect(rawElementSchema.safeParse({ ...base }).success).toBe(false);
  });

  it('rechaza price no numérico', () => {
    expect(rawElementSchema.safeParse({ ...base, price: 'gratis' }).success).toBe(false);
  });

  it('rechaza price cero', () => {
    expect(rawElementSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
  });

  it('rechaza price negativo', () => {
    expect(rawElementSchema.safeParse({ ...base, price: -50 }).success).toBe(false);
  });
});
