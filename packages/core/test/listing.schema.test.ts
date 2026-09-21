import { describe, expect, it } from 'vitest';

import { listingSchema, type Listing } from '../src/schemas/listing.schema.js';
import { withoutField } from './test-helpers.js';

// Payload mínimo válido: solo los seis campos requeridos y priceCents entero
// positivo. Se reutiliza como base para las mutaciones de cada caso de
// rechazo, para que cada test aísle un único campo.
const minimalValid = {
  sourceId: 'idealista',
  externalId: 'ext-123',
  url: 'https://example.com/anuncio/123',
  operation: 'sale',
  propertyType: 'flat',
  priceCents: 15_000_00,
};

describe('listingSchema — payload mínimo', () => {
  it('acepta el payload mínimo válido', () => {
    const result = listingSchema.safeParse(minimalValid);

    expect(result.success).toBe(true);
  });
});

describe('listingSchema — un rechazo por campo requerido', () => {
  it('rechaza sin sourceId', () => {
    expect(listingSchema.safeParse(withoutField(minimalValid, 'sourceId')).success).toBe(false);
  });

  it('rechaza sin externalId', () => {
    expect(listingSchema.safeParse(withoutField(minimalValid, 'externalId')).success).toBe(false);
  });

  it('rechaza sin url', () => {
    expect(listingSchema.safeParse(withoutField(minimalValid, 'url')).success).toBe(false);
  });

  it('rechaza sin operation', () => {
    expect(listingSchema.safeParse(withoutField(minimalValid, 'operation')).success).toBe(false);
  });

  it('rechaza sin propertyType', () => {
    expect(listingSchema.safeParse(withoutField(minimalValid, 'propertyType')).success).toBe(
      false
    );
  });

  it('rechaza sin priceCents', () => {
    expect(listingSchema.safeParse(withoutField(minimalValid, 'priceCents')).success).toBe(false);
  });
});

describe('listingSchema — priceCents es entero seguro y positivo (z.int(), decisión 021)', () => {
  it('rechaza un valor no entero', () => {
    const result = listingSchema.safeParse({ ...minimalValid, priceCents: 199.5 });
    expect(result.success).toBe(false);
  });

  it('rechaza un valor negativo', () => {
    const result = listingSchema.safeParse({ ...minimalValid, priceCents: -1 });
    expect(result.success).toBe(false);
  });

  it('rechaza Number.MAX_SAFE_INTEGER + 1 — prueba que se usó z.int(), no la forma legacy', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      priceCents: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('listingSchema — enums cerrados', () => {
  it('rechaza un operation fuera de la unión', () => {
    const result = listingSchema.safeParse({ ...minimalValid, operation: 'lease' });
    expect(result.success).toBe(false);
  });

  it('rechaza un propertyType fuera de la unión (vocabulario de un portal concreto)', () => {
    const result = listingSchema.safeParse({ ...minimalValid, propertyType: 'homes' });
    expect(result.success).toBe(false);
  });
});

describe('listingSchema — matriz de campos opcionales ausentes', () => {
  const optionalFields = [
    'surfaceM2',
    'rooms',
    'bathrooms',
    'floor',
    'title',
    'description',
    'address',
    'coordinates',
    'location',
    'thumbnailUrl',
  ] as const;

  it.each(optionalFields)('es válido sin el campo opcional "%s"', (field) => {
    const payload = { ...minimalValid };
    expect(field in payload).toBe(false);

    const result = listingSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('es válido sin coordinatesObfuscated', () => {
    const result = listingSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinatesObfuscated).toBeUndefined();
    }
  });
});

describe('listingSchema — coordinatesObfuscated es tri-estado (decisión 026)', () => {
  it('undefined es distinto de false — ausencia de señal fiable, no una afirmación de exactitud', () => {
    const undefinedResult = listingSchema.safeParse(minimalValid);
    const falseResult = listingSchema.safeParse({ ...minimalValid, coordinatesObfuscated: false });

    expect(undefinedResult.success).toBe(true);
    expect(falseResult.success).toBe(true);
    if (undefinedResult.success && falseResult.success) {
      expect(undefinedResult.data.coordinatesObfuscated).toBeUndefined();
      expect(falseResult.data.coordinatesObfuscated).toBe(false);
    }
  });
});

describe('listingSchema — numPhotos es entero no negativo opcional (ROADMAP 1.12, decisión 062)', () => {
  it('acepta un numPhotos entero no negativo', () => {
    const result = listingSchema.safeParse({ ...minimalValid, numPhotos: 46 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numPhotos).toBe(46);
    }
  });

  it('acepta cero', () => {
    const result = listingSchema.safeParse({ ...minimalValid, numPhotos: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numPhotos).toBe(0);
    }
  });

  it('es válido sin numPhotos, y el valor resultante es undefined (nunca null)', () => {
    const result = listingSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numPhotos).toBeUndefined();
    }
  });

  it('rechaza un numPhotos negativo', () => {
    const result = listingSchema.safeParse({ ...minimalValid, numPhotos: -1 });
    expect(result.success).toBe(false);
  });

  it('rechaza un numPhotos no entero', () => {
    const result = listingSchema.safeParse({ ...minimalValid, numPhotos: 4.5 });
    expect(result.success).toBe(false);
  });
});

describe('listingSchema — thumbnailUrl es .optional(), nunca .nullable() (ROADMAP 1.11, decisión 059)', () => {
  it('acepta un thumbnailUrl con formato de URL', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      thumbnailUrl: 'https://img4.idealista.com/blur/480_360_mq/foto.webp',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thumbnailUrl).toBe('https://img4.idealista.com/blur/480_360_mq/foto.webp');
    }
  });

  it('es válido sin thumbnailUrl, y el valor resultante es undefined (nunca null)', () => {
    const result = listingSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thumbnailUrl).toBeUndefined();
    }
  });
});

describe('listingSchema — Coordinates nunca es una tupla (decisión 019)', () => {
  it('rechaza coordinates expresado como tupla [lat, lng]', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      coordinates: [37.17, -3.6],
    });
    expect(result.success).toBe(false);
  });

  it('acepta coordinates con latitude/longitude con nombre explícito', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      coordinates: { latitude: 37.17, longitude: -3.6 },
    });
    expect(result.success).toBe(true);
  });
});

describe('listingSchema — residencial vs. no residencial, sin campo hasLift', () => {
  it('un listing residencial con rooms y ascensor como AppliedFeature es válido', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      rooms: 3,
      features: [{ key: 'lift' }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Ningún campo hasLift, ninguna presencia obligatoria de rooms: la
      // única señal es la entrada del catálogo de features.
      expect('hasLift' in result.data).toBe(false);
      expect(result.data.features).toEqual([{ key: 'lift' }]);
    }
  });

  it('un local comercial sin rooms y sin features es válido (evidencia de la sonda, obs #81)', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      propertyType: 'commercial',
      features: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBeUndefined();
    }
  });
});

describe('listingSchema — comportamiento frente a claves desconocidas y default de features', () => {
  it('una clave de nivel superior desconocida se elimina, no se rechaza', () => {
    const result = listingSchema.safeParse({
      ...minimalValid,
      // Clave arbitraria que no pertenece a ningún portal ni al dominio.
      unknownAdapterLeftover: 'debería desaparecer',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect('unknownAdapterLeftover' in result.data).toBe(false);
    }
  });

  it('features usa por defecto [] y no es opcional en el tipo de salida (z.infer = z.output)', () => {
    const result = listingSchema.safeParse(minimalValid);

    expect(result.success).toBe(true);
    if (result.success) {
      const listing: Listing = result.data;
      // Si features fuera opcional en el tipo, esta comprobación de tipos
      // seguiría compilando; el valor en tiempo de ejecución es lo que
      // demuestra el default.
      expect(listing.features).toEqual([]);
    }
  });
});
