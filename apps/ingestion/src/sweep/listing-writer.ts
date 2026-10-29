// Paso 1.7 — listing-writer.ts (diseño D3, D5; PERSIST-1..8). Único módulo,
// junto a coverage-store.ts, que toca la base de datos real desde este
// cambio. Implementa la mitad de `SweepStore` (store.ts, fase 1) que
// escribe `listings`/`listing_versions`; el compositor (fase 4, fuera de
// este lote) la compone junto a coverage-store.ts en un único objeto.
//
// UNA transacción por página (diseño D3): upserts + versiones + avance del
// cursor de coverage_jobs, todo dentro de la misma transacción — así el
// cursor nunca avanza por delante de filas no comprometidas.
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import {
  coverageJobs,
  listingPresenceChecks,
  listingVersions,
  listings,
  refreshPropertyVisibility,
} from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

import { encodeJobCursor } from './job-cursor.js';
import type { PersistPageInput, PersistPageItem, PersistPageOutcome } from './store.js';
import { equalVersionColumns, projectToVersionColumns } from './version-columns.js';
import type { VersionColumns } from './listing-field-policy.js';

export interface ListingWriter {
  // La mitad de SweepStore (store.ts) que este fichero implementa.
  persistPage(input: PersistPageInput): Promise<PersistPageOutcome>;
}

type ListingVersionRow = typeof listingVersions.$inferSelect;

// `listing_versions.property_type` es nullable en el esquema (a diferencia
// de `operation`, NOT NULL) aunque `Listing.propertyType` es obligatorio y
// esta escritura nunca lo deja en null — la cadena vacía de abajo es una
// guarda de tipos que jamás se ejercita en la práctica; si algún día lo
// hiciera, fuerza una versión nueva en vez de enmascarar el hueco como "sin
// cambio" (mismo espíritu que R2: fallar audible, no en silencio).
function projectRowToVersionColumns(row: ListingVersionRow): VersionColumns {
  return {
    priceCents: row.priceCents,
    surfaceM2: row.surfaceM2 ?? undefined,
    rooms: row.rooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    floor: row.floor ?? undefined,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    address: row.address ?? undefined,
    propertyType: row.propertyType ?? '',
    operation: row.operation,
  };
}

export function createListingWriter(db: Database): ListingWriter {
  async function persistPage(input: PersistPageInput): Promise<PersistPageOutcome> {
    return db.transaction(async (tx): Promise<PersistPageOutcome> => {
      // La unidad de trabajo del store.ts nombra jobId/sourceUuid una vez
      // por página; secuencial adrede (no Promise.all): las páginas
      // comparten una única conexión de transacción, y persistir en
      // paralelo sobre ella corrompería el orden de los statements.
      //
      // ROADMAP 2.5 (decisión 106, reactivación básica): antes de los upserts se
      // lee qué anuncios de la página NO están activos, para saber cuáles de
      // ellos se reactivan al verse de nuevo. Una sola consulta por página.
      const nonActiveExternalIds = new Set(
        input.items.length === 0
          ? []
          : (
              await tx
                .select({ externalId: listings.externalId })
                .from(listings)
                .where(
                  and(
                    eq(listings.sourceId, input.sourceUuid),
                    inArray(
                      listings.externalId,
                      input.items.map((item) => item.listing.externalId)
                    ),
                    ne(listings.status, 'active')
                  )
                )
            ).map((row) => row.externalId)
      );
      const reactivatedListingIds: string[] = [];
      const seenListingIds: string[] = [];

      async function persistItem(item: PersistPageItem): Promise<'inserted' | 'versioned' | 'unchanged'> {
        const { raw, listing } = item;
        const now = new Date();

        // Paso 1: upsert de identidad sobre la clave natural
        // (source_id, external_id) — diseño D5 paso 2.
        //
        // Spec PERSIST-3 es más estricta que el ejemplo de prosa de D5
        // ("nunca vaciar": escribir url/location/coordinatesObfuscated solo
        // cuando el valor entrante está definido, lo que sugiere permitir
        // sobrescritura). PERSIST-3 dice, sin condición: en una re-visión
        // NO se modifican `url`, `location`, `location_id`,
        // `coordinates_obfuscated` ni `created_at` — solo `last_seen_at` y
        // `updated_at` (y opcionalmente `status`, que P6 decide no tocar
        // nunca en este cambio). El requisito (los criterios de aceptación)
        // gana sobre el ejemplo de diseño: el `set` de conflicto de abajo
        // solo toca las dos columnas de presencia.
        const [listingRow] = await tx
          .insert(listings)
          .values({
            sourceId: input.sourceUuid,
            externalId: listing.externalId,
            url: listing.url,
            lastSeenAt: now,
            updatedAt: now,
            // `listing.coordinates` → `listings.location` ({x: lon, y: lat},
            // diseño D4). Se escribe siempre que el normalizador la emite —
            // es decir, siempre que la fuente aporta latitude/longitude
            // (`sources/idealista/normalizer.ts:36-39`; verificado en el
            // corpus real de ROADMAP 1.7: 50/50 filas con `location`
            // poblada). El spread condicional de abajo existe para una
            // fuente que no las aporte, no porque este adaptador las omita
            // (corregido en ROADMAP 1.8, DOC-1 — el comentario anterior
            // afirmaba justo lo contrario; ver `docs/AI-NOTES.md`).
            ...(listing.coordinates !== undefined
              ? { location: { x: listing.coordinates.longitude, y: listing.coordinates.latitude } }
              : {}),
            // Tri-estado deliberado (decisión 026): solo se escribe cuando
            // el normalizador emite una señal explícita.
            ...(listing.coordinatesObfuscated !== undefined
              ? { coordinatesObfuscated: listing.coordinatesObfuscated }
              : {}),
            // ROADMAP 1.11 — identity-column (decisión 059): mismo spread
            // condicional que arriba, se escribe solo en la primera vista.
            // `onConflictDoUpdate.set` de abajo NO incluye thumbnailUrl
            // (PERSIST-3, sin cambios): una re-visión nunca lo sobrescribe.
            ...(listing.thumbnailUrl !== undefined ? { thumbnailUrl: listing.thumbnailUrl } : {}),
            // ROADMAP 1.12 — identity-column (decisión 062): mismo
            // tratamiento que thumbnailUrl; `onConflictDoUpdate.set` de abajo
            // tampoco incluye numPhotos.
            ...(listing.numPhotos !== undefined ? { numPhotos: listing.numPhotos } : {}),
            // `listing.location` (ineCode/municipio…) → `listings.location_id`
            // FK: siempre `undefined` desde esta fuente (diseño D4/D9) — no
            // hay resolución ine_code→locations.id que implementar aquí
            // porque nunca se ejercita; queda fuera de alcance de este cambio.
          })
          .onConflictDoUpdate({
            target: [listings.sourceId, listings.externalId],
            set: {
              lastSeenAt: now,
              updatedAt: now,
              status: 'active',
              inactiveSince: null,
              inactiveReason: null,
              // ROADMAP 2.5 (S4; decisión 107): la reaparición de un anuncio con
              // tombstone limpia la marca y REPUEBLA la miniatura, solo para él.
              // En un SET de `ON CONFLICT` las expresiones ven la fila ANTERIOR,
              // así que `listings.tombstoned_at` es el valor previo a este
              // UPDATE. Para cualquier otro anuncio la miniatura sigue congelada
              // en la primera vista (decisión 059).
              tombstonedAt: null,
              thumbnailUrl: sql`case when ${listings.tombstonedAt} is not null then excluded.thumbnail_url else ${listings.thumbnailUrl} end`,
            },
          })
          .returning({ id: listings.id });

        if (!listingRow) {
          throw new Error(
            `No se pudo resolver la identidad de listings para external_id="${listing.externalId}".`
          );
        }
        const listingId = listingRow.id;
        seenListingIds.push(listingId);
        if (nonActiveExternalIds.has(listing.externalId)) {
          reactivatedListingIds.push(listingId);
        }

        // Paso 2: leer la última versión por `version DESC LIMIT 1`,
        // deliberadamente NO `WHERE is_current` (diseño D5 paso 3) — si la
        // cabeza llegara a faltar, esto sigue devolviendo el número de
        // sucesor correcto en vez de reintentar version=1 contra el índice
        // único (listing_versions.ts:58).
        const [latestVersionRow] = await tx
          .select()
          .from(listingVersions)
          .where(eq(listingVersions.listingId, listingId))
          .orderBy(desc(listingVersions.version))
          .limit(1);

        // La MISMA proyección alimenta la comparación Y la escritura
        // (diseño D4): cierra la trampa de redondeo (78.5→79) de raíz, en
        // vez de confiar en que el cast implícito de Postgres redondee
        // igual que Math.round en version-columns.ts.
        const projected = projectToVersionColumns(listing);

        if (latestVersionRow === undefined) {
          // Nunca visto: version 1, sin demote (diseño D5 paso 5).
          await tx.insert(listingVersions).values({ listingId, version: 1, isCurrent: true, raw, ...projected });
          return 'inserted';
        }

        // ROADMAP 2.5 (S4; decisión 107): si la última versión está REDACTADA
        // (`raw IS NULL`, tombstone) se inserta una versión nueva aunque las
        // columnas no hayan cambiado: restaura descripción y `raw` y la
        // historia de precios continúa. El writer nunca deja `raw` nulo en una
        // versión propia, así que esto solo ocurre tras una redacción.
        const latestIsRedacted = latestVersionRow.raw === null;
        if (!latestIsRedacted && equalVersionColumns(projected, projectRowToVersionColumns(latestVersionRow))) {
          return 'unchanged';
        }

        // Demote ANTES de insertar (diseño D5 paso 5) — orden determinante:
        // `listing_versions_current_idx` es un índice único parcial NO
        // DEFERRABLE, comprobado por sentencia; insertar antes de demover
        // dispara 23505 en vez de suceder limpiamente.
        await tx
          .update(listingVersions)
          .set({ isCurrent: false })
          .where(and(eq(listingVersions.listingId, listingId), eq(listingVersions.isCurrent, true)));

        await tx.insert(listingVersions).values({
          listingId,
          version: latestVersionRow.version + 1,
          isCurrent: true,
          raw,
          ...projected,
        });
        return 'versioned';
      }

      let inserted = 0;
      let versioned = 0;
      let unchanged = 0;
      for (const item of input.items) {
        const outcome = await persistItem(item);
        if (outcome === 'inserted') {
          inserted += 1;
        } else if (outcome === 'versioned') {
          versioned += 1;
        } else {
          unchanged += 1;
        }
      }

      // ROADMAP 2.5 (S3; decisión 105, S-LR-17): un anuncio visto de nuevo deja
      // de ser sospechoso de ausencia — su fila de la cola de verificación de
      // presencia se borra en la MISMA transacción que registra el avistamiento.
      if (seenListingIds.length > 0) {
        await tx.delete(listingPresenceChecks).where(inArray(listingPresenceChecks.listingId, seenListingIds));
      }

      // ROADMAP 2.5 (decisión 109): los anuncios reactivados vuelven a contar
      // en su vivienda. Se refresca DESPUÉS de todas las versiones de la
      // página (el precio mínimo usa la versión vigente ya actualizada), en la
      // MISMA transacción. No toca `property_listings`: reactivar no reagrupa.
      await refreshPropertyVisibility(tx, { listingIds: reactivatedListingIds });

      // Avance del cursor de coverage_jobs, MISMA transacción (diseño D3,
      // resuelve D-b): así el cursor nunca queda por delante de filas no
      // comprometidas. `nextCursor === undefined` significa que el barrido
      // se completa con esta página (contrato de store.ts, confirmado
      // contra `isSweepComplete` en sweep-runner.ts/idealista-source.ts:
      // `page.nextCursor === undefined` es exactamente esa condición) — el
      // cierre real (`status='done'`, `cursor=null`) lo hace
      // `finishJob(kind:'completed')`, invocado aparte justo después por
      // sweep-runner; no se toca `cursor` aquí para no pisar esa escritura.
      if (input.nextCursor !== undefined) {
        await tx
          .update(coverageJobs)
          // ROADMAP 3.4 (decisión 258, parte 2; D14b): cada página persistida renueva el arrendamiento del job
          // (reloj de la base de datos), en la MISMA transacción que el cursor: si la página se revierte, el
          // arrendamiento tampoco avanza.
          .set({ cursor: encodeJobCursor(input.fingerprint, input.nextCursor), leaseRenewedAt: sql`now()` })
          .where(eq(coverageJobs.id, input.jobId));
      }

      return { inserted, versioned, unchanged };
    });
  }

  return { persistPage };
}
