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
// sale de `listingStatusLabel` (la insignia «(no disponible)» por fila desaparece, ya
// lo dice «Estado») y una nota fija recuerda que la agrupación es una estimación.
//
// D.17 (B9, decisión 211): un anuncio retirado dice «No disponible», como uno inactivo y como la
// insignia del histórico; «Retirado» desaparece.
//
// D.18 (decisión 221): sin ningún anuncio activo la insignia pasa de «Precio más bajo» a «Último
// precio más bajo» (enmienda la 180): es el último precio conocido, no uno vigente.
//
// D.19 (decisión 231): «Más económico» y «Disponible» llevan el verde de estado favorable además del
// texto (el color nunca es la única señal). «Último precio más bajo» es un precio histórico, no un
// estado favorable, y conserva la caja de tinta sin verde.
import type { ReactElement } from 'react';

import { compareSourceListings } from '@buscahogar/core';
import type { PropertyDetailSource } from '@buscahogar/db';

import { formatUtcDate } from '@/lib/format-date';
import { formatPriceCents } from '@/lib/format-price';
import { isListingAvailable, listingStatusLabel } from '@/lib/listing-status';
import { sourceLabel } from '@/lib/search-labels';

import { Icon } from './icon';

export interface SourceListProps {
  readonly sources: readonly PropertyDetailSource[];
}

const HIGHLIGHT_BY_MODE = {
  active: 'Más económico',
  'none-active': 'Último precio más bajo',
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
                  <Icon name="external-link" className="ms-1" />
                  <span className="sr-only"> (web externa)</span>
                </a>
                {comparison.mode !== 'empty' && highlighted.has(source.listingId) ? (
                  <strong
                    className={
                      comparison.mode === 'active'
                        ? 'source-row__highlight source-row__highlight--active'
                        : 'source-row__highlight'
                    }
                  >
                    {HIGHLIGHT_BY_MODE[comparison.mode]}
                  </strong>
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
                  <dd className="tabular-nums">{formatUtcDate(source.lastSeenAt)}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd className={isListingAvailable(source.status) ? 'source-row__status--available' : undefined}>
                    {listingStatusLabel(source.status)}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
