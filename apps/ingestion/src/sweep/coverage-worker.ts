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
import { planZoneMaintenance } from '@buscahogar/core';
import type { AreaQuery, ZoneLifecycleSnapshot } from '@buscahogar/core';
import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { areaFingerprint, buildArea } from './area.js';
import { JobAlreadyClaimedError } from './coverage-store.js';
import type { JobLane, PollJob } from './job-selection.js';
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

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104/110) — pasos de
// mantenimiento del tick, cada uno aislado (`runIsolatedStep`): una avería de
// cualquiera de ellos nunca aborta el tick ni impide el barrido. Agrupados en
// un objeto OPCIONAL de `CoverageWorkerPorts` (y no como métodos sueltos) para
// que las composiciones y dobles anteriores a 2.5 sigan siendo válidos sin
// cambios (S-CWT-12). Los cortes de S2-S4 (purga de zonas, tombstone) se
// añaden a este mismo grupo.
export interface ZoneMaintenancePorts {
  // Purga acotada de `zone_query_signals` caducadas (RP-12).
  purgeZoneQuerySignals(): Promise<number>;
  // Fotos de zona para el planificador puro de `packages/core`.
  listZoneLifecycle(): Promise<readonly ZoneLifecycleSnapshot[]>;
  // Re-encola los jobs de las zonas dadas en el carril de refresco (ZRS-8).
  scheduleRefresh(zoneIds: readonly string[]): Promise<number>;
}

export interface CoverageWorkerPorts {
  selectNextJob(): Promise<PollJob | null>;
  resolveZoneGeometry(zoneId: string): Promise<ZoneGeometry>;
  failJob(jobId: string, reason: string): Promise<void>;
  // ROADMAP 2.5: la reserva se hace POR CARRIL. 'refresh' se compara contra el
  // techo `floor(cap × fracción)` sobre el gasto TOTAL del día; 'on-demand'
  // no lleva techo (ZRS-11).
  reserveBudget(reservation: BudgetReservation, lane: JobLane): Promise<LedgerState | null>;
  reconcileBudget(reserved: BudgetReservation, actual: BudgetSnapshotLike): Promise<void>;
  claimAndSweep(job: PollJob, area: AreaQuery, fingerprint: string): Promise<SweepTickResult>;
  runDedup(): Promise<void>;
  // ROADMAP 1.15 (security-hardening, decisión #263 D9) — purga programada
  // de `coverage_client_quota`, REFUERZO sobre la purga perezosa que
  // `consumeClientQuota` ya hace en cada escritura (packages/db, decisión
  // 076): acota la retención incluso cuando no hay ningún registro nuevo
  // que la dispare. Invocada SIEMPRE, una vez por tick, sin importar el
  // resultado del resto del tick — nunca condicionada a que haya trabajo,
  // presupuesto, o un barrido completado.
  purgeClientQuota(): Promise<void>;
  // Opcional (ver `ZoneMaintenancePorts`): ausente = sin mantenimiento.
  readonly maintenance?: ZoneMaintenancePorts;
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
  // ROADMAP 2.5 (decisión 104): el mantenimiento corre en el primer tick y
  // después cada `maintenanceEveryTicks` ticks (basado en ticks, así que el
  // driver no necesita reloj — CWT-3). Por defecto, cada tick.
  readonly maintenanceEveryTicks?: number;
  // Fracción del tope diario que puede gastar el carril de refresco, en
  // [0, 1] (validada con Zod en el composition root). Ausente o 0 desactiva el
  // refresco: no se re-encola ninguna zona (S-ZRS-10), así que ningún job
  // espera para siempre detrás de un techo nulo.
  readonly refreshBudgetFraction?: number;
}

const DEFAULT_MAINTENANCE_EVERY_TICKS = 1;

// El token se reserva una vez por barrido, igual que budget.ts::TOKEN_CAP
// (1.6) — no un valor nuevo, el mismo principio repetido en el nivel diario
// (DD-13: los dos niveles componen porque la reserva ES el tope por
// barrido).
const TOKEN_RESERVE = 1;

type IsolatedResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

// Decisión 110 — ejecuta UN paso de mantenimiento aislado: si lanza, registra
// `paso "<nombre>" falló: <mensaje>` (solo el mensaje del error: las
// credenciales nunca viajan en él) y devuelve un resultado tipado en vez de
// abortar el tick. NO envuelve `purgeClientQuota` (comportamiento 1.15
// intacto) ni el barrido (su semántica de propagación no cambia).
async function runIsolatedStep<T>(
  ports: CoverageWorkerPorts,
  name: string,
  step: () => Promise<T>
): Promise<IsolatedResult<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ports.log(`coverage-worker: paso "${name}" falló: ${message}`);
    return { ok: false };
  }
}

// Mantenimiento de zonas (S1): purga de señales caducadas, planificación pura
// de refresco y re-encolado. Cada paso aislado; si el listado falla, se omite
// la planificación entera. La purga de zonas que también devuelve el plan
// (`plan.purge`) se conecta en S4 — hasta entonces solo se re-encola.
async function runMaintenance(
  ports: CoverageWorkerPorts,
  maintenance: ZoneMaintenancePorts,
  options: CoverageWorkerOptions
): Promise<void> {
  await runIsolatedStep(ports, 'purga-señales-de-zona', () => maintenance.purgeZoneQuerySignals());

  const planned = await runIsolatedStep(ports, 'ciclo-de-vida-de-zonas', async () =>
    planZoneMaintenance(await maintenance.listZoneLifecycle())
  );

  // Fracción 0 (o ausente): el re-encolado se OMITE. Encolar refrescos que el
  // techo nulo nunca dejaría gastar solo dejaría jobs esperando sin fin.
  const refreshEnabled = (options.refreshBudgetFraction ?? 0) > 0;
  if (planned.ok && refreshEnabled && planned.value.refresh.length > 0) {
    const zoneIds = planned.value.refresh;
    await runIsolatedStep(ports, 're-encolado-de-refresco', () => maintenance.scheduleRefresh(zoneIds));
  }
}

async function runTick(
  ports: CoverageWorkerPorts,
  options: CoverageWorkerOptions,
  tickIndex: number
): Promise<{ readonly dirty: boolean }> {
  // D9: SIEMPRE lo primero del tick, antes de cualquier rama de salida
  // temprana (sin trabajo, centroide nulo, presupuesto agotado) — así se
  // garantiza exactamente una vez por tick sin duplicar la comprobación en
  // cada punto de retorno.
  await ports.purgeClientQuota();

  // ROADMAP 2.5: mantenimiento en el primer tick y luego cada N ticks, ANTES
  // de elegir trabajo — así un refresco re-encolado ya es candidato en este
  // mismo tick.
  const maintenanceEveryTicks = options.maintenanceEveryTicks ?? DEFAULT_MAINTENANCE_EVERY_TICKS;
  if (ports.maintenance && tickIndex % maintenanceEveryTicks === 0) {
    await runMaintenance(ports, ports.maintenance, options);
  }

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
  const reserved = await ports.reserveBudget(reservation, job.lane ?? 'on-demand');
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

    const { dirty } = await runTick(ports, options, tickCount - 1);

    // DD-18 paso 11/12: como mucho UN reproceso global por tick, solo si
    // algo se completó de verdad en ESTE tick — nunca acumulado entre
    // ticks, nunca dentro de la transacción del barrido.
    if (dirty) {
      await ports.runDedup();
    }
  }
}
