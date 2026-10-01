// ROADMAP 2.5 (refresh-retention-policy, S4; decisión 107) — tombstone de los
// anuncios inactivos a los 180 días. Es una REDACCIÓN por UPDATE, no un borrado:
//
// - `listing_versions.description` y `raw` de TODAS las versiones del anuncio
//   pasan a NULL (contenido libre y payload de la fuente, donde vive lo
//   personal y de marketing) y `listings.thumbnail_url` también;
// - el anuncio pasa a `status = 'removed'` y se sella `tombstoned_at`.
//
// Se conserva todo lo demás: la fila del anuncio, el precio y los campos
// estructurados de cada versión (historial), `listing_features`,
// `property_listings` con puntuación y desglose por señal, y toda la evidencia
// de deduplicación. Ningún DELETE: no se dispara ninguna FK en cascada.
//
// ES UNA EXCEPCIÓN A "listings no se sobrescribe" (CLAUDE.md), autorizada en la
// decisión 107: el historial de precios sigue intacto, el contenido libre no.
// La redacción es irreversible; solo una reaparición del anuncio en un barrido
// repuebla el contenido (`listing-writer`).
//
// Lo usa el propietario (`apps/ingestion`); Zod-free y sin `process.env`.
import { sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { refreshPropertyVisibility } from './visibility.js';

export interface TombstoneOptions {
  // Un anuncio caduca cuando `inactive_since <= now() - retentionDays` (RP-10).
  readonly retentionDays: number;
  // Tope de anuncios por llamada: el tombstone de un tick nunca es ilimitado.
  readonly batchSize: number;
}

// Devuelve cuántos anuncios se redactaron. `FOR UPDATE SKIP LOCKED` evita
// esperar (o pisar) a un barrido que esté reactivando el mismo anuncio; el
// índice parcial `listings_tombstone_candidates_idx` sirve la selección.
// Idempotente: los ya redactados salen del predicado (`status = 'removed'`).
export async function tombstoneExpiredListings(db: Database, options: TombstoneOptions): Promise<number> {
  return db.transaction(async (tx): Promise<number> => {
    // Se eligen y bloquean los ids UNA vez y las dos escrituras actúan sobre
    // esa misma lista (repetir la subconsulta podría elegir otro lote).
    const selected = await tx.execute<{ id: string }>(sql`
      select id from listings
       where status = 'inactive'
         and tombstoned_at is null
         and inactive_since <= now() - make_interval(days => ${options.retentionDays}::integer)
       order by inactive_since, id
       limit ${options.batchSize}::integer
         for update skip locked
    `);
    if (selected.rows.length === 0) {
      return 0;
    }
    const ids = sql.join(
      selected.rows.map((row) => sql`${row.id}::uuid`),
      sql`, `
    );
    await tx.execute(sql`
      update listing_versions set description = null, raw = null
       where listing_id in (${ids}) and (description is not null or raw is not null)
    `);
    const redacted = await tx.execute<{ id: string }>(sql`
      update listings
         set status = 'removed', tombstoned_at = now(), thumbnail_url = null, updated_at = now()
       where id in (${ids})
      returning id
    `);
    // El anuncio pasa de `inactive` a `removed`: el recuento de activos no cambia,
    // pero la caché de la vivienda se recalcula por si su fallback (mínimo de
    // todos) dependiera del grupo. Es barato y coherente con el resto de caminos
    // que tocan anuncios.
    await refreshPropertyVisibility(tx, { listingIds: redacted.rows.map((row) => row.id) });
    return redacted.rows.length;
  });
}
