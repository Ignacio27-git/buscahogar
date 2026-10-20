// ROADMAP 1.13 Unit D (diseño §5 interfaces addendum, DD-14, DD-16 lado
// web) — capa de registro/consulta de `coverage_jobs` que consume
// `apps/web`. Zod-free (decisión 023): tipos planos, sin validación — la
// validación de la entrada externa (código INE) vive en `packages/core`
// (decisión 057); este módulo solo recibe ya-resueltos `zoneId`/`sourceId`.
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { coverageJobs, sources } from './tables.js';
import { utcDayStart } from './time.js';

// ROADMAP 3.3 (decisión 250): el job es POR OPERACIÓN; venta y alquiler de una
// zona son jobs independientes y la clave única incluye la operación en los dos
// índices (total y parcial pending/running).
export type CoverageOperation = 'sale' | 'rent';

// DD-16 (arbitraje CR-3): `ON CONFLICT DO NOTHING` SIN `target` — cualquier
// conflicto de unicidad (el índice parcial pending/running heredado del
// paso 1.7, o el índice único TOTAL de DD-16, ambos con la operación) se trata
// como éxito.
// `status`/`cursor` van explícitos aunque coincidan con el default de la
// columna (coverage-jobs.ts:21,24): documenta la garantía de la spec
// («status='pending', cursor=NULL») en el propio call site, no solo en el
// esquema.
export async function registerCoverageJob(
  db: Database,
  zoneId: string,
  sourceId: string,
  operation: CoverageOperation
): Promise<void> {
  await db
    .insert(coverageJobs)
    .values({ zoneId, sourceId, operation, status: 'pending', cursor: null })
    .onConflictDoNothing();
}

// DD-14 — el contador de "zonas nuevas hoy" deriva de
// `coverage_jobs.requested_at`, NUNCA de `zones.createdAt` (que tras la
// importación masiva de Unit A es uniforme para ~8.100 filas). Cero
// columnas nuevas, cero privilegio nuevo: el rol de solo lectura ya puede
// leer `coverage_jobs` en su totalidad.
export async function countZonesOpenedToday(db: Database): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(coverageJobs)
    .where(gte(coverageJobs.requestedAt, utcDayStart()));
  return row?.count ?? 0;
}

export interface CoverageJobState {
  readonly status: 'pending' | 'running' | 'done' | 'failed';
  readonly attempts: number;
  readonly requestedAt: Date;
  readonly startedAt: Date | null;
  readonly error: string | null;
}

export async function getCoverageJobState(
  db: Database,
  zoneId: string,
  sourceId: string,
  operation: CoverageOperation
): Promise<CoverageJobState | null> {
  const [row] = await db
    .select({
      status: coverageJobs.status,
      attempts: coverageJobs.attempts,
      requestedAt: coverageJobs.requestedAt,
      startedAt: coverageJobs.startedAt,
      error: coverageJobs.error,
    })
    .from(coverageJobs)
    .where(
      and(
        eq(coverageJobs.zoneId, zoneId),
        eq(coverageJobs.sourceId, sourceId),
        eq(coverageJobs.operation, operation)
      )
    );
  return row ?? null;
}

// Adición señalada, ausente del listado literal de interfaces del diseño
// (§5): `registerCoverageJob`/`getCoverageJobState` necesitan un
// `sourceId`, y `apps/web` no puede importar
// `apps/ingestion/src/sweep/reference-store.ts` (`resolveSourceUuid`) — los
// dos apps nunca se importan entre sí (CLAUDE.md), solo comparten base de
// datos. Esta es la misma consulta de lectura, disponible desde el paquete
// que ambos apps SÍ importan. A diferencia de la versión de `apps/ingestion`
// (que lanza `UnknownSourceError`), esta devuelve `null` — una `key`
// desconocida en el camino de lectura de `apps/web` es un problema de
// configuración de servidor, no un caso de negocio que deba abortar con una
// traza cruda; el llamador decide cómo degradar.
export async function resolveSourceUuidByKey(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, key));
  return row?.id ?? null;
}
