// ROADMAP 3.4 (decisión 259, D17; R7.3, R7.4) — selección PURA de los avisos que se envían en un tick.
//
// - Enfriamiento por clave contra el último envío PERSISTIDO (`alert_dispatch_log`): un reinicio del worker
//   dentro del enfriamiento no reenvía.
// - Tope de mensajes por tick (`maxPerTick`, 3) y plazas de salida restantes (`slots`, el presupuesto
//   compartido con el latido): si hay más avisos que plazas, se envían `plazas - 1` y UN resumen "+N más".
//   Los avisos plegados NO se registran como enviados: siguen siendo candidatos en el siguiente tick (la cola
//   la recalcula el estado, nunca crece sin límite).
// - El orden es determinista: gravedad (crítico primero) y luego clave.
import type { AlertCandidate, AlertSeverity } from './checks.js';

export interface AlertMessage {
  readonly text: string;
  // Claves que se registran como enviadas si el envío tiene éxito. Vacío en el resumen.
  readonly dedupKeys: readonly string[];
}

export interface AlertSelection {
  readonly messages: readonly AlertMessage[];
  // Claves que estaban dentro del enfriamiento (no se envían).
  readonly suppressed: readonly string[];
  // Avisos elegibles que no caben y quedan plegados en el resumen (o simplemente sin enviar si no hay plazas).
  readonly folded: number;
}

export interface AlertSelectionOptions {
  readonly maxPerTick: number;
  readonly slots: number;
}

const SEVERITY_RANK: Readonly<Record<AlertSeverity, number>> = { critical: 0, warning: 1, info: 2 };

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`selectAlertsToSend: ${name} debe ser un entero >= 0 (recibido ${String(value)}).`);
  }
}

function uniqueByKey(candidates: readonly AlertCandidate[]): readonly AlertCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.dedupKey)) {
      return false;
    }
    seen.add(candidate.dedupKey);
    return true;
  });
}

function compareCandidates(a: AlertCandidate, b: AlertCandidate): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.dedupKey.localeCompare(b.dedupKey);
}

export function selectAlertsToSend(
  candidates: readonly AlertCandidate[],
  lastSent: ReadonlyMap<string, Date>,
  now: Date,
  options: AlertSelectionOptions
): AlertSelection {
  assertNonNegativeInteger('maxPerTick', options.maxPerTick);
  assertNonNegativeInteger('slots', options.slots);

  const suppressed: string[] = [];
  const eligible: AlertCandidate[] = [];
  for (const candidate of uniqueByKey(candidates)) {
    const sentAt = lastSent.get(candidate.dedupKey);
    // Un envío en el futuro (reloj desfasado) cuenta como dentro del enfriamiento: nunca se reenvía por error.
    if (sentAt !== undefined && now.getTime() - sentAt.getTime() < candidate.cooldownMs) {
      suppressed.push(candidate.dedupKey);
    } else {
      eligible.push(candidate);
    }
  }
  eligible.sort(compareCandidates);

  const allowed = Math.min(options.maxPerTick, options.slots);
  if (eligible.length <= allowed) {
    return {
      messages: eligible.map((candidate) => ({ text: candidate.text, dedupKeys: [candidate.dedupKey] })),
      suppressed,
      folded: 0,
    };
  }
  if (allowed === 0) {
    return { messages: [], suppressed, folded: eligible.length };
  }
  const individual = eligible.slice(0, allowed - 1);
  const folded = eligible.length - individual.length;
  return {
    messages: [
      ...individual.map((candidate) => ({ text: candidate.text, dedupKeys: [candidate.dedupKey] })),
      { text: `+${String(folded)} avisos más pendientes: revisa los registros del worker.`, dedupKeys: [] },
    ],
    suppressed,
    folded,
  };
}
