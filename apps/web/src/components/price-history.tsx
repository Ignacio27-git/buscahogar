// D.10 (decisión 178) — «Histórico de precios» de la ficha. Server Component
// síncrono, sin `'use client'`, sin librería de gráficos y sin atributos `style`
// (la CSP no los admite): el SVG sale de números ya calculados en
// `lib/price-chart.ts` y los trazos y colores los pone el CSS por clase. La tabla
// es la fuente de verdad; el gráfico solo existe si algún precio cambió.
import type { ReactElement } from 'react';

import { derivePriceHistory } from '@buscahogar/core';
import type { PropertyPriceObservation } from '@buscahogar/db';

import { formatUtcDate } from '@/lib/format-date';
import { formatPriceCents, formatPriceChange } from '@/lib/format-price';
import {
  buildPriceChart,
  chartAriaLabel,
  labelSeries,
  markerPath,
  X_LABEL_Y,
  Y_LABEL_X,
} from '@/lib/price-chart';

export interface PriceHistoryProps {
  readonly observations: readonly PropertyPriceObservation[];
}

export function PriceHistory({ observations }: PriceHistoryProps): ReactElement | null {
  const history = derivePriceHistory(observations);
  if (history.series.length === 0) {
    return null;
  }

  const labels = labelSeries(history.series.map((s) => s.sourceKey));
  const withdrawnOf = (status: string): boolean => status !== 'active';

  const model = history.unchanged
    ? null
    : buildPriceChart(
        history.series.map((s, index) => ({
          key: s.listingId,
          label: labels[index] ?? '',
          withdrawn: withdrawnOf(s.status),
          points: s.points,
        }))
      );

  return (
    <section className="price-history" aria-labelledby="historico-de-precios">
      <h2 id="historico-de-precios">Histórico de precios</h2>
      {history.unchanged && history.firstObservedAt !== null ? (
        <p className="price-history__note">
          {`Precio observado el ${formatUtcDate(history.firstObservedAt)}; aún sin cambios`}
        </p>
      ) : null}
      {model !== null ? (
        <figure className="price-chart">
          <svg
            className="price-chart__plot"
            viewBox={model.viewBox}
            role="img"
            aria-label={chartAriaLabel(model.series.length)}
          >
            {model.yLabels.map((label) => (
              <g key={`y-${String(label.y)}`}>
                <line
                  className="price-chart__grid"
                  x1={Y_LABEL_X + 8}
                  x2={308}
                  y1={label.y}
                  y2={label.y}
                />
                <text
                  className="price-chart__label"
                  x={Y_LABEL_X}
                  y={label.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {label.text}
                </text>
              </g>
            ))}
            {model.xLabels.map((label) => (
              <text
                key={`x-${String(label.x)}`}
                className="price-chart__label"
                x={label.x}
                y={X_LABEL_Y}
                textAnchor={label.anchor}
              >
                {label.text}
              </text>
            ))}
            {model.series.map((s) => (
              <g
                key={s.key}
                className={`price-chart__series price-chart__series--${String(s.styleIndex)}`}
              >
                {s.linePath !== null ? <path className="price-chart__line" d={s.linePath} /> : null}
                {s.markerPaths.map((d, i) => (
                  <path key={`${s.key}-${String(i)}`} className="price-chart__marker" d={d} />
                ))}
              </g>
            ))}
          </svg>
          <figcaption>
            <ul className="price-chart__legend">
              {model.series.map((s) => (
                <li key={s.key} className="price-chart__legend-item">
                  <svg
                    className={`price-chart__swatch price-chart__series price-chart__series--${String(s.styleIndex)}`}
                    viewBox="0 0 24 12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <line className="price-chart__line" x1="0" x2="24" y1="6" y2="6" />
                    <path className="price-chart__marker" d={markerPath(s.styleIndex, 12, 6)} />
                  </svg>
                  <span>{s.label}</span>
                  {s.withdrawn ? (
                    <span className="price-history__badge">(no disponible)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </figcaption>
        </figure>
      ) : null}
      {/* Región con foco por teclado: a 320 px la tabla puede ser unos píxeles más ancha que la
          columna y se desplaza aquí dentro, sin desbordar la página. */}
      <div
        className="price-history__scroll"
        role="region"
        aria-label="Tabla del histórico de precios"
        tabIndex={0}
      >
        <table className="price-history__table">
          <caption>
            Fechas en que nuestro barrido observó cada precio; no son fechas de publicación del
            portal.
          </caption>
          <thead>
            <tr>
              <th scope="col">Fuente</th>
              <th scope="col">Fecha</th>
              <th scope="col">Precio</th>
              <th scope="col">Variación</th>
            </tr>
          </thead>
          <tbody>
            {history.series.flatMap((s, index) =>
              s.points.map((point, pointIndex) => (
                <tr key={`${s.listingId}-${String(pointIndex)}`}>
                  <td>
                    {labels[index]}
                    {withdrawnOf(s.status) ? (
                      <>
                        {' '}
                        <span className="price-history__badge">(no disponible)</span>
                      </>
                    ) : null}
                  </td>
                  <td className="price-history__date">{formatUtcDate(point.capturedAt)}</td>
                  <td className="price-history__num price-history__price">
                    {formatPriceCents(point.priceCents)}
                  </td>
                  <td className="price-history__num">
                    {point.deltaCents === null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Primer precio observado</span>
                      </>
                    ) : (
                      formatPriceChange(point.deltaCents, point.percentTenths)
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
