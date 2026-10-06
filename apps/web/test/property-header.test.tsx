// ROADMAP 1.12 (diseño D8, arbitraje obs #193 AR-8, addendum obs #194 AR-13)
// — cabecera consolidada como componente presentacional SÍNCRONO propio,
// para que quede dentro del alcance del arnés `renderToStaticMarkup` (AR-9):
// la página async solo compone, nunca renderiza markup de cabecera
// directamente.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertyDetailHeader } from '@buscahogar/db';

import { PropertyHeader, PropertySummary, resolvePropertyTitle } from '../src/components/property-header.js';

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

    expect(html).toMatch(/Baños<\/dt><dd[^>]*>2</);
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

// D.9 (decisiones 173 y 174) — datos clave como <dl>, un único aviso y precio por punto de corte.
describe('PropertyHeader (D.9) — datos clave y aviso único', () => {
  it('muestra los rótulos en español, nunca las claves crudas', () => {
    const html = renderToStaticMarkup(<PropertyHeader property={FULL_HEADER} />);

    expect(html).toMatch(/Tipo<\/dt><dd[^>]*>Piso</);
    expect(html).toMatch(/Operación<\/dt><dd[^>]*>Venta</);
    expect(html).not.toMatch(/>flat</);
    expect(html).not.toMatch(/>sale</);
  });

  it('la planta usa los rótulos naturales y un código desconocido cuenta como dato que falta', () => {
    const floorOf = (floor: string): string =>
      renderToStaticMarkup(<PropertyHeader property={{ ...FULL_HEADER, floor }} />);

    expect(floorOf('3')).toMatch(/Planta<\/dt><dd[^>]*>3\.ª</);
    expect(floorOf('bj')).toMatch(/Planta<\/dt><dd[^>]*>Bajo</);
    expect(floorOf('en')).toMatch(/Planta<\/dt><dd[^>]*>Entresuelo</);
    expect(floorOf('bj')).not.toContain('Planta bajo');
    const unknown = floorOf('zz');
    expect(unknown).not.toContain('zz');
    expect(unknown).toContain('Sin dato');
  });

  it('cada dato que falta lleva «—» visible y «Sin dato» solo para lectores de pantalla', () => {
    const header: PropertyDetailHeader = { ...FULL_HEADER, rooms: null, bathrooms: null };
    const html = renderToStaticMarkup(<PropertyHeader property={header} />);

    expect(html.match(/<span class="sr-only">Sin dato<\/span>/g)).toHaveLength(2);
    expect(html).toMatch(/Habitaciones<\/dt><dd[^>]*><span aria-hidden="true">—<\/span>/);
  });

  it('el aviso aparece una sola vez aunque falten varios datos y «No consolidado» no aparece en otro sitio', () => {
    const header: PropertyDetailHeader = { ...FULL_HEADER, rooms: null, bathrooms: null, address: null };
    const html = renderToStaticMarkup(<PropertyHeader property={header} />);

    expect(html.match(/No consolidado/g)).toHaveLength(1);
    expect(html.indexOf('No consolidado')).toBeGreaterThan(html.indexOf('</dl>'));
  });

  it('sin datos que falten no hay «—» ni aviso', () => {
    const html = renderToStaticMarkup(<PropertyHeader property={FULL_HEADER} />);

    expect(html).not.toContain('—');
    expect(html).not.toContain('Sin dato');
  });

  it('la descripción ya no se pinta en la cabecera', () => {
    const html = renderToStaticMarkup(<PropertyHeader property={FULL_HEADER} />);

    expect(html).not.toContain('Descripción larga del piso.');
  });
});

describe('PropertySummary (D.9) — precio por punto de corte', () => {
  it('lleva el gancho de cada copia, con cifras tabulares en el precio', () => {
    const lead = renderToStaticMarkup(<PropertySummary property={FULL_HEADER} placement="lead" />);
    const panel = renderToStaticMarkup(<PropertySummary property={FULL_HEADER} placement="panel" />);

    expect(lead).toContain('property-summary property-summary--lead');
    expect(panel).toContain('property-summary property-summary--panel');
    expect(lead).toMatch(/<p class="property-summary__price tabular-nums">150\.000 €<\/p>/);
    expect(lead).toContain('Disponible en 2 fuentes');
  });

  it('el precio ausente usa la variante discreta', () => {
    const html = renderToStaticMarkup(
      <PropertySummary property={{ ...FULL_HEADER, minPriceCents: null }} placement="lead" />
    );

    expect(html).toContain('property-summary__price--missing');
    expect(html).toContain('Precio no disponible');
  });
});

describe('resolvePropertyTitle (D.9)', () => {
  it('recorta el título y usa «Ficha de la vivienda» si es nulo, vacío o en blanco', () => {
    expect(resolvePropertyTitle('  Piso luminoso ')).toBe('Piso luminoso');
    expect(resolvePropertyTitle(null)).toBe('Ficha de la vivienda');
    expect(resolvePropertyTitle('   ')).toBe('Ficha de la vivienda');
  });
});
