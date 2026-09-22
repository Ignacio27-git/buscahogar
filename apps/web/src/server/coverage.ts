// ROADMAP 1.13 Unit D (diseño DD-14, DD-16 lado web, arbitraje CR-4/CR-12)
// — guarda de APLICACIÓN que decide SI se registra un `coverage_job` para
// una zona no cubierta. `packages/db/src/coverage.ts` deliberadamente NO
// hace esta comprobación por sí sola: el rol INSERT-only (D1) solo puede
// ESCRIBIR `coverage_jobs`, nunca leer `locations.centroid` ni
// `zones.state` — ambas comprobaciones (centroide, tope diario) viven aquí,
// contra el rol de SOLO LECTURA, ANTES de intentar cualquier escritura.
// Cableada en `apps/web/src/app/page.tsx` (fase 12 de esta misma unidad).
import {
  countZonesOpenedToday,
  getCoverageJobState,
  registerCoverageJob,
  resolveSourceUuidByKey,
} from '@buscahogar/db';
import type { CoverageJobState, Database, ZoneGeometry } from '@buscahogar/db';

// Mismo literal hardcoded que `apps/ingestion` ya repite tres veces
// (seed.ts:62, sweep-zone.ts:85, coverage-worker.ts:155) — ningún artefacto
// nombra una constante compartida, y los dos apps nunca se importan entre
// sí (CLAUDE.md), así que no hay un módulo común donde declararla una sola
// vez sin cruzar esa frontera.
const IDEALISTA_SOURCE_KEY = 'idealista';

// ROADMAP 1.13 Unit D — el tope de zonas nuevas por día (DD-14, CR-4) NUNCA
// se inventa en código (mismo principio que decisión 066: `searchCap` es un
// parámetro suministrado por quien opera, nunca un número mágico). `apps/web`
// SÍ puede leer `process.env` (comentario de `./db.ts`), así que esta es la
// única capa donde puede vivir esta lectura.
export class MissingNewZonesDailyCapError extends Error {}

export function resolveNewZonesDailyCap(): number {
  const raw = process.env.NEW_ZONES_DAILY_CAP;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  if (raw === undefined || raw === '' || !Number.isInteger(parsed) || parsed <= 0) {
    throw new MissingNewZonesDailyCapError(
      'NEW_ZONES_DAILY_CAP no está definida o no es un entero positivo: el tope de zonas ' +
        'nuevas por día (DD-14) es una decisión de operación, nunca un valor inventado en código.'
    );
  }
  return parsed;
}

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
  | { readonly kind: 'registered'; readonly job: CoverageJobState | null };

// `getWriteDb` es una fábrica PEREZOSA, nunca un `Database` ya resuelto:
// `getCoverageDb()` (DD-15) falla alto en la PRIMERA llamada si
// `WEB_COVERAGE_DATABASE_URL` no está definida (R3, todavía sin
// provisionar) — resolverla ANTES de saber si hace falta escribir de
// verdad rompería toda petición que solo consulta el estado de un job que
// YA existe (rama de abajo), que nunca necesita el handle de escritura.
export async function resolveCoverageForZone(
  readDb: Database,
  getWriteDb: () => Database,
  zoneGeometry: ZoneGeometry,
  newZonesDailyCap: number
): Promise<CoverageOutcome> {
  if (zoneGeometry.state === 'covered') {
    return { kind: 'covered' };
  }

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

  // Una zona que YA tiene un job (de un registro anterior el mismo día, o
  // de un intento previo fallido — DD-16) nunca se bloquea por el tope al
  // re-visitarla: el tope solo protege registros NUEVOS, nunca la consulta
  // de estado de uno que ya existe.
  const existingJob = await getCoverageJobState(readDb, zoneGeometry.zoneId, sourceId);
  if (existingJob !== null) {
    return { kind: 'registered', job: existingJob };
  }

  const openedToday = await countZonesOpenedToday(readDb);
  if (openedToday >= newZonesDailyCap) {
    return { kind: 'cap-exhausted' };
  }

  await registerCoverageJob(getWriteDb(), zoneGeometry.zoneId, sourceId);
  const job = await getCoverageJobState(readDb, zoneGeometry.zoneId, sourceId);
  return { kind: 'registered', job };
}
