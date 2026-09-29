// Paso 1.7 — coverage-store.ts (diseño D6, D7): reclamo CAS de
// coverage_jobs, enrutado de finishJob según la tabla D6, y bookkeeping de
// zones honestamente acotado al círculo barrido (COVERAGE-6).
//
// `coverage_jobs` guarda UNA fila por (zone_id, source_id) a lo largo de
// toda su vida, no una fila por ejecución: reclamar reutiliza la fila
// existente (pending/done/failed → running), nunca crea una segunda para el
// mismo par — así "attempts" cuenta reintentos reales de la misma entidad.
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
import type { ClaimedJob, JobOutcome } from './store.js';

export class JobAlreadyClaimedError extends Error {
  readonly zoneId: string;
  readonly sourceId: string;

  constructor(zoneId: string, sourceId: string) {
    super(
      `Ya hay un barrido pendiente o en curso para zone_id="${zoneId}" y source_id="${sourceId}". ` +
        'Cero peticiones emitidas.'
    );
    this.zoneId = zoneId;
    this.sourceId = sourceId;
  }
}

// Estados desde los que una fila existente puede reclamarse. 'running' se
// excluye a propósito: significa que otro proceso lo tiene ahora mismo
// (COVERAGE-3).
const RECLAIMABLE_STATUSES = ['pending', 'done', 'failed'] as const;

export interface CoverageStore {
  claimJob(zoneId: string, sourceId: string, fingerprint: string): Promise<ClaimedJob>;
  finishJob(jobId: string, outcome: JobOutcome): Promise<void>;
}

export function createCoverageStore(db: Database): CoverageStore {
  const fingerprintByJobId = new Map<string, string>();

  async function claimJob(zoneId: string, sourceId: string, fingerprint: string): Promise<ClaimedJob> {
    const [existing] = await db
      .select({ id: coverageJobs.id, status: coverageJobs.status, cursor: coverageJobs.cursor })
      .from(coverageJobs)
      .where(and(eq(coverageJobs.zoneId, zoneId), eq(coverageJobs.sourceId, sourceId)));

    let claimedId: string;
    let storedCursor: string | null;

    if (!existing) {
      // Ninguna fila previa: crearla YA reclamada evita la ventana entre
      // "crear" y "reclamar" que un INSERT + UPDATE separados dejarían
      // abierta.
      const [inserted] = await db
        .insert(coverageJobs)
        .values({ zoneId, sourceId, status: 'running', attempts: 1, startedAt: new Date() })
        .returning({ id: coverageJobs.id, cursor: coverageJobs.cursor });
      if (!inserted) {
        throw new Error('No se pudo crear la fila de coverage_jobs.');
      }
      claimedId = inserted.id;
      storedCursor = inserted.cursor;
    } else if (existing.status === 'running') {
      throw new JobAlreadyClaimedError(zoneId, sourceId);
    } else {
      // CAS real: la condición WHERE repite el estado ya leído, así que una
      // carrera perdida entre el SELECT y este UPDATE devuelve cero filas
      // en vez de reclamar un trabajo que otro proceso ya tiene.
      const [updated] = await db
        .update(coverageJobs)
        .set({ status: 'running', startedAt: new Date(), attempts: sql`${coverageJobs.attempts} + 1` })
        .where(and(eq(coverageJobs.id, existing.id), inArray(coverageJobs.status, RECLAIMABLE_STATUSES)))
        .returning({ id: coverageJobs.id, cursor: coverageJobs.cursor });
      if (!updated) {
        throw new JobAlreadyClaimedError(zoneId, sourceId);
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
          .set({ status: 'done', cursor: null, finishedAt: new Date(), refreshRequestedAt: null })
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
