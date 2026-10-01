// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — traducción PURA de
// un lote de presencia a los campos de la petición `adIds`, y mapa inverso del
// tipo crudo de propiedad al filtro de la petición (S-LR-3, S-LR-11).
import { describe, expect, it } from 'vitest';

import type { PresenceBatch } from '@buscahogar/core';

import { filterForRawType } from '../src/sources/idealista/filter-for-raw-type.js';
import { buildPresenceFields } from '../src/sources/idealista/presence-request.js';

const BATCH: PresenceBatch = {
  center: { latitude: 40.43, longitude: -3.702 },
  radiusMeters: 4500,
  operation: 'sale',
  groupKey: 'homes',
  externalIds: ['111741132', '111976734', '111364311'],
};

function asRecord(fields: readonly { name: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.value]));
}

describe('buildPresenceFields', () => {
  it('centro de la zona, radio + margen, filtro, operación, una sola página de 50 y los ids separados por comas', () => {
    const fields = buildPresenceFields(BATCH, 500);

    expect(asRecord(fields)).toEqual({
      center: '40.43,-3.702',
      distance: '5000',
      propertyType: 'homes',
      operation: 'sale',
      maxItems: '50',
      numPage: '1',
      adIds: '111741132,111976734,111364311',
    });
    // El orden es estable y `adIds` va al final (los campos de área no cambian de sitio).
    expect(fields.map((field) => field.name)).toEqual([
      'center',
      'distance',
      'propertyType',
      'operation',
      'maxItems',
      'numPage',
      'adIds',
    ]);
  });

  it('redondea la distancia al metro y usa el filtro y la operación del lote', () => {
    const fields = buildPresenceFields(
      { ...BATCH, radiusMeters: 1234.6, operation: 'rent', groupKey: 'premises', externalIds: ['9'] },
      250
    );

    expect(asRecord(fields)).toMatchObject({
      distance: '1485',
      propertyType: 'premises',
      operation: 'rent',
      adIds: '9',
    });
  });

  it('un margen de 0 deja el radio de la zona tal cual', () => {
    expect(asRecord(buildPresenceFields(BATCH, 0)).distance).toBe('4500');
  });
});

describe('filterForRawType (S-LR-11: sin mapa, no hay petición)', () => {
  it.each([
    ['flat', 'homes'],
    ['penthouse', 'homes'],
    ['duplex', 'homes'],
    ['premise', 'premises'],
  ] as const)('%s -> %s (tipos con evidencia en las fixtures)', (raw, expected) => {
    expect(filterForRawType(raw)).toBe(expected);
  });

  it.each(['chalet', 'countryHouse', 'studio', 'garage', 'office', '', 'FLAT'])(
    "'%s' sin evidencia -> null (no se pide, el id queda ambiguo)",
    (raw) => {
      expect(filterForRawType(raw)).toBeNull();
    }
  );

  it.each([null, undefined])('%s -> null', (raw) => {
    expect(filterForRawType(raw)).toBeNull();
  });
});
