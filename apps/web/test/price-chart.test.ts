// D.10 (decisión 178) — geometría pura del gráfico escalonado: escalas
// compartidas, trazado en escalón, estilos por serie y rótulos.
import { describe, expect, it } from 'vitest';

import { formatPriceCents } from '../src/lib/format-price.js';
import { buildPriceChart, chartAriaLabel, labelSeries } from '../src/lib/price-chart.js';
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

// Las pruebas de geometría de D.10 se miden en el diseño compacto (288 × 160, columna a 320 px).
function compactChart(input: readonly ChartSeriesInput[]): ReturnType<typeof buildPriceChart> {
  return buildPriceChart(input, 'compact');
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

    const model = compactChart([a, b]);

    // pad = max(round(30000 * 0,1), round(310000 * 0,01), 100) = 3100
    // dominio 276900..313100 (rango 36200); área útil y 12..132 (alto 120).
    expect(model.viewBox).toBe('0 0 288 160');
    expect(model.yLabels.map((l) => l.text)).toEqual([formatPriceCents(310_000), formatPriceCents(280_000)]);
    expect(model.yLabels[0]?.y).toBe(22.3); // 12 + 3100 / 36200 * 120
    expect(model.yLabels[1]?.y).toBe(121.7); // 12 + 33100 / 36200 * 120
  });

  it('no parte de cero: el rótulo inferior es el mínimo observado', () => {
    const model = compactChart([
      series('a', [
        [1, 300_000],
        [5, 290_000],
      ]),
    ]);

    expect(model.yLabels.map((l) => l.text)).toEqual([formatPriceCents(300_000), formatPriceCents(290_000)]);
  });

  it('rotula la primera y la última fecha del eje de tiempo', () => {
    const model = compactChart([
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
    const model = compactChart([series('a', [[3, 300_000]]), series('b', [[3, 310_000]])]);

    expect(model.xLabels).toEqual([{ x: 174, text: '03/01/2026', anchor: 'middle' }]);
  });
});

describe('gridX2 — borde derecho del área útil', () => {
  it('coincide con el rótulo final del eje de tiempo, sin 308 fijo', () => {
    const model = compactChart([
      series('a', [
        [1, 300_000],
        [11, 290_000],
      ]),
    ]);

    expect(model.gridX2).toBe(276);
    expect(model.xLabels[1]?.x).toBe(model.gridX2);
  });
});

describe('buildPriceChart — rangos degenerados', () => {
  it('min = max y tMin = tMax producen números finitos, sin NaN ni Infinity', () => {
    const model = compactChart([series('a', [[1, 300_000]])]);

    const text = JSON.stringify(model);
    expect(text).not.toMatch(/NaN|Infinity|null.*undefined/);
    expect(model.yLabels).toHaveLength(1);
    expect(Number.isFinite(model.yLabels[0]?.y)).toBe(true);
    // Punto centrado: x = 174; y a mitad del área útil (dominio simétrico).
    expect(model.series[0]?.markerPaths[0]).toMatch(/^M/);
  });

  it('un rango de precio vacío (todo igual) mantiene el margen mínimo y valores finitos', () => {
    const model = compactChart([series('a', [[1, 100]]), series('b', [[2, 100]])]);

    for (const label of model.yLabels) {
      expect(Number.isFinite(label.y)).toBe(true);
    }
    expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity/);
  });
});

describe('buildPriceChart — trazado en escalón', () => {
  it('construye M x y y luego H x V y por cada punto siguiente', () => {
    const model = compactChart([
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
    const model = compactChart([
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
    const model = compactChart([
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
    const model = compactChart([
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
    const model = compactChart([
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

    const model = compactChart(many);

    expect(model.series.map((s) => s.styleIndex)).toEqual([0, 1, 2, 3, 0]);
  });

  it('cada estilo dibuja un marcador distinto', () => {
    const four = ['a', 'b', 'c', 'd'].map((k) => series(k, [[1, 100_000]]));

    const model = compactChart(four);
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

// D.18 (decisión 222) — dos diseños del mismo modelo: compacto 288 × 160 y ancho 544 × 192, ambos a
// escala 1:1 (el texto no se encoge). Los rótulos del eje de tiempo miden 70 con 8 de separación.
function labelLeft(label: { readonly x: number; readonly anchor: 'start' | 'middle' | 'end' }): number {
  if (label.anchor === 'start') return label.x;
  return label.anchor === 'end' ? label.x - 70 : label.x - 35;
}

describe('buildPriceChart — diseños compacto y ancho (D.18)', () => {
  const two = [
    series('a', [
      [1, 300_000],
      [11, 290_000],
    ]),
    series('b', [
      [1, 310_000],
      [11, 305_000],
    ]),
  ];

  it('el diseño compacto mide 288 × 160 y el ancho 544 × 192', () => {
    expect(buildPriceChart(two, 'compact').viewBox).toBe('0 0 288 160');
    expect(buildPriceChart(two, 'wide').viewBox).toBe('0 0 544 192');
  });

  it('el diseño ancho amplía el área útil: inicio en 72 y fin en 532', () => {
    const wide = buildPriceChart(two, 'wide');

    expect(wide.xLabels).toEqual([
      { x: 72, text: '01/01/2026', anchor: 'start' },
      { x: 532, text: '11/01/2026', anchor: 'end' },
    ]);
    expect(wide.gridX2).toBe(532);
    expect(wide.xLabelY).toBe(184);
    expect(wide.yLabelX).toBe(68);
  });

  it('el compacto coloca los rótulos fijos: fechas en y = 152, precios en x = 68', () => {
    const compact = buildPriceChart(two, 'compact');

    expect(compact.xLabelY).toBe(152);
    expect(compact.yLabelX).toBe(68);
  });

  // D.19 (decisión 230): Figtree es más ancha que la pila del sistema y «1.234.567 €» (12px, unos 66 de
  // ancho) se salía 2px por la izquierda del lienzo con el hueco de 8 (e2e `fixed-boxes.spec.ts`). El hueco
  // entre el rótulo de precio y el inicio de la rejilla pasa a 4: el rótulo termina en gridX1 - 4.
  it.each(['compact', 'wide'] as const)(
    'el rótulo de precio del diseño %s termina 4 antes de donde empieza la rejilla',
    (layout) => {
      const model = buildPriceChart(two, layout);

      expect(model.gridX1 - model.yLabelX).toBe(4);
      expect(model.yLabelX).toBeGreaterThanOrEqual(66);
    }
  );

  it('rotula el inicio de una serie posterior en el diseño ancho, centrado en su primera captura', () => {
    const wide = buildPriceChart(
      [
        series('a', [
          [1, 300_000],
          [21, 290_000],
        ]),
        series('b', [
          [11, 310_000],
          [21, 305_000],
        ]),
      ],
      'wide'
    );

    // día 11 de 1..21 → mitad del área útil: 72 + 10/20 * 460 = 302.
    expect(wide.xLabels).toEqual([
      { x: 72, text: '01/01/2026', anchor: 'start' },
      { x: 532, text: '21/01/2026', anchor: 'end' },
      { x: 302, text: '11/01/2026', anchor: 'middle' },
    ]);
  });

  it('el compacto no tiene hueco para un rótulo intermedio: lo descarta', () => {
    const compact = buildPriceChart(
      [
        series('a', [
          [1, 300_000],
          [21, 290_000],
        ]),
        series('b', [
          [11, 310_000],
          [21, 305_000],
        ]),
      ],
      'compact'
    );

    expect(compact.xLabels.map((l) => l.text)).toEqual(['01/01/2026', '21/01/2026']);
  });

  it('un inicio que solapa con el rótulo de inicio se descarta aunque quepa en el ancho', () => {
    const wide = buildPriceChart(
      [
        series('a', [
          [1, 300_000],
          [31, 290_000],
        ]),
        series('b', [
          [2, 310_000],
          [31, 305_000],
        ]),
        series('c', [
          [16, 320_000],
          [31, 315_000],
        ]),
      ],
      'wide'
    );

    // b empieza el día 2 (x = 72 + 1/30 * 460 ≈ 87): solapa con «01/01/2026». c queda en ≈ 302.
    expect(wide.xLabels.map((l) => l.text)).toEqual(['01/01/2026', '31/01/2026', '16/01/2026']);
    expect(wide.xLabels.length).toBeGreaterThan(2);
    for (const [index, label] of wide.xLabels.entries()) {
      for (const other of wide.xLabels.slice(index + 1)) {
        const separated =
          labelLeft(label) + 70 + 8 <= labelLeft(other) || labelLeft(other) + 70 + 8 <= labelLeft(label);
        expect(separated).toBe(true);
      }
    }
  });

  it('dos series que empiezan el mismo día comparten un único rótulo', () => {
    const wide = buildPriceChart(
      [
        series('a', [
          [1, 300_000],
          [21, 290_000],
        ]),
        series('b', [
          [11, 310_000],
          [21, 305_000],
        ]),
        series('c', [
          [11, 320_000],
          [21, 315_000],
        ]),
      ],
      'wide'
    );

    expect(wide.xLabels.filter((l) => l.text === '11/01/2026')).toHaveLength(1);
  });

  it('prioriza las series por orden de primera captura, no por el orden de entrada', () => {
    const wide = buildPriceChart(
      [
        series('late', [
          [16, 310_000],
          [31, 305_000],
        ]),
        series('early', [
          [1, 300_000],
          [31, 290_000],
        ]),
        series('mid', [
          [13, 320_000],
          [31, 315_000],
        ]),
      ],
      'wide'
    );

    // mid (día 13, x = 256) llega antes que late (día 16, x ≈ 302): 46 < 78, late se descarta.
    expect(wide.xLabels.map((l) => l.text)).toEqual(['01/01/2026', '31/01/2026', '13/01/2026']);
  });

  it('con una sola fecha el rótulo único se centra en cada diseño', () => {
    const one = [series('a', [[3, 300_000]]), series('b', [[3, 310_000]])];

    expect(buildPriceChart(one, 'compact').xLabels).toEqual([{ x: 174, text: '03/01/2026', anchor: 'middle' }]);
    expect(buildPriceChart(one, 'wide').xLabels).toEqual([{ x: 302, text: '03/01/2026', anchor: 'middle' }]);
  });

  it('la geometría de las series escala con el diseño: el último punto llega al borde derecho', () => {
    const wide = buildPriceChart(two, 'wide');

    expect(wide.series[0]?.linePath).toMatch(/^M72 [\d.]+ H532 V[\d.]+$/);
  });
});
