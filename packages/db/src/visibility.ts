// ROADMAP 2.5 (refresh-retention-policy, S2; decisión 109) — caché de
// visibilidad de `properties`. Una sola función SQL que usan todos los caminos
// que cambian el estado de un anuncio o rehacen la vivienda (consolidación,
// reactivación en el escritor de listings y, en fases posteriores,
// verificación y purga de zona):
//
// - `active_listing_count` = nº de anuncios del grupo con `status = 'active'`.
//   La búsqueda solo devuelve viviendas con `active_listing_count > 0`.
// - `min_price_cents` = mínimo del precio VIGENTE entre los anuncios activos;
//   si ninguno lo está, el mínimo de todos (solo es alcanzable desde el
//   detalle, que sigue listando los inactivos: decisión 109).
//
// Es una caché por vivienda calculada al escribir, no un join en la consulta
// de búsqueda: así siguen valiendo los planes medidos en ROADMAP 2.4
// (decisión 100). No toca `property_listings` ni `updated_at` (el orden por
// defecto de la búsqueda no debe alterarse por un cambio de visibilidad), y
// bloqueo, hidratación y agrupación siguen ajenos al estado (decisión 068).
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from './db.js';

// Basta `execute`: la función se llama tanto con la conexión como con la
// transacción de `db.transaction(...)`, que no es un `Database` completo.
export type VisibilityExecutor = Pick<Database, 'execute'>;

// El alcance nombra viviendas directamente, listings (se resuelven a su
// vivienda por `property_listings`) o TODAS las viviendas (tras reconstruir la
// caché entera en `writeConsolidation`, donde una lista de ids superaría el
// límite de parámetros de PostgreSQL).
export type VisibilityScope =
  | { readonly propertyIds: readonly string[] }
  | { readonly listingIds: readonly string[] }
  | { readonly all: true };

// Tope de ids por sentencia: cada id es un parámetro ligado y PostgreSQL
// admite 65 535 por sentencia.
const MAX_IDS_PER_STATEMENT = 5_000;

// Devuelve cuántas viviendas cambiaron. Idempotente: una segunda ejecución
// sobre el mismo estado devuelve 0 (la guarda `IS DISTINCT FROM` evita
// reescrituras vacías).
export async function refreshPropertyVisibility(
  executor: VisibilityExecutor,
  scope: VisibilityScope
): Promise<number> {
  if ('all' in scope) {
    return runRefresh(executor, sql`select p0.id as property_id from properties p0`);
  }
  const ids = 'propertyIds' in scope ? scope.propertyIds : scope.listingIds;
  let changed = 0;
  for (let offset = 0; offset < ids.length; offset += MAX_IDS_PER_STATEMENT) {
    const list = sql.join(
      ids.slice(offset, offset + MAX_IDS_PER_STATEMENT).map((id) => sql`${id}::uuid`),
      sql`, `
    );
    const scopedProperties =
      'propertyIds' in scope
        ? sql`select unnest(array[${list}]) as property_id`
        : sql`select distinct pl0.property_id from property_listings pl0 where pl0.listing_id in (${list})`;
    changed += await runRefresh(executor, scopedProperties);
  }
  return changed;
}

async function runRefresh(executor: VisibilityExecutor, scopedProperties: SQL): Promise<number> {
  const result = await executor.execute(sql`
    update properties p
       set active_listing_count = agg.active_count,
           min_price_cents = agg.min_price
      from (
        select scoped.property_id,
               (count(*) filter (where l.status = 'active'))::int as active_count,
               coalesce(
                 min(lv.price_cents) filter (where l.status = 'active'),
                 min(lv.price_cents)
               )::bigint as min_price
          from (${scopedProperties}) as scoped
          join property_listings pl on pl.property_id = scoped.property_id
          join listings l on l.id = pl.listing_id
          join listing_versions lv on lv.listing_id = l.id and lv.is_current
         group by scoped.property_id
      ) as agg
     where p.id = agg.property_id
       and (p.active_listing_count is distinct from agg.active_count
            or p.min_price_cents is distinct from agg.min_price)
  `);
  return result.rowCount ?? 0;
}
