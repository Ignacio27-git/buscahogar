// ROADMAP 3.3 (decisión 253; R4) — concesión por barrido y motivo de parada del presweep. PURO.
//
// La concesión de un barrido es el MÍNIMO de tres términos: el tope por barrido, lo que queda del tope
// de la ejecución y lo que queda del techo mensual del carril batch. El término que limita determina el
// motivo con el que acaba el barrido si gasta toda su concesión. Si varios coinciden manda el más global
// (techo mensual > tope de la ejecución > tope por barrido): es el que de verdad impide seguir.

// Los cinco motivos con los que puede terminar una unidad (R4).
export type SweepStopReason =
  | 'unit-exhausted'
  | 'per-sweep-cap'
  | 'run-cap'
  | 'monthly-batch-ceiling'
  | 'upstream-signal';

// Términos que pueden limitar una concesión, del más global al más local.
export type AllowanceBinding = 'monthly-batch-ceiling' | 'run-cap' | 'per-sweep-cap';

export interface SweepAllowanceInput {
  readonly perSweepCap: number;
  // Lo que queda del tope de la ejecución (`--max-requests` menos lo ya gastado).
  readonly runRemaining: number;
  // Margen del carril batch del mes (`laneRemaining('batch', ...)`).
  readonly monthlyBatchRemaining: number;
}

export interface SweepAllowance {
  readonly allowance: number;
  readonly binding: AllowanceBinding;
}

// Evaluación de más global a más local con `<=`: ante un empate gana el primer término evaluado.
export function sweepAllowance(input: SweepAllowanceInput): SweepAllowance {
  const allowance = Math.min(input.perSweepCap, input.runRemaining, input.monthlyBatchRemaining);
  if (input.monthlyBatchRemaining <= allowance) {
    return { allowance, binding: 'monthly-batch-ceiling' };
  }
  if (input.runRemaining <= allowance) {
    return { allowance, binding: 'run-cap' };
  }
  return { allowance, binding: 'per-sweep-cap' };
}

// Resultado del barrido tal como lo informa `runSweep` (apps/ingestion): completado, presupuesto
// agotado (la concesión se gastó entera) o fallo (transporte, envelope o cursor).
export type SweepRunOutcome = 'completed' | 'budget-exhausted' | 'failed';

// Completado manda sobre el tope (la unidad acabó justo al gastar la concesión); un fallo es una señal
// de la fuente y no se reintenta dentro de la ejecución; el agotamiento del presupuesto lo explica el
// término que limitaba.
export function unitStopReason(binding: AllowanceBinding, outcome: SweepRunOutcome): SweepStopReason {
  if (outcome === 'completed') {
    return 'unit-exhausted';
  }
  if (outcome === 'failed') {
    return 'upstream-signal';
  }
  return binding;
}

// Los topes globales y la señal de la fuente detienen toda la ejecución; el tope por barrido y la
// unidad agotada pasan a la unidad siguiente.
export function stopsRun(reason: SweepStopReason): boolean {
  return reason === 'monthly-batch-ceiling' || reason === 'run-cap' || reason === 'upstream-signal';
}
