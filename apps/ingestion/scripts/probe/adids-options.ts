// Sonda de `adIds` de Idealista (ROADMAP 2.5, S3; decisión 105, U3) — parseo de
// argumentos y plan de las tres peticiones. Todo puro: sin red, sin
// credenciales, sin disco.
//
// Mismo criterio que options.ts (paso 1.5): `parseArgs` de node:util con
// `strict: true` rechaza cualquier flag desconocido.
//
// El plan reutiliza `buildPresenceFields` (la MISMA construcción de campos que
// la verificación de producción, con margen 0): lo que la sonda mide es
// exactamente lo que producción enviará.
import { parseArgs } from 'node:util';

import type { PresenceBatch } from '@buscahogar/core';

import { buildPresenceFields } from '../../src/sources/idealista/presence-request.js';
import type { SearchField } from '../../src/sources/idealista/search-request.js';

// Tope duro de peticiones de búsqueda facturables de la sonda (U3). El contador
// (ledger.ts) se construye con ESTE valor, así que una cuarta es imposible.
export const ADIDS_PROBE_SEARCH_CAP = 3;

export const ADIDS_PROBE_FILTERS = ['homes', 'premises'] as const;
export type AdIdsProbeFilter = (typeof ADIDS_PROBE_FILTERS)[number];

export interface AdIdsProbeOptions {
  readonly mode: 'dry-run' | 'execute';
  // `propertyCode` de un anuncio que se sabe publicado ahora mismo.
  readonly liveId: string;
  // `propertyCode` de un anuncio que se sabe dado de baja.
  readonly delistedId: string;
  readonly center: { readonly latitude: number; readonly longitude: number };
  readonly distanceMeters: number;
  readonly operation: 'sale' | 'rent';
  // Filtro bajo el que aparece el anuncio vivo y filtro ALTERNATIVO del paso 3.
  readonly filter: AdIdsProbeFilter;
  readonly otherFilter: AdIdsProbeFilter;
  readonly overwrite: boolean;
}

export class AdIdsProbeUsageError extends Error {}

export const ADIDS_USAGE = `Uso:
  probe-idealista-adids.ts --live-id <propertyCode> --delisted-id <propertyCode>
                           --center <lat,lon> --distance <metros>
                           [--operation <sale|rent>] [--filter <homes|premises>]
                           [--other-filter <homes|premises>] [--execute] [--overwrite]

  --live-id      anuncio que se sabe PUBLICADO ahora mismo (visible en el portal).
  --delisted-id  anuncio que se sabe DADO DE BAJA (el portal ya no lo muestra).
  --center, --distance  círculo de búsqueda que contiene al anuncio vivo.
  --filter       filtro de petición bajo el que aparece el anuncio vivo (por defecto homes).
  --other-filter filtro alternativo del paso 3 (por defecto, el otro de los dos).

Por defecto (sin --execute) el script solo imprime las tres peticiones planeadas
y no abre ninguna conexión de red. Con --execute hace HASTA 3 peticiones de
búsqueda FACTURABLES (más 1 de token): ejecutar una sola vez, a mano.`;

const PROPERTY_CODE = /^\d{1,15}$/;

function fail(message: string): never {
  throw new AdIdsProbeUsageError(`${message}\n\n${ADIDS_USAGE}`);
}

function requireString(value: string | undefined, flag: string): string {
  if (value === undefined || value.length === 0) {
    return fail(`${flag} es obligatorio.`);
  }
  return value;
}

function parsePropertyCode(value: string | undefined, flag: string): string {
  const text = requireString(value, flag);
  // Solo dígitos: un id con coma inyectaría un segundo id en `adIds`.
  if (!PROPERTY_CODE.test(text)) {
    return fail(`${flag} debe ser un propertyCode numérico (recibido "${text}").`);
  }
  return text;
}

function parseCenter(value: string | undefined): { readonly latitude: number; readonly longitude: number } {
  const text = requireString(value, '--center');
  const parts = text.split(',');
  const [latitudeText, longitudeText] = parts;
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (
    parts.length !== 2 ||
    latitudeText?.trim() === '' ||
    longitudeText?.trim() === '' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return fail(`--center debe ser "lat,lon" con latitud en [-90, 90] y longitud en [-180, 180] (recibido "${text}").`);
  }
  return { latitude, longitude };
}

function parseDistance(value: string | undefined): number {
  const text = requireString(value, '--distance');
  const distance = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(distance) || distance < 1) {
    return fail(`--distance debe ser un entero positivo de metros (recibido "${text}").`);
  }
  return distance;
}

function isFilter(value: string): value is AdIdsProbeFilter {
  return (ADIDS_PROBE_FILTERS as readonly string[]).includes(value);
}

function parseFilter(value: string | undefined, flag: string, fallback: AdIdsProbeFilter): AdIdsProbeFilter {
  if (value === undefined) {
    return fallback;
  }
  if (!isFilter(value)) {
    return fail(`${flag} debe ser uno de: ${ADIDS_PROBE_FILTERS.join(', ')} (recibido "${value}").`);
  }
  return value;
}

export function parseAdIdsProbeArgs(argv: readonly string[]): AdIdsProbeOptions {
  let values: {
    'live-id'?: string;
    'delisted-id'?: string;
    center?: string;
    distance?: string;
    operation?: string;
    filter?: string;
    'other-filter'?: string;
    execute?: boolean;
    overwrite?: boolean;
  };
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      options: {
        'live-id': { type: 'string' },
        'delisted-id': { type: 'string' },
        center: { type: 'string' },
        distance: { type: 'string' },
        operation: { type: 'string' },
        filter: { type: 'string' },
        'other-filter': { type: 'string' },
        execute: { type: 'boolean' },
        overwrite: { type: 'boolean' },
      },
      allowPositionals: true,
      strict: true,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Argumentos inválidos.');
  }

  if (positionals.length > 0) {
    return fail(`Argumentos posicionales inesperados: ${positionals.join(', ')}.`);
  }

  const liveId = parsePropertyCode(values['live-id'], '--live-id');
  const delistedId = parsePropertyCode(values['delisted-id'], '--delisted-id');
  if (liveId === delistedId) {
    return fail('--live-id y --delisted-id deben ser anuncios distintos.');
  }

  const operation = values.operation ?? 'sale';
  if (operation !== 'sale' && operation !== 'rent') {
    return fail(`--operation debe ser sale o rent (recibido "${operation}").`);
  }

  const filter = parseFilter(values.filter, '--filter', 'homes');
  const otherFilter = parseFilter(values['other-filter'], '--other-filter', filter === 'homes' ? 'premises' : 'homes');
  if (otherFilter === filter) {
    return fail('--other-filter debe ser distinto de --filter.');
  }

  return {
    mode: values.execute === true ? 'execute' : 'dry-run',
    liveId,
    delistedId,
    center: parseCenter(values.center),
    distanceMeters: parseDistance(values.distance),
    operation,
    filter,
    otherFilter,
    overwrite: values.overwrite === true,
  };
}

export type AdIdsProbeStepName = 'live-own-filter' | 'live-and-delisted' | 'live-other-filter';

export interface AdIdsProbeStep {
  readonly name: AdIdsProbeStepName;
  readonly fields: readonly SearchField[];
}

function stepFor(
  name: AdIdsProbeStepName,
  options: AdIdsProbeOptions,
  filter: AdIdsProbeFilter,
  externalIds: readonly string[]
): AdIdsProbeStep {
  const batch: PresenceBatch = {
    center: options.center,
    radiusMeters: options.distanceMeters,
    operation: options.operation,
    groupKey: filter,
    externalIds,
  };
  // Margen 0: la sonda pide exactamente el círculo indicado.
  return { name, fields: buildPresenceFields(batch, 0) };
}

// Exactamente tres pasos (U3):
//   1. el id vivo solo, bajo su filtro (línea base: `adIds` se respeta);
//   2. el id vivo Y el dado de baja juntos, bajo el mismo filtro: fija la
//      codificación de la lista (coma) y si el dado de baja se OMITE;
//   3. el id vivo solo, bajo OTRO filtro: ¿`propertyType` restringe a `adIds`?
export function buildAdIdsProbePlan(options: AdIdsProbeOptions): readonly AdIdsProbeStep[] {
  return [
    stepFor('live-own-filter', options, options.filter, [options.liveId]),
    stepFor('live-and-delisted', options, options.filter, [options.liveId, options.delistedId]),
    stepFor('live-other-filter', options, options.otherFilter, [options.liveId]),
  ];
}
