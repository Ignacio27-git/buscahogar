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
import { partitionPresenceVerdicts, planZoneMaintenance } from '@buscahogar/core';
import type {
  AreaQuery,
  PartitionedPresence,
  PresenceBatch,
  PresenceVerdict,
  RefreshTarget,
  ZoneLifecycleSnapshot,
} from '@buscahogar/core';
import type { BudgetReservation, BudgetSnapshotLike, LedgerState, ZoneGeometry } from '@buscahogar/db';

import { createOutboundBudget, DEFAULT_MAX_OUTBOUND_CALLS_PER_TICK } from '../ops/outbound-budget.js';
import type { OutboundBudget } from '../ops/outbound-budget.js';
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
// cambios (S-CWT-12).
export interface ZoneMaintenancePorts {
  // Purga acotada de `zone_query_signals` caducadas (RP-12).
  purgeZoneQuerySignals(): Promise<number>;
  // Fotos de zona para el planificador puro de `packages/core`.
  listZoneLifecycle(): Promise<readonly ZoneLifecycleSnapshot[]>;
  // ROADMAP 2.5 (S4; decisión 108) — reinicia las zonas dadas (las que el plan
  // puro marcó con ≥ 180 días sin consultas): retira sus anuncios huérfanos,
  // borra job y señales y las devuelve a `uncovered`. Sin llamadas a la fuente
  // ni gasto de cuota. Devuelve cuántas zonas se reiniciaron.
  purgeZones(zoneIds: readonly string[]): Promise<number>;
  // Re-encola los jobs de las (zona, operación) dadas en el carril de refresco
  // (ZRS-8): cada operación vence según su propio último barrido (decisión 250).
  scheduleRefresh(targets: readonly RefreshTarget[]): Promise<number>;
  // ROADMAP 2.5 (S4; decisión 107) — redacta los anuncios inactivos desde hace
  // ≥ 180 días (lote acotado). Devuelve cuántos: si es > 0 el tick queda sucio
  // y el reproceso de dedup reconstruye las cachés de las viviendas (RP-9).
  tombstoneExpiredListings(): Promise<number>;
}

// ROADMAP 2.5 (S3; decisión 105) — plan de un paso de verificación de presencia,
// resuelto por el puerto real (DB + mapa de filtros de la fuente):
// - `batches`: lotes listos para enviar (≤ 50 ids, una zona, una operación, un
//   filtro de la fuente).
// - `listingIdByExternalId`: id externo -> id de listing de los ids de esos
//   lotes, para aplicar los veredictos sobre la base de datos.
// - `unverifiableListingIds`: anuncios cuyo tipo crudo no tiene filtro de la
//   fuente: no se pide nada y quedan AMBIGUOS (S-LR-11).
export interface PresencePlan {
  readonly batches: readonly PresenceBatch[];
  readonly listingIdByExternalId: ReadonlyMap<string, string>;
  readonly unverifiableListingIds: readonly string[];
}

// `actual` es lo REALMENTE gastado (token y búsquedas): el ledger se reconcilia
// con ello, nunca con lo reservado.
export interface PresenceVerification {
  readonly verdicts: ReadonlyMap<string, PresenceVerdict>;
  readonly actual: BudgetSnapshotLike;
}

// ROADMAP 2.5 (S3; decisión 105) — verificación de presencia por `adIds`.
// Grupo OPCIONAL de `CoverageWorkerPorts` por el mismo motivo que
// `ZoneMaintenancePorts` (composiciones y dobles anteriores siguen válidos,
// S-CWT-12). La verificación vive en un puerto APARTE de la búsqueda: no es una
// capacidad de `PropertySource`.
export interface PresenceVerificationPorts {
  // Tras un ciclo COMPLETADO: nomina los anuncios activos de la zona no vistos
  // en él. Nunca cambia el estado de un anuncio (039 enmendada).
  markAbsenceCandidates(job: PollJob, area: AreaQuery): Promise<number>;
  // Planifica como mucho `maxBatches` lotes vencidos (la cola con backoff).
  nextPresenceBatches(maxBatches: number): Promise<PresencePlan>;
  // Una petición por lote. No lanza por fallos de la fuente (ids ambiguos).
  verifyPresence(batches: readonly PresenceBatch[]): Promise<PresenceVerification>;
  // Aplica los veredictos (ids de listing): presente, ausente o ambiguo.
  applyPresence(result: PartitionedPresence): Promise<void>;
}

export interface CoverageWorkerPorts {
  selectNextJob(): Promise<PollJob | null>;
  resolveZoneGeometry(zoneId: string): Promise<ZoneGeometry>;
  failJob(jobId: string, reason: string): Promise<void>;
  // ROADMAP 2.5: la reserva se hace POR CARRIL. 'refresh' se compara contra el
  // techo `floor(cap × fracción)` sobre el gasto TOTAL del día; 'on-demand'
  // no lleva techo (ZRS-11). ROADMAP 3.3 (decisión 248): además, TODA reserva
  // pasa por el registro mensual de cuota (techo por carril; sin cuota
  // utilizable se deniega, también a demanda). La verificación de presencia
  // reserva en el carril 'refresh' (mismo fondo que el batch).
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
  // Opcional (ver `PresenceVerificationPorts`): ausente = sin verificación.
  readonly verification?: PresenceVerificationPorts;
  // ROADMAP 3.4 (decisión 258, D16) — gancho OPCIONAL tras un tick que ha terminado sin lanzar (latido). Recibe
  // el presupuesto de llamadas salientes de ESE tick. Aislado: si lanza, se registra y el worker sigue. Un tick
  // que lanza nunca llega aquí.
  onTickSuccess?(budget: OutboundBudget): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

// ROADMAP 3.3 (decisión 252) — el worker es ÚNICO y sirve las dos operaciones: la
// operación de cada barrido es la de su job (`PollJob.operation`). Ya no hay una
// operación fija por proceso (la antigua variable `OPERATION`, retirada).
export interface CoverageWorkerOptions {
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
  // ROADMAP 2.5 (S3; decisión 105) — tope EXPLÍCITO de peticiones de
  // verificación por tick (un lote = una petición facturable). Cada verificación
  // reserva en el carril de refresco, así que también la acota el techo diario.
  readonly maxVerificationRequestsPerTick?: number;
  // ROADMAP 3.4 (decisión 258, D16): tope de llamadas salientes por tick que reciben los ganchos (latido). Por
  // defecto 4 (`MAX_OUTBOUND_CALLS_PER_TICK`).
  readonly maxOutboundCallsPerTick?: number;
  // ROADMAP 3.4 (decisión 258, D14): parada pedida, consultada DENTRO del tick (antes de elegir trabajo y de
  // verificar presencia) y pasada al barrido para cerrarlo en el límite de página. Distinta de `shouldContinue`,
  // que solo se mira entre ticks. Ausente = nunca.
  readonly shouldStop?: () => boolean;
}

const DEFAULT_MAINTENANCE_EVERY_TICKS = 1;
// Por defecto, pocas peticiones por tick: la cuota es mensual y limitada.
const DEFAULT_MAX_VERIFICATION_REQUESTS_PER_TICK = 2;

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

// Mantenimiento (S1, S4): purga de señales caducadas, planificación pura,
// purga de zonas, re-encolado de refresco y tombstone de anuncios. Cada paso
// aislado; si el listado de zonas falla, se omiten la purga y el re-encolado
// (ambos dependen del plan) pero el tombstone, que no depende de él, se ejecuta.
interface MaintenanceResult {
  // Anuncios redactados en este tick: si es > 0 el tick queda sucio (RP-9).
  readonly tombstoned: number;
}

async function runMaintenance(
  ports: CoverageWorkerPorts,
  maintenance: ZoneMaintenancePorts,
  options: CoverageWorkerOptions
): Promise<MaintenanceResult> {
  await runIsolatedStep(ports, 'purga-señales-de-zona', () => maintenance.purgeZoneQuerySignals());

  const planned = await runIsolatedStep(ports, 'ciclo-de-vida-de-zonas', async () =>
    planZoneMaintenance(await maintenance.listZoneLifecycle())
  );

  // La purga de zonas va ANTES del re-encolado (una zona purgable nunca se
  // refresca) y NO depende de la fracción de refresco: no gasta cuota (RP-5).
  if (planned.ok && planned.value.purge.length > 0) {
    const zoneIds = planned.value.purge;
    await runIsolatedStep(ports, 'purga-de-zonas', () => maintenance.purgeZones(zoneIds));
  }

  // Fracción 0 (o ausente): el re-encolado se OMITE. Encolar refrescos que el
  // techo nulo nunca dejaría gastar solo dejaría jobs esperando sin fin.
  const refreshEnabled = (options.refreshBudgetFraction ?? 0) > 0;
  if (planned.ok && refreshEnabled && planned.value.refresh.length > 0) {
    const targets = planned.value.refresh;
    await runIsolatedStep(ports, 're-encolado-de-refresco', () => maintenance.scheduleRefresh(targets));
  }

  const tombstone = await runIsolatedStep(ports, 'tombstone-de-anuncios', () =>
    maintenance.tombstoneExpiredListings()
  );
  return { tombstoned: tombstone.ok ? tombstone.value : 0 };
}

interface SweepStepResult {
  readonly dirty: boolean;
  // Se seleccionó un job A DEMANDA en este tick (haya salido bien o no): la
  // demanda del usuario manda y el refresco de presencia espera (LR-9).
  readonly onDemandSelected: boolean;
  // Tick sin trabajo procesable: se duerme `pollIntervalMs` al final del tick.
  readonly idle: boolean;
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
  let tombstoned = 0;
  if (ports.maintenance && tickIndex % maintenanceEveryTicks === 0) {
    ({ tombstoned } = await runMaintenance(ports, ports.maintenance, options));
  }

  const sweep = await runSweepStep(ports, options);

  // ROADMAP 2.5 (S3; decisión 105): verificación de presencia DESPUÉS del
  // barrido, solo si no hubo trabajo a demanda y hay techo de gasto de refresco
  // (fracción > 0). Aislada: una avería nunca aborta el tick.
  const verification = ports.verification;
  if (verification && !sweep.onDemandSelected && (options.refreshBudgetFraction ?? 0) > 0 && !stopRequested(options)) {
    await runIsolatedStep(ports, 'verificacion-de-presencia', () =>
      runPresenceVerification(ports, verification, options)
    );
  }

  if (sweep.idle) {
    await ports.sleep(options.pollIntervalMs);
  }
  // Sucio = un barrido completó O se redactó algún anuncio (RP-9).
  return { dirty: sweep.dirty || tombstoned > 0 };
}

// ROADMAP 3.4 (decisión 258, D14): con una parada pedida no se arranca trabajo facturable nuevo en lo que
// queda del tick (el barrido en curso se cierra en el límite de página, sweep-runner.ts).
function stopRequested(options: CoverageWorkerOptions): boolean {
  return options.shouldStop?.() === true;
}

async function runSweepStep(ports: CoverageWorkerPorts, options: CoverageWorkerOptions): Promise<SweepStepResult> {
  if (stopRequested(options)) {
    return { dirty: false, onDemandSelected: false, idle: false };
  }
  const job = await ports.selectNextJob();
  if (!job) {
    return { dirty: false, onDemandSelected: false, idle: true };
  }
  const onDemandSelected = (job.lane ?? 'on-demand') === 'on-demand';

  // DD-18 paso 3: la geometría se resuelve ANTES de reservar presupuesto o
  // reclamar — un centroide nulo (DD-5) es una razón estructural para NUNCA
  // barrer esta zona, no un fallo transitorio que merezca gastar cuota.
  const geometry = await ports.resolveZoneGeometry(job.zoneId);
  if (geometry.centroid === null || geometry.sweepRadiusM === null) {
    await ports.failJob(
      job.jobId,
      `La zona "${geometry.ineCode}" no tiene centroide: barrido worker-side imposible (DD-5).`
    );
    return { dirty: false, onDemandSelected, idle: false };
  }

  // DD-18 paso 4: construir el área y su huella ANTES de reservar
  // presupuesto o reclamar — buildArea/areaFingerprint son puras (area.ts,
  // reutilizadas sin cambios, CR-2).
  const areaOptions: SweepOptions = {
    zone: geometry.ineCode,
    center: geometry.centroid,
    radiusMeters: geometry.sweepRadiusM,
    operation: job.operation,
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
      `coverage-worker: presupuesto agotado (diario o mensual), el trabajo job_id="${job.jobId}" permanece pendiente, cero peticiones emitidas.`
    );
    return { dirty: false, onDemandSelected, idle: true };
  }

  try {
    const result = await ports.claimAndSweep(job, area, fingerprint);
    await ports.reconcileBudget(reservation, result.actual);
    // ROADMAP 2.5 (S3; decisión 105): SOLO un ciclo completado (finishJob
    // completed ya ejecutado) es evidencia de ausencia. Aislado: si falla, este
    // ciclo no nomina a nadie (fail-safe) y el tick sigue sucio.
    if (result.outcome === 'completed' && ports.verification) {
      const verification = ports.verification;
      await runIsolatedStep(ports, 'nominacion-de-ausentes', () => verification.markAbsenceCandidates(job, area));
    }
    return { dirty: result.outcome === 'completed', onDemandSelected, idle: false };
  } catch (error) {
    // A-8.1: JobAlreadyClaimedError es una señal de sondeo NO fatal — otro
    // proceso ya tiene este trabajo (claimJob's CAS ya lo hace seguro entre
    // workers concurrentes, coverage-store.ts). La reserva se reembolsa por
    // completo: cero peticiones reales se emitieron en este tick.
    if (error instanceof JobAlreadyClaimedError) {
      await ports.reconcileBudget(reservation, { search: 0, token: 0 });
      ports.log(error.message);
      return { dirty: false, onDemandSelected, idle: false };
    }
    // Cualquier otro error NO se enmascara en silencio: fuera del alcance
    // declarado de esta unidad (A-8.1 solo cubre JobAlreadyClaimedError) es
    // preferible un fallo ruidoso a un tick que parece haber ido bien sin
    // haberlo hecho.
    throw error;
  }
}

// Verificación de presencia (S3; decisión 105): planificar -> reservar (carril de
// refresco) -> verificar (una petición por lote) -> reconciliar el ledger con lo
// gastado -> aplicar veredictos. Cada bucle tiene corte explícito: los lotes se
// recortan al tope por tick ANTES de reservar y de enviar.
async function runPresenceVerification(
  ports: CoverageWorkerPorts,
  verification: PresenceVerificationPorts,
  options: CoverageWorkerOptions
): Promise<void> {
  const maxRequests = options.maxVerificationRequestsPerTick ?? DEFAULT_MAX_VERIFICATION_REQUESTS_PER_TICK;
  const plan = await verification.nextPresenceBatches(maxRequests);

  // Sin filtro de la fuente no hay petición posible (S-LR-11): ambiguo, sin
  // gastar presupuesto. Se aplica aunque luego el ledger deniegue los lotes.
  if (plan.unverifiableListingIds.length > 0) {
    await verification.applyPresence({ present: [], absent: [], ambiguous: plan.unverifiableListingIds });
  }

  const batches = plan.batches.slice(0, maxRequests);
  if (batches.length === 0) {
    return;
  }

  const reservation: BudgetReservation = { searchReserved: batches.length, tokenReserved: TOKEN_RESERVE };
  const reserved = await ports.reserveBudget(reservation, 'refresh');
  if (reserved === null) {
    ports.log('coverage-worker: presupuesto de refresco agotado, verificación de presencia omitida (cero peticiones).');
    return;
  }

  // Si `verifyPresence` lanza, la reserva se CONSERVA (sobre-cuenta, nunca
  // sub-cuenta: A-9.2) y el aislamiento del paso registra el fallo.
  const verified = await verification.verifyPresence(batches);
  await ports.reconcileBudget(reservation, verified.actual);

  // Solo los ids de los lotes realmente enviados: los recortados por el tope
  // siguen vencidos para el próximo tick.
  const sentExternalIds = new Set(batches.flatMap((batch) => batch.externalIds));
  const sentListingIds = new Map(
    [...plan.listingIdByExternalId].filter(([externalId]) => sentExternalIds.has(externalId))
  );
  await verification.applyPresence(partitionPresenceVerdicts(verified.verdicts, sentListingIds));
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

    // D16: el tick terminó sin lanzar. Un presupuesto de salida NUEVO por tick; aislado.
    const onTickSuccess = ports.onTickSuccess?.bind(ports);
    if (onTickSuccess) {
      const budget = createOutboundBudget(options.maxOutboundCallsPerTick ?? DEFAULT_MAX_OUTBOUND_CALLS_PER_TICK);
      await runIsolatedStep(ports, 'latido', () => onTickSuccess(budget));
    }
  }
}
