// ROADMAP 1.11 — searchQuerySchema (diseño D2; docs/DECISIONS.md, decisión
// 057). Frontera real: entra desde los search params de la página de
// resultados. Cada valor llega como string | string[] | undefined —tal como
// Next.js resuelve `searchParams`—, nunca ya tipado.
import { describe, expect, it } from 'vitest';

import { searchQuerySchema } from '../src/schemas/search-query.schema.js';

describe('searchQuerySchema — sin coerción: cadena vacía nunca es 0 (decisión 057)', () => {
  it('rechaza minPrice vacío', () => {
    expect(searchQuerySchema.safeParse({ minPrice: '' }).success).toBe(false);
  });

  it('rechaza minSurface vacío', () => {
    expect(searchQuerySchema.safeParse({ minSurface: '' }).success).toBe(false);
  });
});

describe('searchQuerySchema — clave repetida en un filtro escalar es un rechazo', () => {
  it('rechaza minRooms repetido (Next.js lo resuelve como array)', () => {
    expect(searchQuerySchema.safeParse({ minRooms: ['2', '3'] }).success).toBe(false);
  });

  it('rechaza operation repetido', () => {
    expect(searchQuerySchema.safeParse({ operation: ['sale', 'rent'] }).success).toBe(false);
  });
});

describe('searchQuerySchema — enums cerrados', () => {
  it('rechaza propertyType fuera de la unión de 11 valores', () => {
    expect(searchQuerySchema.safeParse({ propertyType: 'chalet' }).success).toBe(false);
  });

  it('rechaza sort=popularity', () => {
    expect(searchQuerySchema.safeParse({ sort: 'popularity' }).success).toBe(false);
  });
});

describe('searchQuerySchema — clave desconocida es inocua', () => {
  it('ignora utm_source y valida el resto con normalidad', () => {
    const result = searchQuerySchema.safeParse({ operation: 'sale', utm_source: 'newsletter' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('utm_source' in result.data).toBe(false);
      expect(result.data.operation).toBe('sale');
    }
  });

  it('pageSize se ignora sin importar su valor (page size es constante de servidor)', () => {
    const result = searchQuerySchema.safeParse({ page: '1', pageSize: '500' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('pageSize' in result.data).toBe(false);
    }
  });
});

describe('searchQuerySchema — geo todo-o-nada (PD-3)', () => {
  it('rechaza radius sin lat/lng', () => {
    expect(searchQuerySchema.safeParse({ radius: '2000' }).success).toBe(false);
  });

  it('rechaza lat/lng sin radius', () => {
    expect(searchQuerySchema.safeParse({ lat: '40.4168', lng: '-3.7038' }).success).toBe(false);
  });

  it('rechaza radius=0', () => {
    expect(
      searchQuerySchema.safeParse({ lat: '40.4168', lng: '-3.7038', radius: '0' }).success
    ).toBe(false);
  });

  it('acepta lat/lng/radius completos y los ensambla en geo.radiusMeters', () => {
    const result = searchQuerySchema.safeParse({ lat: '40.4168', lng: '-3.7038', radius: '2000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geo).toEqual({ lon: -3.7038, lat: 40.4168, radiusMeters: 2000 });
    }
  });
});

describe('searchQuerySchema — page: malformado, rango y sin pageSize', () => {
  it('rechaza page=abc', () => {
    expect(searchQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });

  it('rechaza page=0', () => {
    expect(searchQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('es válido sin page (ausencia legítima)', () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe('searchQuerySchema — minPrice/maxPrice son euros y salen en céntimos (decisión 121)', () => {
  it('convierte euros enteros a céntimos', () => {
    const result = searchQuerySchema.safeParse({ minPrice: '900', maxPrice: '1200' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPriceCents).toBe(90000);
      expect(result.data.maxPriceCents).toBe(120000);
    }
  });

  it('19.99 euros son 1999 céntimos (sin error binario de 19.99*100)', () => {
    const result = searchQuerySchema.safeParse({ minPrice: '19.99' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPriceCents).toBe(1999);
    }
  });

  it('acepta un decimal de un dígito', () => {
    const result = searchQuerySchema.safeParse({ maxPrice: '10.5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxPriceCents).toBe(1050);
    }
  });

  it('0 es válido', () => {
    const result = searchQuerySchema.safeParse({ minPrice: '0' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minPriceCents).toBe(0);
    }
  });

  it('rechaza tres decimales (no se redondea la intención del usuario)', () => {
    expect(searchQuerySchema.safeParse({ minPrice: '1200.505' }).success).toBe(false);
  });

  it('rechaza un precio negativo', () => {
    expect(searchQuerySchema.safeParse({ maxPrice: '-5' }).success).toBe(false);
  });

  it('rechaza un importe que no cabe en un entero seguro de céntimos', () => {
    expect(searchQuerySchema.safeParse({ maxPrice: '99999999999999999999' }).success).toBe(false);
  });

  it('rechaza un rango invertido expresado en euros', () => {
    expect(searchQuerySchema.safeParse({ minPrice: '1200', maxPrice: '900' }).success).toBe(false);
  });

  it('sigue rechazando maxPrice vacío', () => {
    expect(searchQuerySchema.safeParse({ maxPrice: '' }).success).toBe(false);
  });
});

describe('searchQuerySchema — rango de precio invertido es un rechazo', () => {
  it('rechaza minPrice > maxPrice', () => {
    expect(
      searchQuerySchema.safeParse({ minPrice: '300000', maxPrice: '200000' }).success
    ).toBe(false);
  });

  it('acepta un rango de precio válido', () => {
    const result = searchQuerySchema.safeParse({ minPrice: '100000', maxPrice: '300000' });
    expect(result.success).toBe(true);
  });
});

describe('searchQuerySchema — minRooms: cero explícito distinto de ausencia, negativo rechazado', () => {
  it('acepta minRooms=0', () => {
    const result = searchQuerySchema.safeParse({ minRooms: '0' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minRooms).toBe(0);
    }
  });

  it('minRooms ausente se refleja como undefined, no como 0', () => {
    const result = searchQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minRooms).toBeUndefined();
    }
  });

  it('rechaza minRooms=-1', () => {
    expect(searchQuerySchema.safeParse({ minRooms: '-1' }).success).toBe(false);
  });
});

describe('searchQuerySchema — operation opcional (arbitraje R-1 falso alarma 5)', () => {
  it('es válido sin operation', () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rechaza un operation fuera de la unión', () => {
    expect(searchQuerySchema.safeParse({ operation: 'lease' }).success).toBe(false);
  });
});

// Hueco detectado por `sdd-verify` (obs #182, hallazgo CRÍTICO 1): el escenario
// «Beyond the max-offset cap» de la especificación no tenía NINGÚN test. El tope
// de `page` es lo que acota el offset máximo (D2: 1..100, offset máximo 2376),
// así que rechazarlo es lo que impide servir en silencio una página distinta de
// la que nombra la URL — la garantía de compartibilidad.
// ROADMAP 1.13 Unit D (diseño DD-21, arbitraje CR-6) — `zone` es la segunda
// forma de indicar una zona geográfica, además de lat/lng/radius. Mismo
// patrón nombrado que `zoneSelectionSchema` en `packages/core` (decisión
// 057): regex explícita, nunca `z.coerce`.
describe('searchQuerySchema — zone (DD-21): código INE de 5 dígitos, nunca combinado con lat/lng/radius', () => {
  it('acepta un envío solo con zone y lo resuelve vía zone-resolution', () => {
    const result = searchQuerySchema.safeParse({ zone: '18087' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.zone).toBe('18087');
    }
  });

  it('rechaza un zone malformado (no 5 dígitos) antes de que corra ninguna consulta', () => {
    expect(searchQuerySchema.safeParse({ zone: '1808' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ zone: 'abcde' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ zone: '180877' }).success).toBe(false);
  });

  it('zone ausente se refleja como undefined, nunca como cadena vacía', () => {
    const result = searchQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.zone).toBeUndefined();
    }
  });

  // CR-6 (arbitraje): un rechazo NOMBRADO, nunca una precedencia silenciosa
  // — mismo idioma que el bloque geo todo-o-nada de arriba.
  it('CR-6: zone junto con lat/lng/radius completos es un rechazo nombrado, nunca zone silenciosamente preferido', () => {
    const result = searchQuerySchema.safeParse({ zone: '18087', lat: '40.4168', lng: '-3.7038', radius: '2000' });
    expect(result.success).toBe(false);
  });

  it('CR-6: zone junto con SOLO uno de lat/lng/radius (trío incompleto) también es un rechazo nombrado', () => {
    expect(searchQuerySchema.safeParse({ zone: '18087', radius: '2000' }).success).toBe(false);
  });

  it('zone sin ningún parámetro geográfico coexiste con normalidad con otros filtros', () => {
    const result = searchQuerySchema.safeParse({ zone: '18087', operation: 'sale' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.zone).toBe('18087');
      expect(result.data.operation).toBe('sale');
    }
  });
});

describe('searchQuerySchema — tope de página (escenario «Beyond the max-offset cap»)', () => {
  it('acepta la última página válida', () => {
    const result = searchQuerySchema.safeParse({ page: '100' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(100);
    }
  });

  it('rechaza la primera página por encima del tope, en vez de recortarla', () => {
    // Rechazo NOMBRADO, nunca un recorte silencioso a 100: recortar serviría
    // datos de una página distinta de la que pide la URL.
    expect(searchQuerySchema.safeParse({ page: '101' }).success).toBe(false);
  });

  it('rechaza un desbordamiento muy por encima del tope', () => {
    expect(searchQuerySchema.safeParse({ page: '99999' }).success).toBe(false);
  });
});

// ROADMAP 2.6 (map-view-search, decisión 115/118) — `polygon` y `view`.
describe('searchQuerySchema — polygon (ROADMAP 2.6)', () => {
  const VALID = '40,-3;40,-2.9;40.1,-2.9;40.1,-3';

  it('acepta un polígono válido y lo entrega como criteria.polygon', () => {
    const result = searchQuerySchema.safeParse({ polygon: VALID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.polygon).toEqual([
        { lat: 40, lon: -3 },
        { lat: 40, lon: -2.9 },
        { lat: 40.1, lon: -2.9 },
        { lat: 40.1, lon: -3 },
      ]);
    }
  });

  it('sin polygon no aparece la clave en el criterio', () => {
    const result = searchQuerySchema.safeParse({ operation: 'sale' });
    expect(result.success && 'polygon' in result.data).toBe(false);
  });

  it('polygon con filtros no geográficos, sort, dir y page es válido', () => {
    const result = searchQuerySchema.safeParse({
      polygon: VALID,
      operation: 'rent',
      minPrice: '50000',
      sort: 'price',
      dir: 'asc',
      page: '2',
    });
    expect(result.success).toBe(true);
  });

  it('polygon vacío es un rechazo nombrado (ni ausente ni cero)', () => {
    const result = searchQuerySchema.safeParse({ polygon: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['polygon']);
  });

  it('polygon repetido (array) es un rechazo nombrado', () => {
    const result = searchQuerySchema.safeParse({ polygon: [VALID, VALID] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['polygon']);
      expect(result.error.issues[0]?.message).toBe('aparece repetido en el enlace; deja un solo valor.');
    }
  });

  it('un polígono inválido lleva el código nombrado y un mensaje en español sin la clave', () => {
    const result = searchQuerySchema.safeParse({ polygon: '0,0;1,1;1,0;0,1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const first = result.error.issues[0];
      expect(first?.path).toEqual(['polygon']);
      expect(first?.message).toBe('sus lados se cruzan; vuelve a dibujar la zona.');
      expect(first).toMatchObject({ params: { polygonCode: 'self-intersecting' } });
    }
  });

  it('hostil: WKT y SQL se rechazan sin excepción', () => {
    expect(searchQuerySchema.safeParse({ polygon: 'POLYGON((0 0,1 1,1 0,0 0))' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ polygon: "1,1;2,2;3,3'); DROP TABLE x;--" }).success).toBe(false);
  });

  it('polygon + zone se rechaza y el mensaje nombra ambos', () => {
    const result = searchQuerySchema.safeParse({ polygon: VALID, zone: '28079' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'no puede combinarse con el municipio; usa solo una forma de indicar la zona.'
      );
    }
  });

  it('polygon + lat/lng/radius se rechaza nombrando los presentes', () => {
    const result = searchQuerySchema.safeParse({ polygon: VALID, lat: '40', lng: '-3', radius: '2000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'no puede combinarse con el punto con radio; usa solo una forma de indicar la zona.'
      );
    }
  });

  it('polygon + geo parcial (solo radius) se rechaza por exclusividad, no por bloque incompleto', () => {
    const result = searchQuerySchema.safeParse({ polygon: VALID, radius: '2000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'no puede combinarse con el punto con radio; usa solo una forma de indicar la zona.'
      );
    }
  });

  it('polygon + zone + radius nombra todos los presentes en orden', () => {
    const result = searchQuerySchema.safeParse({ polygon: VALID, zone: '28079', radius: '2000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'no puede combinarse con el municipio ni con el punto con radio; usa solo una forma de indicar la zona.'
      );
    }
  });

  it('claves desconocidas junto a un polygon válido siguen siendo inocuas', () => {
    expect(searchQuerySchema.safeParse({ polygon: VALID, utm_source: 'x', pageSize: '500' }).success).toBe(true);
  });

  it('zone y radius sin polygon: comportamiento anterior intacto', () => {
    expect(searchQuerySchema.safeParse({ zone: '28079' }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ radius: '2000' }).success).toBe(false);
  });
});

// D.14 (D11, N1) — todos los mensajes llegan ya en español, sin la clave del parámetro (la página
// antepone el rótulo) y sin ningún texto por defecto de Zod. Tabla: cada clave con un valor
// inválido, uno repetido (array) y el desbordamiento numérico de 400 nueves (`Number()` da
// `Infinity`).
describe('searchQuerySchema — mensajes en español sin la clave (D11, N1)', () => {
  const VALID_POLYGON = '40,-3;40,-2.9;40.1,-2.9';
  const INVALID_BY_KEY: Readonly<Record<string, string>> = {
    operation: 'foo',
    propertyType: 'chalet',
    minPrice: 'abc',
    maxPrice: 'abc',
    minSurface: 'abc',
    maxSurface: '-1',
    minRooms: '-1',
    minBathrooms: 'x',
    lat: 'x',
    lng: 'x',
    radius: 'x',
    sort: 'popularity',
    dir: 'sideways',
    page: '0',
    zone: '1234',
    polygon: 'abc',
  };
  const KEYS = Object.keys(INVALID_BY_KEY);

  function messagesOf(params: Record<string, unknown>): string[] {
    const result = searchQuerySchema.safeParse(params);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  }

  function expectCleanCopy(key: string, message: string): void {
    expect(message, key).toMatch(/^[a-záéíóúñ]/);
    expect(message, key).not.toMatch(new RegExp(`\\b${key}\\b`));
    expect(message, key).not.toMatch(/Invalid|expected|se esperaba|\bSe /);
  }

  it.each(KEYS)('%s inválido: al menos un mensaje y todos sin clave ni texto de Zod', (key) => {
    const messages = messagesOf({ [key]: INVALID_BY_KEY[key] });

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expectCleanCopy(key, message);
    }
  });

  it.each(KEYS)('%s repetido (array): mensajes sin clave ni texto de Zod', (key) => {
    const value = key === 'polygon' ? [VALID_POLYGON, VALID_POLYGON] : ['sale', 'sale'];
    const messages = messagesOf({ [key]: value });

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expectCleanCopy(key, message);
    }
  });

  it.each([
    ['minPrice', 'escribe un importe más pequeño.'],
    ['maxPrice', 'escribe un importe más pequeño.'],
    ['minSurface', 'escribe un número más pequeño.'],
    ['maxSurface', 'escribe un número más pequeño.'],
    ['page', 'elige una página entre 1 y 100.'],
  ])('desbordamiento (400 nueves) en %s: mensaje explícito, no el de Zod', (key, expected) => {
    expect(messagesOf({ [key]: '9'.repeat(400) })).toEqual([expected]);
  });

  it.each(KEYS)('desbordamiento (400 nueves) en %s: cualquier mensaje sigue las reglas de copy', (key) => {
    for (const message of messagesOf({ [key]: '9'.repeat(400) })) {
      expectCleanCopy(key, message);
    }
  });

  it('mensajes concretos de los rangos y del bloque geográfico', () => {
    expect(messagesOf({ minPrice: '900', maxPrice: '600' })).toEqual(['no puede ser mayor que el precio máximo.']);
    expect(messagesOf({ minSurface: '90', maxSurface: '60' })).toEqual([
      'no puede ser mayor que la superficie máxima.',
    ]);
    expect(messagesOf({ lat: '40' })).toEqual([
      'el punto con radio está incompleto; elige un municipio en el buscador.',
    ]);
    expect(messagesOf({ lat: '40', lng: '-3', radius: '0' })).toEqual(['escribe un número mayor que cero.']);
    expect(messagesOf({ zone: '28079', lat: '40', lng: '-3', radius: '100' })).toEqual([
      'no puede combinarse con el punto con radio; usa solo una forma de indicar la zona.',
    ]);
  });

  it('mensajes concretos de entero, decimal, importe, superficie negativa, zona y enumerado', () => {
    expect(messagesOf({ minRooms: '1.5' })).toEqual(['escribe un número entero, sin signo ni decimales.']);
    // El bloque geográfico se evalúa aunque `lat` falle: el primer mensaje es el del propio campo.
    expect(messagesOf({ lat: 'x', lng: '-3', radius: '100' })[0]).toBe(
      'escribe un número; usa punto para los decimales.'
    );
    expect(messagesOf({ minPrice: '1.999' })).toEqual(['escribe un importe en euros, con dos decimales como mucho.']);
    expect(messagesOf({ minSurface: '-1' })).toEqual(['escribe un número igual o mayor que cero.']);
    expect(messagesOf({ zone: '1234' })).toEqual([
      'el municipio del enlace no es válido; escribe su nombre en el buscador.',
    ]);
    expect(messagesOf({ operation: 'foo' })).toEqual(['elige una de las opciones de la lista.']);
  });
});
