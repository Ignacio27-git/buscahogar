// ROADMAP 1.13 Unit C (diseño DD-17, DD-18, CR-1, CR-2) — implementación
// REAL de `CoverageWorkerPorts` (coverage-worker.ts): la única pieza de
// este cambio que toca PostgreSQL y el adaptador de Idealista de verdad.
// `scripts/coverage-worker.ts` (composition root, único lector de
// `process.env`) construye sus dependencias y llama a
// `createRealCoverageWorkerPorts` una vez; el resultado se pasa tal cual a
// `runCoverageWorker` (coverage-worker.ts, driver puro).
//
// CR-2 (arbitraje, vinculante): reutiliza `runSweep` + `composeStore` +
// `createIdealistaSource` + `buildReport` SIN CAMBIOS — nunca
// `runSweepZone` completo, que abre su propio pool por invocación y se
// resuelve por un `--zone` de CLI (la propia acoplación que 1.13 elimina).
import {
  LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS,
  LISTING_TOMBSTONE_BATCH_SIZE,
  PRESENCE_BATCH_SIZE,
  PRESENCE_MAX_CHECK_ATTEMPTS,
  PRESENCE_RETRY_BACKOFF_DAYS,
  planPresenceBatches,
  PURGE_DEMAND_AGE_DAYS,
  SIGNAL_PURGE_MAX_ROWS_PER_TICK,
  SIGNAL_RETENTION_DAYS,
} from '@buscahogar/core';
import type {
  AreaQuery,
  BlockingThresholds,
  PartitionedPresence,
  PresenceBatch,
  PresenceCandidate,
  PresenceVerdict,
  RefreshTarget,
} from '@buscahogar/core';
import {
  applyPresenceVerdicts,
  listDuePresenceCandidates,
  listZoneLifecycle,
  markAbsenceCandidates,
  purgeExpiredClientQuota,
  purgeExpiredZoneQuerySignals,
  purgeZones,
  reconcileRequestBudget,
  refreshLaneCeiling,
  reserveRequestBudget,
  resolveZoneGeometryById,
  scheduleRefresh,
  tombstoneExpiredListings,
} from '@buscahogar/db';
import type {
  BudgetReservation,
  BudgetSnapshotLike,
  Database,
  LedgerState,
  RequestBudgetGrant,
  ZoneGeometry,
} from '@buscahogar/db';

import { runReprocessCore } from '../dedup/reprocess-core.js';
import type { ReprocessIo } from '../dedup/reprocess-core.js';
import {
  createIdealistaSource,
  createReusableTokenPort,
  IdealistaListingNormalizer,
  invalidateOnRejectedToken,
} from '../sources/idealista/index.js';
import { filterForRawType } from '../sources/idealista/filter-for-raw-type.js';
import type { IdealistaSearchPort, IdealistaTokenPort } from '../sources/idealista/ports.js';
import { createIdealistaPresenceVerifier } from '../sources/idealista/presence-verifier.js';
import { composeStore } from './compose-store.js';
import type {
  CoverageWorkerPorts,
  PresencePlan,
  PresenceVerification,
  PresenceVerificationPorts,
  SweepTickResult,
  ZoneMaintenancePorts,
} from './coverage-worker.js';
import { markJobFailedWithoutClaim, selectNextClaimableJob } from './job-selection.js';
import type { JobLane, PollJob } from './job-selection.js';
import { buildReport } from './report.js';
import { DEFAULT_STALE_RUNNING_JOB_AFTER_MS, reclaimStaleRunningJobs } from './stale-job-reclaim.js';
import { runSweep } from './sweep-runner.js';

export interface CoverageWorkerRealDeps {
  readonly db: Database;
  // Resuelto UNA vez por el composition root (resolveSourceUuid(db,
  // 'idealista'), mismo idioma que runSweepZone), no por trabajo: multi-fuente
  // queda fuera de alcance de este cambio (spec, "Out of scope").
  readonly sourceUuid: string;
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
  readonly maxSearchRequestsPerSweep: number;
  readonly maxAttempts: number;
  readonly dailySearchCap: number;
  // ROADMAP 2.5 (decisión 104): fracción del tope diario que el carril de
  // refresco puede gastar EN TOTAL, en [0, 1] (validada con Zod en el
  // composition root). Ausente = 0: el refresco no gasta nada por defecto.
  readonly refreshBudgetFraction?: number;
  // ROADMAP 2.5 (S3; decisión 105): verificación de presencia por `adIds`.
  // Ausente = sin verificación (composiciones anteriores a S3). El worker único
  // verifica anuncios de las dos operaciones (decisión 252); `radiusMarginM` se
  // suma al radio de la zona en la petición.
  readonly presenceVerification?: {
    readonly radiusMarginM: number;
  };
  readonly blockingThresholds: BlockingThresholds;
  // ROADMAP 3.4 (decisión 258, D14): parada pedida (SIGTERM/SIGINT). Se pasa a `runSweep`, que cierra el barrido
  // en el límite de página con el desenlace `budget-exhausted`. Ausente = nunca.
  readonly shouldStop?: () => boolean;
  // ROADMAP 3.4 (decisión 258, parte 2; D14b): antigüedad del arrendamiento que da un job `running` por
  // abandonado. Ausente = 900000 ms.
  readonly staleRunningJobAfterMs?: number;
  readonly io: ReprocessIo;
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createRealCoverageWorkerPorts(deps: CoverageWorkerRealDeps): CoverageWorkerPorts {
  // UNA instancia compartida por el proceso — composeStore ya es la misma
  // composición reutilizada por scripts/sweep-zone.ts (CR-2).
  const store = composeStore(deps.db);

  // ROADMAP 3.3 (decisión 272): UN token para todo el proceso mientras no caduque (`expires_in` menos un margen),
  // compartido por los barridos y la verificación de presencia; un 401 de la búsqueda lo invalida para el siguiente
  // uso. El registro anota solo las adquisiciones REALES de cada barrido o verificación (`tokenSpentSince`).
  const tokenPort = createReusableTokenPort(deps.tokenPort, { now: Date.now });
  const searchPort = invalidateOnRejectedToken(deps.searchPort, tokenPort);
  const tokenSpentSince = (acquisitionsBefore: number): number => tokenPort.acquisitions() - acquisitionsBefore;

  // Recibos de las reservas mensuales en curso, por objeto de reserva (ver `reserveBudget`).
  const grants = new WeakMap<BudgetReservation, RequestBudgetGrant>();

  // ROADMAP 2.5 — mantenimiento de zonas sobre el MISMO pool propietario.
  // Solo delega en `packages/db`: la política (qué zonas, cuándo) vive en
  // `packages/core`, y el reloj es el de Postgres (DD-11).
  const maintenance: ZoneMaintenancePorts = {
    purgeZoneQuerySignals(): Promise<number> {
      return purgeExpiredZoneQuerySignals(deps.db, {
        retentionDays: SIGNAL_RETENTION_DAYS,
        maxRows: SIGNAL_PURGE_MAX_ROWS_PER_TICK,
      });
    },
    listZoneLifecycle() {
      return listZoneLifecycle(deps.db, { sourceId: deps.sourceUuid, maxAttempts: deps.maxAttempts });
    },
    async purgeZones(zoneIds: readonly string[]): Promise<number> {
      const result = await purgeZones(deps.db, {
        sourceId: deps.sourceUuid,
        zoneIds,
        purgeAfterDays: PURGE_DEMAND_AGE_DAYS,
      });
      // Una zona cuya transacción falló se revirtió entera: se registra el
      // mensaje de la base de datos (sin credenciales) y el resto sigue.
      for (const failure of result.failed) {
        deps.io.log(`coverage-worker: purga de la zona "${failure.zoneId}" revertida: ${failure.message}`);
      }
      return result.purged.length;
    },
    scheduleRefresh(targets: readonly RefreshTarget[]): Promise<number> {
      return scheduleRefresh(deps.db, { sourceId: deps.sourceUuid, targets, maxAttempts: deps.maxAttempts });
    },
    tombstoneExpiredListings(): Promise<number> {
      return tombstoneExpiredListings(deps.db, {
        retentionDays: LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS,
        batchSize: LISTING_TOMBSTONE_BATCH_SIZE,
      });
    },
  };

  const presenceDeps = deps.presenceVerification;
  const verification: PresenceVerificationPorts | undefined = presenceDeps && {
    // La operación que se juzga es la del job (`coverage_jobs.operation`).
    markAbsenceCandidates(job: PollJob): Promise<number> {
      return markAbsenceCandidates(deps.db, { jobId: job.jobId });
    },

    async nextPresenceBatches(maxBatches: number): Promise<PresencePlan> {
      // Se leen como mucho `maxBatches` lotes completos de candidatos: la
      // verificación de un tick nunca es ilimitada (corte explícito).
      const due = await listDuePresenceCandidates(deps.db, {
        sourceId: deps.sourceUuid,
        limit: maxBatches * PRESENCE_BATCH_SIZE,
        retryBackoffDays: PRESENCE_RETRY_BACKOFF_DAYS,
      });

      const candidates: PresenceCandidate[] = [];
      const listingIdByExternalId = new Map<string, string>();
      const unverifiableListingIds: string[] = [];
      for (const row of due) {
        // El filtro de la petición no se guarda: se reconstruye del tipo crudo
        // de la versión vigente. Sin mapa no se pide nada (S-LR-11).
        const filter = filterForRawType(row.rawPropertyType);
        if (filter === null) {
          unverifiableListingIds.push(row.listingId);
          continue;
        }
        candidates.push({
          externalId: row.externalId,
          center: row.center,
          radiusMeters: row.radiusMeters,
          operation: row.operation,
          groupKey: filter,
        });
        listingIdByExternalId.set(row.externalId, row.listingId);
      }
      return { batches: planPresenceBatches(candidates), listingIdByExternalId, unverifiableListingIds };
    },

    async verifyPresence(batches: readonly PresenceBatch[]): Promise<PresenceVerification> {
      // Una instancia POR llamada y con el tope duro = nº de lotes: el propio
      // presupuesto impide una petición de más. El token es el del proceso
      // (decisión 272), así que la instancia solo sale a la red si no hay uno vigente.
      const acquisitionsBefore = tokenPort.acquisitions();
      const verifier = createIdealistaPresenceVerifier({
        searchPort,
        tokenPort,
        radiusMarginM: presenceDeps.radiusMarginM,
        maxRequests: batches.length,
        log: (line: string): void => {
          deps.io.log(line);
        },
      });
      const verdicts = new Map<string, PresenceVerdict>();
      for (const batch of batches) {
        for (const [externalId, verdict] of await verifier.verifyBatch(batch)) {
          verdicts.set(externalId, verdict);
        }
      }
      return { verdicts, actual: { search: verifier.budgetSnapshot().search, token: tokenSpentSince(acquisitionsBefore) } };
    },

    async applyPresence(result: PartitionedPresence): Promise<void> {
      const applied = await applyPresenceVerdicts(deps.db, result, PRESENCE_MAX_CHECK_ATTEMPTS);
      deps.io.log(
        `coverage-worker: verificación de presencia aplicada — presentes=${String(applied.present)}, ` +
          `ausentes=${String(applied.absent)}, ambiguos=${String(applied.ambiguous)}, descartados=${String(applied.dropped)}.`
      );
    },
  };

  return {
    maintenance,
    ...(verification ? { verification } : {}),
    // ROADMAP 3.4 (decisión 258, parte 2; D14b): jobs `running` con el arrendamiento caducado -> `failed` (cursor
    // y ciclo conservados; `maxAttempts` acota los reinicios). Corre al arrancar y en cada tick, antes de elegir.
    reclaimStaleJobs(): Promise<readonly string[]> {
      return reclaimStaleRunningJobs(deps.db, deps.staleRunningJobAfterMs ?? DEFAULT_STALE_RUNNING_JOB_AFTER_MS);
    },
    selectNextJob(): Promise<PollJob | null> {
      return selectNextClaimableJob(deps.db, deps.maxAttempts);
    },

    async resolveZoneGeometry(zoneId: string): Promise<ZoneGeometry> {
      const geometry = await resolveZoneGeometryById(deps.db, zoneId);
      if (!geometry) {
        // Invariante de FK: coverage_jobs.zone_id referencia siempre una
        // fila real de zones (schema/coverage-jobs.ts). Si esto salta, la
        // base de datos dejó de cumplir esa referencia — un error de
        // programación, nunca un caso de negocio esperado.
        throw new Error(`resolveZoneGeometry: no existe ninguna zona con id="${zoneId}" (¿violación de FK?).`);
      }
      return geometry;
    },

    failJob(jobId: string, reason: string): Promise<void> {
      return markJobFailedWithoutClaim(deps.db, jobId, reason);
    },

    // ROADMAP 3.3 (decisión 248): TODO gasto pasa por `reserveRequestBudget`, que en una sola
    // transacción aplica el techo MENSUAL del carril (registro `monthly_request_budget`; sin
    // fila utilizable no se gasta nada, tampoco a demanda) y el cupo DIARIO.
    // ROADMAP 2.5 (ZRS-11): el carril de refresco reserva contra el TECHO diario
    // `least(cap, floor(cap × fracción))` sobre el gasto total del día — el
    // gasto a demanda también cuenta contra él. La demanda no lleva techo diario y
    // conserva siempre al menos `cap × (1 - fracción)`.
    async reserveBudget(reservation: BudgetReservation, lane: JobLane): Promise<LedgerState | null> {
      const laneCeiling =
        lane === 'refresh' ? refreshLaneCeiling(deps.dailySearchCap, deps.refreshBudgetFraction ?? 0) : undefined;
      const result = await reserveRequestBudget(
        deps.db,
        deps.sourceUuid,
        { lane, searchRequested: reservation.searchReserved, tokenReserved: reservation.tokenReserved },
        { cap: deps.dailySearchCap, ...(laneCeiling !== undefined ? { laneCeiling } : {}) }
      );
      if (!result.granted) {
        // Sin fila mensual el operador debe fijar la cuota (decisión 066): se dice en claro.
        const hint =
          result.reason === 'monthly-missing'
            ? ' No hay cuota mensual utilizable: ejecuta `set-monthly-quota --total <n> --reserve <n>`.'
            : '';
        deps.io.log(`coverage-worker: reserva del carril "${lane}" denegada (${result.reason}).${hint}`);
        return null;
      }
      // El recibo lleva el MES de la reserva: la reconciliación devuelve lo no gastado a ese mes
      // aunque el tick cruce el cambio de mes. El driver crea un objeto de reserva nuevo por cada
      // reserva, así que el propio objeto sirve de clave.
      grants.set(reservation, result);
      return { searchRequests: result.searchGranted, tokenRequests: result.tokenReserved };
    },

    async reconcileBudget(reserved: BudgetReservation, actual: BudgetSnapshotLike): Promise<void> {
      const grant = grants.get(reserved);
      if (!grant) {
        throw new Error('reconcileBudget: la reserva no se hizo con este puerto (no hay recibo mensual que reconciliar).');
      }
      grants.delete(reserved);
      await reconcileRequestBudget(deps.db, deps.sourceUuid, grant, actual);
    },

    // ROADMAP 1.15 (security-hardening, decisión #263 D9) — purga
    // programada sobre el MISMO pool propietario del proceso worker
    // (`deps.db`), reutilizando `purgeExpiredClientQuota` sin ningún
    // adaptador propio: la purga es una simple DELETE, no necesita
    // credenciales aparte de las que este proceso ya tiene.
    async purgeClientQuota(): Promise<void> {
      await purgeExpiredClientQuota(deps.db);
    },

    async claimAndSweep(job: PollJob, area: AreaQuery, fingerprint: string): Promise<SweepTickResult> {
      // ROADMAP 3.3 (decisión 253, D11): el worker solo recibe jobs a demanda, de refresco o PARCIALES DEL PRESWEEP
      // PROMOVIDOS (zona con demanda reciente, `selectNextClaimableJob`). Reclamar uno promovido lo saca del carril
      // batch: se limpia `presweep_requested_at`. En cualquier otro job la marca ya es NULL (no-op).
      const claimed = await store.claimJob(job.zoneId, job.sourceId, job.operation, fingerprint, { presweep: 'clear' });

      const acquisitionsBefore = tokenPort.acquisitions();
      const source = createIdealistaSource({
        searchPort,
        tokenPort,
        maxSearchRequestsPerSweep: deps.maxSearchRequestsPerSweep,
      });
      const normalizer = new IdealistaListingNormalizer();

      const result = await runSweep({
        source,
        normalizer,
        store,
        area,
        job: claimed,
        sourceUuid: job.sourceId,
        fingerprint,
        ...(deps.shouldStop ? { shouldStop: deps.shouldStop } : {}),
      });

      // Mismo formato que runSweepZone (R2): el informe es la evidencia de
      // qué área se barrió y con qué resultado, a coste facturable.
      const report = buildReport({
        area,
        outcome: result.outcome,
        inserted: result.inserted,
        versioned: result.versioned,
        unchanged: result.unchanged,
        rejectedCount: result.rejectedCount,
        resumeCursor: result.resumeCursor,
        error: result.error,
        requestsSpent: source.diagnostics().budget.search,
      });
      deps.io.log(JSON.stringify(report, null, 2));

      // Token: las llamadas REALES de este barrido, no las que pidió la fuente (decisión 272).
      return {
        outcome: result.outcome,
        actual: { search: source.diagnostics().budget.search, token: tokenSpentSince(acquisitionsBefore) },
      };
    },

    async runDedup(): Promise<void> {
      // DD-10/CR-2: el MISMO núcleo de reproceso global que
      // scripts/reprocess-dedup.ts, sin filtro de zona — blocking.ts:4-6
      // queda sin estrechar (decisión 068).
      await runReprocessCore(deps.db, deps.blockingThresholds, deps.io);
    },

    sleep: realSleep,

    log(line: string): void {
      deps.io.log(line);
    },
  };
}
