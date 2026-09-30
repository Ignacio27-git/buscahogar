// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105, U3) — sonda de
// `adIds`: argumentos y plan de las tres peticiones. Todo puro: sin red, sin
// credenciales, sin disco. El plan usa el MISMO constructor de campos que la
// verificación real, así que la sonda valida exactamente lo que producción envía.
import { describe, expect, it } from 'vitest';

import {
  ADIDS_PROBE_SEARCH_CAP,
  AdIdsProbeUsageError,
  buildAdIdsProbePlan,
  parseAdIdsProbeArgs,
} from '../scripts/probe/adids-options.js';
import { createRequestLedger } from '../scripts/probe/ledger.js';

const BASE_ARGS = [
  '--live-id',
  '111741132',
  '--delisted-id',
  '99999999',
  '--center',
  '40.430,-3.702',
  '--distance',
  '300',
];

function asRecord(fields: readonly { name: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.value]));
}

describe('parseAdIdsProbeArgs', () => {
  it('con los argumentos obligatorios resuelve a dry-run (sin --execute no hay red), venta y filtro homes', () => {
    const options = parseAdIdsProbeArgs(BASE_ARGS);

    expect(options).toEqual({
      mode: 'dry-run',
      liveId: '111741132',
      delistedId: '99999999',
      center: { latitude: 40.43, longitude: -3.702 },
      distanceMeters: 300,
      operation: 'sale',
      filter: 'homes',
      otherFilter: 'premises',
      overwrite: false,
    });
  });

  it('--execute activa el modo de ejecución; --overwrite, --operation y --filter se respetan', () => {
    const options = parseAdIdsProbeArgs([
      ...BASE_ARGS,
      '--execute',
      '--overwrite',
      '--operation',
      'rent',
      '--filter',
      'premises',
    ]);

    expect(options).toMatchObject({
      mode: 'execute',
      overwrite: true,
      operation: 'rent',
      filter: 'premises',
      otherFilter: 'homes',
    });
  });

  it('--other-filter explícito se respeta mientras sea distinto de --filter', () => {
    expect(parseAdIdsProbeArgs([...BASE_ARGS, '--filter', 'homes', '--other-filter', 'premises']).otherFilter).toBe(
      'premises'
    );
    expect(() => parseAdIdsProbeArgs([...BASE_ARGS, '--filter', 'homes', '--other-filter', 'homes'])).toThrow(
      AdIdsProbeUsageError
    );
  });

  it.each([
    ['falta --live-id', ['--delisted-id', '9', '--center', '40,-3', '--distance', '300']],
    ['falta --delisted-id', ['--live-id', '9', '--center', '40,-3', '--distance', '300']],
    ['falta --center', ['--live-id', '1', '--delisted-id', '2', '--distance', '300']],
    ['falta --distance', ['--live-id', '1', '--delisted-id', '2', '--center', '40,-3']],
    ['el mismo id vivo y dado de baja', ['--live-id', '5', '--delisted-id', '5', '--center', '40,-3', '--distance', '300']],
    ['id no numérico', ['--live-id', 'abc', '--delisted-id', '2', '--center', '40,-3', '--distance', '300']],
    ['id con una coma (inyectaría un segundo id)', ['--live-id', '1,2', '--delisted-id', '3', '--center', '40,-3', '--distance', '300']],
    ['centro con un solo número', ['--live-id', '1', '--delisted-id', '2', '--center', '40', '--distance', '300']],
    ['latitud fuera de rango', ['--live-id', '1', '--delisted-id', '2', '--center', '95,-3', '--distance', '300']],
    ['longitud fuera de rango', ['--live-id', '1', '--delisted-id', '2', '--center', '40,-200', '--distance', '300']],
    ['distancia cero', ['--live-id', '1', '--delisted-id', '2', '--center', '40,-3', '--distance', '0']],
    ['distancia no entera', ['--live-id', '1', '--delisted-id', '2', '--center', '40,-3', '--distance', '3.5']],
    ['operación desconocida', [...BASE_ARGS, '--operation', 'swap']],
    ['filtro desconocido', [...BASE_ARGS, '--filter', 'garages']],
    ['flag desconocido (strict)', [...BASE_ARGS, '--nope']],
    ['argumento posicional', [...BASE_ARGS, 'sobra']],
  ])('%s -> AdIdsProbeUsageError', (_name, argv) => {
    expect(() => parseAdIdsProbeArgs(argv)).toThrow(AdIdsProbeUsageError);
  });
});

describe('buildAdIdsProbePlan (U3: como mucho 3 peticiones de búsqueda)', () => {
  const plan = buildAdIdsProbePlan(parseAdIdsProbeArgs(BASE_ARGS));

  it('tiene exactamente tres pasos, en orden, y el tope de la sonda es 3', () => {
    expect(plan.map((step) => step.name)).toEqual(['live-own-filter', 'live-and-delisted', 'live-other-filter']);
    expect(ADIDS_PROBE_SEARCH_CAP).toBe(3);
    expect(plan).toHaveLength(ADIDS_PROBE_SEARCH_CAP);
  });

  it('paso 1: el id vivo solo, bajo su filtro', () => {
    expect(asRecord(plan[0]?.fields ?? [])).toEqual({
      center: '40.43,-3.702',
      distance: '300',
      propertyType: 'homes',
      operation: 'sale',
      maxItems: '50',
      numPage: '1',
      adIds: '111741132',
    });
  });

  it('paso 2: el vivo Y el dado de baja juntos, separados por coma, bajo el mismo filtro (fija la codificación y la omisión)', () => {
    expect(asRecord(plan[1]?.fields ?? [])).toMatchObject({
      propertyType: 'homes',
      adIds: '111741132,99999999',
    });
  });

  it('paso 3: el id vivo solo bajo OTRO filtro (¿restringe propertyType a adIds?)', () => {
    expect(asRecord(plan[2]?.fields ?? [])).toMatchObject({ propertyType: 'premises', adIds: '111741132' });
  });

  it('todas las peticiones usan el mismo centro, distancia y operación', () => {
    const shared = plan.map((step) => {
      const record = asRecord(step.fields);
      return [record['center'], record['distance'], record['operation']];
    });

    expect(new Set(shared.map((entry) => entry.join('|'))).size).toBe(1);
  });

  it('S-LR-21: con el contador en tope 3 las tres peticiones del plan caben y una CUARTA se rechaza antes de la red', () => {
    const ledger = createRequestLedger({ search: ADIDS_PROBE_SEARCH_CAP });
    ledger.spend('token');

    plan.forEach(() => {
      ledger.spend('search');
    });

    expect(ledger.snapshot()).toEqual({ token: 1, search: 3 });
    expect(() => {
      ledger.spend('search');
    }).toThrow(/máximo 3/);
  });
});
