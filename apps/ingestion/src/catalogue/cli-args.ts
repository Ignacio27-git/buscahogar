// ROADMAP 1.15 (paso 3, PR3) — parseCatalogueImportArgs (spec #261, capability
// runtime-config-validation): argumentos de línea de comandos del conversor
// del catálogo municipal (scripts/import-municipality-catalogue.ts). Mismo
// patrón de tres pasos que sweep/options.ts (1.7) y blocking/options.ts
// (1.8): `node:util.parseArgs({strict:true})` rechaza por sí solo cualquier
// flag no declarada; Zod cubre el resto (requeridos ausentes, formato) —
// siempre nombrando el flag ofensivo, nunca un valor por defecto silencioso
// para un argumento REQUERIDO. Sustituye el parseo manual (`args.find(...)`)
// que main() tenía antes: la validación corre completa ANTES de que
// importMunicipalityCatalogue toque ningún fichero (readFileSync).
import { parseArgs } from 'node:util';

import { z } from 'zod';

export class CatalogueImportOptionsError extends Error {}

export interface CatalogueImportArgs {
  readonly ngmepPath: string;
  readonly provinciasPath: string;
  readonly outputPath: string;
  readonly delimiter: string;
  readonly encoding: BufferEncoding;
  readonly downloadDate: string;
  readonly sourceCrsString: string;
}

const DEFAULT_OUTPUT_PATH = '../../packages/db/src/municipality-catalogue.generated.ts';
const DEFAULT_DELIMITER = ';';
const DEFAULT_ENCODING = 'latin1';

// Subconjunto de BufferEncoding que este conversor puede necesitar de verdad
// (ficheros administrativos, nunca binarios) — un valor fuera de este
// conjunto es casi siempre un typo del operador, no una codificación real
// que falte soportar.
const SUPPORTED_ENCODINGS = [
  'ascii',
  'utf8',
  'utf-8',
  'utf16le',
  'ucs2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex',
] as const;

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

// Solo PRESENCIA y forma superficial — mismo criterio que sweep/options.ts y
// blocking/options.ts.
const rawOptionsSchema = z.strictObject({
  ngmep: z.string().min(1),
  provincias: z.string().min(1),
  'download-date': z.string().regex(YYYY_MM_DD, 'se espera el formato YYYY-MM-DD'),
  'source-crs': z.string().min(1),
  output: z.string().min(1).optional(),
  delimiter: z.string().min(1).optional(),
  encoding: z.enum(SUPPORTED_ENCODINGS).optional(),
});

export function parseCatalogueImportArgs(argv: readonly string[]): CatalogueImportArgs {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        ngmep: { type: 'string' },
        provincias: { type: 'string' },
        'download-date': { type: 'string' },
        'source-crs': { type: 'string' },
        output: { type: 'string' },
        delimiter: { type: 'string' },
        encoding: { type: 'string' },
      },
    });
  } catch (error) {
    // parseArgs({strict:true}) ya nombra el flag desconocido en su propio
    // mensaje (p. ej. "Unknown option '--ngmp'") — se conserva tal cual,
    // mismo criterio que sweep/options.ts y blocking/options.ts.
    throw new CatalogueImportOptionsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawOptionsSchema.safeParse(parsed.values);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const flagPath = firstIssue?.path[0];
    const flagName = typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
    throw new CatalogueImportOptionsError(`${flagName} inválido o ausente: ${firstIssue?.message ?? 'sin detalle'}.`);
  }

  const raw = result.data;
  return {
    ngmepPath: raw.ngmep,
    provinciasPath: raw.provincias,
    outputPath: raw.output ?? DEFAULT_OUTPUT_PATH,
    delimiter: raw.delimiter ?? DEFAULT_DELIMITER,
    encoding: raw.encoding ?? DEFAULT_ENCODING,
    downloadDate: raw['download-date'],
    sourceCrsString: raw['source-crs'],
  };
}
