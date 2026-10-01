// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — planificación PURA
// de la verificación de presencia: agrupa candidatos por (zona, operación,
// filtro de la fuente) y los trocea en lotes de como mucho 50 ids. Cero DB,
// cero red: la capa SQL entrega los candidatos ya resueltos.
import type { PresenceBatch, PresenceVerdict } from '../contracts/listing-presence-verifier.js';
import type { Coordinates } from '../types/coordinates.js';
import type { OperationType } from '../types/operation-type.js';
import { PRESENCE_BATCH_SIZE } from './policy.js';

export interface PresenceCandidate {
  readonly externalId: string;
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly operation: OperationType;
  readonly groupKey: string;
}

function groupIdentity(candidate: PresenceCandidate): string {
  return [
    candidate.center.latitude,
    candidate.center.longitude,
    candidate.radiusMeters,
    candidate.operation,
    candidate.groupKey,
  ].join('|');
}

// Los grupos salen en el orden de su primera aparición y dentro de cada grupo
// se conserva el orden de entrada: el llamador ordena por antigüedad de la
// sospecha y ese orden se respeta. Un id repetido en un grupo cuenta una vez.
export function planPresenceBatches(
  candidates: readonly PresenceCandidate[],
  maxBatchSize: number = PRESENCE_BATCH_SIZE
): readonly PresenceBatch[] {
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new RangeError(`planPresenceBatches: maxBatchSize debe ser un entero positivo (recibido ${String(maxBatchSize)}).`);
  }

  const groups = new Map<string, { readonly head: PresenceCandidate; readonly ids: string[] }>();
  for (const candidate of candidates) {
    const identity = groupIdentity(candidate);
    const group = groups.get(identity) ?? { head: candidate, ids: [] };
    if (!group.ids.includes(candidate.externalId)) {
      group.ids.push(candidate.externalId);
    }
    groups.set(identity, group);
  }

  const batches: PresenceBatch[] = [];
  for (const { head, ids } of groups.values()) {
    for (let offset = 0; offset < ids.length; offset += maxBatchSize) {
      batches.push({
        center: head.center,
        radiusMeters: head.radiusMeters,
        operation: head.operation,
        groupKey: head.groupKey,
        externalIds: ids.slice(offset, offset + maxBatchSize),
      });
    }
  }
  return batches;
}

export interface PartitionedPresence {
  readonly present: readonly string[];
  readonly absent: readonly string[];
  readonly ambiguous: readonly string[];
}

// Traduce los veredictos por id externo a ids de listing, repartidos por
// veredicto. Un id del plan SIN veredicto se trata como `ambiguous` (nunca como
// ausente): fail-safe. Un veredicto para un id que el plan no contiene se
// ignora.
export function partitionPresenceVerdicts(
  verdicts: ReadonlyMap<string, PresenceVerdict>,
  listingIdByExternalId: ReadonlyMap<string, string>
): PartitionedPresence {
  const present: string[] = [];
  const absent: string[] = [];
  const ambiguous: string[] = [];
  for (const [externalId, listingId] of listingIdByExternalId) {
    const verdict = verdicts.get(externalId) ?? 'ambiguous';
    if (verdict === 'present') {
      present.push(listingId);
    } else if (verdict === 'absent') {
      absent.push(listingId);
    } else {
      ambiguous.push(listingId);
    }
  }
  return { present, absent, ambiguous };
}
