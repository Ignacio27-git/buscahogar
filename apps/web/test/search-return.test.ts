// D.9 (decisión 171) — el enlace de vuelta de la ficha revalida con los
// esquemas de búsqueda. Todo o nada: cualquier valor inválido da `/`.
import { describe, expect, it } from 'vitest';

import { resolveSearchReturnLink } from '../src/lib/search-return.js';

const BACK_TO_SEARCH = { href: '/', label: 'Volver a la búsqueda' };

describe('resolveSearchReturnLink — D.9', () => {
  it('reconstruye /? con las claves válidas y el texto «Volver a los resultados»', () => {
    expect(
      resolveSearchReturnLink({ operation: 'sale', minPrice: '100000', sort: 'price', dir: 'asc', view: 'map' })
    ).toEqual({
      href: '/?operation=sale&minPrice=100000&sort=price&dir=asc&view=map',
      label: 'Volver a los resultados',
    });
  });

  it('conserva page cuando es válida', () => {
    expect(resolveSearchReturnLink({ operation: 'sale', page: '3' }).href).toBe('/?operation=sale&page=3');
  });

  it('sin claves de búsqueda enlaza a /', () => {
    expect(resolveSearchReturnLink({})).toEqual(BACK_TO_SEARCH);
  });

  it('ignora las claves desconocidas y q/zoneQuery', () => {
    expect(resolveSearchReturnLink({ evil: '1', sort: 'price' }).href).toBe('/?sort=price');
    expect(resolveSearchReturnLink({ q: 'piso', zoneQuery: 'x' })).toEqual(BACK_TO_SEARCH);
  });

  it('un valor inválido tumba todo el conjunto: no se rescata el válido', () => {
    expect(resolveSearchReturnLink({ sort: '<script>', minPrice: '100000' })).toEqual(BACK_TO_SEARCH);
  });

  it('una clave repetida (array) cae a /', () => {
    expect(resolveSearchReturnLink({ operation: ['sale', 'rent'] })).toEqual(BACK_TO_SEARCH);
  });

  it('un valor vacío cae a /', () => {
    expect(resolveSearchReturnLink({ minPrice: '', operation: 'sale' })).toEqual(BACK_TO_SEARCH);
    expect(resolveSearchReturnLink({ view: '' })).toEqual(BACK_TO_SEARCH);
  });

  it('view=//evil.com cae a / y nunca apunta fuera del origen', () => {
    const link = resolveSearchReturnLink({ view: '//evil.com', operation: 'sale' });
    expect(link).toEqual(BACK_TO_SEARCH);
    expect(link.href.startsWith('//')).toBe(false);
  });

  it('minPrice mayor que maxPrice (fallo entre campos) cae a /', () => {
    expect(resolveSearchReturnLink({ minPrice: '200000', maxPrice: '100000' })).toEqual(BACK_TO_SEARCH);
  });
});
