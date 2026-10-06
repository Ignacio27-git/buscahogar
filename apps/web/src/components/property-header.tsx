// ROADMAP 1.12 (diseño D8, arbitraje obs #193 AR-8; addendum obs #194 AR-13)
// — cabecera consolidada, componente presentacional SÍNCRONO propio: cae
// dentro del alcance del arnés `renderToStaticMarkup` (AR-9), a diferencia
// de la página async que solo hace fetching, `notFound()` y composición.
//
// D.9 (decisiones 173 y 174): los datos clave son un `<dl>` con rótulos en
// español; un dato que falta muestra «—» (y «Sin dato» solo para lectores de
// pantalla) y UNA nota bajo la lista dice «No consolidado — ver anuncios de
// origen». El resumen (precio y número de fuentes) se pinta dos veces, una por
// punto de corte; el CSS oculta la copia que no toca.
//
// Los atributos que pueden venir NULL desde `properties` (decisión 053) pasan
// por `resolveConsolidatedField` (D8/AR-8): DOS estados, nunca tres.
import type { ReactElement, ReactNode } from 'react';

import type { PropertyDetailHeader } from '@buscahogar/db';

import { formatPriceCents } from '@/lib/format-price';
import { floorLabel, operationLabel, propertyTypeLabel } from '@/lib/search-labels';

import { resolveConsolidatedField } from './consolidated-field';

export type SummaryPlacement = 'lead' | 'panel';

export interface PropertyHeaderProps {
  readonly property: PropertyDetailHeader;
}

export interface PropertySummaryProps {
  readonly property: PropertyDetailHeader;
  readonly placement: SummaryPlacement;
}

const NOT_CONSOLIDATED_NOTE = 'No consolidado — ver anuncios de origen';
const FALLBACK_TITLE = 'Ficha de la vivienda';

// El título es el del anuncio, recortado; sin título (nulo, vacío o en blanco) se usa un
// texto fijo, nunca «No consolidado». Lo comparten `generateMetadata` y el `<h1>`.
export function resolvePropertyTitle(title: string | null): string {
  const trimmed = title?.trim() ?? '';
  return trimmed === '' ? FALLBACK_TITLE : trimmed;
}

interface Fact {
  readonly label: string;
  readonly value: string | null;
  readonly wide?: boolean;
}

function buildFacts(property: PropertyDetailHeader): readonly Fact[] {
  const surface = resolveConsolidatedField(property.surfaceM2);
  const rooms = resolveConsolidatedField(property.rooms);
  const bathrooms = resolveConsolidatedField(property.bathrooms);
  return [
    { label: 'Tipo', value: propertyTypeLabel(property.propertyType) },
    { label: 'Operación', value: operationLabel(property.operation) },
    { label: 'Superficie', value: surface.kind === 'value' ? `${String(surface.value)} m²` : null },
    { label: 'Habitaciones', value: rooms.kind === 'value' ? String(rooms.value) : null },
    { label: 'Baños', value: bathrooms.kind === 'value' ? String(bathrooms.value) : null },
    { label: 'Planta', value: floorLabel(property.floor) },
    { label: 'Dirección', value: property.address, wide: true },
  ];
}

function renderValue(value: string | null): ReactNode {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sin dato</span>
      </>
    );
  }
  return value;
}

export function PropertySummary({ property, placement }: PropertySummaryProps): ReactElement {
  const price = formatPriceCents(property.minPriceCents);
  const priceClass =
    property.minPriceCents === null
      ? 'property-summary__price property-summary__price--missing'
      : 'property-summary__price tabular-nums';
  return (
    <div className={`property-summary property-summary--${placement}`}>
      <p className={priceClass}>{price}</p>
      <p className="property-summary__count">
        {`Disponible en ${String(property.listingCount)} ${property.listingCount === 1 ? 'fuente' : 'fuentes'}`}
      </p>
    </div>
  );
}

export function PropertyHeader({ property }: PropertyHeaderProps): ReactElement {
  const facts = buildFacts(property);
  const hasMissing = facts.some((fact) => fact.value === null);
  return (
    <div className="property-header">
      <PropertySummary property={property} placement="panel" />
      <div className="property-facts">
        <dl className="property-facts__list">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className={fact.wide === true ? 'property-facts__item property-facts__item--wide' : 'property-facts__item'}
            >
              <dt>{fact.label}</dt>
              <dd>{renderValue(fact.value)}</dd>
            </div>
          ))}
        </dl>
        {hasMissing ? (
          <p className="property-facts__note">
            <span aria-hidden="true">— </span>
            {NOT_CONSOLIDATED_NOTE}
          </p>
        ) : null}
      </div>
    </div>
  );
}
