// Paso 1.7 — parseSweepArgs (CLI-1): rechazo nombrado, nunca un valor por
// defecto silencioso. `node:util.parseArgs({strict:true})` rechaza un flag
// desconocido por sí solo; Zod cubre el resto (requeridos ausentes, formato).
import { describe, expect, it } from 'vitest';

import { areaQuerySchema } from '@buscahogar/core';

import { parseSweepArgs, SweepOptionsError } from '../src/sweep/options.js';

const VALID_ARGS = ['--zone', '18087', '--center', '37.18,-3.60', '--radius', '2000', '--operation', 'sale'];

describe('parseSweepArgs — CLI-1a: flag mal escrita, rechazo nombrado', () => {
  it('rechaza "--radious" (en vez de "--radius") nombrándolo, sin caer en un radio por defecto', () => {
    const argsWithTypo = ['--zone', '18087', '--center', '37.18,-3.60', '--radious', '2000', '--operation', 'sale'];
    expect(() => parseSweepArgs(argsWithTypo)).toThrow(SweepOptionsError);
    expect(() => parseSweepArgs(argsWithTypo)).toThrow(/radious/);
  });
});

describe('parseSweepArgs — CLI-1b: flag requerida ausente, rechazo nombrado', () => {
  it('rechaza cuando falta --operation, nombrándolo', () => {
    const argsWithoutOperation = ['--zone', '18087', '--center', '37.18,-3.60', '--radius', '2000'];
    expect(() => parseSweepArgs(argsWithoutOperation)).toThrow(SweepOptionsError);
    expect(() => parseSweepArgs(argsWithoutOperation)).toThrow(/operation/);
  });

  it('rechaza cuando falta --zone, nombrándolo', () => {
    const argsWithoutZone = ['--center', '37.18,-3.60', '--radius', '2000', '--operation', 'sale'];
    expect(() => parseSweepArgs(argsWithoutZone)).toThrow(SweepOptionsError);
    expect(() => parseSweepArgs(argsWithoutZone)).toThrow(/zone/);
  });
});

describe('parseSweepArgs — CLI-1c: argumentos válidos construyen un AreaQuery bien formado', () => {
  it('produce un AreaQuery que pasa areaQuerySchema', () => {
    const options = parseSweepArgs(VALID_ARGS);
    const area = { center: options.center, radiusMeters: options.radiusMeters, operation: options.operation };
    expect(() => areaQuerySchema.parse(area)).not.toThrow();
  });

  it('usa 10 como --max-requests por defecto, igual que el adaptador (1.6)', () => {
    const options = parseSweepArgs(VALID_ARGS);
    expect(options.maxSearchRequestsPerSweep).toBe(10);
  });

  it('--max-requests explícito sobreescribe el valor por defecto', () => {
    const options = parseSweepArgs([...VALID_ARGS, '--max-requests', '3']);
    expect(options.maxSearchRequestsPerSweep).toBe(3);
  });

  it('rechaza --max-requests no positivo, sin caer en el valor por defecto', () => {
    expect(() => parseSweepArgs([...VALID_ARGS, '--max-requests', '0'])).toThrow(SweepOptionsError);
  });

  it('rechaza un --center malformado (sin coma)', () => {
    const badCenter = ['--zone', '18087', '--center', '37.18', '--radius', '2000', '--operation', 'sale'];
    expect(() => parseSweepArgs(badCenter)).toThrow(SweepOptionsError);
  });
});
