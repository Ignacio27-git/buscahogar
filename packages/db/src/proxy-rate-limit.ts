// ROADMAP 3.4 (decisión 255, D2/D3; R1.1-R1.4) — almacén COMPARTIDO del limitador de ventana fija de
// `apps/web/src/proxy.ts`. Sustituye al `Map` por proceso de la decisión 074 para que todas las
// instancias (Vercel) cuenten sobre el mismo contador.
//
// Zod-free y crypto-free como `client-quota.ts`: `key` llega YA resuelta (HMAC-SHA256 hex). Y
// reloj-free: `nowMs` lo aporta el llamador (a diferencia de `client-quota.ts`, que usa el reloj de
// Postgres) para que la lógica de ventana sea EXACTAMENTE la de `evaluateFixedWindow` del núcleo y se
// pueda comprobar contra ella con instantes inyectados. Este módulo solo devuelve el estado; la
// decisión (permitida / `Retry-After`) la toma `fixedWindowVerdict` del núcleo.
import { sql } from 'drizzle-orm';
import type { FixedWindowParams, FixedWindowState } from '@buscahogar/core';
import type { Database } from './db.js';

export type ProxyRateLimitParams = FixedWindowParams;

export interface ProxyRateLimitStore {
  hit(key: string, nowMs: number, params: ProxyRateLimitParams): Promise<FixedWindowState>;
}

// Filas vencidas que como máximo borra UNA petición (R1.4): trabajo acotado por petición, sin
// planificador. Con tráfico sostenido la tabla se vacía sola; sin tráfico no hay nada que molestar.
export const PROXY_RATE_LIMIT_PURGE_BATCH = 100;

// UNA sola sentencia (R1.2): el CTE `purge` es una sentencia de modificación de datos, así que se
// ejecuta siempre aunque nadie lea su resultado. Detalles que importan:
//   - `FOR UPDATE SKIP LOCKED`: dos peticiones que purgan a la vez no se esperan ni se pisan.
//   - `key_hash <> key`: la fila propia nunca se borra; la reinicia el `ON CONFLICT` de abajo.
//   - `ORDER BY window_start_ms`: recorre el índice por las más antiguas, sin escanear la tabla.
//   - Ventana vencida si `nowMs - window_start_ms >= windowMs`; la misma condición, negada, mantiene
//     la ventana (`< windowMs`) en el upsert, igual que `evaluateFixedWindow`.
//   - `hits` se acota a `max + 1`: basta para distinguir «rechazada» y un cliente abusivo no
//     desborda el entero.
export function createPgProxyRateLimitStore(db: Database): ProxyRateLimitStore {
  return {
    async hit(key, nowMs, params): Promise<FixedWindowState> {
      const result = await db.execute<{ window_start_ms: string | number; hits: number }>(sql`
        with purge as (
          delete from proxy_rate_limit
          where key_hash in (
            select key_hash from proxy_rate_limit
            where window_start_ms <= ${nowMs}::bigint - ${params.windowMs}::bigint
              and key_hash <> ${key}
            order by window_start_ms
            limit ${PROXY_RATE_LIMIT_PURGE_BATCH}
            for update skip locked
          )
        )
        insert into proxy_rate_limit as r (key_hash, window_start_ms, hits)
        values (${key}, ${nowMs}::bigint, 1)
        on conflict (key_hash) do update set
          window_start_ms = case
            when ${nowMs}::bigint - r.window_start_ms < ${params.windowMs}::bigint then r.window_start_ms
            else ${nowMs}::bigint
          end,
          hits = case
            when ${nowMs}::bigint - r.window_start_ms < ${params.windowMs}::bigint
              then least(r.hits + 1, ${params.max}::integer + 1)
            else 1
          end
        returning window_start_ms, hits
      `);

      const row = result.rows[0];
      if (row === undefined) {
        // El upsert siempre devuelve la fila; que no lo haga es un fallo genuino, nunca «permitir».
        throw new Error('proxy_rate_limit: el upsert no devolvió ninguna fila');
      }
      return { count: row.hits, windowStart: Number(row.window_start_ms) };
    },
  };
}
