// Paso 1.7 — proyección a espacio de columna y comparación (diseño D4). El
// conjunto de columnas comparadas se DERIVA de listing-field-policy.ts
// (VERSION_COLUMN_FIELDS), nunca se repite aquí a mano (R2): si un campo
// nuevo se clasifica allí como version-column, empieza a compararse aquí
// sin tocar este fichero.
import type { Listing } from '@buscahogar/core';

import { VERSION_COLUMN_FIELDS, type VersionColumns } from './listing-field-policy.js';

// PostgreSQL redondea al escribir surface_m2 (integer) y rooms/bathrooms
// (smallint) — proyectar con el MISMO redondeo en ambos lados es lo que
// cierra la trampa de precisión (diseño D4, verificado contra
// listing.schema.ts:30-32 vs listing-versions.ts:38-40): sin esto, un
// surfaceM2 fraccional (78.5) compararía 78.5 !== 79 en cada ejecución,
// insertando una versión nueva para siempre — justo lo contrario de R2.
function roundColumn(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value);
}

// La entrada real siempre trae un Listing normalizado; la firma admite
// `undefined` en los campos opcionales porque eso es lo que Listing declara
// — la comparación posterior normaliza null↔undefined, no esta función.
export function projectToVersionColumns(listing: Listing): VersionColumns {
  return {
    priceCents: listing.priceCents,
    surfaceM2: roundColumn(listing.surfaceM2),
    rooms: roundColumn(listing.rooms),
    bathrooms: roundColumn(listing.bathrooms),
    floor: listing.floor,
    title: listing.title,
    description: listing.description,
    address: listing.address,
    propertyType: listing.propertyType,
    operation: listing.operation,
  };
}

// `null` (lectura de la fila, columna nullable) y `undefined` (Listing
// opcional) comparan igual — sin esto, TODA columna nullable no rellenada
// dispararía una versión nueva en cada ejecución (diseño D4).
function normalize(value: number | string | null | undefined): number | string | undefined {
  return value === null ? undefined : value;
}

export function equalVersionColumns(a: VersionColumns, b: VersionColumns): boolean {
  return VERSION_COLUMN_FIELDS.every((field) => normalize(a[field]) === normalize(b[field]));
}
