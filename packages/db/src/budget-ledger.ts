// ROADMAP 1.13 (diseño DD-12) — ledger PERSISTENTE de presupuesto diario de
// peticiones: UNA sentencia atómica de reserva, sin lectura-modificación-
// escritura entre procesos concurrentes. Zod-free (decisión 023):
// `packages/db` nunca importa Zod, tipos planos únicamente — este módulo es
// infraestructura interna, nunca recibe entrada externa directamente.
//
// Fail-closed (A-9.1) es ESTRUCTURAL, no una rama `catch`: la reserva
// devuelve una fila (reserva concedida) o `null` (tope superado, sin
// reserva), y un error de base de datos se PROPAGA sin capturar — no existe
// ninguna rama en la que un fallo de lectura/escritura del ledger permita
// una petición. El llamador (Unit C, `coverage-worker.ts`) es quien decide
// saltar el tick ante ese rechazo; este módulo nunca lo convierte en éxito.
import type { QuotaLane } from '@buscahogar/core';
import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from './db.js';
import { dailyRequestBudget } from './tables.js';
import { utcDayStart } from './time.js';

export interface BudgetReservation {
  readonly searchReserved: number;
  readonly tokenReserved: number;
}

export interface LedgerState {
  readonly searchRequests: number;
  readonly tokenRequests: number;
}

// ROADMAP 2.5 (decisión 104) — techo del carril de refresco: la parte del tope
// diario que el refresco puede gastar EN TOTAL. `fraction` llega validada en
// [0, 1] desde el composition root (Zod); aun así se acota aquí (defensa en
// profundidad): una fracción negativa o no finita da 0 (refresco desactivado)
// y el techo nunca supera el tope. La pequeña tolerancia evita que el error de
// coma flotante recorte una unidad (100 × 0.29 = 28.999999999999996).
const CEILING_EPSILON = 1e-9;

export function refreshLaneCeiling(dailySearchCap: number, fraction: number): number {
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return 0;
  }
  return Math.min(dailySearchCap, Math.floor(dailySearchCap * fraction + CEILING_EPSILON));
}

// Misma forma que `SweepBudget.snapshot()`
// (`apps/ingestion/src/sources/idealista/budget.ts`), pero definida aquí de
// forma ESTRUCTURAL: `packages/db` nunca importa de `apps/ingestion`
// (CLAUDE.md — los dos apps no se importan entre sí, se comunican solo por
// base de datos).
export interface BudgetSnapshotLike {
  readonly search: number;
  readonly token: number;
}

// El día se calcula SIEMPRE con el reloj del propio Postgres (DD-11), nunca
// con el del proceso Node que llama — casteado a `date` para que coincida
// con el tipo de la columna `day` y con la clave del índice único
// `daily_request_budget_day_source_idx`.
function todaySql(): SQL {
  return sql`(${utcDayStart()})::date`;
}

// CORRECCIÓN post-verificación (work unit B, hallazgo del orchestrator) —
// el tope se respeta en AMBAS ramas: el `INSERT ... SELECT ... WHERE`
// filtra la fila fuente en la PRIMERA reserva del día para un (day,
// source), y el `ON CONFLICT ... DO UPDATE ... WHERE` filtra cualquier
// reserva posterior sobre una fila ya existente. Sigue siendo UNA sola
// sentencia atómica (DD-12): no hay hueco de lectura-modificación-escritura
// entre procesos concurrentes en ninguna de las dos ramas. Cero filas
// devueltas ⇒ la reserva no cupo en el tope diario vigente para esa fila ⇒
// NINGUNA reserva, NINGUNA petición debe emitirse (A-9.1).
//
// El `CHECK daily_request_budget_search_requests_check` (esquema) es el
// respaldo ESTRUCTURAL: protege la tabla frente a cualquier otro escritor
// que no pase por esta función. Este `WHERE` en el `SELECT` fuente evita
// que el uso normal de esta función dispare jamás ese CHECK — una reserva
// por encima del tope nunca llega a intentar el `INSERT`, así que el
// llamador recibe el mismo `null` limpio que la rama de conflicto, nunca
// una excepción por violación de CHECK. Un error de base de datos genuino
// (p. ej. la fuente no existe) sigue propagándose sin capturar — el
// fail-closed sigue siendo estructural, no una rama `catch` que decide.
//
// DD-12 en `sdd/on-demand-coverage/design` (obs #215) especifica
// exactamente el `INSERT ... VALUES ... ON CONFLICT ... DO UPDATE ...
// WHERE` original, que tiene este mismo hueco sin cerrar — no es una
// decisión de diseño que acepte el hueco, es una omisión del diseño (no
// existe ninguna cláusula que lo mencione). Reflejado en
// `sdd/on-demand-coverage/apply-progress` para que `sdd-verify` señale que
// el propio DD-12 necesita la misma corrección.
//
// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104) — `laneCeiling`
// opcional: TECHO sobre el gasto TOTAL del día para el carril de refresco
// (`floor(dailySearchCap × REFRESH_BUDGET_FRACTION)`, calculado por el
// llamador). NO es un contador aparte: ambas ramas comparan contra
// `least(cap, laneCeiling)`, así que el gasto a demanda también cuenta contra
// él y la demanda del usuario (sin techo) conserva siempre al menos
// `cap - ceiling`. `least()` ignora los NULL, de modo que sin techo el
// comportamiento es EXACTAMENTE el de antes. Techo 0 = ninguna reserva de
// refresco puede concederse.
export async function reserveDailyBudget(
  db: Pick<Database, 'execute'>,
  sourceId: string,
  reservation: BudgetReservation,
  searchCap: number,
  laneCeiling?: number
): Promise<LedgerState | null> {
  const ceiling = laneCeiling ?? null;
  // Los dos operandos de la comparación del `WHERE` del `SELECT` fuente son
  // AMBOS parámetros ligados sin ninguna columna real de por medio (a
  // diferencia del `WHERE` de `ON CONFLICT ... DO UPDATE`, donde
  // `daily_request_budget.search_requests`/`search_cap` ya son columnas
  // `integer` reales y fijan el tipo). Sin columna de referencia, Postgres
  // no puede inferir el tipo de ninguno de los dos parámetros y los trata
  // como `unknown` → compara como TEXTO: `'2' <= '10'` es FALSO
  // (comparación de caracteres, `'2' > '1'`), aunque `2 <= 10` sea
  // verdadero. Verificado empíricamente contra Postgres real antes de esta
  // corrección — el CAST explícito es obligatorio aquí, no cosmético.
  const result = await db.execute<{ search_requests: number; token_requests: number }>(sql`
    insert into daily_request_budget (day, source_id, search_requests, token_requests, search_cap)
    select ${todaySql()}, ${sourceId}, ${reservation.searchReserved}, ${reservation.tokenReserved}, ${searchCap}
    where ${reservation.searchReserved}::integer <= least(${searchCap}::integer, ${ceiling}::integer)
    on conflict (day, source_id) do update
      set search_requests = daily_request_budget.search_requests + ${reservation.searchReserved},
          token_requests  = daily_request_budget.token_requests + ${reservation.tokenReserved},
          updated_at = now()
      where daily_request_budget.search_requests + ${reservation.searchReserved}
        <= least(daily_request_budget.search_cap, ${ceiling}::integer)
    returning search_requests, token_requests
  `);

  const [row] = result.rows;
  return row ? { searchRequests: row.search_requests, tokenRequests: row.token_requests } : null;
}

// DD-12 — reconciliación tras el barrido: `reservado - real` se resta del
// contador. Si el proceso muere ANTES de esta llamada, la reserva queda tal
// cual — sobre-cuenta, nunca sub-cuenta (A-9.2: mejor perder un poco de
// cobertura que gastar cuota de más).
export async function reconcileDailyBudget(
  db: Pick<Database, 'update'>,
  sourceId: string,
  reserved: BudgetReservation,
  actual: BudgetSnapshotLike
): Promise<void> {
  const searchDelta = reserved.searchReserved - actual.search;
  const tokenDelta = reserved.tokenReserved - actual.token;
  if (searchDelta === 0 && tokenDelta === 0) {
    return;
  }

  await db
    .update(dailyRequestBudget)
    .set({
      searchRequests: sql`${dailyRequestBudget.searchRequests} - ${searchDelta}`,
      tokenRequests: sql`${dailyRequestBudget.tokenRequests} - ${tokenDelta}`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(dailyRequestBudget.day, todaySql()), eq(dailyRequestBudget.sourceId, sourceId)));
}

// ROADMAP 3.3 (decisión 248; diseño D4b, D5, D6, D6b, D7) — RESERVA ÚNICA de peticiones de
// búsqueda: TODO gasto de la API de Idealista pasa por aquí, con su carril. En UNA
// transacción:
//   1. materializa el mes en curso por herencia (PD10): si no existe la fila, la crea con el
//      total y la reserva del mes anterior más reciente y los contadores a 0. Sin ninguna fila
//      previa no inserta nada y TODO carril se deniega con `monthly-missing` (decisión 066).
//   2. aplica el techo mensual del carril con un UPDATE condicional que bloquea la fila
//      (`FOR UPDATE`): dos procesos concurrentes se serializan sobre ella (S7.4). La regla es la
//      de `monthlyGrant` (packages/core): batch, refresco y presencia comparten `total - reserva`,
//      on-demand llega hasta `total`; el batch recibe una concesión PARCIAL, el resto exacta.
//   3. para los carriles del worker, reserva además contra el cupo diario (`reserveDailyBudget`);
//      un rechazo diario REVIERTE el paso mensual entero (incluida la fila heredada). El batch
//      reserva solo contra el mes (D7): un día de barrido masivo no debe agotar el cupo diario
//      de la demanda de usuario.
// Fail-closed estructural: ningún `catch` convierte un error de base de datos en concesión; el
// único error capturado es la señal interna de rechazo diario, que solo sirve para revertir.
export type { QuotaLane };

export interface RequestBudgetRequest {
  readonly lane: QuotaLane;
  // Peticiones de búsqueda pedidas (entero >= 1). El batch acepta una concesión parcial.
  readonly searchRequested: number;
  readonly tokenReserved: number;
}

// Cupo diario para los carriles del worker; el batch no lo usa (D7). `laneCeiling` es el techo
// del carril de refresco sobre el gasto total del día (decisión 104).
export interface DailyBudgetLimit {
  readonly cap: number;
  readonly laneCeiling?: number;
}

// Recibo de una reserva concedida: lleva el MES en que se reservó (la reconciliación devuelve
// lo no gastado a ese mes aunque el tick cruce el cambio de mes), el carril y lo concedido.
export interface RequestBudgetGrant {
  readonly granted: true;
  // 'YYYY-MM-DD' del primer día del mes UTC.
  readonly month: string;
  readonly lane: QuotaLane;
  readonly searchGranted: number;
  readonly tokenReserved: number;
}

export interface RequestBudgetDenial {
  readonly granted: false;
  // monthly-missing: ninguna fila mensual (ni heredable). monthly: techo mensual del carril.
  // daily: cupo diario (el paso mensual se revirtió).
  readonly reason: 'monthly-missing' | 'monthly' | 'daily';
}

export type RequestBudgetResult = RequestBudgetGrant | RequestBudgetDenial;

// Columna del contador de cada carril. Lista cerrada: nunca se interpola texto de entrada.
const LANE_COLUMN: Readonly<Record<QuotaLane, string>> = {
  batch: 'batch_requests',
  'on-demand': 'on_demand_requests',
  refresh: 'refresh_requests',
};

// Mes UTC en curso con el reloj de Postgres (`now()` es el instante de inicio de la transacción).
const CURRENT_MONTH_SQL = sql`date_trunc('month', now() at time zone 'utc')::date`;

// Señal interna para revertir la transacción cuando el cupo diario deniega.
class DailyBudgetDenied extends Error {}

function assertValidRequest(request: RequestBudgetRequest, daily: DailyBudgetLimit | undefined): void {
  if (!Number.isInteger(request.searchRequested) || request.searchRequested < 1) {
    throw new RangeError(
      `reserveRequestBudget: searchRequested debe ser un entero >= 1 (recibido ${String(request.searchRequested)}).`
    );
  }
  if (!Number.isInteger(request.tokenReserved) || request.tokenReserved < 0) {
    throw new RangeError(
      `reserveRequestBudget: tokenReserved debe ser un entero >= 0 (recibido ${String(request.tokenReserved)}).`
    );
  }
  if (request.lane !== 'batch' && daily === undefined) {
    throw new Error(
      `reserveRequestBudget: el carril "${request.lane}" exige el tope diario (solo el batch reserva únicamente contra el mes).`
    );
  }
}

// Concesión del carril en SQL: misma regla que `monthlyGrant` (packages/core). `remaining` nunca es
// negativo (el gasto a demanda dentro de la reserva puede superar el techo del batch).
function grantSql(lane: QuotaLane, requested: number): SQL {
  const ceiling = lane === 'on-demand' ? sql`t.total_cap` : sql`t.total_cap - t.reserve`;
  const remaining = sql`greatest(0, ${ceiling} - t.search_requests)`;
  return lane === 'batch'
    ? sql`least(${requested}::integer, ${remaining})`
    : sql`case when ${requested}::integer <= ${remaining} then ${requested}::integer else 0 end`;
}

export async function reserveRequestBudget(
  db: Database,
  sourceId: string,
  request: RequestBudgetRequest,
  daily?: DailyBudgetLimit
): Promise<RequestBudgetResult> {
  assertValidRequest(request, daily);
  const laneColumn = sql.identifier(LANE_COLUMN[request.lane]);

  try {
    return await db.transaction(async (tx): Promise<RequestBudgetResult> => {
      // 1. Herencia (PD10). `ON CONFLICT DO NOTHING` sobre la PK: dos primeras reservas del mes
      // concurrentes crean UNA fila; la segunda espera al commit de la primera.
      await tx.execute(sql`
        insert into monthly_request_budget (month, source_id, total_cap, reserve)
        select ${CURRENT_MONTH_SQL}, previous.source_id, previous.total_cap, previous.reserve
        from monthly_request_budget previous
        where previous.source_id = ${sourceId} and previous.month < ${CURRENT_MONTH_SQL}
        order by previous.month desc
        limit 1
        on conflict (month, source_id) do nothing
      `);

      // 2. Techo mensual con bloqueo de fila. Si se esperó a otra transacción, Postgres reevalúa
      // `granted` sobre la versión ya actualizada de la fila (READ COMMITTED).
      const { rows } = await tx.execute<{ granted: number; month: string }>(sql`
        with target as (
          select t.month, t.source_id, ${grantSql(request.lane, request.searchRequested)} as granted
          from monthly_request_budget t
          where t.month = ${CURRENT_MONTH_SQL} and t.source_id = ${sourceId}
          for update of t
        )
        update monthly_request_budget b
        set search_requests = b.search_requests + target.granted,
            ${laneColumn} = b.${laneColumn} + target.granted,
            token_requests = b.token_requests + ${request.tokenReserved}::integer,
            updated_at = now()
        from target
        where b.month = target.month and b.source_id = target.source_id and target.granted > 0
        returning target.granted as granted, b.month::text as month
      `);

      const [row] = rows;
      if (!row) {
        const { rows: existing } = await tx.execute(sql`
          select 1 from monthly_request_budget
          where month = ${CURRENT_MONTH_SQL} and source_id = ${sourceId}
        `);
        return { granted: false, reason: existing.length === 0 ? 'monthly-missing' : 'monthly' };
      }

      // 3. Cupo diario, solo para los carriles del worker.
      if (request.lane !== 'batch' && daily !== undefined) {
        const state = await reserveDailyBudget(
          tx,
          sourceId,
          { searchReserved: row.granted, tokenReserved: request.tokenReserved },
          daily.cap,
          daily.laneCeiling
        );
        if (state === null) {
          throw new DailyBudgetDenied();
        }
      }

      return {
        granted: true,
        month: row.month,
        lane: request.lane,
        searchGranted: row.granted,
        tokenReserved: request.tokenReserved,
      };
    });
  } catch (error) {
    if (error instanceof DailyBudgetDenied) {
      return { granted: false, reason: 'daily' };
    }
    throw error;
  }
}

// Reconciliación tras el barrido: devuelve al registro mensual (en el MES DEL RECIBO, no en el
// mes en curso) y al contador de su carril lo concedido y no gastado; los carriles del worker
// también devuelven al cupo diario. Solo reembolsa (`gastado <= concedido` por construcción: el
// tope duro del barrido es la propia concesión). Si el proceso muere antes de llamarla, la
// reserva queda tal cual: sobre-cuenta, nunca sub-cuenta (A-9.2).
export async function reconcileRequestBudget(
  db: Database,
  sourceId: string,
  grant: RequestBudgetGrant,
  actual: BudgetSnapshotLike
): Promise<void> {
  const searchRefund = Math.max(0, grant.searchGranted - actual.search);
  const tokenRefund = Math.max(0, grant.tokenReserved - actual.token);
  if (searchRefund === 0 && tokenRefund === 0) {
    return;
  }
  const laneColumn = sql.identifier(LANE_COLUMN[grant.lane]);

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update monthly_request_budget
      set search_requests = search_requests - ${searchRefund}::integer,
          ${laneColumn} = ${laneColumn} - ${searchRefund}::integer,
          token_requests = token_requests - ${tokenRefund}::integer,
          updated_at = now()
      where month = ${grant.month}::date and source_id = ${sourceId}
    `);
    if (grant.lane !== 'batch') {
      await reconcileDailyBudget(
        tx,
        sourceId,
        { searchReserved: grant.searchGranted, tokenReserved: grant.tokenReserved },
        actual
      );
    }
  });
}

export interface MonthlyQuotaSetting {
  // 'YYYY-MM-DD' del primer día del mes UTC.
  readonly month: string;
  readonly totalCap: number;
  readonly reserve: number;
}

export interface StoredMonthlyQuota extends MonthlyQuotaSetting {
  readonly searchRequests: number;
}

// ROADMAP 3.3 (decisión 248; D13) — fija el total y la reserva de un mes (upsert). Es lo único
// que escribe `set-monthly-quota`: NUNCA toca los contadores de gasto (si el mes ya tiene gasto
// lo conserva). Los CHECK de la tabla rechazan `reserva >= total` y un total por debajo de lo ya
// gastado: el error se propaga y el registro queda como estaba.
export async function setMonthlyQuota(
  db: Pick<Database, 'execute'>,
  sourceId: string,
  setting: MonthlyQuotaSetting
): Promise<StoredMonthlyQuota> {
  const { rows } = await db.execute<{ month: string; total_cap: number; reserve: number; search_requests: number }>(sql`
    insert into monthly_request_budget (month, source_id, total_cap, reserve)
    values (${setting.month}::date, ${sourceId}, ${setting.totalCap}::integer, ${setting.reserve}::integer)
    on conflict (month, source_id) do update
      set total_cap = excluded.total_cap, reserve = excluded.reserve, updated_at = now()
    returning month::text as month, total_cap, reserve, search_requests
  `);
  const [row] = rows;
  if (!row) {
    throw new Error('setMonthlyQuota: la sentencia no devolvió la fila guardada.');
  }
  return { month: row.month, totalCap: row.total_cap, reserve: row.reserve, searchRequests: row.search_requests };
}
