// ROADMAP 1.12 (diseño D3/D6; arbitraje obs #193 AR-5) — una fila por
// anuncio de origen (`property-detail-query`, requisito "Every Source Listed
// With Its Own Current Price And Outbound Link"): precio propio, identidad
// de fuente, y enlace de salida (`listings.url`, nunca una redirección del
// lado del servidor — D2/threat-matrix). Un anuncio retirado (`status !== 'active'`) se marca
// como no disponible pero permanece en la lista (Q1 walk, obs #191: nada
// filtra por `status`). El recuento de fotos se muestra FECHADO junto a
// `lastSeenAt`, nunca como cifra suelta (D6, AR-5: `numPhotos` es
// identity-column, congelada en el primer avistamiento).
import type { ReactElement } from 'react';

import type { PropertyDetailSource } from '@buscahogar/db';

export interface SourceListProps {
  readonly sources: readonly PropertyDetailSource[];
}

function formatPriceCents(cents: number): string {
  return `${(cents / 100).toLocaleString('es-ES')} €`;
}

// Getters UTC, no locales: las fechas llegan de Postgres
// (`timestamp with time zone`) y el runtime de test/CI no debe influir en
// qué día cae la medianoche de un fixture.
function formatObservedAt(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());
  return `${day}/${month}/${year}`;
}

function formatObservedPhotos(numPhotos: number | null, lastSeenAt: Date): string {
  const observedAt = formatObservedAt(lastSeenAt);
  if (numPhotos === null) {
    return `Sin datos de fotos (visto por última vez el ${observedAt})`;
  }
  return `${String(numPhotos)} fotos (visto por última vez el ${observedAt})`;
}

export function SourceList({ sources }: SourceListProps): ReactElement {
  return (
    <ul>
      {sources.map((source) => (
        <li key={source.listingId}>
          <a href={source.url}>{source.sourceKey}</a>
          {source.status !== 'active' ? <span> (no disponible)</span> : null}
          <span> · {formatPriceCents(source.priceCents)}</span>
          <span> · {formatObservedPhotos(source.numPhotos, source.lastSeenAt)}</span>
        </li>
      ))}
    </ul>
  );
}
