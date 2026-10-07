// ROADMAP 1.12 (diseño D3/D6; arbitraje obs #193 AR-5) — una fila por
// anuncio de origen (`property-detail-query`, requisito "Every Source Listed
// With Its Own Current Price And Outbound Link"): precio propio, identidad
// de fuente, y enlace de salida (`listings.url`, nunca una redirección del
// lado del servidor — D2/threat-matrix). Un anuncio retirado (`status !== 'active'`) se marca
// como no disponible pero permanece en la lista (Q1 walk, obs #191: nada
// filtra por `status`). El recuento de fotos se muestra FECHADO junto a
// `lastSeenAt`, nunca como cifra suelta (D6, AR-5: `numPhotos` es
// identity-column, congelada en el primer avistamiento).
//
// D.9 (decisión 174): fila con nombre de fuente de `SOURCE_LABELS`, enlace «Ver en
// {Fuente}» en la misma pestaña (`rel="external"`, sin `target`) e insignia
// «(no disponible)». El orden es el de `getPropertySources`.
import type { ReactElement } from 'react';

import type { PropertyDetailSource } from '@buscahogar/db';

import { formatUtcDate } from '@/lib/format-date';
import { formatPriceCents } from '@/lib/format-price';
import { sourceLabel } from '@/lib/search-labels';

export interface SourceListProps {
  readonly sources: readonly PropertyDetailSource[];
}

function formatObservedPhotos(numPhotos: number | null, lastSeenAt: Date): string {
  const observedAt = formatUtcDate(lastSeenAt);
  if (numPhotos === null) {
    return `Sin datos de fotos (visto por última vez el ${observedAt})`;
  }
  return `${String(numPhotos)} fotos (visto por última vez el ${observedAt})`;
}

export function SourceList({ sources }: SourceListProps): ReactElement {
  return (
    <section className="source-list" aria-labelledby="anuncios-de-origen">
      <h2 id="anuncios-de-origen">Anuncios de origen</h2>
      <ul>
        {sources.map((source) => {
          const name = sourceLabel(source.sourceKey);
          return (
            <li key={source.listingId} className="source-row">
              <a className="source-row__link" href={source.url} rel="external">
                {`Ver en ${name}`}
                <span aria-hidden="true"> ↗</span>
                <span className="sr-only"> (web externa)</span>
              </a>
              <span className="source-row__price tabular-nums">{formatPriceCents(source.priceCents)}</span>
              <span className="source-row__meta">
                {source.status !== 'active' ? <span className="source-row__badge">(no disponible)</span> : null}{' '}
                {formatObservedPhotos(source.numPhotos, source.lastSeenAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
