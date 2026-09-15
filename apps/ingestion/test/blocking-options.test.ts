// ROADMAP 1.8 — parseCalibrationArgs (diseño D-C1, CLI-1). Mismo patrón de
// tres pasos que sweep/options.ts: parseArgs({strict:true}) rechaza un flag
// desconocido por sí solo; Zod comprueba presencia nombrando el flag; el
// split final a números nombra el flag Y el elemento ofensivo. Ningún
// umbral se sustituye nunca por un valor por defecto silencioso.
import { describe, expect, it } from 'vitest';

import { CalibrationOptionsError, parseCalibrationArgs } from '../src/blocking/options.js';

describe('parseCalibrationArgs (CLI-1)', () => {
  it('CLI-1a: un flag no reconocido se rechaza por nombre (esta función es pura: cero consultas emitidas)', () => {
    expect(() =>
      parseCalibrationArgs(['--radio', '300', '--price-band', '1000000', '--surface-tolerance', '5'])
    ).toThrow(/radio/);
  });

  it('CLI-1b: --radius ausente se rechaza por nombre, sin sustituir un valor por defecto', () => {
    expect(() => parseCalibrationArgs(['--price-band', '1000000', '--surface-tolerance', '5'])).toThrow(
      /--radius/
    );
  });

  it('un elemento no numérico se rechaza nombrando el flag y el elemento ofensivo', () => {
    expect(() =>
      parseCalibrationArgs(['--radius', '300,abc', '--price-band', '1000000', '--surface-tolerance', '5'])
    ).toThrow(/--radius.*abc/);
  });

  it('lanza CalibrationOptionsError, no un Error genérico', () => {
    expect(() => parseCalibrationArgs([])).toThrow(CalibrationOptionsError);
  });

  it('una lista separada por comas válida se parsea en arrays de números', () => {
    const options = parseCalibrationArgs([
      '--radius',
      '150,300,600',
      '--price-band',
      '1000000,2500000',
      '--surface-tolerance',
      '5,10,15',
    ]);
    expect(options.radiusMeters).toEqual([150, 300, 600]);
    expect(options.priceBandCents).toEqual([1_000_000, 2_500_000]);
    expect(options.surfaceToleranceM2).toEqual([5, 10, 15]);
  });
});
