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
import { IMPORTED_MUNICIPALITY_CATALOGUE } from '../src/municipality-catalogue.generated.js';
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

  // ROADMAP 3.3 (decisión 249) — la población solo viene del importado: la
  // entrada hand-cited no la trae. Desconocida se queda desconocida (sin
  // clave), nunca 0.
  it('3.3: la población del importado se rellena en la entrada hand-cited que no la trae', () => {
    const merged = mergeCatalogues([handCitedGranada()], [importedGranada({ population: 232462 })]);

    expect(merged[0]?.population).toBe(232462);
  });

  it('3.3: una población ya presente en la entrada hand-cited no se sobrescribe', () => {
    const merged = mergeCatalogues([handCitedGranada({ population: 5 })], [importedGranada({ population: 232462 })]);

    expect(merged[0]?.population).toBe(5);
  });

  it('3.3: si ninguna de las dos trae población, el resultado no la inventa (desconocida, nunca 0)', () => {
    const merged = mergeCatalogues([handCitedGranada()], [importedGranada()]);

    expect(merged[0]).toBeDefined();
    expect(merged[0]?.population).toBeUndefined();
    expect('population' in (merged[0] ?? {})).toBe(false);
  });

  it('un catálogo importado vacío es una fusión SIN efecto — el hand-cited pasa intacto (estado real del placeholder R7)', () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, []);
    expect(merged).toEqual(MUNICIPALITY_CATALOGUE);
  });

  // Adaptación al fichero real (continuación 1.13) — R7 ya no es un
  // placeholder: `IMPORTED_MUNICIPALITY_CATALOGUE` lleva ahora las 8132
  // filas reales de MUNICIPIOS.csv. Este test es el escenario que R7 dejaba
  // pendiente desde el principio (Q2 del diseño original): Granada YA
  // aparece en ambos catálogos, y la regla de precedencia se prueba contra
  // el dato real importado, no contra un fixture sintético.
  it('con el catálogo importado REAL: Granada conserva su cita hand-cited Y gana el centroide/radio real de MUNICIPIOS.csv', () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, IMPORTED_MUNICIPALITY_CATALOGUE);

    const granada = merged.find((entry) => entry.ineCode === '18087');
    expect(granada).toBeDefined();
    expect(granada?.source).toContain('confirmado por el responsable del proyecto'); // cita hand-cited (P5)
    expect(granada?.source).toContain('NGMEP/INE'); // cita del importado, fusionada
    // Granada real (COD_INE 18087000000, MUNICIPIOS.csv): centroide
    // verificado independientemente por el orquestador antes de esta tarea.
    expect(granada?.centroid?.latitude).toBeCloseTo(37.18, 1);
    expect(granada?.centroid?.longitude).toBeCloseTo(-3.6, 1);
    expect(granada?.sweepRadiusM).toBeGreaterThan(0);
  });

  it('con el catálogo importado REAL: el resultado tiene 8132 municipios (todas las filas de MUNICIPIOS.csv, más ningún duplicado de Granada)', () => {
    const merged = mergeCatalogues(MUNICIPALITY_CATALOGUE, IMPORTED_MUNICIPALITY_CATALOGUE);
    expect(merged).toHaveLength(IMPORTED_MUNICIPALITY_CATALOGUE.length);
    expect(merged.filter((entry) => entry.ineCode === '18087')).toHaveLength(1);
  });
});
