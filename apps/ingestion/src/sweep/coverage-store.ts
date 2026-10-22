// Paso 1.7 — coverage-store.ts (diseño D6, D7): reclamo CAS de
// coverage_jobs, enrutado de finishJob según la tabla D6, y bookkeeping de
// zones honestamente acotado al círculo barrido (COVERAGE-6).
//
// `coverage_jobs` guarda UNA fila por (zone_id, source_id, operation) a lo
// largo de toda su vida, no una fila por ejecución: reclamar reutiliza la fila
// existente (pending/done/failed → running), nunca crea una segunda para la
// misma terna — así "attempts" cuenta reintentos reales de la misma entidad.
// Venta y alquiler de una zona son jobs independientes (decisión 250).
//
// El envelope versionado de coverage_jobs.cursor (job-cursor.ts) necesita la
// huella de área para codificar, pero el puerto SweepStore.finishJob (fase
// 1, store.ts) no la recibe como parámetro — una instancia = un barrido
// (mismo idioma que SweepAreaMismatchError, 1.6), así que se cachea aquí en
// memoria, por jobId, en el momento del reclamo (única fuente de verdad
// para esa huella durante la vida de esta instancia).
import { coverageJobs, zones } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { decodeJobCursor, encodeJobCursor } from './job-cursor.js';
import type { ClaimedJob, ClaimOptions, JobOperation, JobOutcome } from './store.js';

export class JobAlreadyClaimedError extends Error {
  readonly zoneId: string;
  readonly sourceId: string;
  readonly operation: JobOperation;

  constructor(zoneId: string, sourceId: string, operation: JobOperation) {
    super(
      `Ya hay un barrido pendiente o en curso para zone_id="${zoneId}", source_id="${sourceId}" y ` +
        `operation="${operation}". Cero peticiones emitidas.`
    );
    this.zoneId = zoneId;
    this.sourceId = sourceId;
    this.operation = operation;
  }
}

// Estados desde los que una fila existente puede reclamarse. 'running' se
// excluye a propósito: significa que otro proceso lo tiene ahora mismo
// (COVERAGE-3).
const RECLAIMABLE_STATUSES = ['pending', 'done', 'failed'] as const;

export interface CoverageStore {
  claimJob(
    zoneId: string,
    sourceId: string,
    operation: JobOperation,
    fingerprint: string,
    options?: ClaimOptions
  ): Promise<ClaimedJob>;
  finishJob(jobId: string, outcome: JobOutcome): Promise<void>;
}

export function createCoverageStore(db: Database): CoverageStore {
  const fingerprintByJobId = new Map<string, string>();

  async function claimJob(
    zoneId: string,
    sourceId: string,
    operation: JobOperation,
    fingerprint: string,
    options?: ClaimOptions
  ): Promise<ClaimedJob> {
    const [existing] = await db
      .select({ id: coverageJobs.id, status: coverageJobs.status, cursor: coverageJobs.cursor })
      .from(coverageJobs)
      .where(
        and(
          eq(coverageJobs.zoneId, zoneId),
          eq(coverageJobs.sourceId, sourceId),
          eq(coverageJobs.operation, operation)
        )
      );

    let claimedId: string;
    let storedCursor: string | null;
    // ROADMAP 2.5 (S3; decisión 105): el reloj del proceso, el MISMO que fija
    // `last_seen_at` en listing-writer.ts, así que "visto durante el ciclo"
    // (`last_seen_at >= cycle_started_at`) compara dos marcas del mismo reloj.
    const claimedAt = new Date();

    // ROADMAP 3.3 (decisión 253, D11): el carril batch del presweep MARCA el job (trabajo parcial que el
    // worker solo retoma si hay demanda); el worker lo LIMPIA al promoverlo. Sin opción, la marca no cambia.
    const presweepMark =
      options?.presweep === 'mark' ? claimedAt : options?.presweep === 'clear' ? null : undefined;

    if (!existing) {
      // Ninguna fila previa: crearla YA reclamada evita la ventana entre
      // "crear" y "reclamar" que un INSERT + UPDATE separados dejarían
      // abierta.
      const [inserted] = await db
        .insert(coverageJobs)
        .values({
          zoneId,
          sourceId,
          operation,
          status: 'running',
          attempts: 1,
          startedAt: claimedAt,
          cycleStartedAt: claimedAt,
          // ROADMAP 3.4 (decisión 258, parte 2; D14b): arrendamiento con el reloj de la BASE DE DATOS.
          leaseRenewedAt: sql`now()`,
          ...(presweepMark !== undefined ? { presweepRequestedAt: presweepMark } : {}),
        })
        .returning({ id: coverageJobs.id, cursor: coverageJobs.cursor });
      if (!inserted) {
        throw new Error('No se pudo crear la fila de coverage_jobs.');
      }
      claimedId = inserted.id;
      storedCursor = inserted.cursor;
    } else if (existing.status === 'running') {
      throw new JobAlreadyClaimedError(zoneId, sourceId, operation);
    } else {
      // CAS real: la condición WHERE repite el estado ya leído, así que una
      // carrera perdida entre el SELECT y este UPDATE devuelve cero filas
      // en vez de reclamar un trabajo que otro proceso ya tiene.
      const [updated] = await db
        .update(coverageJobs)
        .set({
          status: 'running',
          startedAt: claimedAt,
          attempts: sql`${coverageJobs.attempts} + 1`,
          // Reclamar un job existente también abre un arrendamiento nuevo (ver el INSERT de arriba).
          leaseRenewedAt: sql`now()`,
          // Ciclo nuevo SOLO con cursor NULL (arranque limpio: job `done` o
          // refresco re-encolado); una reanudación (presupuesto agotado o
          // reintento con cursor) conserva el inicio del primer tick. En un
          // SET de UPDATE la columna `cursor` es el valor PREVIO.
          cycleStartedAt: sql`case when ${coverageJobs.cursor} is null then ${claimedAt.toISOString()}::timestamptz else ${coverageJobs.cycleStartedAt} end`,
          ...(presweepMark !== undefined ? { presweepRequestedAt: presweepMark } : {}),
        })
        .where(and(eq(coverageJobs.id, existing.id), inArray(coverageJobs.status, RECLAIMABLE_STATUSES)))
        .returning({ id: coverageJobs.id, cursor: coverageJobs.cursor });
      if (!updated) {
        throw new JobAlreadyClaimedError(zoneId, sourceId, operation);
      }
      claimedId = updated.id;
      storedCursor = updated.cursor;
    }

    fingerprintByJobId.set(claimedId, fingerprint);

    // Un cursor almacenado que no decodifica contra ESTA huella de área
    // rechaza aquí — nunca reanuda en silencio el barrido de otra área
    // (diseño D6).
    const cursor = storedCursor === null ? undefined : decodeJobCursor(storedCursor, fingerprint);
    return { id: claimedId, cursor };
  }

  async function finishJob(jobId: string, outcome: JobOutcome): Promise<void> {
    switch (outcome.kind) {
      case 'completed': {
        const [updated] = await db
          .update(coverageJobs)
          // ROADMAP 2.5 (decisión 104): un ciclo COMPLETADO devuelve el job
          // al estado "a demanda" (`refresh_requested_at` NULL) hasta el
          // próximo refresco. Los demás desenlaces lo conservan: un trabajo
          // reanudado o reintentado sigue en el carril de refresco.
          //
          // ROADMAP 3.3 (decisión 250): `last_completed_at` es la cobertura de
          // (zona, operación) y SOLO se fija aquí; ningún otro desenlace, ni un
          // refresco posterior, lo limpia. El trabajo parcial de un presweep
          // (`presweep_requested_at`) termina con el ciclo completado.
          .set({
            status: 'done',
            cursor: null,
            finishedAt: new Date(),
            refreshRequestedAt: null,
            lastCompletedAt: new Date(),
            presweepRequestedAt: null,
          })
          .where(eq(coverageJobs.id, jobId))
          .returning({ zoneId: coverageJobs.zoneId });
        // Bookkeeping de zones honestamente acotado al círculo barrido
        // (COVERAGE-6, D7): 'covered' se escribe SOLO cuando llegamos aquí,
        // es decir, cuando isSweepComplete(page) fue cierto — sweep-runner
        // nunca invoca finishJob con kind:'completed' en otro caso.
        if (updated) {
          await db
            .update(zones)
            .set({ state: 'covered', lastSweptAt: new Date() })
            .where(eq(zones.id, updated.zoneId));
        }
        break;
      }
      case 'budget-exhausted': {
        // No es un fallo (COVERAGE-5): vuelve a 'pending', reanudable, sin
        // tocar 'attempts' (ya incrementado al reclamar) ni 'finishedAt'
        // (el trabajo no ha terminado).
        await db
          .update(coverageJobs)
          .set({ status: 'pending', cursor: encodeCursor(jobId, outcome.resumeCursor, fingerprintByJobId) })
          .where(eq(coverageJobs.id, jobId));
        break;
      }
      case 'transport-failed':
      case 'untrustworthy-envelope': {
        await db
          .update(coverageJobs)
          .set({
            status: 'failed',
            cursor: encodeCursor(jobId, outcome.resumeCursor, fingerprintByJobId),
            error: outcome.error,
            finishedAt: new Date(),
          })
          .where(eq(coverageJobs.id, jobId));
        break;
      }
      case 'invalid-cursor': {
        // D6: el cursor NUNCA se limpia aquí — reanudar desde cero volvería
        // a gastar cuota ya pagada. Por eso este `set` ni siquiera nombra
        // la columna `cursor`.
        await db
          .update(coverageJobs)
          .set({ status: 'failed', error: outcome.error, finishedAt: new Date() })
          .where(eq(coverageJobs.id, jobId));
        break;
      }
    }
    fingerprintByJobId.delete(jobId);
  }

  return { claimJob, finishJob };
}

// La huella de área viaja únicamente en memoria (ver nota de fichero) entre
// claimJob y finishJob de la misma instancia. Su ausencia es un error de
// programación del llamador (finishJob sin claimJob previo para ese jobId),
// nunca un caso silencioso.
function encodeCursor(jobId: string, resumeCursor: string, fingerprintByJobId: ReadonlyMap<string, string>): string {
  const fingerprint = fingerprintByJobId.get(jobId);
  if (fingerprint === undefined) {
    throw new Error(`finishJob("${jobId}") sin una huella de área conocida — ¿se llamó a claimJob antes?`);
  }
  return encodeJobCursor(fingerprint, resumeCursor);
}
