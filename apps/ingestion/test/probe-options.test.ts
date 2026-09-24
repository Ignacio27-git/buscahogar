// Sonda de la API de Idealista (paso 1.5) — parseo de argumentos y
// construcción de los parámetros de búsqueda. Todo puro: sin red, sin
// credenciales, sin disco.
import { describe, expect, it } from 'vitest';

import {
  buildSearchFields,
  PROBE_PROFILES,
  ProbeUsageError,
  parseProbeArgs,
  toFormData,
} from '../scripts/probe/options.js';

describe('parseProbeArgs', () => {
  it('lanza ProbeUsageError si falta --profile', () => {
    expect(() => parseProbeArgs([])).toThrow(ProbeUsageError);
  });

  it('lanza ProbeUsageError si --profile tiene un valor no reconocido', () => {
    expect(() => parseProbeArgs(['--profile', 'garages'])).toThrow(ProbeUsageError);
  });

  it('lanza si se pasa un flag desconocido (strict: true)', () => {
    expect(() => parseProbeArgs(['--profile', 'homes', '--unknown-flag'])).toThrow();
  });

  it('sin flags o con --dry-run resuelve a mode: "dry-run"; --execute vale false por defecto', () => {
    const withoutFlags = parseProbeArgs(['--profile', 'homes']);
    expect(withoutFlags.mode).toBe('dry-run');

    const withDryRun = parseProbeArgs(['--profile', 'homes', '--dry-run']);
    expect(withDryRun.mode).toBe('dry-run');
  });

  it('con --execute resuelve a mode: "execute"', () => {
    const options = parseProbeArgs(['--profile', 'homes', '--execute']);
    expect(options.mode).toBe('execute');
  });

  it('parsea --overwrite', () => {
    const withFlag = parseProbeArgs(['--profile', 'homes', '--overwrite']);
    expect(withFlag.overwrite).toBe(true);

    const withoutFlag = parseProbeArgs(['--profile', 'homes']);
    expect(withoutFlag.overwrite).toBe(false);
  });

  it('parsea --analyse junto con los positionals como rutas de análisis', () => {
    const options = parseProbeArgs(['--analyse', 'fixture-a.json', 'fixture-b.json']);

    expect(options.mode).toBe('analyse');
    expect(options.profile).toBeNull();
    expect(options.analysePaths).toEqual(['fixture-a.json', 'fixture-b.json']);
  });

  it('rechaza --analyse combinado con --execute', () => {
    expect(() => parseProbeArgs(['--analyse', '--execute', 'fixture.json'])).toThrow(ProbeUsageError);
  });
});

describe('buildSearchFields', () => {
  it('PROBE_PROFILES es exhaustivo sobre "homes" y "premises"', () => {
    expect(PROBE_PROFILES).toEqual(['homes', 'premises']);
  });

  it('"homes" y "premises" difieren únicamente en distance y propertyType', () => {
    const homes = buildSearchFields('homes');
    const premises = buildSearchFields('premises');

    expect(homes).toEqual([
      { name: 'center', value: '40.430,-3.702' },
      { name: 'distance', value: '300' },
      { name: 'propertyType', value: 'homes' },
      { name: 'operation', value: 'sale' },
      { name: 'maxItems', value: '50' },
      { name: 'numPage', value: '1' },
    ]);

    expect(premises).toEqual([
      { name: 'center', value: '40.430,-3.702' },
      { name: 'distance', value: '2000' },
      { name: 'propertyType', value: 'premises' },
      { name: 'operation', value: 'sale' },
      { name: 'maxItems', value: '50' },
      { name: 'numPage', value: '1' },
    ]);

    // Confirma explícitamente que la única diferencia es distance + propertyType.
    const diffFields = homes.filter((field, index) => field.value !== premises[index]?.value);
    expect(diffFields.map((field) => field.name).sort()).toEqual(['distance', 'propertyType']);
  });
});

describe('toFormData', () => {
  it('produce un FormData con exactamente las entradas de los campos, como cadenas', () => {
    const fields = buildSearchFields('homes');
    const formData = toFormData(fields);

    for (const field of fields) {
      expect(formData.get(field.name)).toBe(field.value);
    }
    expect([...formData.keys()]).toHaveLength(fields.length);
  });
});
