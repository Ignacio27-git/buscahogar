// D.13b (decisión 184) — tope de reintentos de un coverage_job, compartido entre el worker
// (que decide si vuelve a seleccionar un job `failed`) y la web (que decide qué le cuenta a quien
// espera). Una sola fuente: ya no hay `MAX_ATTEMPTS` por entorno.
import { describe, expect, it } from 'vitest';

import { COVERAGE_JOB_MAX_ATTEMPTS, hasRetriesLeft } from '../src/index.js';

describe('COVERAGE_JOB_MAX_ATTEMPTS', () => {
  it('es 3, el valor con el que ya operaba el worker', () => {
    expect(COVERAGE_JOB_MAX_ATTEMPTS).toBe(3);
  });
});

describe('hasRetriesLeft (attempts < máximo)', () => {
  it('con intentos por debajo del máximo quedan reintentos', () => {
    expect(hasRetriesLeft(0)).toBe(true);
    expect(hasRetriesLeft(COVERAGE_JOB_MAX_ATTEMPTS - 1)).toBe(true);
  });

  it('con el máximo exacto ya no quedan reintentos', () => {
    expect(hasRetriesLeft(COVERAGE_JOB_MAX_ATTEMPTS)).toBe(false);
  });

  it('por encima del máximo tampoco', () => {
    expect(hasRetriesLeft(COVERAGE_JOB_MAX_ATTEMPTS + 1)).toBe(false);
  });
});
