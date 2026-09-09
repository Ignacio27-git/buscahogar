// Jerarquía administrativa canónica, indexada por el código de municipio del
// INE. Es la referencia geográfica compartida por `zones`, `listings` y
// `properties`.
import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns.js';

export const locations = pgTable(
  'locations',
  {
    id: id(),
    ineCode: text('ine_code').notNull().unique(),
    municipality: text('municipality').notNull(),
    province: text('province').notNull(),
    provinceCode: text('province_code').notNull(),
    autonomousCommunity: text('autonomous_community').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('locations_municipality_idx').on(table.municipality)]
);
