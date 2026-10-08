// D.6b (spec search-result-card, mobile-filter-tray) — rótulos de tipo y
// operación para la fila de resultado, y recuento de filtros de la bandeja.
// Funciones puras: sin red ni base de datos.
import { searchQuerySchema } from '@buscahogar/core';
import type { PropertySearchCriteria } from '@buscahogar/core';
import { describe, expect, it } from 'vitest';

import {
  TRAY_FILTER_KEYS,
  SEARCH_PARAM_LABELS,
  SOURCE_LABELS,
  countTrayFilters,
  describeInterpretationStatus,
  floorLabel,
  formatClusterUnit,
  formatMarkerTitle,
  formatSearchIssue,
  operationLabel,
  propertyTypeLabel,
  sourceLabel,
} from '../src/lib/search-labels.js';

function criteria(params: Record<string, string>): PropertySearchCriteria {
  return searchQuerySchema.parse(params);
}

describe('propertyTypeLabel / operationLabel — S1, S2 (decisión 134)', () => {
  it('devuelve el rótulo en español de un valor conocido', () => {
    expect(propertyTypeLabel('flat')).toBe('Piso');
    expect(propertyTypeLabel('storage_room')).toBe('Trastero');
    expect(operationLabel('sale')).toBe('Venta');
    expect(operationLabel('rent')).toBe('Alquiler');
  });

  it('null devuelve null: el texto de reserva es del componente', () => {
    expect(propertyTypeLabel(null)).toBeNull();
    expect(operationLabel(null)).toBeNull();
  });

  it('un valor desconocido devuelve null, nunca el valor crudo', () => {
    expect(propertyTypeLabel('castle')).toBeNull();
    expect(operationLabel('barter')).toBeNull();
  });

  it('no hereda claves del prototipo de Object', () => {
    expect(propertyTypeLabel('constructor')).toBeNull();
    expect(operationLabel('toString')).toBeNull();
  });
});

describe('countTrayFilters — S15 (decisión 154)', () => {
  it('sin filtros, cero', () => {
    expect(countTrayFilters(criteria({}))).toBe(0);
  });

  it('los ocho filtros de la bandeja suman ocho', () => {
    expect(
      countTrayFilters(
        criteria({
          operation: 'sale',
          propertyType: 'flat',
          minPrice: '150000',
          maxPrice: '300000',
          minSurface: '60',
          maxSurface: '120',
          minRooms: '2',
          minBathrooms: '1',
        })
      )
    ).toBe(8);
    expect(TRAY_FILTER_KEYS).toHaveLength(8);
  });

  it('sort y dir no cuentan', () => {
    expect(countTrayFilters(criteria({ sort: 'price', dir: 'asc' }))).toBe(0);
  });

  it('zona, polígono y punto con radio no cuentan', () => {
    expect(countTrayFilters(criteria({ zone: '28065' }))).toBe(0);
    expect(countTrayFilters(criteria({ polygon: '40.4,-3.7;40.4,-3.6;40.5,-3.6' }))).toBe(0);
    expect(countTrayFilters(criteria({ lat: '40.4', lng: '-3.7', radius: '500' }))).toBe(0);
  });

  it('mezcla: operación, precio máximo, orden y zona cuentan 2', () => {
    expect(countTrayFilters(criteria({ operation: 'sale', maxPrice: '300000', sort: 'price', zone: '28065' }))).toBe(2);
  });
});

// D.7 (spec nl-search-confirmation R6, decisión 160) — la línea de estado única
// de la interpretación. Función pura: el texto es de presentación.
describe('describeInterpretationStatus — S6.1, S6.4, S6.5', () => {
  const none = { unrecognised: 0, conflicts: 0, zonePending: false };

  it('todo reconocido y sin partes sueltas', () => {
    expect(describeInterpretationStatus({ ...none, hasRecognised: true })).toBe(
      'Todo tu texto se ha convertido en filtros.'
    );
  });

  it('reconocido con partes sueltas: singular y plural, unidas con «y»', () => {
    expect(describeInterpretationStatus({ ...none, hasRecognised: true, unrecognised: 1 })).toBe(
      'Tu texto se ha convertido en filtros, salvo 1 parte sin reconocer.'
    );
    expect(describeInterpretationStatus({ ...none, hasRecognised: true, unrecognised: 2 })).toBe(
      'Tu texto se ha convertido en filtros, salvo 2 partes sin reconocer.'
    );
    expect(describeInterpretationStatus({ ...none, hasRecognised: true, conflicts: 1 })).toBe(
      'Tu texto se ha convertido en filtros, salvo 1 indicación contradictoria.'
    );
    expect(describeInterpretationStatus({ ...none, hasRecognised: true, unrecognised: 1, conflicts: 2 })).toBe(
      'Tu texto se ha convertido en filtros, salvo 1 parte sin reconocer y 2 indicaciones contradictorias.'
    );
  });

  it('reconocido con la zona pendiente: la menciona al final', () => {
    expect(describeInterpretationStatus({ ...none, hasRecognised: true, zonePending: true })).toBe(
      'Tu texto se ha convertido en filtros, salvo la zona, que tienes que elegir.'
    );
    expect(
      describeInterpretationStatus({ hasRecognised: true, unrecognised: 1, conflicts: 0, zonePending: true })
    ).toBe('Tu texto se ha convertido en filtros, salvo 1 parte sin reconocer y la zona, que tienes que elegir.');
  });

  it('nada reconocido y la zona pendiente: pide elegirla, con o sin otras partes', () => {
    expect(describeInterpretationStatus({ ...none, hasRecognised: false, zonePending: true })).toBe(
      'Todavía no hay ningún filtro: elige la zona abajo.'
    );
    expect(
      describeInterpretationStatus({ hasRecognised: false, unrecognised: 2, conflicts: 1, zonePending: true })
    ).toBe(
      'Todavía no hay ningún filtro: elige la zona abajo. Además, hay 2 partes sin reconocer y 1 indicación contradictoria.'
    );
  });

  it('nada reconocido y sin zona pendiente', () => {
    expect(describeInterpretationStatus({ ...none, hasRecognised: false })).toBe(
      'Ninguna parte de tu texto se ha convertido en filtros.'
    );
  });
});

// D.8a (SMV-20, decisión 166) — nombre accesible de marcadores y clústeres.
describe('formatMarkerTitle — SMV-20', () => {
  it('con precio: «Vivienda, {precio}. Ver detalle»', () => {
    expect(formatMarkerTitle('250.000 €')).toBe('Vivienda, 250.000 €. Ver detalle');
    expect(formatMarkerTitle('1.200 €')).toBe('Vivienda, 1.200 €. Ver detalle');
  });

  it('sin precio: usa «precio no disponible» en minúscula, nunca null, NaN ni undefined', () => {
    const title = formatMarkerTitle('Precio no disponible');
    expect(title).toBe('Vivienda, precio no disponible. Ver detalle');
    expect(title).not.toMatch(/null|NaN|undefined/);
  });
});

describe('formatClusterUnit — SMV-20', () => {
  it('singular con uno y plural en el resto', () => {
    expect(formatClusterUnit(1)).toBe('vivienda');
    expect(formatClusterUnit(2)).toBe('viviendas');
    expect(formatClusterUnit(37)).toBe('viviendas');
  });
});

// D.9 (decisión 174) — nombre de la fuente y planta en español natural.
describe('sourceLabel — D.9', () => {
  it('rotula las fuentes conocidas', () => {
    expect(SOURCE_LABELS.idealista).toBe('Idealista');
    expect(sourceLabel('idealista')).toBe('Idealista');
    expect(sourceLabel('kyero')).toBe('Kyero');
  });

  it('una clave desconocida da «Otra fuente», nunca la clave cruda', () => {
    expect(sourceLabel('foo')).toBe('Otra fuente');
    expect(sourceLabel('constructor')).toBe('Otra fuente');
  });
});

describe('floorLabel — D.9', () => {
  it('un dígito mayor que cero es «n.ª»', () => {
    expect(floorLabel('3')).toBe('3.ª');
    expect(floorLabel('12')).toBe('12.ª');
  });

  it('0 y bj son «Bajo»', () => {
    expect(floorLabel('0')).toBe('Bajo');
    expect(floorLabel('bj')).toBe('Bajo');
  });

  it('en, ss y st tienen su rótulo', () => {
    expect(floorLabel('en')).toBe('Entresuelo');
    expect(floorLabel('ss')).toBe('Semisótano');
    expect(floorLabel('st')).toBe('Sótano');
  });

  it('un código desconocido o null cuenta como dato que falta', () => {
    expect(floorLabel('zz')).toBeNull();
    expect(floorLabel('')).toBeNull();
    expect(floorLabel(null)).toBeNull();
  });
});

// D.14 (D8, D11) — los mensajes del núcleo no llevan la clave; la página antepone el rótulo.
describe('formatSearchIssue y SEARCH_PARAM_LABELS', () => {
  it('antepone el rótulo en español de la clave del primer segmento del camino', () => {
    expect(formatSearchIssue({ path: ['minPrice'], message: 'escribe un importe en euros.' })).toBe(
      'Precio mínimo (€): escribe un importe en euros.'
    );
    expect(formatSearchIssue({ path: ['polygon'], message: 'sus lados se cruzan.' })).toBe(
      'Zona dibujada: sus lados se cruzan.'
    );
    expect(formatSearchIssue({ path: ['view'], message: 'elige lista o mapa.' })).toBe(
      'Vista: elige lista o mapa.'
    );
  });

  it('sin camino, con clave sin rótulo o con segmento no textual: el mensaje en mayúscula inicial, nunca la clave', () => {
    expect(formatSearchIssue({ path: [], message: 'escribe un número.' })).toBe('Escribe un número.');
    expect(formatSearchIssue({ path: ['utm_source'], message: 'elige una opción.' })).toBe('Elige una opción.');
    expect(formatSearchIssue({ path: [3], message: 'ángulo no válido.' })).toBe('Ángulo no válido.');
  });

  it('una clave del prototipo no cuenta como rótulo', () => {
    expect(formatSearchIssue({ path: ['constructor'], message: 'está mal.' })).toBe('Está mal.');
    expect(formatSearchIssue({ path: ['toString'], message: 'está mal.' })).toBe('Está mal.');
  });

  it('SEARCH_PARAM_LABELS cubre todas las claves de la búsqueda, y «place» no entra', () => {
    expect(Object.keys(SEARCH_PARAM_LABELS).sort()).toEqual(
      [
        'operation',
        'propertyType',
        'minPrice',
        'maxPrice',
        'minSurface',
        'maxSurface',
        'minRooms',
        'minBathrooms',
        'sort',
        'dir',
        'lat',
        'lng',
        'radius',
        'zone',
        'polygon',
        'page',
        'view',
      ].sort()
    );
    expect(SEARCH_PARAM_LABELS.lat).toBe('Latitud');
    expect(SEARCH_PARAM_LABELS.radius).toBe('Radio');
    expect(SEARCH_PARAM_LABELS.page).toBe('Página');
    expect(SEARCH_PARAM_LABELS.zone).toBe('Zona');
  });
});
