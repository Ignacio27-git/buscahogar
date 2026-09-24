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
export async function reserveDailyBudget(
  db: Database,
  sourceId: string,
  reservation: BudgetReservation,
  searchCap: number
): Promise<LedgerState | null> {
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
    where ${reservation.searchReserved}::integer <= ${searchCap}::integer
    on conflict (day, source_id) do update
      set search_requests = daily_request_budget.search_requests + ${reservation.searchReserved},
          token_requests  = daily_request_budget.token_requests + ${reservation.tokenReserved},
          updated_at = now()
      where daily_request_budget.search_requests + ${reservation.searchReserved} <= daily_request_budget.search_cap
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
  db: Database,
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
