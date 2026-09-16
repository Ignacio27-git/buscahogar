// ROADMAP 1.10 — parseReprocessArgs (diseño D9). Mismo patrón de tres pasos
// que src/blocking/options.ts (paso 1.8, blocking-options.test.ts):
// parseArgs({strict:true}) rechaza un flag desconocido por sí solo; Zod
// comprueba presencia y forma superficial nombrando el flag exacto; la
// conversión numérica final nombra el flag Y el texto ofensivo;
// blockingThresholdsSchema.parse reutiliza el MISMO esquema que ya protege
// la consulta de bloqueo (paso 1.8) — la CLI de reproceso queda protegida
// por la misma frontera, no por una copia. A diferencia de
// parseCalibrationArgs (rejilla separada por comas), esta CLI recibe UN
// valor por umbral: una corrida, no una rejilla (D9).
import { describe, expect, it } from 'vitest';

import { parseReprocessArgs, ReprocessOptionsError } from '../src/dedup/options.js';

describe('parseReprocessArgs (D9)', () => {
  it('un flag no reconocido se rechaza por nombre', () => {
    expect(() =>
      parseReprocessArgs(['--radio', '300', '--price-band', '2500000', '--surface-tolerance', '10'])
    ).toThrow(/radio/);
  });

  it('--radius ausente se rechaza por nombre, sin sustituir un valor por defecto', () => {
    expect(() => parseReprocessArgs(['--price-band', '2500000', '--surface-tolerance', '10'])).toThrow(
      /--radius/
    );
  });

  it('--price-band ausente se rechaza por nombre', () => {
    expect(() => parseReprocessArgs(['--radius', '300', '--surface-tolerance', '10'])).toThrow(/--price-band/);
  });

  it('--surface-tolerance ausente se rechaza por nombre', () => {
    expect(() => parseReprocessArgs(['--radius', '300', '--price-band', '2500000'])).toThrow(
      /--surface-tolerance/
    );
  });

  it('un valor no numérico se rechaza nombrando el flag y el texto ofensivo', () => {
    expect(() =>
      parseReprocessArgs(['--radius', 'abc', '--price-band', '2500000', '--surface-tolerance', '10'])
    ).toThrow(/--radius.*abc/);
  });

  it('lanza ReprocessOptionsError, no un Error genérico', () => {
    expect(() => parseReprocessArgs([])).toThrow(ReprocessOptionsError);
  });

  it('un umbral que viola el esquema compartido (radio no positivo) también se rechaza, reutilizando blockingThresholdsSchema', () => {
    expect(() =>
      parseReprocessArgs(['--radius', '0', '--price-band', '2500000', '--surface-tolerance', '10'])
    ).toThrow(ReprocessOptionsError);
  });

  it('un conjunto de flags válido produce exactamente los tres umbrales, sin ningún valor por defecto', () => {
    const thresholds = parseReprocessArgs([
      '--radius',
      '300',
      '--price-band',
      '2500000',
      '--surface-tolerance',
      '10',
    ]);
    expect(thresholds).toEqual({ radiusMeters: 300, priceBandCents: 2_500_000, surfaceToleranceM2: 10 });
  });
});
