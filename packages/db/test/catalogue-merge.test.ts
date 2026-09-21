// ROADMAP 1.13 (diseño DD-2, arbitraje CR-15) — fusión PURA del catálogo
// hand-cited (`MUNICIPALITY_CATALOGUE`) y el catálogo importado, ANTES de la
// transacción de siembra. `ON CONFLICT DO NOTHING` sobre `ine_code`
// (`seed.ts:62`) nunca actualiza: sembrar el hand-cited primero pierde en
// silencio el centroide importado de Granada; sembrar el importado primero
// pierde su cita verificada a mano (P5/COVERAGE-8). La fusión pura hace la
// precedencia una regla explícita y testeable, no un accidente de orden de
// inserción — esto SUSTITUYE el escenario original de Granada del spec
// (obs #214), que habría probado a favor de la regresión (CR-15).
import { describe, expect, it } from 'vitest';

import { mergeCatalogues } from '../src/catalogue-merge.js';
import { MUNICIPALITY_CATALOGUE } from '../src/seed-data.js';
import type { MunicipalitySeed } from '../src/seed-data.js';

function handCitedGranada(overrides: Partial<MunicipalitySeed> = {}): MunicipalitySeed {
  const [granada] = MUNICIPALITY_CATALOGUE;
  if (!granada) {
    throw new Error('MUNICIPALITY_CATALOGUE no contiene Granada — fixture de test inválido');
  }
  return { ...granada, ...overrides };
}

function importedGranada(overrides: Partial<MunicipalitySeed> = {}): MunicipalitySeed {
  return {
    ineCode: '18087',
    municipality: 'Granada',
    province: 'Granada',
    provinceCode: '18',
    autonomousCommunity: 'Andalucía',
    searchName: 'granada',
    centroid: { latitude: 37.177336, longitude: -3.598557 },
    sweepRadiusM: 4500,
    source: 'NGMEP/INE, tier=tier-1, importado 2026-09-20',
    ...overrides,
  };
}

describe('mergeCatalogues (DD-2, CR-15) — Granada conserva su cita Y gana el centroide importado', () => {
  it('Granada del catálogo hand-cited GANA el centroide/radio del importado, pero conserva su propia cita de fuente (P5)', () => {
    const merged = mergeCatalogues([handCitedGranada()], [importedGranada()]);

    expect(merged).toHaveLength(1);
    const granada = merged[0];
    expect(granada?.municipality).toBe('Granada');
    expect(granada?.centroid).toEqual({ latitude: 37.177336, longitude: -3.598557 });
    expect(granada?.sweepRadiusM).toBe(4500);
    // La cita hand-cited original sigue presente en el resultado —
    // evidencia de que el código no se fabricó (P5, COVERAGE-8).
    expect(granada?.source).toContain('confirmado por el responsable del proyecto');
  });

  it('la fuente fusionada nombra AMBAS procedencias, no solo una (precedencia explícita, no accidente de orden)', () => {
    const merged = mergeCatalogues([handCitedGranada()], [importedGranada()]);
    expect(merged[0]?.source).toContain('NGMEP/INE');
  });

  it('un centroide/radio hand-cited YA presente nunca se sobrescribe con el importado (relleno, no reemplazo)', () => {
    const handCitedWithCentroid = handCitedGranada({
      centroid: { latitude: 1, longitude: 2 },
      sweepRadiusM: 999,
    });
    const merged = mergeCatalogues([handCitedWithCentroid], [importedGranada()]);

    expect(merged[0]?.centroid).toEqual({ latitude: 1, longitude: 2 });
    expect(merged[0]?.sweepRadiusM).toBe(999);
  });

  it('una entrada hand-cited SIN contrapartida en el importado queda sin cambios', () => {
    const soloHandCited: MunicipalitySeed = {
      ineCode: '99999',
      municipality: 'Solo hand-cited',
      province: 'Test',
      provinceCode: '99',
      autonomousCommunity: 'Test',
      searchName: 'solo hand-cited',
      source: 'test',
    };

    const merged = mergeCatalogues([soloHandCited], [importedGranada()]);
    const own = merged.find((entry) => entry.ineCode === '99999');
    expect(own).toEqual(soloHandCited);
  });

  it('una entrada del importado SIN contrapartida hand-cited se incluye tal cual en el resultado', () => {
    const importedOnly = importedGranada({ ineCode: '07040', municipality: 'Palma' });
    const merged = mergeCatalogues([handCitedGranada()], [importedOnly]);

    expect(merged).toHaveLength(2);
    expect(merged.find((entry) => entry.ineCode === '07040')).toEqual(importedOnly);
  });

  it('un catálogo importado vacío es una fusión SIN efecto — el hand-cited pasa intacto (estado real del placeholder R7)', () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, []);
    expect(merged).toEqual(MUNICIPALITY_CATALOGUE);
  });
});
