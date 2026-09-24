// Paso 1.7 — seed-data.ts (diseño D8, P5, COVERAGE-8). Módulo puro, sin
// conexión a base de datos: cubre la validación estructural del catálogo de
// municipios y el catálogo real embebido, no la escritura (eso lo cubre
// seed.test.ts, respaldado por PostgreSQL).
import { describe, expect, it } from 'vitest';

import {
  assertValidMunicipality,
  InvalidMunicipalitySeedError,
  MUNICIPALITY_CATALOGUE,
  type MunicipalitySeed,
} from '../src/seed-data.js';

function buildEntry(overrides: Partial<MunicipalitySeed> = {}): MunicipalitySeed {
  return {
    ineCode: '18087',
    municipality: 'Granada',
    province: 'Granada',
    provinceCode: '18',
    autonomousCommunity: 'Andalucía',
    searchName: 'granada',
    source: 'INE — Registro de Entidades Locales, código de municipio 18087.',
    ...overrides,
  };
}

describe('seed-data — catálogo de municipios (D8, P5, confirma COVERAGE-8)', () => {
  it('el catálogo real embebido pasa la validación estructural completa', () => {
    expect(MUNICIPALITY_CATALOGUE.length).toBeGreaterThan(0);
    MUNICIPALITY_CATALOGUE.forEach((entry) => {
      expect(() => {
        assertValidMunicipality(entry);
      }).not.toThrow();
    });
  });

  it('cada entrada del catálogo real cita la fuente del código INE (nunca fabricado, P5)', () => {
    MUNICIPALITY_CATALOGUE.forEach((entry) => {
      expect(entry.source.trim().length).toBeGreaterThan(0);
    });
  });

  it('Granada está en el catálogo con su código INE real 18087', () => {
    const granada = MUNICIPALITY_CATALOGUE.find((entry) => entry.municipality === 'Granada');
    expect(granada?.ineCode).toBe('18087');
    expect(granada?.provinceCode).toBe('18');
  });

  it('COVERAGE-8a: rechaza un ine_code que no tiene exactamente 5 dígitos', () => {
    const bad = buildEntry({ ineCode: '187' });
    expect(() => {
      assertValidMunicipality(bad);
    }).toThrow(InvalidMunicipalitySeedError);
  });

  it('COVERAGE-8a: rechaza un province_code que no tiene exactamente 2 dígitos', () => {
    const bad = buildEntry({ provinceCode: '1' });
    expect(() => {
      assertValidMunicipality(bad);
    }).toThrow(InvalidMunicipalitySeedError);
  });

  it('COVERAGE-8a: rechaza un ine_code que no empieza por su province_code', () => {
    const bad = buildEntry({ ineCode: '29087', provinceCode: '18' });
    expect(() => {
      assertValidMunicipality(bad);
    }).toThrow(InvalidMunicipalitySeedError);
  });

  it('COVERAGE-8a: rechaza una entrada sin cita de la fuente del código INE', () => {
    const bad = buildEntry({ source: '' });
    expect(() => {
      assertValidMunicipality(bad);
    }).toThrow(InvalidMunicipalitySeedError);
  });

  it('COVERAGE-8a: el error nombra el municipio y el ine_code ofensivo', () => {
    const bad = buildEntry({ municipality: 'Municipio de prueba', ineCode: '187' });
    expect(() => {
      assertValidMunicipality(bad);
    }).toThrow(/Municipio de prueba/);
    expect(() => {
      assertValidMunicipality(bad);
    }).toThrow(/187/);
  });
});
