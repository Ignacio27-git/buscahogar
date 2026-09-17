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
