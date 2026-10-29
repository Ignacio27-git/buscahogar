// ROADMAP 3.3 (decisión 249, diseño D14) — guarda de deriva de la población.
// Una celda inválida suelta es población desconocida (ngmep-parse.test.ts);
// pero si menos del 90 % de las filas trae población, lo más probable es que
// el formato del fichero haya cambiado y TODAS las ciudades quedarían sin
// ordenar: el importador aborta ANTES de escribir nada.
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importMunicipalityCatalogue } from '../../scripts/import-municipality-catalogue.js';
import {
  assertPopulationCoverage,
  MIN_POPULATION_COVERAGE,
  PopulationDriftError,
} from '../../src/catalogue/population-guard.js';

function rows(withPopulation: number, withoutPopulation: number): readonly { readonly population: number | null }[] {
  return [
    ...Array.from({ length: withPopulation }, () => ({ population: 1000 })),
    ...Array.from({ length: withoutPopulation }, () => ({ population: null })),
  ];
}

describe('assertPopulationCoverage — umbral del 90 %', () => {
  it('el umbral es 0,9', () => {
    expect(MIN_POPULATION_COVERAGE).toBe(0.9);
  });

  it('9 de 10 filas con población (exactamente 90 %) pasa', () => {
    expect(() => {
      assertPopulationCoverage(rows(9, 1));
    }).not.toThrow();
  });

  it('8 de 10 filas con población (80 %) aborta con PopulationDriftError nombrando el recuento', () => {
    expect(() => {
      assertPopulationCoverage(rows(8, 2));
    }).toThrow(PopulationDriftError);
    expect(() => {
      assertPopulationCoverage(rows(8, 2));
    }).toThrow(/8 de 10/);
  });

  it('todas desconocidas (cambio de formato) aborta; todas con población pasa', () => {
    expect(() => {
      assertPopulationCoverage(rows(0, 10));
    }).toThrow(PopulationDriftError);
    expect(() => {
      assertPopulationCoverage(rows(10, 0));
    }).not.toThrow();
  });
});

// Integración del script real contra ficheros temporales: la guarda debe
// abortar antes de escribir el catálogo generado.
const NGMEP_HEADER =
  'COD_INE;COD_PROV;NOMBRE_ACTUAL;POBLACION_MUNI;SUPERFICIE;LONGITUD_ETRS89_REGCAN95;LATITUD_ETRS89_REGCAN95\n';
const PROVINCIAS = 'COD_PROV;PROVINCIA;COD_CA;COMUNIDAD_AUTONOMA;CAPITAL\n18;Granada;01;Andalucia;Granada\n';

function ngmepCsv(populationCells: readonly string[]): string {
  return (
    NGMEP_HEADER +
    populationCells
      .map((cell, index) => `180${String(index).padStart(2, '0')}000000;18;Municipio ${String(index)};${cell};8806,81;-3,598691013;37,17428891\n`)
      .join('')
  );
}

describe('importMunicipalityCatalogue — guarda de deriva de población', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'catalogue-population-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function run(populationCells: readonly string[]): string {
    const ngmepPath = join(workDir, 'MUNICIPIOS.csv');
    const provinciasPath = join(workDir, 'PROVINCIAS.csv');
    const outputPath = join(workDir, 'out.generated.ts');
    writeFileSync(ngmepPath, ngmepCsv(populationCells), 'utf8');
    writeFileSync(provinciasPath, PROVINCIAS, 'utf8');
    importMunicipalityCatalogue({
      ngmepPath,
      provinciasPath,
      outputPath,
      delimiter: ';',
      encoding: 'utf8',
      downloadDate: '2026-10-20',
      sourceUrls: [ngmepPath, provinciasPath],
      sourceCrsString: 'ETRS89',
    });
    return outputPath;
  }

  it('con menos del 90 % de filas con población aborta y NO escribe el fichero generado', () => {
    const outputPath = join(workDir, 'out.generated.ts');

    // 7 de 10 celdas válidas (n/d, vacía y 0 son desconocidas).
    expect(() => run(['1000', '2000', 'n/d', '', '0', '5', '6', '7', '8', '9'])).toThrow(PopulationDriftError);
    expect(existsSync(outputPath)).toBe(false);
  });

  it('con el 90 % o más escribe el catálogo con la población de cada municipio (y omite la desconocida)', () => {
    const outputPath = run(['1000', '2000', '3000', '4000', '5000', '6000', '7000', '8000', '9000', 'n/d']);

    const generated = readFileSync(outputPath, 'utf8');
    expect(generated).toContain('population: 1000,');
    expect(generated).toContain('population: 9000,');
    expect(generated.match(/population: /g)).toHaveLength(9);
  });
});
