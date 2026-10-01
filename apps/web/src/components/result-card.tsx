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
import Image from 'next/image';
import type { ReactElement } from 'react';

import type { PropertySearchResult } from '@buscahogar/db';

import { formatPriceCents } from '@/lib/format-price';
import { buildPropertyDetailHref } from '@/lib/property-href';

import { resolveThumbnailSource } from './thumbnail-source';

export interface ResultCardProps {
  readonly result: PropertySearchResult;
}

export function ResultCard({ result }: ResultCardProps): ReactElement {
  const thumbnail = resolveThumbnailSource(result.thumbnailUrl);

  const content = (
    <>
      {thumbnail.kind === 'thumbnail' ? (
        <Image src={thumbnail.url} alt="" width={480} height={360} />
      ) : (
        <div aria-hidden="true">Sin imagen disponible</div>
      )}
      <h2>{formatPriceCents(result.minPriceCents)}</h2>
      <p>
        {result.propertyType ?? 'Tipo no disponible'} · {result.operation ?? 'Operación no disponible'}
      </p>
      <p>
        {result.surfaceM2 !== null ? `${String(result.surfaceM2)} m²` : 'Superficie no disponible'}
        {result.rooms !== null ? ` · ${String(result.rooms)} hab.` : ''}
        {result.bathrooms !== null ? ` · ${String(result.bathrooms)} baños` : ''}
      </p>
      {result.address !== null ? <p>{result.address}</p> : null}
      <p>
        Disponible en {result.distinctSourceCount} {result.distinctSourceCount === 1 ? 'fuente' : 'fuentes'}
      </p>
    </>
  );

  if (result.anchorListingId === null) {
    return <article>{content}</article>;
  }

  return (
    <article>
      <a href={buildPropertyDetailHref(result.anchorListingId)}>{content}</a>
    </article>
  );
}
