// D.9 (decisión 176) — número de fuentes de la ficha: fuentes DISTINTAS con al
// menos un anuncio activo. Función pura: sin red ni base de datos.
import { describe, expect, it } from 'vitest';

import { countActiveSources } from '../src/lib/count-active-sources.js';

describe('countActiveSources — D.9', () => {
  it('sin fuentes da 0', () => {
    expect(countActiveSources([])).toBe(0);
  });

  it('un anuncio activo cuenta su fuente', () => {
    expect(countActiveSources([{ sourceKey: 'idealista', status: 'active' }])).toBe(1);
  });

  it('un anuncio retirado o inactivo no cuenta', () => {
    expect(
      countActiveSources([
        { sourceKey: 'idealista', status: 'active' },
        { sourceKey: 'kyero', status: 'removed' },
      ])
    ).toBe(1);
    expect(countActiveSources([{ sourceKey: 'kyero', status: 'inactive' }])).toBe(0);
  });

  it('solo anuncios no activos da 0', () => {
    expect(
      countActiveSources([
        { sourceKey: 'idealista', status: 'inactive' },
        { sourceKey: 'kyero', status: 'inactive' },
      ])
    ).toBe(0);
  });

  it('dos anuncios activos de la misma fuente cuentan como una', () => {
    expect(
      countActiveSources([
        { sourceKey: 'idealista', status: 'active' },
        { sourceKey: 'idealista', status: 'active' },
      ])
    ).toBe(1);
  });

  it('una fuente con un anuncio activo y otro retirado cuenta una vez', () => {
    expect(
      countActiveSources([
        { sourceKey: 'idealista', status: 'removed' },
        { sourceKey: 'idealista', status: 'active' },
      ])
    ).toBe(1);
  });

  it('anuncios activos de fuentes distintas cuentan cada fuente', () => {
    expect(
      countActiveSources([
        { sourceKey: 'idealista', status: 'active' },
        { sourceKey: 'kyero', status: 'active' },
      ])
    ).toBe(2);
  });
});
