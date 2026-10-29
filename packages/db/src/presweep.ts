// ROADMAP 3.3 (decisión 253; R2, R5; diseño D13) — consulta de candidatos del presweep. Solo LECTURA y
// tipos planos (Zod-free, decisión 023): el orden y el filtrado de unidades los decide el planificador puro
// de `packages/core`; esta consulta solo aporta los datos.
//
// Top-N: localizaciones con población conocida, centroide y radio (las únicas barribles), con zona,
// `ORDER BY population DESC, ine_code ASC LIMIT N`. El orden total (el código INE es único) hace la selección
// determinista entre ejecuciones. El estado de cada unidad (zona, operación) sale del job de ESA fuente:
// completada = tiene `last_completed_at` (cobertura por operación, decisión 250); en curso = `running`;
// el resto (sin job, pendiente, parcial con cursor, fallido) está pendiente y el cursor decide dónde se reanuda.
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from './db.js';
import { coverageJobs, locations, zones } from './tables.js';

export type PresweepJobState = 'pending' | 'running' | 'completed';

export interface PresweepCandidateRow {
  readonly zoneId: string;
  readonly ineCode: string;
  readonly municipality: string;
  readonly population: number;
  readonly units: { readonly sale: PresweepJobState; readonly rent: PresweepJobState };
}

export interface PresweepCandidateQuery {
  readonly sourceId: string;
  // Número de ciudades (entero >= 1).
  readonly top: number;
}

function unitState(job: { readonly status: string; readonly lastCompletedAt: Date | null } | undefined): PresweepJobState {
  if (job === undefined) {
    return 'pending';
  }
  if (job.status === 'running') {
    return 'running';
  }
  return job.lastCompletedAt === null ? 'pending' : 'completed';
}

export async function selectPresweepCandidates(
  db: Database,
  query: PresweepCandidateQuery
): Promise<readonly PresweepCandidateRow[]> {
  if (!Number.isInteger(query.top) || query.top < 1) {
    throw new RangeError(`selectPresweepCandidates: top debe ser un entero >= 1 (recibido ${String(query.top)}).`);
  }

  const cities = await db
    .select({
      zoneId: zones.id,
      ineCode: locations.ineCode,
      municipality: locations.municipality,
      population: locations.population,
    })
    .from(locations)
    .innerJoin(zones, eq(zones.locationId, locations.id))
    .where(
      and(isNotNull(locations.population), isNotNull(locations.centroid), isNotNull(locations.sweepRadiusM))
    )
    .orderBy(desc(locations.population), asc(locations.ineCode))
    .limit(query.top);

  if (cities.length === 0) {
    return [];
  }

  const jobs = await db
    .select({
      zoneId: coverageJobs.zoneId,
      operation: coverageJobs.operation,
      status: coverageJobs.status,
      lastCompletedAt: coverageJobs.lastCompletedAt,
    })
    .from(coverageJobs)
    .where(
      and(
        eq(coverageJobs.sourceId, query.sourceId),
        inArray(
          coverageJobs.zoneId,
          cities.map((city) => city.zoneId)
        )
      )
    );

  const rows: PresweepCandidateRow[] = [];
  for (const city of cities) {
    // `population` no es nulo por el filtro; el estrechamiento evita una aserción de tipo.
    if (city.population === null) {
      continue;
    }
    const jobOf = (operation: 'sale' | 'rent'): PresweepJobState =>
      unitState(jobs.find((job) => job.zoneId === city.zoneId && job.operation === operation));
    rows.push({
      zoneId: city.zoneId,
      ineCode: city.ineCode,
      municipality: city.municipality,
      population: city.population,
      units: { sale: jobOf('sale'), rent: jobOf('rent') },
    });
  }
  return rows;
}
