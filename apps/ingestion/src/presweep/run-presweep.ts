// ROADMAP 3.3 (decisión 253; R3, R4, R5; diseño D13, "Data flow") — bucle de ejecución del presweep de las
// ciudades más pobladas. Depende de PUERTOS, nunca de `Database` ni de la red: su terminación, el reparto de
// los topes y el enrutado de motivos son demostrables con puertos falsos (test/presweep-run.test.ts); el
// composition root (scripts/presweep-top-cities.ts) y los puertos reales (presweep-ports.ts) lo cablean.
//
// Flujo: preflight de SOLO LECTURA (cuota utilizable y techo del batch) -> candidatos -> plan puro de
// `packages/core` -> por unidad: concesión = min(tope por barrido, tope de la ejecución restante, techo mensual
// del batch restante) -> reserva en el carril batch -> barrido con tope duro = lo concedido -> reconciliación con
// el gasto real. Ningún token se pide antes del preflight (el token solo se obtiene dentro de `sweepUnit`).
//
// Corte explícito (R4): este bucle recorre un conjunto FINITO de unidades y cada barrido está acotado por su
// concesión, que el conector aplica como tope duro (`maxSearchRequestsPerSweep` del adaptador, budget.ts). No
// existe ninguna ruta que repita una unidad ni que pida más de lo reservado en el registro mensual.
import { laneRemaining, planPresweep, stopsRun, sweepAllowance, unitStopReason } from '@buscahogar/core';
import type {
  AllowanceBinding,
  MonthlyLedgerState,
  PresweepCityCandidate,
  PresweepUnit,
  SweepRunOutcome,
  SweepStopReason,
} from '@buscahogar/core';

import type { PresweepArgs } from './presweep-options.js';

// Los candidatos llevan además el nombre del municipio, solo para el informe.
export interface PresweepCandidate extends PresweepCityCandidate {
  readonly municipality: string;
}

// Misma forma que los argumentos validados: el bucle solo depende de estos cuatro campos.
export type PresweepArgsLike = PresweepArgs;

// Reserva concedida en el carril batch: `searchGranted` puede ser MENOR que lo pedido (concesión parcial,
// D6b). `settle` devuelve al registro lo concedido y no gastado (reconciliación con el gasto real).
export type PresweepReservation =
  | {
      readonly granted: true;
      readonly searchGranted: number;
      settle(actual: { readonly search: number; readonly token: number }): Promise<void>;
    }
  | { readonly granted: false; readonly reason: 'monthly-missing' | 'monthly' };

// Resultado de barrer UNA unidad. `not-claimed`: el reclamo falló (otro proceso la tiene o el cursor guardado no
// es reanudable): no se emitió ninguna petición.
export type UnitSweepResult =
  | {
      readonly kind: 'swept';
      readonly outcome: SweepRunOutcome;
      readonly actual: { readonly search: number; readonly token: number };
      readonly error?: string;
    }
  | { readonly kind: 'not-claimed'; readonly reason: string };

export interface PresweepPorts {
  // Lectura SIN efectos del registro mensual (mes en curso o heredable); null = sin cuota utilizable.
  readLedger(): Promise<MonthlyLedgerState | null>;
  listCandidates(top: number): Promise<readonly PresweepCandidate[]>;
  reserve(requested: number): Promise<PresweepReservation>;
  // Reclama el job (marcándolo como trabajo de presweep), barre con `hardCap` peticiones como máximo y
  // persiste el cursor. Es el ÚNICO punto que obtiene token y emite peticiones.
  sweepUnit(unit: PresweepUnit, hardCap: number): Promise<UnitSweepResult>;
  log(line: string): void;
}

export type PresweepRunReason =
  | 'plan-complete'
  | 'run-cap'
  | 'monthly-batch-ceiling'
  | 'upstream-signal'
  | 'monthly-missing'
  | 'dry-run';

export interface PresweepUnitReport {
  readonly cityId: string;
  readonly municipality: string;
  readonly operation: PresweepUnit['operation'];
  readonly requests: number;
  readonly reason: SweepStopReason;
  readonly error?: string;
}

export interface PresweepSkippedReport {
  readonly cityId: string;
  readonly operation: PresweepUnit['operation'];
  readonly why: 'completed' | 'running' | 'not-claimed';
  readonly detail?: string;
}

export interface PresweepRunReport {
  readonly reason: PresweepRunReason;
  readonly totalRequests: number;
  readonly plannedUnits: number;
  readonly planned: readonly PresweepUnit[];
  readonly units: readonly PresweepUnitReport[];
  readonly skipped: readonly PresweepSkippedReport[];
}

const EMPTY_REPORT: Omit<PresweepRunReport, 'reason'> = {
  totalRequests: 0,
  plannedUnits: 0,
  planned: [],
  units: [],
  skipped: [],
};

// Mapea el término limitante que detiene la ejecución al motivo de la ejecución. El tope por barrido nunca
// detiene la ejecución (`stopsRun` es falso), así que no tiene motivo de ejecución.
function runReasonOf(reason: SweepStopReason): PresweepRunReason {
  if (reason === 'run-cap' || reason === 'monthly-batch-ceiling' || reason === 'upstream-signal') {
    return reason;
  }
  return 'plan-complete';
}

export async function runPresweep(ports: PresweepPorts, args: PresweepArgsLike): Promise<PresweepRunReport> {
  // Preflight de SOLO LECTURA, ANTES de cualquier token (D13): sin cuota utilizable no se hace nada.
  const ledger = await ports.readLedger();
  if (ledger === null) {
    ports.log('Sin cuota mensual utilizable (ni en el mes en curso ni heredable): ejecuta `set-monthly-quota --total <n> --reserve <n>`.');
    return { ...EMPTY_REPORT, reason: 'monthly-missing' };
  }
  if (laneRemaining('batch', ledger) <= 0) {
    ports.log('El techo mensual del carril batch está agotado (total - reserva - gastado = 0): cero peticiones.');
    return { ...EMPTY_REPORT, reason: 'monthly-batch-ceiling' };
  }

  const candidates = await ports.listCandidates(args.top);
  const municipalityOf = new Map(candidates.map((candidate) => [candidate.id, candidate.municipality]));
  const plan = planPresweep(candidates, args.top);

  const skipped: PresweepSkippedReport[] = plan.skipped.map((unit) => ({
    cityId: unit.cityId,
    operation: unit.operation,
    why: unit.why,
  }));
  const base = { plannedUnits: plan.units.length, planned: plan.units };

  if (args.dryRun) {
    return { ...base, reason: 'dry-run', totalRequests: 0, units: [], skipped };
  }

  const units: PresweepUnitReport[] = [];
  let totalRequests = 0;
  let runReason: PresweepRunReason = 'plan-complete';

  for (const unit of plan.units) {
    // Lectura fresca por unidad: otro proceso (worker, barrido manual) también gasta del mismo registro.
    const current = await ports.readLedger();
    if (current === null) {
      runReason = 'monthly-missing';
      break;
    }
    const { allowance, binding } = sweepAllowance({
      perSweepCap: args.maxRequestsPerSweep,
      runRemaining: args.maxRequests - totalRequests,
      monthlyBatchRemaining: laneRemaining('batch', current),
    });
    if (allowance <= 0) {
      // Nada que conceder: el término a 0 es el motivo (techo mensual o tope de la ejecución).
      runReason = runReasonOf(binding);
      break;
    }

    const reservation = await ports.reserve(allowance);
    if (!reservation.granted) {
      runReason = reservation.reason === 'monthly-missing' ? 'monthly-missing' : 'monthly-batch-ceiling';
      break;
    }
    // Una concesión menor que la pedida solo puede deberse a que otro proceso gastó margen entre la lectura y
    // la reserva: el techo mensual pasa a ser el término limitante.
    const effectiveBinding: AllowanceBinding = reservation.searchGranted < allowance ? 'monthly-batch-ceiling' : binding;

    const result = await ports.sweepUnit(unit, reservation.searchGranted);
    if (result.kind === 'not-claimed') {
      // Nada se emitió: la reserva entera vuelve al mes y se pasa a la unidad siguiente.
      await reservation.settle({ search: 0, token: 0 });
      skipped.push({ cityId: unit.cityId, operation: unit.operation, why: 'not-claimed', detail: result.reason });
      continue;
    }

    await reservation.settle(result.actual);
    totalRequests += result.actual.search;
    const reason = unitStopReason(effectiveBinding, result.outcome);
    units.push({
      cityId: unit.cityId,
      municipality: municipalityOf.get(unit.cityId) ?? unit.cityId,
      operation: unit.operation,
      requests: result.actual.search,
      reason,
      ...(result.error !== undefined ? { error: result.error } : {}),
    });
    if (stopsRun(reason)) {
      runReason = runReasonOf(reason);
      break;
    }
  }

  return { ...base, reason: runReason, totalRequests, units, skipped };
}

// 0: la ejecución terminó dentro de lo previsto (incluidos los topes, que son el diseño). 1: no se pudo
// empezar (sin cuota) o la fuente señaló un error (cursor persistido, ejecución interrumpida).
export function presweepExitCode(report: PresweepRunReport): number {
  return report.reason === 'monthly-missing' || report.reason === 'upstream-signal' ? 1 : 0;
}

const REASON_TEXT: Readonly<Record<PresweepRunReason, string>> = {
  'plan-complete': 'plan completado',
  'run-cap': 'tope de peticiones de la ejecución',
  'monthly-batch-ceiling': 'techo mensual del carril batch',
  'upstream-signal': 'señal de la fuente (error o cuota)',
  'monthly-missing': 'sin cuota mensual utilizable',
  'dry-run': 'simulación (no se ha gastado nada)',
};

// Informe legible, una línea por unidad y un resumen final de la ejecución.
export function formatPresweepReport(report: PresweepRunReport): readonly string[] {
  const lines: string[] = [];
  if (report.reason === 'dry-run') {
    lines.push(`Plan: ${String(report.plannedUnits)} unidades.`);
    for (const unit of report.planned) {
      lines.push(`  pendiente: ${unit.cityId} ${unit.operation}`);
    }
  }
  for (const unit of report.units) {
    lines.push(
      `${unit.cityId} ${unit.municipality} ${unit.operation}: ${String(unit.requests)} peticiones, motivo ${unit.reason}` +
        (unit.error !== undefined ? ` (${unit.error})` : '')
    );
  }
  for (const unit of report.skipped) {
    lines.push(`${unit.cityId} ${unit.operation}: omitida (${unit.why}${unit.detail !== undefined ? `: ${unit.detail}` : ''})`);
  }
  lines.push(
    `Ejecución: ${String(report.totalRequests)} peticiones en ${String(report.units.length)} unidades barridas; ` +
      `motivo ${report.reason} (${REASON_TEXT[report.reason]}).`
  );
  return lines;
}
