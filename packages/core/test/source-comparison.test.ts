// D.12 — comparación pura de los anuncios de origen de una vivienda: cuál fija
// el precio mostrado (decisión 109: mínimo de los activos; sin ninguno activo,
// mínimo de todos) y cuáles se destacan.
import { describe, expect, it } from 'vitest';

import { compareSourceListings } from '../src/index.js';
import type { SourceListingSnapshot } from '../src/index.js';

function snap(
  listingId: string,
  priceCents: number,
  overrides: Partial<SourceListingSnapshot> = {}
): SourceListingSnapshot {
  return {
    listingId,
    status: 'active',
    priceCents,
    lastSeenAt: new Date(Date.UTC(2026, 8, 10)),
    ...overrides,
  };
}

describe('compareSourceListings — modo activo', () => {
  it('con un solo anuncio activo lo destaca y fija el precio', () => {
    const result = compareSourceListings([snap('a', 8_500_000)]);

    expect(result).toEqual({
      mode: 'active',
      priceCents: 8_500_000,
      primaryId: 'a',
      highlightedIds: ['a'],
    });
  });

  it('destaca solo el activo más barato cuando los precios difieren', () => {
    const result = compareSourceListings([snap('a', 8_700_000), snap('b', 8_500_000)]);

    expect(result.mode).toBe('active');
    expect(result.highlightedIds).toEqual(['b']);
    expect(result).toMatchObject({ priceCents: 8_500_000, primaryId: 'b' });
  });

  it('ignora un anuncio inactivo más barato que el activo', () => {
    const result = compareSourceListings([
      snap('a', 9_000_000),
      snap('b', 7_000_000, { status: 'inactive' }),
    ]);

    expect(result.highlightedIds).toEqual(['a']);
    expect(result).toMatchObject({ mode: 'active', priceCents: 9_000_000, primaryId: 'a' });
  });

  it('ignora un anuncio retirado más barato que el activo', () => {
    const result = compareSourceListings([
      snap('a', 9_000_000),
      snap('b', 7_000_000, { status: 'removed' }),
    ]);

    expect(result.highlightedIds).toEqual(['a']);
  });

  it('un estado desconocido no cuenta como activo', () => {
    const result = compareSourceListings([
      snap('a', 9_000_000),
      snap('b', 7_000_000, { status: 'pending-review' }),
    ]);

    expect(result.mode).toBe('active');
    expect(result.highlightedIds).toEqual(['a']);
  });

  it('un empate de dos activos destaca ambos en el orden de entrada', () => {
    const result = compareSourceListings([snap('b', 8_500_000), snap('a', 8_500_000)]);

    expect(result.highlightedIds).toEqual(['b', 'a']);
  });

  it('un empate de tres activos destaca los tres y deja fuera al más caro', () => {
    const result = compareSourceListings([
      snap('a', 8_500_000),
      snap('d', 9_900_000),
      snap('b', 8_500_000),
      snap('c', 8_500_000),
    ]);

    expect(result.highlightedIds).toEqual(['a', 'b', 'c']);
  });
});

describe('compareSourceListings — anuncio principal', () => {
  it('elige el visto más recientemente entre los empatados', () => {
    const result = compareSourceListings([
      snap('a', 8_500_000, { lastSeenAt: new Date(Date.UTC(2026, 8, 1)) }),
      snap('b', 8_500_000, { lastSeenAt: new Date(Date.UTC(2026, 8, 20)) }),
    ]);

    expect(result).toMatchObject({ primaryId: 'b' });
    expect(result.highlightedIds).toEqual(['a', 'b']);
  });

  it('a igual fecha de avistamiento gana el listingId menor', () => {
    const result = compareSourceListings([snap('z', 8_500_000), snap('m', 8_500_000)]);

    expect(result).toMatchObject({ primaryId: 'm' });
  });

  it('el desempate por listingId no depende del orden de entrada', () => {
    const forward = compareSourceListings([snap('m', 8_500_000), snap('z', 8_500_000)]);
    const reverse = compareSourceListings([snap('z', 8_500_000), snap('m', 8_500_000)]);

    expect(forward).toMatchObject({ primaryId: 'm' });
    expect(reverse).toMatchObject({ primaryId: 'm' });
  });
});

describe('compareSourceListings — ninguno activo', () => {
  it('toma el mínimo de todos los anuncios', () => {
    const result = compareSourceListings([
      snap('a', 9_000_000, { status: 'inactive' }),
      snap('b', 7_500_000, { status: 'removed' }),
    ]);

    expect(result).toEqual({
      mode: 'none-active',
      priceCents: 7_500_000,
      primaryId: 'b',
      highlightedIds: ['b'],
    });
  });

  it('destaca todos los empatados en el mínimo y elige el principal por avistamiento', () => {
    const result = compareSourceListings([
      snap('a', 7_500_000, { status: 'inactive', lastSeenAt: new Date(Date.UTC(2026, 7, 1)) }),
      snap('b', 7_500_000, { status: 'removed', lastSeenAt: new Date(Date.UTC(2026, 7, 15)) }),
      snap('c', 8_000_000, { status: 'removed' }),
    ]);

    expect(result.mode).toBe('none-active');
    expect(result.highlightedIds).toEqual(['a', 'b']);
    expect(result).toMatchObject({ priceCents: 7_500_000, primaryId: 'b' });
  });
});

describe('compareSourceListings — entrada vacía y pureza', () => {
  it('una lista vacía devuelve el modo empty sin destacados y sin lanzar', () => {
    const result = compareSourceListings([]);

    expect(result).toEqual({ mode: 'empty', highlightedIds: [] });
  });

  it('no muta la entrada', () => {
    const input = [snap('b', 8_500_000), snap('a', 8_500_000), snap('c', 9_000_000)];
    const copy = input.map((s) => ({ ...s }));

    compareSourceListings(input);

    expect(input).toEqual(copy);
  });
});
