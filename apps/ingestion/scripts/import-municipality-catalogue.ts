// ROADMAP 1.13 (diseño DD-3, "Data flow") — composition root del conversor
// del catálogo municipal. Humano-ejecutado, una sola vez, offline (A-2): lee
// los dos ficheros LOCALES (nunca red — `apps/ingestion/test/setup-no-network.ts`
// haría lanzar cualquier intento de `fetch` en el conjunto de tests, pero
// este script ni siquiera lo intenta), decodifica con la codificación
// declarada explícitamente (R7 — nunca asumida `,`/UTF-8 por defecto), y
// cablea las piezas PURAS ya probadas por separado
// (ngmep-parse/ine-register/join/sanity/geo/provenance/import-report) sin
// lógica propia más allá del propio cableado.
//
// Sin test dedicado — mismo precedente que `scripts/sweep-zone.ts:9-15`: es
// el shell de orquestación de módulos que YA están testeados por separado.
//
// R7, precondición de APLICACIÓN que ningún agente puede saltarse: antes de
// rellenar `NGMEP_FIELD_MAP`/`INE_REGISTER_FIELD_MAP` con los nombres reales
// de columna, el operador verifica contra el fichero real en mano:
//   1. presencia/ausencia de una columna de código INE de 5 dígitos;
//   2. la ortografía exacta de la cabecera;
//   3. si latitud/longitud vienen en grados decimales o en DMS (este script
//      asume SIEMPRE grados decimales — si el fichero real usa DMS, el
//      parser de coordenadas debe extenderse antes de ejecutar contra datos
//      reales, nunca asumir la conversión);
//   4. el delimitador y la codificación reales.
//
// Límite declarado y no fabricado (mismo principio que R7): este script NO
// trae una tabla de cajas delimitadoras provinciales — verificar 52 límites
// geográficos reales está fuera del alcance de lo que este proyecto puede
// comprobar sin arriesgarse a fabricar un dato incorrecto. `provinceBounds`
// se recibe vacío por defecto (la comprobación de provincia se OMITE para
// cada municipio, nunca se adivina) y el operador puede rellenarlo por
// provincia cuando disponga de una fuente verificable.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deriveSweepRadiusM, RADIUS_CEILING_M, RADIUS_FLOOR_M } from '../src/catalogue/geo.js';
import { INE_REGISTER_FIELD_MAP, parseIneRegisterCsv } from '../src/catalogue/ine-register.js';
import type { IneRegisterFieldMap } from '../src/catalogue/ine-register.js';
import { buildImportReport } from '../src/catalogue/import-report.js';
import { joinCatalogue } from '../src/catalogue/join.js';
import type { MunicipalityTier } from '../src/catalogue/join.js';
import { NGMEP_FIELD_MAP, parseNgmepCsv } from '../src/catalogue/ngmep-parse.js';
import type { NgmepFieldMap } from '../src/catalogue/ngmep-parse.js';
import { buildProvenanceHeader } from '../src/catalogue/provenance.js';
import type { ProvenanceHeader } from '../src/catalogue/provenance.js';
import { checkSanity } from '../src/catalogue/sanity.js';
import type { BoundingBox } from '../src/catalogue/sanity.js';

export interface ImportMunicipalityCatalogueOptions {
  readonly ngmepPath: string;
  readonly ineRegisterPath: string;
  readonly outputPath: string;
  readonly delimiter: string;
  readonly encoding: BufferEncoding;
  readonly downloadDate: string;
  readonly sourceUrls: readonly string[];
  readonly sourceCrsString: string;
  readonly ineCodeWidth?: 5 | 6;
  readonly provinceBounds?: Readonly<Record<string, BoundingBox>>;
  readonly ngmepFieldMap?: NgmepFieldMap;
  readonly ineRegisterFieldMap?: IneRegisterFieldMap;
}

interface ResolvedMunicipality {
  readonly ineCode: string;
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
  readonly searchName: string;
  readonly tier: MunicipalityTier;
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
  const ineText = readFileSync(options.ineRegisterPath, { encoding: options.encoding });

  const ngmepRows = parseNgmepCsv(ngmepText, options.delimiter, options.ngmepFieldMap ?? NGMEP_FIELD_MAP);
  const ineRows = parseIneRegisterCsv(ineText, options.delimiter, options.ineRegisterFieldMap ?? INE_REGISTER_FIELD_MAP);

  const { municipalities, truncatedCount } = joinCatalogue(ineRows, ngmepRows, {
    ineCodeWidth: options.ineCodeWidth ?? 5,
  });

  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  let unmatchedCount = 0;
  let spreadGuardDrops = 0;
  let sanityGateDrops = 0;

  const resolved: ResolvedMunicipality[] = municipalities.map((candidate) => {
    if (candidate.tier === 'tier-1') tier1Count += 1;
    else if (candidate.tier === 'tier-2') tier2Count += 1;
    else if (candidate.tier === 'tier-3') tier3Count += 1;
    else unmatchedCount += 1;

    const base = {
      ineCode: candidate.ineCode,
      municipality: candidate.municipality,
      province: candidate.province,
      provinceCode: candidate.provinceCode,
      autonomousCommunity: candidate.autonomousCommunity,
      searchName: candidate.searchName,
      tier: candidate.tier,
    };

    if (candidate.centroidCandidate === null) {
      return { ...base, centroid: null, sweepRadiusM: null };
    }

    const provinceBounds = options.provinceBounds?.[candidate.provinceCode] ?? null;
    // DD-4: la guarda de esparcimiento solo aplica a tier-2/tier-3;
    // checkSanity ya lo sabe por el campo `tier` — 'unmatched' nunca llega
    // aquí (ya se filtró por centroidCandidate === null arriba).
    const sanity = checkSanity({
      tier: candidate.tier === 'tier-1' ? 'tier-1' : candidate.tier === 'tier-2' ? 'tier-2' : 'tier-3',
      centroid: candidate.centroidCandidate,
      siblingCoordinates: candidate.siblingCoordinates,
      provinceBounds,
    });

    if (!sanity.passed) {
      if (sanity.reason === 'spread-guard') spreadGuardDrops += 1;
      else sanityGateDrops += 1;
      return { ...base, centroid: null, sweepRadiusM: null };
    }

    const sweepRadiusM = deriveSweepRadiusM(candidate.centroidCandidate, candidate.siblingCoordinates);
    return { ...base, centroid: candidate.centroidCandidate, sweepRadiusM };
  });

  const report = buildImportReport(resolved.map((row) => ({ ineCode: row.ineCode, centroid: row.centroid })));

  const provenance = buildProvenanceHeader({
    sourceUrls: options.sourceUrls,
    downloadDate: options.downloadDate,
    sourceFileNames: [options.ngmepPath, options.ineRegisterPath],
    sourceSha256: [sha256Hex(ngmepText), sha256Hex(ineText)],
    sourceCrsString: options.sourceCrsString,
    delimiter: options.delimiter,
    encoding: options.encoding,
    inputRowCount: ineRows.length,
    emittedRowCount: resolved.length,
    centroidCount: report.centroidCount,
    centroidlessCount: report.centroidlessCount,
    tier1Count,
    tier2Count,
    tier3Count,
    unmatchedCount,
    spreadGuardDrops,
    sanityGateDrops,
    radiusFloorM: RADIUS_FLOOR_M,
    radiusCeilingM: RADIUS_CEILING_M,
    importerVersion: '1.0.0',
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
  if (truncatedCount > 0) {
    console.log(`Import: ${String(truncatedCount)} código(s) INE de 6 dígitos truncados por --ine-code-width=6`);
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

  return (
    `  {\n` +
    `    ineCode: ${JSON.stringify(row.ineCode)},\n` +
    `    municipality: ${JSON.stringify(row.municipality)},\n` +
    `    province: ${JSON.stringify(row.province)},\n` +
    `    provinceCode: ${JSON.stringify(row.provinceCode)},\n` +
    `    autonomousCommunity: ${JSON.stringify(row.autonomousCommunity)},\n` +
    `    searchName: ${JSON.stringify(row.searchName)},\n` +
    `    centroid: ${centroidLiteral},\n` +
    `    sweepRadiusM: ${sweepRadiusLiteral},\n` +
    `    source: ${JSON.stringify(`NGMEP/INE, tier=${row.tier}, importado ${new Date().toISOString().slice(0, 10)}`)},\n` +
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
    `// NO editar a mano: vuelve a ejecutar el conversor contra el fichero fuente.\n` +
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
    `//   tier 1/2/3/sin emparejar: ${String(provenance.tier1Count)} / ${String(provenance.tier2Count)} / ` +
    `${String(provenance.tier3Count)} / ${String(provenance.unmatchedCount)}\n` +
    `//   descartes por guarda de esparcimiento / puerta de cordura: ${String(provenance.spreadGuardDrops)} / ` +
    `${String(provenance.sanityGateDrops)}\n` +
    `//   radio suelo/techo (m): ${String(provenance.radiusFloorM)} / ${String(provenance.radiusCeilingM)}\n` +
    `//   ${provenance.attribution}\n` +
    `import type { MunicipalitySeed } from './seed-data.js';\n\n` +
    `export const IMPORTED_MUNICIPALITY_CATALOGUE: readonly MunicipalitySeed[] = [\n`;

  const body = rows
    .filter((row) => row.tier !== 'unmatched') // Q2: una fila sin ninguna entidad NGMEP hermana no aporta coordenada ni fuente citable — se reporta (import-report), no se siembra.
    .map(renderMunicipalityLiteral)
    .join('\n');

  return `${header}${body}\n];\n`;
}

// Composition root real: lee argv/env, NUNCA en un test (mismo patrón que
// `scripts/sweep-zone.ts:165-191`).
function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const prefix = `--${flag}=`;
    return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  };

  const ngmepPath = get('ngmep');
  const ineRegisterPath = get('ine-register');
  const outputPath = get('output') ?? '../../packages/db/src/municipality-catalogue.generated.ts';
  const delimiter = get('delimiter') ?? ';';
  const encoding = (get('encoding') ?? 'latin1') as BufferEncoding;
  const downloadDate = get('download-date');
  const sourceCrsString = get('source-crs');
  const ineCodeWidthArg = get('ine-code-width');

  if (!ngmepPath || !ineRegisterPath || !downloadDate || !sourceCrsString) {
    console.error(
      'Uso: import-municipality-catalogue --ngmep=<path> --ine-register=<path> --download-date=<YYYY-MM-DD> ' +
        '--source-crs=<cadena verbatim> [--output=<path>] [--delimiter=;] [--encoding=latin1] [--ine-code-width=5|6]'
    );
    process.exitCode = 2;
    return;
  }

  importMunicipalityCatalogue({
    ngmepPath,
    ineRegisterPath,
    outputPath,
    delimiter,
    encoding,
    downloadDate,
    sourceUrls: [ngmepPath, ineRegisterPath],
    sourceCrsString,
    ...(ineCodeWidthArg === '6' ? { ineCodeWidth: 6 as const } : {}),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
