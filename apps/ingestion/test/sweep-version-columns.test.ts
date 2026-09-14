// Paso 1.7 — version-columns.ts (PERSIST-4, diseño D4). Caso explícito: la
// trampa de redondeo numérico verificada contra listing.schema.ts:30-32
// (surfaceM2/rooms/bathrooms: z.number(), sin restricción entera) vs.
// listing-versions.ts:38-40 (integer/smallint) — obs #113/#116. Sin
// proyectar con el MISMO redondeo en ambos lados, un surfaceM2 fraccional
// insertaría una versión nueva EN CADA ejecución, para siempre.
import { describe, expect, it } from 'vitest';

import type { Listing } from '@buscahogar/core';

import { VERSION_COLUMN_FIELDS, type VersionColumns } from '../src/sweep/listing-field-policy.js';
import { equalVersionColumns, projectToVersionColumns } from '../src/sweep/version-columns.js';

function baseListing(overrides: Partial<Listing> = {}): Listing {
  return {
    sourceId: 'idealista',
    externalId: '1',
    url: 'https://example.test/1',
    operation: 'sale',
    propertyType: 'flat',
    priceCents: 20000000,
    surfaceM2: 80,
    rooms: 3,
    bathrooms: 1,
    floor: '2',
    title: 'Piso',
    description: 'Piso reformado',
    address: 'calle falsa 1',
    features: [],
    ...overrides,
  };
}

describe('projectToVersionColumns / equalVersionColumns — trampa de redondeo numérico', () => {
  it('un surfaceM2 fraccional (78.5) proyectado con el mismo redondeo que la columna integer (79) NO reporta cambio', () => {
    const incoming = projectToVersionColumns(baseListing({ surfaceM2: 78.5 }));
    // Simula la lectura de vuelta de la columna `integer`: PostgreSQL ya la
    // redondeó al escribir la primera vez.
    const storedRow: VersionColumns = { ...incoming, surfaceM2: 79 };
    expect(equalVersionColumns(incoming, storedRow)).toBe(true);
  });

  it('un surfaceM2 que SÍ cambia de valor entero reporta cambio', () => {
    const a = projectToVersionColumns(baseListing({ surfaceM2: 80 }));
    const b = projectToVersionColumns(baseListing({ surfaceM2: 95 }));
    expect(equalVersionColumns(a, b)).toBe(false);
  });
});

describe('equalVersionColumns — null (lectura de fila) y undefined (Listing opcional) comparan igual', () => {
  it('trata null igual que undefined para un campo opcional ausente', () => {
    const projected = projectToVersionColumns(baseListing({ floor: undefined }));
    const storedRow: VersionColumns = { ...projected, floor: null as unknown as undefined };
    expect(equalVersionColumns(projected, storedRow)).toBe(true);
  });
});

describe('equalVersionColumns — cada uno de los 10 campos version-column vuelca el veredicto por separado', () => {
  const CASES: readonly [keyof Listing, unknown][] = [
    ['priceCents', 20500000],
    ['surfaceM2', 95],
    ['rooms', 4],
    ['bathrooms', 2],
    ['floor', '3'],
    ['title', 'Piso reformado'],
    ['description', 'Piso reformado, ascensor'],
    ['address', 'calle falsa 2'],
    ['propertyType', 'house'],
    ['operation', 'rent'],
  ];

  it.each(CASES)('cambiar solo "%s" hace que equalVersionColumns devuelva false', (field, newValue) => {
    const original = projectToVersionColumns(baseListing());
    const changed = projectToVersionColumns(baseListing({ [field]: newValue }));
    expect(equalVersionColumns(original, changed)).toBe(false);
  });

  it('el conjunto comparado es exactamente VERSION_COLUMN_FIELDS (R2, derivado de listing-field-policy)', () => {
    expect([...VERSION_COLUMN_FIELDS].sort()).toEqual(CASES.map(([field]) => field).sort());
  });
});

describe('equalVersionColumns — contenido idéntico reporta ausencia de cambio (PERSIST-4a)', () => {
  it('dos proyecciones del mismo Listing son iguales', () => {
    const a = projectToVersionColumns(baseListing());
    const b = projectToVersionColumns(baseListing());
    expect(equalVersionColumns(a, b)).toBe(true);
  });
});
