// ROADMAP 1.13 Unit D (diseño DD-14, DD-16 lado web, arbitraje CR-4/CR-12)
// — guarda de APLICACIÓN que decide SI se registra un `coverage_job` para
// una zona no cubierta. `packages/db/src/coverage.ts` deliberadamente NO
// hace esta comprobación por sí sola: el rol INSERT-only (D1) solo puede
// ESCRIBIR `coverage_jobs`, nunca leer `locations.centroid` ni
// `zones.state` — ambas comprobaciones (centroide, tope diario) viven aquí,
// contra el rol de SOLO LECTURA, ANTES de intentar cualquier escritura.
// Cableada en `apps/web/src/app/(search)/page.tsx` (fase 12 de esta misma unidad).
//
// ROADMAP 1.15 (security-hardening, diseño decisión 081): guardado con
// `import 'server-only'` — este módulo consume ambos handles de DB.
import 'server-only';

import {
  consumeClientQuota,
  countZonesOpenedToday,
  listCoverageJobStates,
  registerCoverageJob,
  resolveSourceUuidByKey,
} from '@buscahogar/db';
import type { CoverageJobState, CoverageOperation, CoverageOperationState, Database, ZoneGeometry } from '@buscahogar/db';

// Mismo literal hardcoded que `apps/ingestion` ya repite tres veces
// (seed.ts:62, sweep-zone.ts:85, coverage-worker.ts:155) — ningún artefacto
// nombra una constante compartida, y los dos apps nunca se importan entre
// sí (CLAUDE.md), así que no hay un módulo común donde declararla una sola
// vez sin cruzar esa frontera.
const IDEALISTA_SOURCE_KEY = 'idealista';

// ROADMAP 1.13 Unit D — el tope de zonas nuevas por día (DD-14, CR-4) NUNCA
// se inventa en código (mismo principio que decisión 066: `searchCap` es un
// parámetro suministrado por quien opera, nunca un número mágico).
//
// ROADMAP 1.15 (security-hardening, diseño decisión 078): la validación
// Zod vive ahora en `./env.js` (lector canónico compartido);
// `MissingNewZonesDailyCapError` y `resolveNewZonesDailyCap` se RE-EXPORTAN
// desde aquí para que ningún import existente (`test/coverage-env.test.ts`,
// `src/app/(search)/page.tsx`) cambie.
export { MissingNewZonesDailyCapError, readNewZonesDailyCap as resolveNewZonesDailyCap } from './env';

export type CoverageOutcome =
  | { readonly kind: 'covered' }
  // CR-12 (arbitraje, sustituye la exclusión original del spec): un
  // municipio sin centroide nunca es barríble — defensa en profundidad con
  // zone-resolution, que ya lo excluye estructuralmente; esta es la SEGUNDA
  // comprobación independiente, del lado de la aplicación.
  | { readonly kind: 'not-sweepable' }
  // DD-14/CR-4: el tope de registro es higiene de cola y mensaje honesto al
  // usuario, NUNCA la garantía dura de cuota (que vive enteramente en el
  // worker vía DD-12, Unit C) — check-then-insert no transaccional,
  // aceptado a propósito.
  | { readonly kind: 'cap-exhausted' }
  // ROADMAP 1.15 (spec #261 "A Per-Client Limit Hit Is The Distinct
  // Outcome client-cap-exhausted, Never cap-exhausted", diseño decisión
  // 079) — DISTINTO de 'cap-exhausted' (D6): el tope global bloquea a
  // TODOS los clientes, este bloquea solo UNO.
  | { readonly kind: 'client-cap-exhausted' }
  | { readonly kind: 'registered'; readonly job: CoverageJobState | null };

// ROADMAP 1.15 (diseño decisión 079) — identidad y tope YA resueltos por el
// llamador (`apps/web/src/server/coverage-client.ts`): este módulo nunca
// lee `next/headers` ni `CLIENT_IP_HMAC_KEY` por sí mismo, solo recibe el
// `key_hash` opaco y el tope numérico — mismo principio que ya aplica a
// `newZonesDailyCap`.
export interface ClientLimit {
  readonly keyHash: string;
  readonly dailyCap: number;
}

// ROADMAP 3.3 (decisión 251, PD9) — la cobertura es POR OPERACIÓN. Sin filtro de operación una búsqueda
// necesita las dos; con filtro, solo esa.
const ALL_OPERATIONS: readonly CoverageOperation[] = ['sale', 'rent'];

// Con dos jobs por zona hay que enseñar UN estado en el aviso. Gana el más "vivo": en curso, en cola,
// fallido y, por último, terminado (sin cobertura todavía). A igualdad conserva el primero.
const DISPLAY_PRIORITY: Readonly<Record<CoverageJobState['status'], number>> = {
  running: 0,
  pending: 1,
  failed: 2,
  done: 3,
};

export function pickDisplayJob(jobs: readonly CoverageJobState[]): CoverageJobState | null {
  let best: CoverageJobState | null = null;
  for (const job of jobs) {
    if (best === null || DISPLAY_PRIORITY[job.status] < DISPLAY_PRIORITY[best.status]) {
      best = job;
    }
  }
  return best;
}

function isCovered(states: readonly CoverageOperationState[], operation: CoverageOperation): boolean {
  return states.some((state) => state.operation === operation && state.lastCompletedAt !== null);
}

// `getWriteDb` es una fábrica PEREZOSA, nunca un `Database` ya resuelto:
// `getCoverageDb()` (DD-15) falla alto en la PRIMERA llamada si
// `WEB_COVERAGE_DATABASE_URL` no está definida (R3, todavía sin
// provisionar) — resolverla ANTES de saber si hace falta escribir de
// verdad rompería toda petición que solo consulta el estado de un job que
// YA existe (rama de abajo), que nunca necesita el handle de escritura.
//
// ROADMAP 3.3 (decisión 251, PD9): cubierta = `coverage_jobs.last_completed_at` de la operación pedida
// (o de las dos, sin filtro); `zones.state` es un agregado y ya no decide. Se registra un job por cada
// operación que falta y aún no tiene fila. El tope global cuenta ZONAS distintas y la cuota del cliente se
// consume UNA vez por zona, no por job.
export async function resolveCoverageForZone(
  readDb: Database,
  getWriteDb: () => Database,
  zoneGeometry: ZoneGeometry,
  newZonesDailyCap: number,
  clientLimit?: ClientLimit | null,
  operation?: CoverageOperation
): Promise<CoverageOutcome> {
  if (zoneGeometry.centroid === null) {
    return { kind: 'not-sweepable' };
  }

  const sourceId = await resolveSourceUuidByKey(readDb, IDEALISTA_SOURCE_KEY);
  if (sourceId === null) {
    // Configuración de servidor incompleta (el seed nunca se ejecutó) —
    // nunca se trata como "zona no cubierta" ordinaria: nombrado y
    // propagado, no una rama de negocio silenciosa.
    throw new Error(
      `No existe ninguna fila en sources con key="${IDEALISTA_SOURCE_KEY}". Ejecuta \`pnpm db:seed\`.`
    );
  }

  const wanted = operation === undefined ? ALL_OPERATIONS : [operation];
  const states = await listCoverageJobStates(readDb, zoneGeometry.zoneId, sourceId);
  const uncovered = wanted.filter((wantedOperation) => !isCovered(states, wantedOperation));
  if (uncovered.length === 0) {
    return { kind: 'covered' };
  }

  // Las operaciones que faltan pero YA tienen job (de un registro anterior, o de un intento previo
  // fallido — DD-16) nunca se bloquean por el tope al re-visitarlas: el tope solo protege registros
  // NUEVOS, nunca la consulta de estado de uno que ya existe.
  const missing = uncovered.filter((wantedOperation) => !states.some((state) => state.operation === wantedOperation));
  const jobsOfUncovered = (current: readonly CoverageOperationState[]): readonly CoverageOperationState[] =>
    current.filter((state) => uncovered.includes(state.operation));
  if (missing.length === 0) {
    return { kind: 'registered', job: pickDisplayJob(jobsOfUncovered(states)) };
  }

  // ROADMAP 1.15 (spec #261 "Three Checks, In Order — Global Cap
  // (Read-Only) Before Per-Client Consume (Write)", diseño decisión 079,
  // SUPERA el orden previo de la spec) — el tope GLOBAL se comprueba
  // PRIMERO, de solo lectura: así ningún registro que vaya a ser rechazado
  // por el tope global consume nunca la cuota de un cliente concreto, y el
  // handle de escritura perezoso sigue sin abrirse en esta rama.
  //
  // Una zona que ya tiene un job pedido hoy ya ocupa su plaza del tope (se cuenta por zona, decisión
  // 251): añadirle la otra operación no abre una zona nueva, así que no se la bloquea.
  const zoneAlreadyCounted = states.some((state) => state.requestedToday);
  if (!zoneAlreadyCounted) {
    const openedToday = await countZonesOpenedToday(readDb);
    if (openedToday >= newZonesDailyCap) {
      return { kind: 'cap-exhausted' };
    }
  }

  // Solo se alcanza con hueco en el tope global — el tope por cliente es la
  // SEGUNDA comprobación, y la única que ESCRIBE (decisión 076/077). Una sola vez por zona, aunque se
  // registren dos jobs.
  if (clientLimit) {
    const allowed = await consumeClientQuota(getWriteDb(), clientLimit.keyHash, clientLimit.dailyCap);
    if (!allowed) {
      return { kind: 'client-cap-exhausted' };
    }
  }

  for (const missingOperation of missing) {
    await registerCoverageJob(getWriteDb(), zoneGeometry.zoneId, sourceId, missingOperation);
  }
  const registered = await listCoverageJobStates(readDb, zoneGeometry.zoneId, sourceId);
  return { kind: 'registered', job: pickDisplayJob(jobsOfUncovered(registered)) };
}
