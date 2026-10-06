// Paso D.1a (spec e2e-test-database R3/R4; diseño «Seed», decisión 135) — dataset
// determinista de la base e2e, como DATOS PUROS: sin conexión, sin leer
// `process.env`. `seed.ts` solo lo inserta. Separarlo permite probar la forma
// del dataset (S4.x) y su determinismo (S3.1) sin una base de datos.
//
// Todo es constante: identificadores de `fixture-ids.ts` y marcas de tiempo
// fijas. Ninguna columna con `DEFAULT now()` o `defaultRandom()` se deja sin
// valor, porque dos siembras dejarían volcados distintos (S3.1).
import { normalizeSearchName } from '@buscahogar/core';

import { geographyPointWkt } from '../spatial.js';
import type {
  listingVersions,
  listings,
  locations,
  properties,
  propertyListings,
  sources,
  zones,
} from '../tables.js';
import {
  E2E_GETAFE,
  E2E_LISTING_IDS,
  E2E_PROPERTY_IDS,
  E2E_SOURCE_IDS,
  e2eUuid,
} from './fixture-ids.js';

export interface E2eFixture {
  readonly sources: (typeof sources.$inferInsert)[];
  readonly location: typeof locations.$inferInsert;
  readonly zone: typeof zones.$inferInsert;
  readonly properties: (typeof properties.$inferInsert)[];
  readonly listings: (typeof listings.$inferInsert)[];
  readonly versions: (typeof listingVersions.$inferInsert)[];
  readonly propertyListings: (typeof propertyListings.$inferInsert)[];
}

// Instante «ahora» del dataset y los de los anuncios que dejaron de verse.
const SEEN_AT = new Date('2026-09-15T10:00:00Z');
const REMOVED_LAST_SEEN_AT = new Date('2026-02-28T10:00:00Z');
const INACTIVE_SINCE = new Date('2026-03-01T10:00:00Z');
const TOMBSTONED_AT = new Date('2026-08-28T10:00:00Z');
// D.9 (decisión 175): inactivos recientes, lejos de los 180 días del tombstone
// (decisión 107), así que conservan descripción, `raw` y miniatura.
const INACTIVE_LAST_SEEN_AT = new Date('2026-08-31T10:00:00Z');
const RECENTLY_INACTIVE_SINCE = new Date('2026-09-01T10:00:00Z');

// Miniaturas del dataset: rutas de NUESTRO origen, nunca un host externo (R8). Los
// PNG viven en `apps/web/e2e/assets/` y `Dockerfile.e2e` los copia a
// `apps/web/public/e2e-fixtures/`: solo existen en la imagen del e2e, y pasan por el
// optimizador local de `next/image` (`/_next/image`) como una miniatura real.
const E2E_THUMBNAILS = {
  first: '/e2e-fixtures/gallery-1.png',
  second: '/e2e-fixtures/gallery-2.png',
} as const;

// Centroide aproximado de Getafe (28065) y radio de barrido en metros.
const GETAFE_CENTROID = { latitude: 40.3057, longitude: -3.7326 };
const GETAFE_SWEEP_RADIUS_M = 3500;

interface ListingSeed {
  readonly id: string;
  readonly source: keyof typeof E2E_SOURCE_IDS;
  readonly status: 'active' | 'inactive' | 'removed';
  readonly priceCents: number;
  // Solo P7 lleva miniatura (decisión 175); el resto, `null` (S4.6).
  readonly thumbnailUrl?: string;
}

interface PropertySeed {
  readonly id: string;
  readonly operation: 'sale' | 'rent';
  readonly propertyType: string;
  // `null`: dato sin consolidar (el ganador no lo tiene, decisión 053). Solo P7.
  readonly rooms: number;
  readonly bathrooms: number | null;
  readonly surfaceM2: number;
  readonly address: string;
  readonly floor: string | null;
  readonly title: string;
  // `null`: vivienda sin ubicación (P6, spec S4.5).
  readonly location: { readonly x: number; readonly y: number } | null;
  readonly listings: readonly ListingSeed[];
}

// P1: dos anuncios activos de dos fuentes. P2: uno activo y uno retirado.
// P3: solo retirados (no aparece en la búsqueda; su detalle sí resuelve).
// P4 y P5: activos con ubicación. P6: activo sin ubicación. P7: solo inactivos sin
// redactar, con dos fotos y baños y planta sin consolidar (ficha de D.9).
const PROPERTY_SEEDS: readonly PropertySeed[] = [
  {
    id: E2E_PROPERTY_IDS.p1,
    operation: 'rent',
    propertyType: 'flat',
    rooms: 2,
    bathrooms: 1,
    surfaceM2: 70,
    address: 'Calle Ejemplo 12',
    floor: '3',
    title: 'Piso luminoso en Getafe centro',
    location: { x: -3.7324, y: 40.3063 },
    listings: [
      { id: E2E_LISTING_IDS.p1Idealista, source: 'idealista', status: 'active', priceCents: 85000 },
      { id: E2E_LISTING_IDS.p1Kyero, source: 'kyero', status: 'active', priceCents: 87000 },
    ],
  },
  {
    id: E2E_PROPERTY_IDS.p2,
    operation: 'rent',
    propertyType: 'flat',
    rooms: 3,
    bathrooms: 2,
    surfaceM2: 95,
    address: 'Avenida de España 40',
    floor: '1',
    title: 'Piso de tres habitaciones con terraza',
    location: { x: -3.7391, y: 40.3099 },
    listings: [
      { id: E2E_LISTING_IDS.p2Active, source: 'idealista', status: 'active', priceCents: 118000 },
      { id: E2E_LISTING_IDS.p2Removed, source: 'kyero', status: 'removed', priceCents: 124000 },
    ],
  },
  {
    id: E2E_PROPERTY_IDS.p3,
    operation: 'sale',
    propertyType: 'house',
    rooms: 4,
    bathrooms: 2,
    surfaceM2: 140,
    address: 'Calle Toledo 5',
    floor: 'bajo',
    title: 'Casa adosada retirada del mercado',
    location: { x: -3.725, y: 40.301 },
    listings: [
      {
        id: E2E_LISTING_IDS.p3RemovedA,
        source: 'idealista',
        status: 'removed',
        priceCents: 24900000,
      },
      { id: E2E_LISTING_IDS.p3RemovedB, source: 'kyero', status: 'removed', priceCents: 25500000 },
    ],
  },
  {
    id: E2E_PROPERTY_IDS.p4,
    operation: 'sale',
    propertyType: 'flat',
    rooms: 2,
    bathrooms: 1,
    surfaceM2: 65,
    address: 'Calle del Pinar 8',
    floor: '2',
    title: 'Piso reformado cerca del Hospital',
    location: { x: -3.744, y: 40.314 },
    listings: [
      { id: E2E_LISTING_IDS.p4, source: 'idealista', status: 'active', priceCents: 18500000 },
    ],
  },
  {
    id: E2E_PROPERTY_IDS.p5,
    operation: 'rent',
    propertyType: 'studio',
    rooms: 1,
    bathrooms: 1,
    surfaceM2: 38,
    address: 'Plaza Mayor 3',
    floor: 'bajo',
    title: 'Estudio amueblado en el centro',
    location: { x: -3.72, y: 40.318 },
    listings: [{ id: E2E_LISTING_IDS.p5, source: 'kyero', status: 'active', priceCents: 62000 }],
  },
  {
    id: E2E_PROPERTY_IDS.p6,
    operation: 'sale',
    propertyType: 'house',
    rooms: 5,
    bathrooms: 3,
    surfaceM2: 210,
    address: 'Urbanización Los Olivos 21',
    floor: 'bajo',
    title: 'Chalet independiente sin ubicación publicada',
    location: null,
    listings: [
      { id: E2E_LISTING_IDS.p6, source: 'idealista', status: 'active', priceCents: 39000000 },
    ],
  },
  {
    id: E2E_PROPERTY_IDS.p7,
    operation: 'sale',
    propertyType: 'flat',
    rooms: 3,
    bathrooms: null,
    surfaceM2: 88,
    address: 'Calle Madrid 27',
    floor: null,
    title: 'Piso exterior con dos fuentes y fotos',
    location: { x: -3.7305, y: 40.3072 },
    listings: [
      {
        id: E2E_LISTING_IDS.p7Idealista,
        source: 'idealista',
        status: 'inactive',
        priceCents: 21900000,
        thumbnailUrl: E2E_THUMBNAILS.first,
      },
      {
        id: E2E_LISTING_IDS.p7Kyero,
        source: 'kyero',
        status: 'inactive',
        priceCents: 22500000,
        thumbnailUrl: E2E_THUMBNAILS.second,
      },
    ],
  },
];

export function buildE2eFixture(): E2eFixture {
  const fixture: {
    properties: (typeof properties.$inferInsert)[];
    listings: (typeof listings.$inferInsert)[];
    versions: (typeof listingVersions.$inferInsert)[];
    propertyListings: (typeof propertyListings.$inferInsert)[];
  } = { properties: [], listings: [], versions: [], propertyListings: [] };

  PROPERTY_SEEDS.forEach((seed, propertyIndex) => {
    const active = seed.listings.filter((listing) => listing.status === 'active');
    // Decisión 109: el precio mostrado es el mínimo de los activos; sin
    // activos, el mínimo de todos (solo alcanzable desde el detalle).
    const pricePool = active.length > 0 ? active : seed.listings;
    // Un tombstone redacta la descripción (decisión 107); un inactivo reciente no.
    const hasContent = seed.listings.some((listing) => listing.status !== 'removed');

    fixture.properties.push({
      id: seed.id,
      locationId: E2E_GETAFE.locationId,
      location: seed.location,
      minPriceCents: Math.min(...pricePool.map((listing) => listing.priceCents)),
      surfaceM2: seed.surfaceM2,
      rooms: seed.rooms,
      propertyType: seed.propertyType,
      operation: seed.operation,
      address: seed.address,
      bathrooms: seed.bathrooms,
      floor: seed.floor,
      title: seed.title,
      description: hasContent ? `${seed.title}. Datos ficticios del dataset e2e.` : null,
      // La consolidación copia la miniatura del ganador, el primer anuncio.
      thumbnailUrl: seed.listings[0]?.thumbnailUrl ?? null,
      listingCount: seed.listings.length,
      activeListingCount: active.length,
      consolidatedAt: SEEN_AT,
      createdAt: SEEN_AT,
      // `updated_at` distinto por vivienda: fija el orden por defecto de la búsqueda.
      updatedAt: new Date(SEEN_AT.getTime() + (PROPERTY_SEEDS.length - propertyIndex) * 60_000),
    });

    for (const listing of seed.listings) {
      const ordinal = fixture.listings.length + 1;
      const removed = listing.status === 'removed';
      const inactive = listing.status === 'inactive';
      const versionId = e2eUuid(0x50 + ordinal);

      fixture.listings.push({
        id: listing.id,
        sourceId: E2E_SOURCE_IDS[listing.source],
        externalId: `e2e-${String(ordinal)}`,
        locationId: E2E_GETAFE.locationId,
        url: `https://e2e.invalid/${listing.source}/${String(ordinal)}`,
        location: seed.location,
        coordinatesObfuscated: false,
        thumbnailUrl: listing.thumbnailUrl ?? null,
        numPhotos: removed ? null : 8,
        status: listing.status,
        inactiveSince: removed ? INACTIVE_SINCE : inactive ? RECENTLY_INACTIVE_SINCE : null,
        inactiveReason: removed || inactive ? 'delisted' : null,
        tombstonedAt: removed ? TOMBSTONED_AT : null,
        firstSeenAt: SEEN_AT,
        lastSeenAt: removed ? REMOVED_LAST_SEEN_AT : inactive ? INACTIVE_LAST_SEEN_AT : SEEN_AT,
        createdAt: SEEN_AT,
        updatedAt: SEEN_AT,
      });

      fixture.versions.push({
        id: versionId,
        listingId: listing.id,
        version: 1,
        isCurrent: true,
        priceCents: listing.priceCents,
        surfaceM2: seed.surfaceM2,
        rooms: seed.rooms,
        bathrooms: seed.bathrooms,
        floor: seed.floor,
        title: seed.title,
        // Tombstone (decisión 107): descripción y `raw` redactados.
        description: removed ? null : `${seed.title}. Anuncio ficticio de ${listing.source}.`,
        address: seed.address,
        propertyType: seed.propertyType,
        operation: seed.operation,
        raw: removed ? null : { fixture: 'e2e', source: listing.source },
        capturedAt: SEEN_AT,
        createdAt: SEEN_AT,
      });

      fixture.propertyListings.push({
        id: e2eUuid(0x60 + ordinal),
        propertyId: seed.id,
        listingId: listing.id,
        score: 0.97,
        strategyName: 'e2e-fixture',
        strategyVersion: '1',
        signals: {
          distance: { value: 1, weight: 0.5, detail: 'coordenadas de fixture' },
          price: { value: 0.94, weight: 0.5, detail: 'precio de fixture' },
        },
        scoredListingVersionId: versionId,
        decidedAt: SEEN_AT,
      });
    }
  });

  return {
    sources: [
      {
        id: E2E_SOURCE_IDS.idealista,
        key: 'idealista',
        name: 'Idealista',
        kind: 'api',
        isActive: true,
        createdAt: SEEN_AT,
        updatedAt: SEEN_AT,
      },
      {
        id: E2E_SOURCE_IDS.kyero,
        key: 'kyero',
        name: 'Kyero',
        kind: 'scrape',
        isActive: true,
        createdAt: SEEN_AT,
        updatedAt: SEEN_AT,
      },
    ],
    location: {
      id: E2E_GETAFE.locationId,
      ineCode: E2E_GETAFE.ineCode,
      municipality: 'Getafe',
      province: 'Madrid',
      provinceCode: '28',
      autonomousCommunity: 'Comunidad de Madrid',
      centroid: geographyPointWkt(GETAFE_CENTROID),
      sweepRadiusM: GETAFE_SWEEP_RADIUS_M,
      searchName: normalizeSearchName('Getafe'),
      createdAt: SEEN_AT,
    },
    zone: {
      id: E2E_GETAFE.zoneId,
      locationId: E2E_GETAFE.locationId,
      state: 'covered',
      lastSweptAt: SEEN_AT,
      createdAt: SEEN_AT,
      updatedAt: SEEN_AT,
    },
    ...fixture,
  };
}
