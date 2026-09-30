// ROADMAP 1.12 (diseño D8, arbitraje obs #193 AR-8; addendum obs #194 AR-13)
// — cabecera consolidada, componente presentacional SÍNCRONO propio: cae
// dentro del alcance del arnés `renderToStaticMarkup` (AR-9), a diferencia
// de la página async que solo hace fetching, `notFound()` y composición.
//
// Los ocho atributos que pueden venir NULL desde `properties` (decisión
// 053: siete campos opcionales de contenido, más `propertyType`/`operation`
// — enums obligatorios en la práctica pero nulables a nivel de esquema, y
// la spec los nombra explícitamente como ejemplo) pasan por
// `resolveConsolidatedField` (D8/AR-8): DOS estados, nunca tres — un valor,
// o el indicador "no consolidado", jamás un hueco en blanco.
import type { ReactElement } from 'react';

import type { PropertyDetailHeader } from '@buscahogar/db';

import { formatPriceCents } from '@/lib/format-price';

import { resolveConsolidatedField } from './consolidated-field';

export interface PropertyHeaderProps {
  readonly property: PropertyDetailHeader;
}

const NOT_CONSOLIDATED_TEXT = 'No consolidado — ver anuncios de origen';

// Envuelve `resolveConsolidatedField` con el formato de presentación de cada
// campo, para no repetir el `if (kind === 'value')` ocho veces.
function renderField<T>(value: T | null, format: (value: T) => string): string {
  const resolved = resolveConsolidatedField(value);
  return resolved.kind === 'value' ? format(resolved.value) : NOT_CONSOLIDATED_TEXT;
}

export function PropertyHeader({ property }: PropertyHeaderProps): ReactElement {
  return (
    <header>
      <h1>{renderField(property.title, (value) => value)}</h1>
      <p>{formatPriceCents(property.minPriceCents)}</p>
      <p>
        {renderField(property.propertyType, (value) => value)} ·{' '}
        {renderField(property.operation, (value) => value)}
      </p>
      <p>
        {renderField(property.surfaceM2, (value) => `${String(value)} m²`)} ·{' '}
        {renderField(property.rooms, (value) => `${String(value)} hab.`)} ·{' '}
        {renderField(property.bathrooms, (value) => `${String(value)} baños`)} ·{' '}
        {renderField(property.floor, (value) => `Planta ${value}`)}
      </p>
      <p>{renderField(property.address, (value) => value)}</p>
      <p>{renderField(property.description, (value) => value)}</p>
      <p>
        Disponible en {property.listingCount} {property.listingCount === 1 ? 'fuente' : 'fuentes'}
      </p>
    </header>
  );
}
