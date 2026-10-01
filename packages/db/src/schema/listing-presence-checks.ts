// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — cola TRANSITORIA
// de anuncios sospechosos de haber desaparecido. Un barrido COMPLETADO que no
// vuelve a ver un anuncio activo de su zona solo lo NOMINA aquí: nunca escribe
// su estado (decisión 039 enmendada). La verificación por `adIds` resuelve la
// fila (se borra) o, si el resultado es ambiguo, la reintenta más tarde.
//
// Una fila por anuncio (PK `listing_id`): nominar dos veces no duplica trabajo
// ni reinicia el reintento (`ON CONFLICT DO NOTHING`). La fila desaparece
// cuando el anuncio se vuelve a ver en un barrido (escritor), cuando la
// verificación lo resuelve o tras agotar los intentos. Es trabajo pendiente,
// no historia: por eso `ON DELETE CASCADE` en ambas claves foráneas.
//
// Solo la escribe y lee el propietario (`apps/ingestion`); ningún rol de
// `apps/web` tiene privilegios de escritura sobre ella.
import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { listings } from './listings.js';
import { zones } from './zones.js';

export const listingPresenceChecks = pgTable(
  'listing_presence_checks',
  {
    listingId: uuid('listing_id')
      .primaryKey()
      .references(() => listings.id, { onDelete: 'cascade' }),
    // Zona cuyo círculo barrido dejó de ver el anuncio: de ella salen el
    // centro y el radio de la petición de verificación.
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    suspectedAt: timestamp('suspected_at', { withTimezone: true }).notNull().defaultNow(),
    // NULL = nunca comprobado (vence de inmediato). No nulo = último intento
    // ambiguo; el siguiente no antes de `PRESENCE_RETRY_BACKOFF_DAYS`.
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    checkAttempts: integer('check_attempts').notNull().default(0),
  },
  (table) => [index('listing_presence_checks_zone_id_idx').on(table.zoneId)]
);
