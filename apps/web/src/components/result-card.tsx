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
// D.6b (decisiones 152 y 155) — fila densa en lugar de tarjeta: precio y datos y, desde 48rem, precio en
// una columna fija a la derecha. Tipo y operación salen de los rótulos de decisión 134.
//
// Decisión 276: sin fotos. Idealista no autoriza el uso de sus imágenes, y `thumbnailUrl` no se pinta.
import type { ReactElement } from 'react';

import type { PropertySearchResult } from '@buscahogar/db';

import { formatPriceCents } from '@/lib/format-price';
import { buildPropertyDetailHref } from '@/lib/property-href';
import { operationLabel, propertyTypeLabel } from '@/lib/search-labels';
import type { SearchReturnParams } from '@/lib/search-return-params';

export interface ResultCardProps {
  readonly result: PropertySearchResult;
  // D.9: parámetros de la búsqueda que el enlace lleva a la ficha (vuelta a los resultados).
  readonly returnParams?: SearchReturnParams;
}

function formatBathrooms(count: number): string {
  return `${String(count)} ${count === 1 ? 'baño' : 'baños'}`;
}

export function ResultCard({ result, returnParams = [] }: ResultCardProps): ReactElement {
  const priceMissing = result.minPriceCents === null;
  const sourceCount = result.distinctSourceCount;
  // D.15 (F6, decisión 198): una sola cadena para la línea visible y para el encabezado.
  const typeText = propertyTypeLabel(result.propertyType) ?? 'Tipo no disponible';
  const operationText = operationLabel(result.operation);
  const kind = `${typeText} · ${operationText ?? 'Operación no disponible'}`;

  const content = (
    <>
      <h2 className={priceMissing ? 'result-row__price result-row__price--missing' : 'result-row__price tabular-nums'}>
        {formatPriceCents(result.minPriceCents)}
        <span className="sr-only">{`, ${kind}`}</span>
      </h2>
      <div className="result-row__facts">
        {/* D.20 (decisión 236): la operación es una etiqueta con caja; el texto visible no cambia. */}
        <p className="result-row__kind">
          {operationText === null ? (
            kind
          ) : (
            <>
              {`${typeText} · `}
              <span className="result-row__operation">{operationText}</span>
            </>
          )}
        </p>
        <p className="result-row__figures tabular-nums">
          {result.surfaceM2 !== null ? `${String(result.surfaceM2)} m²` : 'Superficie no disponible'}
          {result.rooms !== null ? ` · ${String(result.rooms)} hab.` : ''}
          {result.bathrooms !== null ? ` · ${formatBathrooms(result.bathrooms)}` : ''}
        </p>
        {result.address !== null ? <p className="result-row__address">{result.address}</p> : null}
        {/* D.17 (B4): con dos o más fuentes la insignia pesa más: es la evidencia de la agregación. */}
        <p className={sourceCount > 1 ? 'result-row__badge result-row__badge--multi' : 'result-row__badge'}>
          {`Disponible en ${String(sourceCount)} ${sourceCount === 1 ? 'fuente' : 'fuentes'}`}
        </p>
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
      <a href={buildPropertyDetailHref(result.anchorListingId, returnParams)} className="result-row__body result-row__link">
        {content}
      </a>
    </article>
  );
}
