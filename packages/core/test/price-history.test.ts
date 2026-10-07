// D.10 — derivación pura del histórico de precios: agrupa por anuncio, une
// versiones consecutivas con el mismo precio y calcula la variación con
// enteros.
import { describe, expect, it } from 'vitest';

import { derivePriceHistory, priceChangePercentTenths } from '../src/index.js';
import type { PriceObservation } from '../src/index.js';

function obs(
  listingId: string,
  priceCents: number,
  day: number,
  overrides: Partial<PriceObservation> = {}
): PriceObservation {
  return {
    sourceKey: 'idealista',
    listingId,
    status: 'active',
    priceCents,
    capturedAt: new Date(Date.UTC(2026, 0, day, 10)),
    ...overrides,
  };
}

describe('derivePriceHistory — agrupación y orden', () => {
  it('agrupa por anuncio filas intercaladas y conserva el orden cronológico dentro de cada uno', () => {
    const result = derivePriceHistory([
      obs('a', 300_000, 1),
      obs('b', 500_000, 2),
      obs('a', 290_000, 3),
      obs('b', 480_000, 4),
    ]);

    expect(result.series.map((s) => s.listingId).sort()).toEqual(['a', 'b']);
    const a = result.series.find((s) => s.listingId === 'a');
    expect(a?.points.map((p) => p.priceCents)).toEqual([300_000, 290_000]);
    const b = result.series.find((s) => s.listingId === 'b');
    expect(b?.points.map((p) => p.priceCents)).toEqual([500_000, 480_000]);
  });

  it('ordena por capturedAt aunque la entrada venga desordenada', () => {
    const result = derivePriceHistory([obs('a', 290_000, 3), obs('a', 300_000, 1)]);

    expect(result.series[0]?.points.map((p) => p.priceCents)).toEqual([300_000, 290_000]);
  });

  it('los empates de capturedAt conservan el orden de entrada (orden de versión)', () => {
    const result = derivePriceHistory([obs('a', 300_000, 1), obs('a', 310_000, 1), obs('a', 320_000, 1)]);

    expect(result.series[0]?.points.map((p) => p.priceCents)).toEqual([300_000, 310_000, 320_000]);
  });

  it('cada serie lleva sourceKey y status de su anuncio', () => {
    const result = derivePriceHistory([obs('a', 1, 1, { sourceKey: 'kyero', status: 'removed' })]);

    expect(result.series[0]).toMatchObject({ listingId: 'a', sourceKey: 'kyero', status: 'removed' });
  });
});

describe('derivePriceHistory — colapso de precios iguales consecutivos', () => {
  it('300000, 300000, 290000 deja dos puntos', () => {
    const result = derivePriceHistory([obs('a', 300_000, 1), obs('a', 300_000, 2), obs('a', 290_000, 3)]);

    expect(result.series[0]?.points.map((p) => p.priceCents)).toEqual([300_000, 290_000]);
    // El punto conservado es el primero de los iguales.
    expect(result.series[0]?.points[0]?.capturedAt.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });

  it('300000, 290000, 300000 deja tres puntos (solo colapsan los consecutivos)', () => {
    const result = derivePriceHistory([obs('a', 300_000, 1), obs('a', 290_000, 2), obs('a', 300_000, 3)]);

    expect(result.series[0]?.points.map((p) => p.priceCents)).toEqual([300_000, 290_000, 300_000]);
  });

  it('una versión forzada por la redacción del tombstone (mismo precio) se colapsa', () => {
    const result = derivePriceHistory([
      obs('a', 100_000, 1, { status: 'removed' }),
      obs('a', 100_000, 2, { status: 'removed' }),
    ]);

    expect(result.series[0]?.points).toHaveLength(1);
  });
});

describe('derivePriceHistory — variación', () => {
  it('la primera observación no tiene variación', () => {
    const result = derivePriceHistory([obs('a', 300_000, 1)]);

    expect(result.series[0]?.points[0]).toMatchObject({ deltaCents: null, percentTenths: null });
  });

  it('el delta es respecto al punto conservado anterior del mismo anuncio', () => {
    const result = derivePriceHistory([
      obs('a', 300_000, 1),
      obs('b', 100_000, 2),
      obs('a', 285_000, 3),
      obs('a', 300_000, 4),
    ]);

    const a = result.series.find((s) => s.listingId === 'a');
    expect(a?.points.map((p) => p.deltaCents)).toEqual([null, -15_000, 15_000]);
    expect(a?.points[1]?.percentTenths).toBe(-50);
    expect(a?.points[2]?.percentTenths).toBe(53); // 15000*1000/285000 = 52,6 -> 53
  });

  it('el precio de la tabla del diseño: 90000 -> 85000 da -56 décimas', () => {
    const result = derivePriceHistory([obs('a', 90_000, 1), obs('a', 85_000, 2)]);

    expect(result.series[0]?.points[1]).toMatchObject({ deltaCents: -5_000, percentTenths: -56 });
  });
});

describe('priceChangePercentTenths', () => {
  it('redondea 55,6 a 56 y -55,6 a -56', () => {
    expect(priceChangePercentTenths(90_000, 95_000)).toBe(56);
    expect(priceChangePercentTenths(90_000, 85_000)).toBe(-56);
  });

  it('redondea 11,4 a 11', () => {
    expect(priceChangePercentTenths(88_000, 87_000)).toBe(-11);
  });

  it('la mitad exacta se redondea lejos de cero en ambos signos', () => {
    // 1*1000/2000 = 0,5 décimas -> 1; el negativo -> -1.
    expect(priceChangePercentTenths(2_000, 2_001)).toBe(1);
    expect(priceChangePercentTenths(2_000, 1_999)).toBe(-1);
  });

  it('un precio previo 0 devuelve null', () => {
    expect(priceChangePercentTenths(0, 100)).toBeNull();
  });

  it('sin cambio devuelve 0', () => {
    expect(priceChangePercentTenths(100, 100)).toBe(0);
  });
});

describe('derivePriceHistory — unchanged y firstObservedAt', () => {
  it('unchanged es true cuando cada anuncio queda con un único punto', () => {
    const result = derivePriceHistory([
      obs('a', 100, 1),
      obs('a', 100, 2),
      obs('b', 200, 3),
      obs('b', 200, 4),
    ]);

    expect(result.unchanged).toBe(true);
  });

  it('unchanged es false si cualquier anuncio cambió', () => {
    const result = derivePriceHistory([obs('a', 100, 1), obs('b', 200, 2), obs('b', 190, 3)]);

    expect(result.unchanged).toBe(false);
  });

  it('un único anuncio con varios cambios es unchanged false', () => {
    const result = derivePriceHistory([obs('a', 100, 1), obs('a', 90, 2), obs('a', 80, 3)]);

    expect(result.unchanged).toBe(false);
  });

  it('entrada vacía: series vacías, unchanged false y firstObservedAt null', () => {
    const result = derivePriceHistory([]);

    expect(result).toEqual({ series: [], unchanged: false, firstObservedAt: null });
  });

  it('firstObservedAt es la primera captura más temprana de todos los anuncios', () => {
    const result = derivePriceHistory([obs('a', 100, 5), obs('b', 200, 2), obs('b', 150, 9)]);

    expect(result.firstObservedAt?.toISOString()).toBe('2026-01-02T10:00:00.000Z');
  });
});

describe('derivePriceHistory — estado conservado y orden de series', () => {
  it('un anuncio retirado conserva todos sus puntos y su estado', () => {
    const result = derivePriceHistory([
      obs('a', 100, 1, { status: 'removed' }),
      obs('a', 90, 2, { status: 'removed' }),
    ]);

    expect(result.series[0]?.status).toBe('removed');
    expect(result.series[0]?.points).toHaveLength(2);
  });

  it('ordena las series: activos primero, luego último precio ascendente, luego id', () => {
    const result = derivePriceHistory([
      obs('removed-cheap', 50, 1, { status: 'removed' }),
      obs('active-dear', 300, 1),
      obs('active-cheap-b', 200, 1),
      obs('active-cheap-a', 200, 1),
      obs('active-last-low', 500, 1),
      obs('active-last-low', 100, 2),
    ]);

    expect(result.series.map((s) => s.listingId)).toEqual([
      'active-last-low',
      'active-cheap-a',
      'active-cheap-b',
      'active-dear',
      'removed-cheap',
    ]);
  });
});
