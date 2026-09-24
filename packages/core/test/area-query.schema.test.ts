import { describe, expect, it } from 'vitest';

import { areaQuerySchema, type AreaQuery } from '../src/schemas/area-query.schema.js';
import { listingSchema } from '../src/schemas/listing.schema.js';
import { withoutField } from './test-helpers.js';

const validPayload = {
  center: { latitude: 37.17, longitude: -3.6 },
  radiusMeters: 500,
  operation: 'sale',
};

describe('areaQuerySchema — payload geográfico válido', () => {
  it('acepta { center, radiusMeters, operation }', () => {
    const result = areaQuerySchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      const query: AreaQuery = result.data;
      expect(query.radiusMeters).toBe(500);
    }
  });
});

describe('areaQuerySchema — radiusMeters debe ser positivo', () => {
  it('rechaza radiusMeters: 0', () => {
    expect(areaQuerySchema.safeParse({ ...validPayload, radiusMeters: 0 }).success).toBe(false);
  });

  it('rechaza un radiusMeters negativo', () => {
    expect(areaQuerySchema.safeParse({ ...validPayload, radiusMeters: -100 }).success).toBe(false);
  });
});

describe('areaQuerySchema — operation obligatorio', () => {
  it('rechaza sin operation', () => {
    expect(areaQuerySchema.safeParse(withoutField(validPayload, 'operation')).success).toBe(
      false
    );
  });

  it('rechaza un operation fuera de la unión', () => {
    expect(areaQuerySchema.safeParse({ ...validPayload, operation: 'lease' }).success).toBe(false);
  });
});

describe('areaQuerySchema — center malformado', () => {
  it('rechaza un center con coordenadas no numéricas', () => {
    const result = areaQuerySchema.safeParse({
      ...validPayload,
      center: { latitude: 'norte', longitude: -3.6 },
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un center expresado como tupla', () => {
    const result = areaQuerySchema.safeParse({ ...validPayload, center: [37.17, -3.6] });
    expect(result.success).toBe(false);
  });

  it('rechaza sin center', () => {
    expect(areaQuerySchema.safeParse(withoutField(validPayload, 'center')).success).toBe(false);
  });
});

describe('areaQuerySchema — geográfico puro, sin locationId ni propertyType', () => {
  it('rechaza una clave locationId extra (schema estricto) — a diferencia de listingSchema', () => {
    const result = areaQuerySchema.safeParse({ ...validPayload, locationId: 'granada' });
    expect(result.success).toBe(false);
  });

  it('contraste: la misma clave extra en listingSchema se elimina, no se rechaza', () => {
    const listingResult = listingSchema.safeParse({
      sourceId: 'idealista',
      externalId: 'ext-1',
      url: 'https://example.com/1',
      operation: 'sale',
      propertyType: 'flat',
      priceCents: 100_000,
      locationId: 'granada',
    });

    expect(listingResult.success).toBe(true);
    if (listingResult.success) {
      expect('locationId' in listingResult.data).toBe(false);
    }
  });

  it('rechaza un propertyType extra — no es un campo de AreaQuery en este cambio (DECISIONS 027)', () => {
    const result = areaQuerySchema.safeParse({ ...validPayload, propertyType: 'flat' });
    expect(result.success).toBe(false);
  });
});

describe('areaQuerySchema — sin coerción (z.input === z.output)', () => {
  it('rechaza radiusMeters como cadena, incluso numérica', () => {
    const result = areaQuerySchema.safeParse({ ...validPayload, radiusMeters: '500' });
    expect(result.success).toBe(false);
  });

  it('rechaza un radiusMeters no finito', () => {
    const result = areaQuerySchema.safeParse({ ...validPayload, radiusMeters: Number.POSITIVE_INFINITY });
    expect(result.success).toBe(false);
  });
});
