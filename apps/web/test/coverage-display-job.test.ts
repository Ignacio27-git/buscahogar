// ROADMAP 3.3 (decisión 251, PD9) — con dos jobs por zona (venta y alquiler), el aviso de cobertura
// necesita UN estado que enseñar. `pickDisplayJob` elige el más "vivo" de los jobs de las operaciones
// que faltan por cubrir: en curso > en cola > fallido > terminado. Pura: sin base de datos.
import { describe, expect, it } from 'vitest';

import type { CoverageJobState } from '@buscahogar/db';

import { pickDisplayJob } from '../src/server/coverage.js';

function job(status: CoverageJobState['status'], overrides: Partial<CoverageJobState> = {}): CoverageJobState {
  return {
    status,
    attempts: 0,
    requestedAt: new Date('2026-10-20T08:00:00Z'),
    startedAt: null,
    error: null,
    ...overrides,
  };
}

describe('pickDisplayJob', () => {
  it('sin jobs devuelve null (no hay nada que enseñar)', () => {
    expect(pickDisplayJob([])).toBeNull();
  });

  it('con un solo job devuelve ese job', () => {
    const only = job('pending');
    expect(pickDisplayJob([only])).toBe(only);
  });

  it('un job en curso gana a uno en cola, sea cual sea el orden', () => {
    const running = job('running', { startedAt: new Date('2026-10-20T09:00:00Z') });
    const pending = job('pending');
    expect(pickDisplayJob([pending, running])).toBe(running);
    expect(pickDisplayJob([running, pending])).toBe(running);
  });

  it('un job en cola gana a uno fallido: el fallo no tapa un trabajo que aún va a ocurrir', () => {
    const failed = job('failed', { attempts: 3, error: 'upstream' });
    const pending = job('pending');
    expect(pickDisplayJob([failed, pending])).toBe(pending);
  });

  it('un job fallido gana a uno terminado sin cobertura', () => {
    const failed = job('failed', { attempts: 3 });
    const done = job('done');
    expect(pickDisplayJob([done, failed])).toBe(failed);
  });

  it('con el mismo estado conserva el primero de la lista (orden estable)', () => {
    const first = job('pending', { requestedAt: new Date('2026-10-20T07:00:00Z') });
    const second = job('pending', { requestedAt: new Date('2026-10-20T08:30:00Z') });
    expect(pickDisplayJob([first, second])).toBe(first);
  });
});
