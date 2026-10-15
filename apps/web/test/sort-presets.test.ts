// D.18 (decisión 227, C-9) — ordenaciones predefinidas. Lógica pura: sin Next ni ORM.
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SORT_PRESET,
  SORT_PRESETS,
  sortPresetById,
  sortPresetFor,
} from '../src/lib/sort-presets.js';

describe('SORT_PRESETS — rótulos C-9 literales y orden', () => {
  it('son cinco, en este orden, con estos ids, rótulos y pares sort/dir', () => {
    expect(SORT_PRESETS.map((p) => [p.id, p.label, p.sort, p.dir])).toEqual([
      ['recent', 'Más recientes', 'updated', 'desc'],
      ['price-asc', 'Precio: de menor a mayor', 'price', 'asc'],
      ['price-desc', 'Precio: de mayor a menor', 'price', 'desc'],
      ['surface-desc', 'Superficie: de mayor a menor', 'surface', 'desc'],
      ['surface-asc', 'Superficie: de menor a mayor', 'surface', 'asc'],
    ]);
  });

  it('el predefinido es «Más recientes» (updated/desc, el del esquema)', () => {
    expect(DEFAULT_SORT_PRESET.id).toBe('recent');
    expect(DEFAULT_SORT_PRESET.sort).toBe('updated');
    expect(DEFAULT_SORT_PRESET.dir).toBe('desc');
  });
});

describe('sortPresetById', () => {
  it('resuelve un id conocido y rechaza el resto, incluidos nombres heredados del prototipo', () => {
    expect(sortPresetById('price-asc')?.label).toBe('Precio: de menor a mayor');
    expect(sortPresetById('surface-asc')?.sort).toBe('surface');
    expect(sortPresetById('nope')).toBeUndefined();
    expect(sortPresetById('toString')).toBeUndefined();
    expect(sortPresetById('')).toBeUndefined();
  });
});

describe('sortPresetFor — par sort/dir efectivo', () => {
  it('sin sort ni dir es el predefinido', () => {
    expect(sortPresetFor(undefined, undefined)?.id).toBe('recent');
  });

  it('sort sin dir usa el sentido por defecto (desc)', () => {
    expect(sortPresetFor('price', undefined)?.id).toBe('price-desc');
    expect(sortPresetFor('surface', undefined)?.id).toBe('surface-desc');
  });

  it('un par con preset lo encuentra', () => {
    expect(sortPresetFor('price', 'asc')?.id).toBe('price-asc');
    expect(sortPresetFor('surface', 'asc')?.id).toBe('surface-asc');
  });

  it('un par sin preset (updated/asc) no activa ninguno', () => {
    expect(sortPresetFor('updated', 'asc')).toBeUndefined();
  });

  it('valores desconocidos no activan ninguno', () => {
    expect(sortPresetFor('x', 'desc')).toBeUndefined();
    expect(sortPresetFor('price', 'sideways')).toBeUndefined();
  });
});
