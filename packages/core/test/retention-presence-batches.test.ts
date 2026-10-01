// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — planificación PURA
// de los lotes de verificación de presencia: agrupa los candidatos por área y
// filtro de la fuente y los trocea en lotes de como mucho 50 ids (S-LR-4).
import { describe, expect, it } from 'vitest';

import {
  PRESENCE_BATCH_SIZE,
  PRESENCE_MAX_CHECK_ATTEMPTS,
  PRESENCE_RETRY_BACKOFF_DAYS,
} from '../src/retention/policy.js';
import { partitionPresenceVerdicts, planPresenceBatches } from '../src/retention/presence-batches.js';
import type { PresenceCandidate } from '../src/retention/presence-batches.js';

const CENTER_A = { latitude: 40.43, longitude: -3.702 };
const CENTER_B = { latitude: 37.18, longitude: -3.6 };

function candidates(count: number, overrides: Partial<PresenceCandidate> = {}, prefix = 'id'): PresenceCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    externalId: `${prefix}-${String(index)}`,
    center: CENTER_A,
    radiusMeters: 4500,
    operation: 'sale' as const,
    groupKey: 'homes',
    ...overrides,
  }));
}

describe('constantes de la verificación de presencia (ZRS-7)', () => {
  it('lotes de 50, reintento a los 7 días y 3 intentos como máximo', () => {
    expect(PRESENCE_BATCH_SIZE).toBe(50);
    expect(PRESENCE_RETRY_BACKOFF_DAYS).toBe(7);
    expect(PRESENCE_MAX_CHECK_ATTEMPTS).toBe(3);
  });
});

describe('planPresenceBatches (S-LR-4)', () => {
  it('120 ids de un mismo grupo dan lotes de 50, 50 y 20 con el centro y el radio de la zona', () => {
    const batches = planPresenceBatches(candidates(120));

    expect(batches.map((batch) => batch.externalIds.length)).toEqual([50, 50, 20]);
    expect(batches[0]).toMatchObject({ center: CENTER_A, radiusMeters: 4500, operation: 'sale', groupKey: 'homes' });
    expect(batches[0]?.externalIds[0]).toBe('id-0');
    expect(batches[2]?.externalIds.at(-1)).toBe('id-119');
  });

  it('exactamente 50 ids caben en un único lote; 51 necesitan dos', () => {
    expect(planPresenceBatches(candidates(50)).map((batch) => batch.externalIds.length)).toEqual([50]);
    expect(planPresenceBatches(candidates(51)).map((batch) => batch.externalIds.length)).toEqual([50, 1]);
  });

  it('grupos distintos (zona, operación o filtro) nunca se mezclan en un lote', () => {
    const batches = planPresenceBatches([
      ...candidates(2, {}, 'a'),
      ...candidates(2, { center: CENTER_B }, 'b'),
      ...candidates(2, { operation: 'rent' }, 'c'),
      ...candidates(2, { groupKey: 'premises' }, 'd'),
    ]);

    expect(batches).toHaveLength(4);
    expect(batches.map((batch) => batch.externalIds)).toEqual([
      ['a-0', 'a-1'],
      ['b-0', 'b-1'],
      ['c-0', 'c-1'],
      ['d-0', 'd-1'],
    ]);
  });

  it('un grupo intercalado con otros conserva el orden de entrada y se agrupa en un solo lote', () => {
    const batches = planPresenceBatches([
      ...candidates(1, {}, 'a'),
      ...candidates(1, { center: CENTER_B }, 'b'),
      ...candidates(1, {}, 'z'),
    ]);

    expect(batches.map((batch) => batch.externalIds)).toEqual([['a-0', 'z-0'], ['b-0']]);
  });

  it('respeta un tamaño de lote explícito y no repite un id duplicado', () => {
    const batches = planPresenceBatches([...candidates(3), ...candidates(3)], 2);

    expect(batches.map((batch) => batch.externalIds)).toEqual([['id-0', 'id-1'], ['id-2']]);
  });

  it('sin candidatos no hay lotes', () => {
    expect(planPresenceBatches([])).toEqual([]);
  });

  it('rechaza un tamaño de lote no positivo en vez de entrar en un bucle sin fin', () => {
    expect(() => planPresenceBatches(candidates(2), 0)).toThrow(RangeError);
  });
});

describe('partitionPresenceVerdicts', () => {
  it('reparte los ids de listing por veredicto; un id sin veredicto queda ambiguo', () => {
    const verdicts = new Map([
      ['e1', 'present' as const],
      ['e2', 'absent' as const],
      ['e3', 'ambiguous' as const],
    ]);
    const listingIds = new Map([
      ['e1', 'l1'],
      ['e2', 'l2'],
      ['e3', 'l3'],
      ['e4', 'l4'],
    ]);

    expect(partitionPresenceVerdicts(verdicts, listingIds)).toEqual({
      present: ['l1'],
      absent: ['l2'],
      ambiguous: ['l3', 'l4'],
    });
  });

  it('ignora un veredicto cuyo id externo no pertenece al plan', () => {
    const result = partitionPresenceVerdicts(new Map([['ajeno', 'absent' as const]]), new Map([['e1', 'l1']]));

    expect(result).toEqual({ present: [], absent: [], ambiguous: ['l1'] });
  });
});
