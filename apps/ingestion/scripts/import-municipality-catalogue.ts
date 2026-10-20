// ROADMAP 1.13 (diseño DD-3, "Data flow") + adaptación al fichero real
// (continuación 1.13) — composition root del conversor del catálogo
// municipal. Humano-ejecutado, una sola vez, offline (A-2): lee los dos
// ficheros LOCALES (nunca red — `apps/ingestion/test/setup-no-network.ts`
// haría lanzar cualquier intento de `fetch` en el conjunto de tests, pero
// este script ni siquiera lo intenta), decodifica con la codificación
// declarada explícitamente (R7 — nunca asumida `,`/UTF-8 por defecto), y
// cablea las piezas PURAS ya probadas por separado
// (ngmep-parse/provincias-parse/join/sanity/geo/provenance/import-report)
// sin lógica propia más allá del propio cableado.
//
// Sin test dedicado — mismo precedente que `scripts/sweep-zone.ts:9-15`: es
// el shell de orquestación de módulos que YA están testeados por separado.
//
// R7, resuelto contra `docs/BD_Municipios-Entidades/MUNICIPIOS.csv` +
// `PROVINCIAS.csv` (202603_NGMEP.mdb, IGN/CNIG, marzo 2026): `NGMEP_FIELD_MAP`
// y `PROVINCIAS_FIELD_MAP` ya llevan la cabecera real. Diccionario26.xlsx
// (INE, "Relación de municipios y códigos... a 1 de enero de 2026") queda
// deliberadamente SIN usar aquí: es redundante para construir el catálogo —
// `MUNICIPIOS.csv` ya trae código, nombre y provincia — y no se referencia
// como segunda fuente de verdad porque cruzarlo añadiría una dependencia sin
// aportar una comprobación que `PROVINCIAS.csv` (comunidad autónoma) o el
// propio guarda de 5 dígitos (join.ts) no cubran ya.
//
// `join.ts` (adaptación real) ya no desambigua tiers: `MUNICIPIOS.csv` es
// una fila por municipio, así que cada fila de entrada es, en los términos
// del diseño original, su propia fila "tier-1" (autoritativa, sin hermanas
// que comparar) — de ahí `tier: 'tier-1'`, `siblingCoordinates: []`
// constantes al llamar a `checkSanity`.
//
// Límite declarado y no fabricado (mismo principio que R7): este script NO
// trae una tabla de cajas delimitadoras provinciales — verificar 52 límites
// geográficos reales está fuera del alcance de lo que este proyecto puede
// comprobar sin arriesgarse a fabricar un dato incorrecto. `provinceBounds`
// se recibe vacío por defecto (esa mitad de la comprobación de provincia se
// sigue OMITIENDO para cada municipio); la otra mitad — `COD_PROV`
// declarado frente al prefijo del código derivado — SÍ se activa, con
// `PROVINCIAS.csv` como tabla maestra (sanity.ts, 'province-code-mismatch').
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseCatalogueImportArgs, CatalogueImportOptionsError } from '../src/catalogue/cli-args.js';
import { deriveSweepRadiusM, RADIUS_CEILING_M, RADIUS_FLOOR_M } from '../src/catalogue/geo.js';
import { buildImportReport } from '../src/catalogue/import-report.js';
import { joinCatalogue } from '../src/catalogue/join.js';
import { NGMEP_FIELD_MAP, parseNgmepCsv } from '../src/catalogue/ngmep-parse.js';
import type { NgmepFieldMap } from '../src/catalogue/ngmep-parse.js';
import { assertPopulationCoverage } from '../src/catalogue/population-guard.js';
import { buildProvenanceHeader } from '../src/catalogue/provenance.js';
import type { ProvenanceHeader } from '../src/catalogue/provenance.js';
import { PROVINCIAS_FIELD_MAP, parseProvinciasCsv } from '../src/catalogue/provincias-parse.js';
import type { ProvinciasFieldMap } from '../src/catalogue/provincias-parse.js';
import { checkSanity } from '../src/catalogue/sanity.js';
import type { BoundingBox } from '../src/catalogue/sanity.js';

export interface ImportMunicipalityCatalogueOptions {
  readonly ngmepPath: string;
  readonly provinciasPath: string;
  readonly outputPath: string;
  readonly delimiter: string;
  readonly encoding: BufferEncoding;
  readonly downloadDate: string;
  readonly sourceUrls: readonly string[];
  readonly sourceCrsString: string;
  readonly provinceBounds?: Readonly<Record<string, BoundingBox>>;
  readonly ngmepFieldMap?: NgmepFieldMap;
  readonly provinciasFieldMap?: ProvinciasFieldMap;
}

interface ResolvedMunicipality {
  readonly ineCode: string;
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
  readonly searchName: string;
  readonly population: number | null;
  readonly centroid: { readonly latitude: number; readonly longitude: number } | null;
  readonly sweepRadiusM: number | null;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function importMunicipalityCatalogue(options: ImportMunicipalityCatalogueOptions): {
  readonly emittedCount: number;
  readonly provenance: ProvenanceHeader;
} {
  const ngmepText = readFileSync(options.ngmepPath, { encoding: options.encoding });
  const provinciasText = readFileSync(options.provinciasPath, { encoding: options.encoding });

  const municipioRows = parseNgmepCsv(ngmepText, options.delimiter, options.ngmepFieldMap ?? NGMEP_FIELD_MAP);
  const provinciaRows = parseProvinciasCsv(
    provinciasText,
    options.delimiter,
    options.provinciasFieldMap ?? PROVINCIAS_FIELD_MAP
  );

  // ROADMAP 3.3 (decisión 249): guarda de deriva ANTES de cualquier escritura.
  assertPopulationCoverage(municipioRows);

  const joined = joinCatalogue(municipioRows, provinciaRows);

  let sanityGateDrops = 0;

  const resolved: ResolvedMunicipality[] = joined.map((candidate) => {
    const base = {
      ineCode: candidate.ineCode,
      municipality: candidate.municipality,
      province: candidate.province,
      provinceCode: candidate.provinceCode,
      autonomousCommunity: candidate.autonomousCommunity,
      searchName: candidate.searchName,
      population: candidate.population,
    };

    const provinceBounds = options.provinceBounds?.[candidate.provinceCode] ?? null;
    const sanity = checkSanity({
      // MUNICIPIOS.csv es una fila por municipio: cada fila es, en los
      // términos del diseño original, su propia fila autoritativa — nunca
      // hay hermanas que comparar (la guarda de esparcimiento queda inerte
      // aquí a propósito, igual que provinceBounds).
      tier: 'tier-1',
      centroid: candidate.centroidCandidate,
      siblingCoordinates: [],
      provinceBounds,
      declaredProvinceCode: candidate.declaredProvinceCode,
      expectedProvinceCode: candidate.expectedProvinceCode,
    });

    if (!sanity.passed) {
      sanityGateDrops += 1;
      return { ...base, centroid: null, sweepRadiusM: null };
    }

    const sweepRadiusM = deriveSweepRadiusM(candidate.superficieHectares);
    return { ...base, centroid: candidate.centroidCandidate, sweepRadiusM };
  });

  const report = buildImportReport(resolved.map((row) => ({ ineCode: row.ineCode, centroid: row.centroid })));

  const provenance = buildProvenanceHeader({
    sourceUrls: options.sourceUrls,
    downloadDate: options.downloadDate,
    sourceFileNames: [options.ngmepPath, options.provinciasPath],
    sourceSha256: [sha256Hex(ngmepText), sha256Hex(provinciasText)],
    sourceCrsString: options.sourceCrsString,
    delimiter: options.delimiter,
    encoding: options.encoding,
    inputRowCount: municipioRows.length,
    emittedRowCount: resolved.length,
    centroidCount: report.centroidCount,
    centroidlessCount: report.centroidlessCount,
    // Adaptación real: MUNICIPIOS.csv ya es una fila por municipio, así que
    // cada una es su propia fila "tier-1" (join.ts ya no resuelve niveles) —
    // estos campos de procedencia se conservan por compatibilidad con
    // provenance.ts, ahora como una medición constante, no una resolución.
    tier1Count: resolved.length,
    tier2Count: 0,
    tier3Count: 0,
    unmatchedCount: 0,
    spreadGuardDrops: 0,
    sanityGateDrops,
    radiusFloorM: RADIUS_FLOOR_M,
    radiusCeilingM: RADIUS_CEILING_M,
    importerVersion: '2.0.0',
  });

  if (report.centroidlessCount > 0) {
    // R2/A-2: informe RUIDOSO, nunca una pérdida silenciosa — impreso en
    // stdout porque este script es humano-ejecutado (io.log no aplica: no
    // hay un puerto de log inyectado, mismo motivo por el que no tiene
    // test dedicado).
    console.log(
      `Import: ${String(report.centroidlessCount)} municipios sin centroide de ${String(report.totalRows)} — ` +
        `códigos INE: ${report.centroidlessIneCodes.join(', ')}`
    );
  }

  writeFileSync(options.outputPath, renderGeneratedCatalogueFile(resolved, provenance), 'utf8');

  return { emittedCount: resolved.length, provenance };
}

function renderMunicipalityLiteral(row: ResolvedMunicipality): string {
  const centroidLiteral =
    row.centroid === null
      ? 'undefined'
      : `{ latitude: ${String(row.centroid.latitude)}, longitude: ${String(row.centroid.longitude)} }`;
  const sweepRadiusLiteral = row.sweepRadiusM === null ? 'undefined' : String(row.sweepRadiusM);
  // La población desconocida se omite (campo opcional): nunca se emite 0.
  const populationLine = row.population === null ? '' : `    population: ${String(row.population)},\n`;

  return (
    `  {\n` +
    `    ineCode: ${JSON.stringify(row.ineCode)},\n` +
    `    municipality: ${JSON.stringify(row.municipality)},\n` +
    `    province: ${JSON.stringify(row.province)},\n` +
    `    provinceCode: ${JSON.stringify(row.provinceCode)},\n` +
    `    autonomousCommunity: ${JSON.stringify(row.autonomousCommunity)},\n` +
    `    searchName: ${JSON.stringify(row.searchName)},\n` +
    populationLine +
    `    centroid: ${centroidLiteral},\n` +
    `    sweepRadiusM: ${sweepRadiusLiteral},\n` +
    `    source: ${JSON.stringify(`NGMEP/INE, tier=tier-1, importado ${new Date().toISOString().slice(0, 10)}`)},\n` +
    `  },`
  );
}

// Emite código TypeScript literal (no JSON): `seed-data.ts` importa el tipo
// `MunicipalitySeed` desde el propio paquete `packages/db` — este fichero
// generado vive DENTRO de ese paquete, así que la importación de tipo es
// relativa y nunca depende de que `apps/ingestion` conozca la forma exacta.
function renderGeneratedCatalogueFile(rows: readonly ResolvedMunicipality[], provenance: ProvenanceHeader): string {
  const header =
    `// GENERADO — apps/ingestion/scripts/import-municipality-catalogue.ts (ROADMAP 1.13, DD-2/DD-6).\n` +
    `// NO editar a mano: vuelve a ejecutar el conversor contra los ficheros fuente reales.\n` +
    `//\n` +
    `// Procedencia:\n` +
    `//   fuentes: ${provenance.sourceUrls.join(', ')}\n` +
    `//   ficheros: ${provenance.sourceFileNames.join(', ')}\n` +
    `//   sha256: ${provenance.sourceSha256.join(', ')}\n` +
    `//   fecha de descarga: ${provenance.downloadDate}\n` +
    `//   CRS (verbatim del fichero, DD-7): ${provenance.sourceCrsString}\n` +
    `//   delimitador/codificación: "${provenance.delimiter}" / ${provenance.encoding}\n` +
    `//   filas de entrada/emitidas: ${String(provenance.inputRowCount)} / ${String(provenance.emittedRowCount)}\n` +
    `//   con centroide / sin centroide: ${String(provenance.centroidCount)} / ${String(provenance.centroidlessCount)}\n` +
    `//   descartes por puerta de cordura: ${String(provenance.sanityGateDrops)}\n` +
    `//   radio suelo/techo (m): ${String(provenance.radiusFloorM)} / ${String(provenance.radiusCeilingM)}\n` +
    `//   ${provenance.attribution}\n` +
    `import type { MunicipalitySeed } from './seed-data.js';\n\n` +
    `export const IMPORTED_MUNICIPALITY_CATALOGUE: readonly MunicipalitySeed[] = [\n`;

  // Adaptación real: ya no existe la fila 'unmatched' del diseño original
  // (MUNICIPIOS.csv es una fila por municipio, siempre con su propia
  // coordenada) — cada fila de entrada se emite, con o sin centroide según
  // la puerta de cordura.
  const body = rows.map(renderMunicipalityLiteral).join('\n');

  return `${header}${body}\n];\n`;
}

// Composition root real: lee argv/env, NUNCA en un test (mismo patrón que
// `scripts/sweep-zone.ts:165-191`). ROADMAP 1.15 (paso 3, PR3): el parseo
// manual (`args.find(...)`) se sustituye por `parseCatalogueImportArgs`
// (Zod) — la validación completa de argv corre ANTES de que
// `importMunicipalityCatalogue` toque ningún fichero (spec #261, capability
// runtime-config-validation, "aborta antes de leer ningún fichero").
function main(): void {
  let options: ReturnType<typeof parseCatalogueImportArgs>;
  try {
    options = parseCatalogueImportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof CatalogueImportOptionsError ? error.message : String(error));
    console.error(
      'Uso: import-municipality-catalogue --ngmep=<path a MUNICIPIOS.csv> --provincias=<path a PROVINCIAS.csv> ' +
        '--download-date=<YYYY-MM-DD> --source-crs=<cadena verbatim> [--output=<path>] [--delimiter=;] ' +
        '[--encoding=latin1]'
    );
    process.exitCode = 2;
    return;
  }

  importMunicipalityCatalogue({
    ngmepPath: options.ngmepPath,
    provinciasPath: options.provinciasPath,
    outputPath: options.outputPath,
    delimiter: options.delimiter,
    encoding: options.encoding,
    downloadDate: options.downloadDate,
    sourceUrls: [options.ngmepPath, options.provinciasPath],
    sourceCrsString: options.sourceCrsString,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
