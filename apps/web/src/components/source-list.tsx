// ROADMAP 1.12 (diseño D3/D6; arbitraje obs #193 AR-5) — una fila por
// anuncio de origen (`property-detail-query`, requisito "Every Source Listed
// With Its Own Current Price And Outbound Link"): precio propio, identidad
// de fuente, y enlace de salida (`listings.url`, nunca una redirección del
// lado del servidor — D2/threat-matrix). Un anuncio retirado (`status !== 'active'`)
// permanece en la lista (Q1 walk, obs #191: nada filtra por `status`). El recuento
// de fotos se muestra junto a `lastSeenAt`, nunca como cifra suelta (D6, AR-5:
// `numPhotos` es identity-column, congelada en el primer avistamiento).
//
// D.9 (decisión 174): fila con nombre de fuente de `SOURCE_LABELS`, enlace «Ver en
// {Fuente}» en la misma pestaña (`rel="external"`, sin `target`). El orden es el de
// `getPropertySources`.
//
// D.12 (decisión 180): la lista es una comparación. `compareSourceListings` (core)
// decide qué anuncios fijan el precio; aquí solo se pinta su resultado, nunca a
// partir del número de fuentes. Cada fila muestra sus datos con etiqueta, el estado
// sale de un `Record` tipado (la insignia «(no disponible)» por fila desaparece, ya
// lo dice «Estado») y una nota fija recuerda que la agrupación es una estimación.
import type { ReactElement } from 'react';

import { compareSourceListings } from '@buscahogar/core';
import type { PropertyDetailSource } from '@buscahogar/db';

import { formatUtcDate } from '@/lib/format-date';
import { formatPriceCents } from '@/lib/format-price';
import { sourceLabel } from '@/lib/search-labels';

export interface SourceListProps {
  readonly sources: readonly PropertyDetailSource[];
}

const LISTING_STATUS_LABELS: Record<'active' | 'inactive' | 'removed', string> = {
  active: 'Disponible',
  inactive: 'No disponible',
  removed: 'Retirado',
};

// Un estado que el tipo no contempla se trata como no disponible, igual que el SQL
// solo considera activo el valor exacto `'active'`. `Object.hasOwn` evita que una
// clave heredada como `toString` salga como etiqueta.
function statusLabel(status: string): string {
  return Object.hasOwn(LISTING_STATUS_LABELS, status)
    ? LISTING_STATUS_LABELS[status as keyof typeof LISTING_STATUS_LABELS]
    : LISTING_STATUS_LABELS.inactive;
}

const HIGHLIGHT_BY_MODE = {
  active: 'Más económico',
  'none-active': 'Precio más bajo',
} as const;

const GROUPING_NOTE =
  'Agrupamos estos anuncios porque creemos que describen la misma vivienda. Compruébalo en cada fuente.';

const NONE_ACTIVE_WARNING =
  'Ninguno de estos anuncios sigue disponible. Mostramos el más bajo de sus últimos precios.';

export function SourceList({ sources }: SourceListProps): ReactElement {
  const comparison = compareSourceListings(sources);
  const highlighted = new Set<string>(comparison.highlightedIds);

  return (
    <section className="source-list" aria-labelledby="anuncios-de-origen">
      <h2 id="anuncios-de-origen">Anuncios de origen</h2>
      <p className="source-list__note">{GROUPING_NOTE}</p>
      {comparison.mode === 'none-active' ? (
        <p className="source-list__warning">{NONE_ACTIVE_WARNING}</p>
      ) : null}
      <ul>
        {sources.map((source) => {
          const name = sourceLabel(source.sourceKey);
          return (
            <li key={source.listingId} className="source-row">
              <div className="source-row__head">
                <a className="source-row__link" href={source.url} rel="external">
                  {`Ver en ${name}`}
                  <span aria-hidden="true"> ↗</span>
                  <span className="sr-only"> (web externa)</span>
                </a>
                {comparison.mode !== 'empty' && highlighted.has(source.listingId) ? (
                  <strong className="source-row__highlight">{HIGHLIGHT_BY_MODE[comparison.mode]}</strong>
                ) : null}
              </div>
              <dl className="source-row__facts">
                <div>
                  <dt>Precio</dt>
                  <dd className="source-row__price tabular-nums">{formatPriceCents(source.priceCents)}</dd>
                </div>
                <div>
                  <dt>Fotos</dt>
                  <dd>{source.numPhotos === null ? 'Sin datos' : String(source.numPhotos)}</dd>
                </div>
                <div>
                  <dt>Visto por última vez</dt>
                  <dd>{formatUtcDate(source.lastSeenAt)}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{statusLabel(source.status)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
