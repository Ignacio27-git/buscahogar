// Sonda de la API de Idealista (paso 1.5) — análisis offline. Se ejecuta sobre
// un payload sintético de 3 elementos, nunca sobre red ni sobre las fixtures
// reales (esas llegan en la fase 12, con cuota ya gastada).
import { describe, expect, it } from 'vitest';

import type { Json } from '../scripts/probe/anonymise.js';
import { crossTabulate, summarise, type FieldObservation } from '../scripts/probe/summarise.js';

function findField(fields: readonly FieldObservation[], path: string): FieldObservation | undefined {
  return fields.find((field) => field.path === path);
}

describe('summarise', () => {
  const syntheticDocument: Json = {
    total: 3,
    totalPages: 1,
    actualPage: 1,
    itemsPerPage: 50,
    paginable: true,
    hiddenResults: false,
    elementList: [
      { propertyCode: '1', price: 100000, latitude: 40.43001, longitude: -3.70201, floor: '2' },
      { propertyCode: '2', price: 200000, latitude: 40.43001, longitude: -3.70201, floor: null },
      { propertyCode: '3', price: 300000, latitude: 40.4305, longitude: -3.703 },
    ],
  };

  it('calcula el inventario de campos (raíz + elementList[i]) con el tipo observado y los conteos de presencia/nulos', () => {
    const summary = summarise(syntheticDocument);

    const price = findField(summary.fields, 'elementList[].price');
    expect(price).toEqual({ path: 'elementList[].price', types: ['number'], present: 3, nulls: 0 });

    const floor = findField(summary.fields, 'elementList[].floor');
    expect(floor).toBeDefined();
    expect(floor?.present).toBe(2);
    expect(floor?.nulls).toBe(1);
    expect([...(floor?.types ?? [])].sort()).toEqual(['null', 'string']);

    const total = findField(summary.fields, 'total');
    expect(total).toEqual({ path: 'total', types: ['number'], present: 1, nulls: 0 });
  });

  it('calcula el histograma de precisión decimal y el conteo de pares (lat,lon) distintos', () => {
    const summary = summarise(syntheticDocument);

    // Dos elementos comparten exactamente el mismo par de coordenadas.
    expect(summary.distinctCoordinateCount).toBe(2);
    // 40.43001 y -3.70201 (5 decimales cada una) se repiten en dos elementos:
    // 4 valores con 5 decimales en total (2 latitudes + 2 longitudes).
    // El tercer elemento aporta 40.4305 (4 decimales) y -3.703 (3 decimales).
    expect(summary.decimalPrecisionHistogram[5]).toBe(4);
    expect(summary.decimalPrecisionHistogram[4]).toBe(1);
    expect(summary.decimalPrecisionHistogram[3]).toBe(1);
  });

  it('extrae la lectura de paginación frente al elementList.length observado', () => {
    const summary = summarise(syntheticDocument);

    expect(summary.pagination).toEqual({
      total: 3,
      totalPages: 1,
      actualPage: 1,
      itemsPerPage: 50,
      paginable: true,
      hiddenResults: false,
      observedItemCount: 3,
    });
  });
});

describe('crossTabulate', () => {
  it('marca como opcional un campo presente en un resumen y ausente en el otro', () => {
    const homes = summarise({
      elementList: [{ propertyCode: '1', exclusiveHomesField: true }],
    });
    const premises = summarise({
      elementList: [{ propertyCode: '2', exclusivePremisesField: 'oficina' }],
    });

    const crossTab = crossTabulate(homes, premises, ['homes', 'premises']);

    const homesOnly = crossTab.find((entry) => entry.field === 'elementList[].exclusiveHomesField');
    const premisesOnly = crossTab.find((entry) => entry.field === 'elementList[].exclusivePremisesField');
    const shared = crossTab.find((entry) => entry.field === 'elementList[].propertyCode');

    expect(homesOnly?.presentIn).toEqual(['homes']);
    expect(premisesOnly?.presentIn).toEqual(['premises']);
    expect(shared?.presentIn).toEqual(['homes', 'premises']);
  });
});
