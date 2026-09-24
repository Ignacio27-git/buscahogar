// ROADMAP 1.12 (diseño D8, arbitraje obs #193 AR-8, addendum obs #194 AR-13)
// — cabecera consolidada como componente presentacional SÍNCRONO propio,
// para que quede dentro del alcance del arnés `renderToStaticMarkup` (AR-9):
// la página async solo compone, nunca renderiza markup de cabecera
// directamente.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertyDetailHeader } from '@buscahogar/db';

import { PropertyHeader } from '../src/components/property-header.js';

const FULL_HEADER: PropertyDetailHeader = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  minPriceCents: 15000000,
  listingCount: 2,
  thumbnailUrl: 'https://img4.idealista.com/foo.jpg',
  propertyType: 'flat',
  operation: 'sale',
  surfaceM2: 90,
  rooms: 3,
  bathrooms: 2,
  floor: '3',
  title: 'Piso luminoso en el centro',
  description: 'Descripción larga del piso.',
  address: 'Calle Mayor 1',
};

describe('PropertyHeader (D8/AR-8) — atributo consolidado NULL, dos estados', () => {
  it('cuando bathrooms es NULL, muestra el indicador explícito, no un hueco en blanco', () => {
    const header: PropertyDetailHeader = { ...FULL_HEADER, bathrooms: null };
    const html = renderToStaticMarkup(<PropertyHeader property={header} />);

    expect(html).toContain('No consolidado — ver anuncios de origen');
  });

  it('cuando bathrooms tiene valor, muestra el valor y no el indicador', () => {
    const html = renderToStaticMarkup(<PropertyHeader property={FULL_HEADER} />);

    expect(html).toContain('2 baños');
    expect(html).not.toContain('No consolidado');
  });

  it('propertyType NULL también muestra el indicador explícito (spec lo nombra por su nombre)', () => {
    const header: PropertyDetailHeader = { ...FULL_HEADER, propertyType: null };
    const html = renderToStaticMarkup(<PropertyHeader property={header} />);

    expect(html).toContain('No consolidado — ver anuncios de origen');
  });

  it('el precio consolidado se formatea como el más económico del grupo', () => {
    const html = renderToStaticMarkup(<PropertyHeader property={FULL_HEADER} />);

    // `.toLocaleString('es-ES')` en este runtime (Node 22, ICU completo)
    // aplica la regla CLDR "min2": el separador de miles solo aparece
    // cuando quedan ≥2 dígitos por delante del último grupo de 3 — de ahí
    // que se use un precio de 6 cifras y no uno de 4, que se
    // formatearía sin punto.
    expect(html).toContain('150.000 €');
  });

  it('minPriceCents NULL no revienta el render y muestra el texto de fallback', () => {
    const header: PropertyDetailHeader = { ...FULL_HEADER, minPriceCents: null };
    const html = renderToStaticMarkup(<PropertyHeader property={header} />);

    expect(html).toContain('Precio no disponible');
  });

  it('listingCount se muestra con la regla singular/plural existente en result-card', () => {
    const singleSource: PropertyDetailHeader = { ...FULL_HEADER, listingCount: 1 };
    const html = renderToStaticMarkup(<PropertyHeader property={singleSource} />);

    expect(html).toContain('Disponible en 1 fuente');
    expect(html).not.toContain('1 fuentes');
  });
});
