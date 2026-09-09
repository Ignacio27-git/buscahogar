// Fuentes de datos externas registradas (p. ej. la API de Idealista, o el
// scraping de un portal). Estas fuentes solo se consultan desde
// `apps/ingestion`; la búsqueda nunca las llama en tiempo real (CLAUDE.md).
import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns';

export const sources = pgTable(
  'sources',
  {
    id: id(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    // 'api': fuente consultada mediante una API con cuota (p. ej. Idealista).
    // 'scrape': fuente obtenida mediante scraping de un portal.
    kind: text('kind').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('sources_kind_check', sql`${table.kind} in ('api', 'scrape')`)]
);
