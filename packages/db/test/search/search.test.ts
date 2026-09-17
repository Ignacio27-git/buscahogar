// ROADMAP 1.11 — buildPropertySearchQuery (diseño D3; docs/DECISIONS.md,
// decisión 058). Mismo patrón que CHK-PARTIAL-IDX (blocking.test.ts): se
// inspecciona `.toSQL()` de la consulta que REALMENTE se ejecuta, sin
// necesitar PostgreSQL real — por eso este fichero NO vive en
// vitest.blocking.config.ts ni en vitest.consolidation.config.ts (ambas
// fail-loud), sino bajo el `vitest.config.ts` por defecto de este paquete.
import { describe, expect, it } from 'vitest';

import type { PropertySearchCriteria } from '@buscahogar/core';

import { buildPropertySearchQuery, PAGE_SIZE } from '../../src/search.js';
import { createDb } from '../../src/db.js';

// `.toSQL()` no ejecuta nada contra la red: basta un `connectionString`
// sintáctico. Ningún test de este fichero necesita PostgreSQL real.
const db = createDb('postgres://toSQL-only/no-op').db;

const BASE: PropertySearchCriteria = { sort: 'updated', dir: 'desc', page: 1 };

function toSql(criteria: PropertySearchCriteria): { sql: string; params: unknown[] } {
  const query = buildPropertySearchQuery(db, criteria);
  return query.toSQL();
}

describe('buildPropertySearchQuery — filtro ausente no añade predicado (7 filtros)', () => {
  it('sin ningún filtro, no hay ningún WHERE de nivel superior entre FROM y ORDER BY', () => {
    const { sql } = toSql(BASE);
    // El WHERE de la subconsulta correlacionada del recuento de fuentes
    // (dentro de sus propios paréntesis) no cuenta: solo importa si el
    // FROM principal encadena directamente con ORDER BY, sin ningún WHERE
    // de nivel superior entre medias.
    expect(sql).toMatch(/from "properties" order by/i);
  });
});

describe('buildPropertySearchQuery — operation: igualdad, sin rama IS NULL', () => {
  it('operation activo añade un predicado de igualdad ligado', () => {
    const { sql, params } = toSql({ ...BASE, operation: 'sale' });
    expect(sql).toMatch(/"operation"\s*=\s*\$\d/);
    expect(params).toContain('sale');
  });

  it('ninguna ocurrencia de operation lleva una rama OR … IS NULL de rescate', () => {
    const { sql } = toSql({ ...BASE, operation: 'sale' });
    expect(sql).not.toMatch(/"operation"[^)]*is null/i);
  });
});

describe('buildPropertySearchQuery — propertyType: igualdad', () => {
  it('propertyType activo añade un predicado de igualdad ligado', () => {
    const { sql, params } = toSql({ ...BASE, propertyType: 'flat' });
    expect(sql).toMatch(/"property_type"\s*=\s*\$\d/);
    expect(params).toContain('flat');
  });
});

describe('buildPropertySearchQuery — precio: rango gte/lte, sin rescate de NULL', () => {
  it('minPriceCents añade gte ligado sobre min_price_cents', () => {
    const { sql, params } = toSql({ ...BASE, minPriceCents: 100_000_00 });
    expect(sql).toMatch(/"min_price_cents"\s*>=\s*\$\d/);
    expect(params).toContain(100_000_00);
  });

  it('maxPriceCents añade lte ligado sobre min_price_cents', () => {
    const { sql, params } = toSql({ ...BASE, maxPriceCents: 300_000_00 });
    expect(sql).toMatch(/"min_price_cents"\s*<=\s*\$\d/);
    expect(params).toContain(300_000_00);
  });

  it('ninguna ocurrencia de min_price_cents lleva una rama OR … IS NULL de rescate', () => {
    const { sql } = toSql({ ...BASE, minPriceCents: 100_000_00, maxPriceCents: 300_000_00 });
    expect(sql).not.toMatch(/"min_price_cents"[^)]*is null/i);
  });
});

describe('buildPropertySearchQuery — superficie: rango gte/lte', () => {
  it('minSurfaceM2/maxSurfaceM2 añaden gte/lte ligados sobre surface_m2', () => {
    const { sql, params } = toSql({ ...BASE, minSurfaceM2: 60, maxSurfaceM2: 120 });
    expect(sql).toMatch(/"surface_m2"\s*>=\s*\$\d/);
    expect(sql).toMatch(/"surface_m2"\s*<=\s*\$\d/);
    expect(params).toEqual(expect.arrayContaining([60, 120]));
  });
});

describe('buildPropertySearchQuery — habitaciones/baños: umbral mínimo (gte), no igualdad', () => {
  it('minRooms añade gte ligado sobre rooms, nunca eq', () => {
    const { sql, params } = toSql({ ...BASE, minRooms: 3 });
    expect(sql).toMatch(/"rooms"\s*>=\s*\$\d/);
    expect(sql).not.toMatch(/"rooms"\s*=\s*\$\d/);
    expect(params).toContain(3);
  });

  it('minBathrooms añade gte ligado sobre bathrooms', () => {
    const { sql, params } = toSql({ ...BASE, minBathrooms: 2 });
    expect(sql).toMatch(/"bathrooms"\s*>=\s*\$\d/);
    expect(params).toContain(2);
  });
});

describe('buildPropertySearchQuery — geo: ST_DWithin cualificado a properties.location_geography, coordenadas ligadas', () => {
  it('el predicado geográfico referencia "properties"."location_geography", con lon/lat/radio como parámetros ligados', () => {
    const { sql, params } = toSql({
      ...BASE,
      geo: { lon: -3.7038, lat: 40.4168, radiusMeters: 2000 },
    });
    expect(sql).toMatch(/ST_DWithin/);
    expect(sql).toMatch(/"properties"\."location_geography"/);
    expect(params).toEqual(expect.arrayContaining([-3.7038, 40.4168, 2000]));
  });
});

describe('buildPropertySearchQuery — recuento de fuentes: subconsulta correlacionada, sin join a sources', () => {
  it('la proyección incluye un count(DISTINCT …) correlacionado sobre property_listings/listings', () => {
    const { sql } = toSql(BASE);
    expect(sql).toMatch(/count\(distinct/i);
    expect(sql).toMatch(/property_listings/);
    // Nunca un join a la tabla sources en el FROM/JOIN de nivel superior
    // (decisión 058): listings.source_id ya es NOT NULL REFERENCES sources.id.
    expect(sql).not.toMatch(/join\s+"sources"/i);
  });
});

describe('buildPropertySearchQuery — orden: NULLS LAST explícito en ambas direcciones, desempate por id', () => {
  it('sort=price/dir=desc ordena por min_price_cents desc nulls last, con properties.id asc de desempate', () => {
    const { sql } = toSql({ ...BASE, sort: 'price', dir: 'desc' });
    expect(sql).toMatch(/"min_price_cents"\s+desc\s+nulls\s+last/i);
    expect(sql).toMatch(/"properties"\."id"\s+asc/i);
  });

  it('sort=price/dir=asc también deja los NULL al final, no intercalados', () => {
    const { sql } = toSql({ ...BASE, sort: 'price', dir: 'asc' });
    expect(sql).toMatch(/"min_price_cents"\s+asc\s+nulls\s+last/i);
  });

  it('sort=surface ordena por surface_m2', () => {
    const { sql } = toSql({ ...BASE, sort: 'surface', dir: 'asc' });
    expect(sql).toMatch(/"surface_m2"\s+asc\s+nulls\s+last/i);
  });

  it('sin sort explícito, ordena por updated_at desc (default D2)', () => {
    const { sql } = toSql(BASE);
    expect(sql).toMatch(/"updated_at"\s+desc\s+nulls\s+last/i);
  });
});

describe('buildPropertySearchQuery — paginación por offset con PAGE_SIZE fijo', () => {
  it('PAGE_SIZE es 24 (D2: constante de servidor, nunca un parámetro de URL)', () => {
    expect(PAGE_SIZE).toBe(24);
  });

  it('pide PAGE_SIZE + 1 filas (25) para poder derivar hasNextPage sin un COUNT(*) OVER()', () => {
    const { sql } = toSql({ ...BASE, page: 1 });
    expect(sql).toMatch(/limit\s+\$\d/);
    const { params } = toSql({ ...BASE, page: 1 });
    expect(params).toContain(PAGE_SIZE + 1);
  });

  it('page=1 no emite ninguna cláusula OFFSET (offset 0 es equivalente a su ausencia)', () => {
    const { sql, params } = toSql({ ...BASE, page: 1 });
    expect(sql.toLowerCase()).not.toMatch(/offset/);
    expect(params).toEqual([PAGE_SIZE + 1]);
  });

  it('page=3 emite OFFSET ligado a 2*PAGE_SIZE', () => {
    const { sql, params } = toSql({ ...BASE, page: 3 });
    expect(sql.toLowerCase()).toMatch(/offset\s+\$\d/);
    expect(params).toContain(2 * PAGE_SIZE);
  });

  it('nunca emite COUNT(*) OVER() — hasNextPage se deriva de la fila extra, no de un total', () => {
    const { sql } = toSql(BASE);
    expect(sql.toLowerCase()).not.toMatch(/count\(\*\)\s+over/);
  });
});
