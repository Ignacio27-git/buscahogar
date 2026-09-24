// Paso 1.7 — parseSweepArgs (diseño, CLI-1): argumentos de línea de comandos
// del barrido de zona. `node:util.parseArgs({strict:true})` rechaza por sí
// solo cualquier flag no declarado (CLI-1a); Zod completa el resto —
// requeridos ausentes (CLI-1b) y formato inválido — siempre nombrando el
// flag ofensivo, nunca cayendo en un valor por defecto silencioso: en un
// sistema con cuota limitada, un radio o centro por defecto sería peticiones
// facturables contra el área equivocada.
import { parseArgs } from 'node:util';

import { z } from 'zod';

// Mismo valor que el default de createIdealistaSource (1.6,
// idealista-source.ts) — se repite aquí porque esa constante no se exporta
// (es un detalle interno del adaptador), no porque sea una decisión nueva.
const DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP = 10;

export class SweepOptionsError extends Error {}

export interface SweepOptions {
  readonly zone: string;
  readonly center: { readonly latitude: number; readonly longitude: number };
  readonly radiusMeters: number;
  readonly operation: 'sale' | 'rent';
  readonly maxSearchRequestsPerSweep: number;
}

// Solo valida PRESENCIA y forma superficial (string no vacía) — el formato
// fino de cada valor (centro, radio, entero positivo) se comprueba después,
// campo a campo, para poder nombrar el flag exacto en el mensaje de error.
const rawOptionsSchema = z.strictObject({
  zone: z.string().min(1),
  center: z.string().min(1),
  radius: z.string().min(1),
  operation: z.enum(['sale', 'rent']),
  'max-requests': z.string().min(1).optional(),
});

function parseCenter(value: string): { latitude: number; longitude: number } {
  const parts = value.split(',');
  if (parts.length !== 2) {
    throw new SweepOptionsError(`--center inválido "${value}": se espera "latitud,longitud".`);
  }
  const [latitudeRaw, longitudeRaw] = parts as [string, string];
  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new SweepOptionsError(`--center inválido "${value}": latitud/longitud no numéricas.`);
  }
  return { latitude, longitude };
}

function parsePositiveNumber(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SweepOptionsError(`${flag} inválido "${value}": se espera un número positivo.`);
  }
  return parsed;
}

function parsePositiveInteger(flag: string, value: string): number {
  const parsed = parsePositiveNumber(flag, value);
  if (!Number.isInteger(parsed)) {
    throw new SweepOptionsError(`${flag} inválido "${value}": se espera un entero positivo.`);
  }
  return parsed;
}

export function parseSweepArgs(argv: readonly string[]): SweepOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        zone: { type: 'string' },
        center: { type: 'string' },
        radius: { type: 'string' },
        operation: { type: 'string' },
        'max-requests': { type: 'string' },
      },
    });
  } catch (error) {
    // parseArgs({strict:true}) ya nombra el flag desconocido en su propio
    // mensaje (p. ej. "Unknown option '--radious'") — se conserva tal cual.
    throw new SweepOptionsError(error instanceof Error ? error.message : String(error));
  }

  const result = rawOptionsSchema.safeParse(parsed.values);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const flagPath = firstIssue?.path[0];
    const flagName = typeof flagPath === 'string' ? `--${flagPath}` : 'argumento';
    throw new SweepOptionsError(`${flagName} inválido o ausente: ${firstIssue?.message ?? 'sin detalle'}.`);
  }

  const raw = result.data;
  return {
    zone: raw.zone,
    center: parseCenter(raw.center),
    radiusMeters: parsePositiveNumber('--radius', raw.radius),
    operation: raw.operation,
    maxSearchRequestsPerSweep:
      raw['max-requests'] !== undefined
        ? parsePositiveInteger('--max-requests', raw['max-requests'])
        : DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP,
  };
}
