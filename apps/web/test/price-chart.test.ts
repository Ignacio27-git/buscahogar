// D.10 (decisión 178) — geometría pura del gráfico escalonado: escalas
// compartidas, trazado en escalón, estilos por serie y rótulos.
import { describe, expect, it } from 'vitest';

import { formatPriceCents } from '../src/lib/format-price.js';
import { GRID_X2, buildPriceChart, chartAriaLabel, labelSeries } from '../src/lib/price-chart.js';
import type { ChartSeriesInput } from '../src/lib/price-chart.js';

function d(day: number): Date {
  return new Date(Date.UTC(2026, 0, day, 10));
}

function series(key: string, points: readonly [number, number][], withdrawn = false): ChartSeriesInput {
  return {
    key,
    label: key,
    withdrawn,
    points: points.map(([day, priceCents]) => ({ capturedAt: d(day), priceCents })),
  };
}

describe('buildPriceChart — escalas compartidas', () => {
  it('usa un único rango de precio para todos los anuncios (280000..310000 más margen)', () => {
    const a = series('a', [
      [1, 280_000],
      [11, 300_000],
    ]);
    const b = series('b', [
      [1, 290_000],
      [11, 310_000],
    ]);

    const model = buildPriceChart([a, b]);

    // pad = max(round(30000 * 0,1), round(310000 * 0,01), 100) = 3100
    // dominio 276900..313100 (rango 36200); área útil y 12..132 (alto 120).
    expect(model.viewBox).toBe('0 0 288 160');
    expect(model.yLabels.map((l) => l.text)).toEqual([formatPriceCents(310_000), formatPriceCents(280_000)]);
    expect(model.yLabels[0]?.y).toBe(22.3); // 12 + 3100 / 36200 * 120
    expect(model.yLabels[1]?.y).toBe(121.7); // 12 + 33100 / 36200 * 120
  });

  it('no parte de cero: el rótulo inferior es el mínimo observado', () => {
    const model = buildPriceChart([
      series('a', [
        [1, 300_000],
        [5, 290_000],
      ]),
    ]);

    expect(model.yLabels.map((l) => l.text)).toEqual([formatPriceCents(300_000), formatPriceCents(290_000)]);
  });

  it('rotula la primera y la última fecha del eje de tiempo', () => {
    const model = buildPriceChart([
      series('a', [
        [1, 300_000],
        [11, 290_000],
      ]),
    ]);

    expect(model.xLabels).toEqual([
      { x: 72, text: '01/01/2026', anchor: 'start' },
      { x: 276, text: '11/01/2026', anchor: 'end' },
    ]);
  });

  it('una sola fecha da un único rótulo centrado', () => {
    const model = buildPriceChart([series('a', [[3, 300_000]]), series('b', [[3, 310_000]])]);

    expect(model.xLabels).toEqual([{ x: 174, text: '03/01/2026', anchor: 'middle' }]);
  });
});

describe('GRID_X2 — borde derecho del área útil', () => {
  it('coincide con el rótulo final del eje de tiempo, sin 308 fijo', () => {
    const model = buildPriceChart([
      series('a', [
        [1, 300_000],
        [11, 290_000],
      ]),
    ]);

    expect(GRID_X2).toBe(276);
    expect(model.xLabels[1]?.x).toBe(GRID_X2);
  });
});

describe('buildPriceChart — rangos degenerados', () => {
  it('min = max y tMin = tMax producen números finitos, sin NaN ni Infinity', () => {
    const model = buildPriceChart([series('a', [[1, 300_000]])]);

    const text = JSON.stringify(model);
    expect(text).not.toMatch(/NaN|Infinity|null.*undefined/);
    expect(model.yLabels).toHaveLength(1);
    expect(Number.isFinite(model.yLabels[0]?.y)).toBe(true);
    // Punto centrado: x = 174; y a mitad del área útil (dominio simétrico).
    expect(model.series[0]?.markerPaths[0]).toMatch(/^M/);
  });

  it('un rango de precio vacío (todo igual) mantiene el margen mínimo y valores finitos', () => {
    const model = buildPriceChart([series('a', [[1, 100]]), series('b', [[2, 100]])]);

    for (const label of model.yLabels) {
      expect(Number.isFinite(label.y)).toBe(true);
    }
    expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity/);
  });
});

describe('buildPriceChart — trazado en escalón', () => {
  it('construye M x y y luego H x V y por cada punto siguiente', () => {
    const model = buildPriceChart([
      series('a', [
        [1, 300_000],
        [11, 290_000],
      ]),
    ]);

    // pad = max(1000, 3000, 100) = 3000; dominio 287000..303000 (16000).
    // y(300000) = 12 + 3000/16000*120 = 34.5; y(290000) = 12 + 13000/16000*120 = 109.5.
    expect(model.series[0]?.linePath).toBe('M72 34.5 H276 V109.5');
  });

  it('encadena varios escalones', () => {
    const model = buildPriceChart([
      series('a', [
        [1, 300_000],
        [6, 290_000],
        [11, 300_000],
      ]),
    ]);

    // x: 72, 174, 276. y(300000) = 34.5; y(290000) = 109.5.
    expect(model.series[0]?.linePath).toBe('M72 34.5 H174 V109.5 H276 V34.5');
  });

  it('un anuncio de un solo punto no tiene línea, solo marcador', () => {
    const model = buildPriceChart([
      series('flat', [[1, 295_000]]),
      series('moves', [
        [1, 300_000],
        [11, 290_000],
      ]),
    ]);

    expect(model.series[0]?.linePath).toBeNull();
    expect(model.series[0]?.markerPaths).toHaveLength(1);
    expect(model.series[1]?.linePath).not.toBeNull();
    expect(model.series[1]?.markerPaths).toHaveLength(2);
  });

  it('ninguna serie se prolonga más allá de su último punto', () => {
    const model = buildPriceChart([
      series('short', [
        [1, 300_000],
        [4, 290_000],
      ]),
      series('long', [
        [1, 310_000],
        [11, 305_000],
      ]),
    ]);

    // El último H de `short` llega a x(día 4) = 72 + 3/10*204 = 133,2, no a 276.
    expect(model.series[0]?.linePath).toMatch(/H133\.2 V/);
    expect(model.series[0]?.linePath).not.toContain('H276');
  });

  it('conserva clave, rótulo y estado retirado de cada serie', () => {
    const model = buildPriceChart([
      series('a', [[1, 100_000]], false),
      series('b', [[1, 200_000]], true),
    ]);

    expect(model.series.map((s) => [s.key, s.label, s.withdrawn])).toEqual([
      ['a', 'a', false],
      ['b', 'b', true],
    ]);
  });
});

describe('buildPriceChart — estilos', () => {
  it('el índice de estilo cicla de 0 a 3 y vuelve a 0', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((k, i) => series(k, [[1, 100_000 + i]]));

    const model = buildPriceChart(many);

    expect(model.series.map((s) => s.styleIndex)).toEqual([0, 1, 2, 3, 0]);
  });

  it('cada estilo dibuja un marcador distinto', () => {
    const four = ['a', 'b', 'c', 'd'].map((k) => series(k, [[1, 100_000]]));

    const model = buildPriceChart(four);
    const shapes = new Set(model.series.map((s) => s.markerPaths[0]));

    expect(shapes.size).toBe(4);
  });
});

describe('labelSeries', () => {
  it('usa el rótulo de la fuente y «Otra fuente» para una clave desconocida', () => {
    expect(labelSeries(['idealista', 'kyero', 'foo'])).toEqual(['Idealista', 'Kyero', 'Otra fuente']);
  });

  it('numera los rótulos repetidos en el orden de las series', () => {
    expect(labelSeries(['idealista', 'kyero', 'idealista', 'idealista'])).toEqual([
      'Idealista',
      'Kyero',
      'Idealista (anuncio 2)',
      'Idealista (anuncio 3)',
    ]);
  });
});

describe('chartAriaLabel', () => {
  it('singular para un anuncio', () => {
    expect(chartAriaLabel(1)).toBe(
      'Gráfico escalonado del precio de 1 anuncio. Los datos detallados están en la tabla de abajo.'
    );
  });

  it('plural para varios anuncios', () => {
    expect(chartAriaLabel(2)).toBe(
      'Gráfico escalonado del precio de 2 anuncios. Los datos detallados están en la tabla de abajo.'
    );
  });
});
