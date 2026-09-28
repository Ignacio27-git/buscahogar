// ROADMAP 2.3 — IMAGE_HAMMING_THRESHOLD (decisión 097): debe coincidir
// EXACTAMENTE con el T committeado en calibration-report.json
// (apps/ingestion/test/fixtures/images/, read-only desde aquí —
// packages/core no lee ficheros en producción, spec "No Native or I-O
// Dependencies in packages/core"). Esta suite SÍ lee el fichero real: es la
// comprobación de que la constante nunca se desincroniza del resultado de
// calibración.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { IMAGE_HAMMING_THRESHOLD } from '../src/strategies/image/parameters.js';

const CALIBRATION_REPORT_PATH = fileURLToPath(
  new URL('../../../apps/ingestion/test/fixtures/images/calibration-report.json', import.meta.url)
);
const PARAMETERS_SOURCE_PATH = fileURLToPath(new URL('../src/strategies/image/parameters.ts', import.meta.url));

describe('IMAGE_HAMMING_THRESHOLD (ROADMAP 2.3, decisión 097)', () => {
  it('coincide exactamente con el T committeado en calibration-report.json', () => {
    const report = JSON.parse(readFileSync(CALIBRATION_REPORT_PATH, 'utf8')) as { threshold: number };

    expect(IMAGE_HAMMING_THRESHOLD).toBe(report.threshold);
  });

  it('es un entero en [1, 64] — el rango que withImageSignal acepta sin lanzar RangeError', () => {
    expect(Number.isInteger(IMAGE_HAMMING_THRESHOLD)).toBe(true);
    expect(IMAGE_HAMMING_THRESHOLD).toBeGreaterThanOrEqual(1);
    expect(IMAGE_HAMMING_THRESHOLD).toBeLessThanOrEqual(64);
  });

  it('el módulo no importa nada de evaluation/ ni de dedup-corpus — independiente del corpus de evaluación', () => {
    const source = readFileSync(PARAMETERS_SOURCE_PATH, 'utf8');

    expect(/from\s+['"][^'"]*evaluation/.test(source)).toBe(false);
    expect(/from\s+['"][^'"]*dedup-corpus/.test(source)).toBe(false);
  });
});
