// Paso 1.7 — buildArea / areaFingerprint (diseño, CLI-1c y D6).
import { createHash } from 'node:crypto';

import { areaQuerySchema, type AreaQuery } from '@buscahogar/core';

import type { SweepOptions } from './options.js';

// SweepOptions valida (CLI-1) y AreaQuery valida de nuevo (frontera externa
// real, z.strictObject) — construir el literal explícitamente, campo a
// campo, evita que "zone" (que AreaQuery no conoce) se cuele por accidente.
export function buildArea(options: SweepOptions): AreaQuery {
  return areaQuerySchema.parse({
    center: options.center,
    radiusMeters: options.radiusMeters,
    operation: options.operation,
  });
}

// Orden estable de claves, recursivo: sin esto, dos AreaQuery
// estructuralmente idénticas pero construidas con las claves en distinto
// orden producirían huellas distintas — y una reanudación (D6) las trataría
// como áreas diferentes sin motivo real.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sortKeysDeep(entryValue)]));
  }
  return value;
}

// Huella determinista del área barrida, usada por job-cursor.ts (D6) para
// que una reanudación con un centro o radio distinto rechace por nombre en
// vez de continuar en silencio el barrido de otra área.
export function areaFingerprint(area: AreaQuery): string {
  const canonical = JSON.stringify(sortKeysDeep(area));
  return createHash('sha256').update(canonical).digest('hex');
}
