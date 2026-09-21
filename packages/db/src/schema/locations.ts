// Jerarquía administrativa canónica, indexada por el código de municipio del
// INE. Es la referencia geográfica compartida por `zones`, `listings` y
// `properties`.
//
// ROADMAP 1.13 (diseño DD-1) — gana tres columnas y un CHECK:
// - `centroid`: `geographyPoint()` nulable (no generada — a diferencia de
//   `listings.locationGeography`/`properties.locationGeography`, aquí NO hay
//   una columna `geometry` origen de la que derivarla: el propio catálogo
//   importado es la fuente). Nulable es load-bearing (DD-5): un municipio
//   que falla la puerta de cordura del importador se siembra IGUAL, sin
//   centroide — nombrable pero no barrible, nunca con una coordenada
//   inventada o interpolada.
// - `sweepRadiusM`: entero nulable, por municipio (A-1). Nulo si y solo si
//   `centroid` es nulo — invariante impuesta por el importador, no por el
//   esquema.
// - `searchName`: texto NOT NULL, plegado de acentos y en minúsculas
//   (`normalizeSearchName`, `packages/core`). Sin él el autocompletado no
//   encuentra "Málaga" ni "Cádiz" — decisión 066/DD-22.
// - CHECK `locations_ine_code_check`: `ine_code` no tenía límite de longitud
//   (R4) — un código de 6 dígitos insertaría sin fallar y después nunca
//   coincidiría con la búsqueda de 5 dígitos de `resolveZoneByIneCode`. Este
//   CHECK lo hace imposible a nivel de base de datos, no solo por disciplina
//   de aplicación (mismo razonamiento que el índice único parcial de A-1/A-6).
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, geographyPoint, id } from './columns.js';

export const locations = pgTable(
  'locations',
  {
    id: id(),
    ineCode: text('ine_code').notNull().unique(),
    municipality: text('municipality').notNull(),
    province: text('province').notNull(),
    provinceCode: text('province_code').notNull(),
    autonomousCommunity: text('autonomous_community').notNull(),
    centroid: geographyPoint('centroid'),
    sweepRadiusM: integer('sweep_radius_m'),
    searchName: text('search_name').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('locations_municipality_idx').on(table.municipality),
    check('locations_ine_code_check', sql`${table.ineCode} ~ '^[0-9]{5}$'`),
  ]
);
