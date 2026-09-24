// ROADMAP 1.15 (paso 3, PR3) — parseCatalogueImportArgs (spec #261, capability
// runtime-config-validation: "The Importer's CLI Arguments And CSV Rows Are
// Zod-Validated, Never Hand-Parsed"). Mismo patrón de tres pasos que
// sweep/options.ts (1.7) y blocking/options.ts (1.8): `parseArgs
// ({strict:true})` rechaza por sí solo cualquier flag desconocida; Zod cubre
// el resto (requeridos ausentes, formato) — siempre nombrando el flag
// ofensivo, nunca cayendo en un valor por defecto silencioso para un
// argumento REQUERIDO, y sin leer ningún fichero cuando el rechazo ocurre.
import { describe, expect, it } from 'vitest';

import { CatalogueImportOptionsError, parseCatalogueImportArgs } from '../../src/catalogue/cli-args.js';

const REQUIRED_FLAGS: Record<string, string> = {
  ngmep: 'docs/BD_Municipios-Entidades/MUNICIPIOS.csv',
  provincias: 'docs/BD_Municipios-Entidades/PROVINCIAS.csv',
  'download-date': '2026-03-01',
  'source-crs': 'ETRS89',
};

function toArgv(overrides: Readonly<Record<string, string>> = {}, omit: readonly string[] = []): string[] {
  const merged = { ...REQUIRED_FLAGS, ...overrides };
  const argv: string[] = [];
  for (const flag of Object.keys(merged)) {
    if (omit.includes(flag)) continue;
    argv.push(`--${flag}`, merged[flag] as string);
  }
  return argv;
}

describe('parseCatalogueImportArgs — argumento requerido ausente, rechazo nombrado', () => {
  it('rechaza cuando falta --ngmep, nombrándolo', () => {
    const args = toArgv({}, ['ngmep']);
    expect(() => parseCatalogueImportArgs(args)).toThrow(CatalogueImportOptionsError);
    expect(() => parseCatalogueImportArgs(args)).toThrow(/ngmep/);
  });

  it('rechaza cuando falta --provincias, nombrándolo', () => {
    const args = toArgv({}, ['provincias']);
    expect(() => parseCatalogueImportArgs(args)).toThrow(/provincias/);
  });

  it('rechaza cuando falta --download-date, nombrándolo', () => {
    const args = toArgv({}, ['download-date']);
    expect(() => parseCatalogueImportArgs(args)).toThrow(/download-date/);
  });

  it('rechaza cuando falta --source-crs, nombrándolo', () => {
    const args = toArgv({}, ['source-crs']);
    expect(() => parseCatalogueImportArgs(args)).toThrow(/source-crs/);
  });
});

describe('parseCatalogueImportArgs — valor inválido en un argumento requerido, rechazo nombrado', () => {
  it('rechaza --download-date con formato distinto de YYYY-MM-DD', () => {
    const args = toArgv({ 'download-date': '01-03-2026' });
    expect(() => parseCatalogueImportArgs(args)).toThrow(CatalogueImportOptionsError);
    expect(() => parseCatalogueImportArgs(args)).toThrow(/download-date/);
  });

  it('rechaza --encoding fuera del conjunto soportado, nombrándolo', () => {
    const args = [...toArgv(), '--encoding', 'martian-8'];
    expect(() => parseCatalogueImportArgs(args)).toThrow(/encoding/);
  });
});

describe('parseCatalogueImportArgs — CLI-1a: flag desconocida, rechazo nombrado', () => {
  it('rechaza "--ngmp" (typo de "--ngmep") nombrándolo, sin caer en ningún valor', () => {
    const args = ['--ngmp', 'x.csv', ...toArgv({}, ['ngmep'])];
    expect(() => parseCatalogueImportArgs(args)).toThrow(CatalogueImportOptionsError);
    expect(() => parseCatalogueImportArgs(args)).toThrow(/ngmp/);
  });
});

describe('parseCatalogueImportArgs — argumentos válidos', () => {
  it('aplica los valores por defecto documentados cuando output/delimiter/encoding se omiten', () => {
    const options = parseCatalogueImportArgs(toArgv());

    expect(options.ngmepPath).toBe(REQUIRED_FLAGS.ngmep);
    expect(options.provinciasPath).toBe(REQUIRED_FLAGS.provincias);
    expect(options.downloadDate).toBe(REQUIRED_FLAGS['download-date']);
    expect(options.sourceCrsString).toBe(REQUIRED_FLAGS['source-crs']);
    expect(options.outputPath).toBe('../../packages/db/src/municipality-catalogue.generated.ts');
    expect(options.delimiter).toBe(';');
    expect(options.encoding).toBe('latin1');
  });

  it('un --output/--delimiter/--encoding explícito sobreescribe el valor por defecto', () => {
    const args = [...toArgv(), '--output', 'out.ts', '--delimiter', ',', '--encoding', 'utf8'];
    const options = parseCatalogueImportArgs(args);

    expect(options.outputPath).toBe('out.ts');
    expect(options.delimiter).toBe(',');
    expect(options.encoding).toBe('utf8');
  });
});
