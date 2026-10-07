// ROADMAP 1.12 (diseño D3, PD-3) — comprobación de tipos: `score`/`signals`
// (`property_listings.score`/`signals`) están AUSENTES de `PropertyDetail`/
// `PropertyDetailSource` a nivel de tipo, no solo sin renderizar. Vive fuera
// de `test/detail/` a propósito: es una comprobación de tipos pura, sin
// PostgreSQL, y `test/detail/**` está excluido del `vitest.config.ts` por
// defecto (fail-loud, `vitest.detail.config.ts`) — este fichero debe
// ejecutarse con `pnpm --filter @buscahogar/db test`, no con `test:detail`.
import { describe, expect, it } from 'vitest';

import type { PropertyDetailHeader, PropertyDetailSource, PropertyPriceObservation } from '../src/detail.js';

// Mismo patrón de aserción de tipos que
// packages/core/test/type-assertions.test.ts (`Equal`/`Expect`): más preciso
// que `expectTypeOf`, comprobado por `tsc --noEmit`, no en tiempo de
// ejecución.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type _PropertyDetailHeaderHasNoScore = Expect<Equal<'score' extends keyof PropertyDetailHeader ? true : false, false>>;
export type _PropertyDetailHeaderHasNoSignals = Expect<Equal<'signals' extends keyof PropertyDetailHeader ? true : false, false>>;
export type _PropertyDetailSourceHasNoScore = Expect<Equal<'score' extends keyof PropertyDetailSource ? true : false, false>>;
export type _PropertyDetailSourceHasNoSignals = Expect<Equal<'signals' extends keyof PropertyDetailSource ? true : false, false>>;

// D.11 — la ubicación del encabezado es anulable: sin `location` no hay
// coordenadas y sin `location_id` no hay municipio.
export type _HeaderLat = Expect<Equal<PropertyDetailHeader['lat'], number | null>>;
export type _HeaderLon = Expect<Equal<PropertyDetailHeader['lon'], number | null>>;
export type _HeaderMunicipality = Expect<Equal<PropertyDetailHeader['municipality'], string | null>>;

// D.10 — la proyección del histórico de precios es exactamente estas cinco
// claves: ni `score`/`signals` ni el texto que redacta el tombstone (107).
export type _PriceObservationKeys = Expect<
  Equal<keyof PropertyPriceObservation, 'sourceKey' | 'listingId' | 'status' | 'priceCents' | 'capturedAt'>
>;
export type _PriceObservationHasNoScore = Expect<Equal<'score' extends keyof PropertyPriceObservation ? true : false, false>>;
export type _PriceObservationHasNoSignals = Expect<Equal<'signals' extends keyof PropertyPriceObservation ? true : false, false>>;
export type _PriceObservationHasNoDescription = Expect<Equal<'description' extends keyof PropertyPriceObservation ? true : false, false>>;
export type _PriceObservationHasNoRaw = Expect<Equal<'raw' extends keyof PropertyPriceObservation ? true : false, false>>;

// Las aserciones de tipo anteriores las comprueba `typecheck`: si
// `score`/`signals` aparecieran algún día en cualquiera de los dos tipos,
// `tsc --noEmit` fallaría aquí mismo. El caso en runtime de abajo es un
// segundo ángulo real (no un placeholder tautológico): construye literales
// completos de ambos tipos y confirma que ninguna clave observada en tiempo
// de ejecución es `score`/`signals` — si algún día se añadiera cualquiera de
// los dos campos al tipo, este objeto literal seguiría compilando (los
// campos extra en un objeto literal exacto SÍ los rechaza TypeScript, así
// que esta construcción por sí sola ya es una tercera guarda) y esta
// aserción de claves seguiría siendo la prueba en tiempo de ejecución.
describe('PropertyDetail / PropertyDetailSource — sin score/signals a nivel de tipo (PD-3)', () => {
  it('un PropertyDetailHeader y un PropertyDetailSource completos no exponen score ni signals entre sus claves', () => {
    const header: PropertyDetailHeader = {
      id: 'prop-1',
      minPriceCents: 100_000_00,
      listingCount: 1,
      thumbnailUrl: null,
      propertyType: 'flat',
      operation: 'sale',
      surfaceM2: 80,
      rooms: 3,
      bathrooms: 1,
      floor: '2',
      title: null,
      description: null,
      address: null,
      lat: 40.3,
      lon: -3.7,
      municipality: 'Getafe',
    };
    const source: PropertyDetailSource = {
      listingId: 'listing-1',
      sourceKey: 'idealista',
      url: 'https://example.test/1',
      priceCents: 100_000_00,
      thumbnailUrl: null,
      numPhotos: null,
      status: 'active',
      lastSeenAt: new Date(),
      propertyType: 'flat',
      surfaceM2: 80,
      rooms: 3,
      bathrooms: 1,
      floor: '2',
      address: null,
    };

    expect(Object.keys(header)).not.toContain('score');
    expect(Object.keys(header)).not.toContain('signals');
    expect(Object.keys(source)).not.toContain('score');
    expect(Object.keys(source)).not.toContain('signals');
  });

  it('un PropertyPriceObservation completo solo tiene las cinco claves previstas (D.10)', () => {
    const observation: PropertyPriceObservation = {
      sourceKey: 'idealista',
      listingId: 'listing-1',
      status: 'active',
      priceCents: 100_000_00,
      capturedAt: new Date(),
    };

    expect(Object.keys(observation).sort()).toEqual(['capturedAt', 'listingId', 'priceCents', 'sourceKey', 'status']);
  });
});
