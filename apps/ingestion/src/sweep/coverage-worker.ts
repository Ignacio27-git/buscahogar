// ROADMAP 1.13 Unit C (diseño DD-17, DD-18, CR-1, CR-2) — driver PURO del
// worker de cobertura: cero DB, cero red, cero `process.env` (mismo
// principio que sweep-runner.ts, fase 1). Toda dependencia externa llega
// inyectada por `ports` — real (scripts/coverage-worker.ts, vía
// src/sweep/coverage-worker-ports.ts) o falsa (test/sweep-coverage-worker.test.ts).
//
// El orden de la tabla DD-18 es la propiedad de seguridad central de este
// fichero: `reserveBudget` SIEMPRE antes de `claimAndSweep` — `claimJob`
// incrementa `attempts` (coverage-store.ts), así que reclamar y luego
// abortar por presupuesto inflaría el contador de reintentos de un trabajo
// nunca intentado de verdad (A-8.2). Por el mismo principio, un centroide
// nulo (DD-5) aborta ANTES de reservar presupuesto: resolver la geometría
// tampoco es un intento real de la fuente.
//
// CR-1 (arbitraje, vinculante): este fichero vive en `src/sweep/`, no en
// `src/index.ts` — ese fichero es el barril del paquete (`export *`), y
// darle una dependencia de proceso lo volvería side-effectful al
// importarlo. El punto de entrada real es `scripts/coverage-worker.ts`
// (composition root, único lector de `process.env` de este módulo).
import type { AreaQuery } from '@buscahogar/core';
import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { areaFingerprint, buildArea } from './area.js';
import { JobAlreadyClaimedError } from './coverage-store.js';
import type { PollJob } from './job-selection.js';
import type { SweepOptions } from './options.js';

// Puerto CADA UNO fakeable por separado (DD-17, §5 interfaces). `failJob` es
// una desviación deliberada y documentada sobre la lista literal del
// diseño: `coverage-store.ts` queda SIN TOCAR por este cambio (§2 del
// diseño) y su unión `JobOutcome` no tiene ninguna variante para "nunca
// reclamado, sin cursor" — el paso 3 de la tabla DD-18 (centroide nulo)
// necesita un camino de escritura propio, así que se añade este puerto en
// vez de ensanchar `JobOutcome` para un único caso que coverage-store.ts no
// pidió.
export interface SweepTickResult {
  readonly outcome: 'completed' | 'budget-exhausted' | 'failed';
  readonly actual: BudgetSnapshotLike;
}

export interface CoverageWorkerPorts {
  selectNextJob(): Promise<PollJob | null>;
  resolveZoneGeometry(zoneId: string): Promise<ZoneGeometry>;
  failJob(jobId: string, reason: string): Promise<void>;
  reserveBudget(reservation: BudgetReservation): Promise<LedgerState | null>;
  reconcileBudget(reserved: BudgetReservation, actual: BudgetSnapshotLike): Promise<void>;
  claimAndSweep(job: PollJob, area: AreaQuery, fingerprint: string): Promise<SweepTickResult>;
  runDedup(): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

export interface CoverageWorkerOptions {
  // Desviación deliberada y documentada sobre el listado literal del diseño
  // (§5 interfaces): ni `coverage_jobs` ni ningún puerto llevan
  // 'sale'/'rent' — buildArea/AreaQuery lo EXIGEN (area-query.schema.ts) y
  // ningún artefacto (spec, diseño, tasks) dice de dónde sale para un
  // trabajo encolado. Un proceso worker cubre UNA operación fija, igual que
  // `sweep-zone.ts --operation` la exige por invocación — sin este campo el
  // tick no podría construir ningún AreaQuery. Documentado como hallazgo,
  // no como invención silenciosa.
  readonly operation: 'sale' | 'rent';
  readonly pollIntervalMs: number;
  readonly maxSearchRequestsPerSweep: number;
  readonly dailySearchCap: number;
  readonly maxAttempts: number;
  // Finito en tests ⇒ terminación determinista, sin temporizadores reales
  // (mismo idioma que maxSearchRequestsPerSweep, 1.6). Ilimitado en
  // producción.
  readonly maxTicks?: number;
  // R11 — apagado ordenado: `RECLAIMABLE_STATUSES` (coverage-store.ts)
  // excluye deliberadamente 'running', así que un proceso matado a mitad de
  // tick deja un trabajo permanentemente inalcanzable. El composition root
  // (scripts/coverage-worker.ts) cablea esto a un manejador de
  // SIGINT/SIGTERM que pone la bandera en `false`; el bucle SIEMPRE termina
  // el tick en curso antes de comprobarlo, y nunca arranca uno nuevo tras
  // eso. Ausente en producción normal (siempre continúa) — solo `maxTicks`
  // es necesario para el resto de los tests de este fichero.
  readonly shouldContinue?: () => boolean;
}

// El token se reserva una vez por barrido, igual que budget.ts::TOKEN_CAP
// (1.6) — no un valor nuevo, el mismo principio repetido en el nivel diario
// (DD-13: los dos niveles componen porque la reserva ES el tope por
// barrido).
const TOKEN_RESERVE = 1;

async function runTick(ports: CoverageWorkerPorts, options: CoverageWorkerOptions): Promise<{ readonly dirty: boolean }> {
  const job = await ports.selectNextJob();
  if (!job) {
    await ports.sleep(options.pollIntervalMs);
    return { dirty: false };
  }

  // DD-18 paso 3: la geometría se resuelve ANTES de reservar presupuesto o
  // reclamar — un centroide nulo (DD-5) es una razón estructural para NUNCA
  // barrer esta zona, no un fallo transitorio que merezca gastar cuota.
  const geometry = await ports.resolveZoneGeometry(job.zoneId);
  if (geometry.centroid === null || geometry.sweepRadiusM === null) {
    await ports.failJob(
      job.jobId,
      `La zona "${geometry.ineCode}" no tiene centroide: barrido worker-side imposible (DD-5).`
    );
    return { dirty: false };
  }

  // DD-18 paso 4: construir el área y su huella ANTES de reservar
  // presupuesto o reclamar — buildArea/areaFingerprint son puras (area.ts,
  // reutilizadas sin cambios, CR-2).
  const areaOptions: SweepOptions = {
    zone: geometry.ineCode,
    center: geometry.centroid,
    radiusMeters: geometry.sweepRadiusM,
    operation: options.operation,
    maxSearchRequestsPerSweep: options.maxSearchRequestsPerSweep,
  };
  const area = buildArea(areaOptions);
  const fingerprint = areaFingerprint(area);
  // R2: registrar el área ANTES de barrer — un centroide equivocado barre
  // el área equivocada a coste facturable; el registro es la evidencia.
  ports.log(`coverage-worker: área a barrer para zone_id="${job.zoneId}" — ${JSON.stringify(area)}`);

  // DD-18 paso 5, ANTES del paso 7 (claimJob, dentro de claimAndSweep) —
  // A-8.2: claimJob incrementa `attempts`, así que reclamar y luego abortar
  // por presupuesto inflaría el contador de un trabajo nunca intentado.
  const reservation: BudgetReservation = {
    searchReserved: options.maxSearchRequestsPerSweep,
    tokenReserved: TOKEN_RESERVE,
  };
  const reserved = await ports.reserveBudget(reservation);
  if (reserved === null) {
    ports.log(
      `coverage-worker: presupuesto diario agotado, el trabajo job_id="${job.jobId}" permanece pendiente, cero peticiones emitidas.`
    );
    await ports.sleep(options.pollIntervalMs);
    return { dirty: false };
  }

  try {
    const result = await ports.claimAndSweep(job, area, fingerprint);
    await ports.reconcileBudget(reservation, result.actual);
    return { dirty: result.outcome === 'completed' };
  } catch (error) {
    // A-8.1: JobAlreadyClaimedError es una señal de sondeo NO fatal — otro
    // proceso ya tiene este trabajo (claimJob's CAS ya lo hace seguro entre
    // workers concurrentes, coverage-store.ts). La reserva se reembolsa por
    // completo: cero peticiones reales se emitieron en este tick.
    if (error instanceof JobAlreadyClaimedError) {
      await ports.reconcileBudget(reservation, { search: 0, token: 0 });
      ports.log(error.message);
      return { dirty: false };
    }
    // Cualquier otro error NO se enmascara en silencio: fuera del alcance
    // declarado de esta unidad (A-8.1 solo cubre JobAlreadyClaimedError) es
    // preferible un fallo ruidoso a un tick que parece haber ido bien sin
    // haberlo hecho.
    throw error;
  }
}

export async function runCoverageWorker(ports: CoverageWorkerPorts, options: CoverageWorkerOptions): Promise<void> {
  let tickCount = 0;

  for (;;) {
    if (options.maxTicks !== undefined && tickCount >= options.maxTicks) {
      return;
    }
    // R11: comprobado ANTES de arrancar un tick nuevo, nunca en mitad de
    // uno — el tick en curso (si lo hay) ya ha terminado en la iteración
    // anterior de este bucle antes de llegar aquí de nuevo.
    if (options.shouldContinue && !options.shouldContinue()) {
      return;
    }
    tickCount += 1;

    const { dirty } = await runTick(ports, options);

    // DD-18 paso 11/12: como mucho UN reproceso global por tick, solo si
    // algo se completó de verdad en ESTE tick — nunca acumulado entre
    // ticks, nunca dentro de la transacción del barrido.
    if (dirty) {
      await ports.runDedup();
    }
  }
}
