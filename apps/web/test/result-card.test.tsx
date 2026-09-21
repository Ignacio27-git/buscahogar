// ROADMAP 1.12 (diseño D4/D9; arbitraje obs #193 AR-4) — el ancla es
// `string | null` (`min(listingId)` sobre un conjunto de miembros vacío da
// NULL en SQL): la tarjeta enlaza cuando hay ancla y degrada a la tarjeta de
// hoy (sin enlace) cuando no la hay — nunca un `href` roto o vacío.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PropertySearchResult } from '@buscahogar/db';

import { ResultCard } from '../src/components/result-card.js';

function makeResult(overrides: Partial<PropertySearchResult>): PropertySearchResult {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    operation: 'sale',
    propertyType: 'flat',
    minPriceCents: 100000,
    surfaceM2: 90,
    rooms: 3,
    bathrooms: 2,
    address: 'Calle Mayor 1',
    floor: '3',
    title: 'Piso',
    description: null,
    thumbnailUrl: null,
    updatedAt: new Date('2026-09-10T00:00:00Z'),
    distinctSourceCount: 1,
    anchorListingId: null,
    ...overrides,
  };
}

describe('ResultCard (D4/D9, AR-4) — enlace condicionado al ancla', () => {
  it('con ancla presente, la raíz es (o envuelve) un <a href="/properties/{anchor}">', () => {
    const result = makeResult({ anchorListingId: 'bbbbbbbb-0000-0000-0000-000000000002' });
    const html = renderToStaticMarkup(<ResultCard result={result} />);

    expect(html).toContain('href="/properties/bbbbbbbb-0000-0000-0000-000000000002"');
  });

  it('con ancla null, degrada exactamente a la tarjeta de hoy — sin <a>', () => {
    const result = makeResult({ anchorListingId: null });
    const html = renderToStaticMarkup(<ResultCard result={result} />);

    expect(html).not.toContain('<a ');
  });

  it('el texto "Disponible en N fuentes" no cambia en ninguna de las dos ramas', () => {
    const linked = renderToStaticMarkup(
      <ResultCard result={makeResult({ anchorListingId: 'bbbbbbbb-0000-0000-0000-000000000002', distinctSourceCount: 2 })} />
    );
    const plain = renderToStaticMarkup(<ResultCard result={makeResult({ anchorListingId: null, distinctSourceCount: 2 })} />);

    expect(linked).toContain('Disponible en 2 fuentes');
    expect(plain).toContain('Disponible en 2 fuentes');
  });
});
