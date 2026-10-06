// ROADMAP 1.11 — tarjeta de resultado (diseño D9/D10). Server Component
// puro: sin `'use client'`, sin estado — recibe ya los datos consolidados
// de `PropertySearchResult` (packages/db/src/search.ts) y los renderiza.
//
// ROADMAP 1.12 (diseño D4/D9; arbitraje obs #193 AR-4) — `anchorListingId`
// es `string | null` (`min(listingId)` sobre un conjunto de miembros vacío
// da NULL en SQL, aunque en la práctica ningún `property_listings`
// consolidado queda sin miembros): CON ancla, la tarjeta envuelve su
// contenido en `<a href="/properties/{anchor}">`; SIN ancla, degrada
// exactamente a la tarjeta de hoy — nunca un `<a>` con `href` vacío o roto.
// `<a href>` normal, nunca `next/link` (D1: `typedRoutes` sigue sin activar
// en `next.config.ts`).
//
// D.6b (decisiones 152 y 155) — fila densa en lugar de tarjeta: miniatura 4:3 a
// la izquierda, precio y datos en el centro y, desde 48rem, precio en una
// columna fija a la derecha. La imagen usa `fill` + `sizes` dentro de una caja
// de proporción fija (`.result-row__media`), de modo que no hay salto de
// maquetación. Tipo y operación salen de los rótulos de decisión 134; la
// política de `alt` vive en `resolveThumbnailAlt`.
import Image from 'next/image';
import type { ReactElement } from 'react';

import type { PropertySearchResult } from '@buscahogar/db';

import { formatPriceCents } from '@/lib/format-price';
import { buildPropertyDetailHref } from '@/lib/property-href';
import { operationLabel, propertyTypeLabel } from '@/lib/search-labels';

import { resolveThumbnailAlt, resolveThumbnailSource } from './thumbnail-source';

export interface ResultCardProps {
  readonly result: PropertySearchResult;
}

// Debe coincidir con el ancho de la columna de miniatura de `.result-row` en
// globals.css: 10rem desde 48rem y 6rem por debajo.
const THUMBNAIL_SIZES = '(min-width: 48rem) 10rem, 6rem';

function formatBathrooms(count: number): string {
  return `${String(count)} ${count === 1 ? 'baño' : 'baños'}`;
}

export function ResultCard({ result }: ResultCardProps): ReactElement {
  const thumbnail = resolveThumbnailSource(result.thumbnailUrl);
  const priceMissing = result.minPriceCents === null;
  const sourceCount = result.distinctSourceCount;

  const content = (
    <>
      <div className="result-row__media">
        {thumbnail.kind === 'thumbnail' ? (
          <Image
            src={thumbnail.url}
            alt={resolveThumbnailAlt(result)}
            fill
            sizes={THUMBNAIL_SIZES}
            className="result-row__img"
          />
        ) : (
          <span aria-hidden="true">Sin foto</span>
        )}
      </div>
      <h2 className={priceMissing ? 'result-row__price result-row__price--missing' : 'result-row__price tabular-nums'}>
        {formatPriceCents(result.minPriceCents)}
      </h2>
      <div className="result-row__facts">
        <p className="result-row__kind">
          {propertyTypeLabel(result.propertyType) ?? 'Tipo no disponible'}
          {' · '}
          {operationLabel(result.operation) ?? 'Operación no disponible'}
        </p>
        <p className="result-row__figures tabular-nums">
          {result.surfaceM2 !== null ? `${String(result.surfaceM2)} m²` : 'Superficie no disponible'}
          {result.rooms !== null ? ` · ${String(result.rooms)} hab.` : ''}
          {result.bathrooms !== null ? ` · ${formatBathrooms(result.bathrooms)}` : ''}
        </p>
        {result.address !== null ? <p className="result-row__address">{result.address}</p> : null}
        <p className="result-row__badge">{`Disponible en ${String(sourceCount)} ${sourceCount === 1 ? 'fuente' : 'fuentes'}`}</p>
      </div>
    </>
  );

  if (result.anchorListingId === null) {
    return (
      <article className="result-row">
        <div className="result-row__body">{content}</div>
      </article>
    );
  }

  return (
    <article className="result-row">
      <a href={buildPropertyDetailHref(result.anchorListingId)} className="result-row__body result-row__link">
        {content}
      </a>
    </article>
  );
}
