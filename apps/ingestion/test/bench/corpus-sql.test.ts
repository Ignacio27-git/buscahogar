// ROADMAP 2.4 (search-indexing-performance) — buildCorpusBatch (diseño D5,
// D7). Esta suite comprueba FORMA y SEGURIDAD de las sentencias generadas
// (orden de tablas, ausencia de `location_geography`, parametrización,
// límites de tanda, semilla por tanda) — es pura, sin base de datos. El
// resultado ESTADÍSTICO/estructural contra PostgreSQL real (recuentos,
// exactamente una versión vigente por anuncio, geografía no nula, precio
// mínimo por grupo) lo demuestra test/db/search-bench.db.test.ts
// (BENCH_DATABASE_URL, tarea 1.7).
import { describe, expect, it } from 'vitest';

import { buildCorpusBatch } from '../../src/bench/corpus-sql.js';
import type { SqlStatement } from '../../src/bench/corpus-sql.js';

const SOURCE_IDS: readonly [string, string] = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
];
const ANCHOR_ISO = '2026-09-29T00:00:00.000Z';

function insertedTableOrder(statements: readonly SqlStatement[]): readonly string[] {
  return statements
    .filter((statement) => /^\s*INSERT INTO/i.test(statement.text))
    .map((statement) => {
      const match = /INSERT INTO (\w+)/i.exec(statement.text);
      if (!match?.[1]) {
        throw new Error('sentencia INSERT sin nombre de tabla reconocible');
      }
      return match[1];
    });
}

function findStatement(statements: readonly SqlStatement[], pattern: RegExp): SqlStatement {
  const found = statements.find((statement) => pattern.test(statement.text));
  if (!found) {
    throw new Error(`no se encontró ninguna sentencia que coincida con ${String(pattern)}`);
  }
  return found;
}

describe('buildCorpusBatch (diseño D5/D7)', () => {
  it('inserta en las 4 tablas del esquema, en el orden properties → listings → listing_versions → property_listings', () => {
    const statements = buildCorpusBatch({
      seed: 42,
      batchIndex: 0,
      batchSize: 777,
      anchorIso: ANCHOR_ISO,
      sourceIds: SOURCE_IDS,
    });

    expect(insertedTableOrder(statements)).toEqual(['properties', 'listings', 'listing_versions', 'property_listings']);
  });

  it('nunca escribe location_geography: es una columna generada por PostgreSQL, no una entrada del generador', () => {
    const statements = buildCorpusBatch({
      seed: 42,
      batchIndex: 0,
      batchSize: 777,
      anchorIso: ANCHOR_ISO,
      sourceIds: SOURCE_IDS,
    });

    for (const statement of statements) {
      expect(statement.text).not.toMatch(/location_geography/);
    }
  });

  it('los límites de la tanda viajan como valores ligados ($1/$2), nunca inlineados como literales en el texto SQL', () => {
    const batchZero = buildCorpusBatch({ seed: 1, batchIndex: 0, batchSize: 777, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const batchOne = buildCorpusBatch({ seed: 1, batchIndex: 1, batchSize: 777, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });

    const stageZero = findStatement(batchZero, /CREATE TEMP TABLE/i);
    const stageOne = findStatement(batchOne, /CREATE TEMP TABLE/i);

    // Tanda 0: filas [1, 777]. Tanda 1 (contigua, disjunta): [778, 1554].
    expect(stageZero.values.slice(0, 2)).toEqual([1, 777]);
    expect(stageOne.values.slice(0, 2)).toEqual([778, 1554]);
    expect(stageZero.text).not.toMatch(/\b777\b/);
    expect(stageOne.text).not.toMatch(/\b1554\b/);
    expect(stageOne.text).not.toMatch(/\b778\b/);
  });

  it('cada tanda deriva su propia semilla (setseed) de seed+batchIndex, distinta entre tandas y dentro de [-1, 1]', () => {
    const batchZero = buildCorpusBatch({ seed: 7, batchIndex: 0, batchSize: 50, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const batchOne = buildCorpusBatch({ seed: 7, batchIndex: 1, batchSize: 50, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });

    const seedZero = findStatement(batchZero, /setseed/i).values[0];
    const seedOne = findStatement(batchOne, /setseed/i).values[0];

    expect(typeof seedZero).toBe('number');
    expect(seedZero).not.toBe(seedOne);
    expect(seedZero as number).toBeGreaterThanOrEqual(-1);
    expect(seedZero as number).toBeLessThanOrEqual(1);
  });

  it('la misma seed y el mismo batchIndex producen exactamente el mismo valor de setseed (reproducibilidad)', () => {
    const first = buildCorpusBatch({ seed: 99, batchIndex: 3, batchSize: 50, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const second = buildCorpusBatch({ seed: 99, batchIndex: 3, batchSize: 50, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });

    expect(findStatement(first, /setseed/i).values[0]).toBe(findStatement(second, /setseed/i).values[0]);
  });

  it('el ancla y los ids de fuente llegan como valores ligados ($3/$4/$5), nunca inlineados en el texto SQL', () => {
    const statements = buildCorpusBatch({ seed: 1, batchIndex: 0, batchSize: 10, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const stage = findStatement(statements, /CREATE TEMP TABLE/i);

    expect(stage.values).toContain(ANCHOR_ISO);
    expect(stage.values).toContain(SOURCE_IDS[0]);
    expect(stage.values).toContain(SOURCE_IDS[1]);
    expect(stage.text).not.toContain(ANCHOR_ISO);
    expect(stage.text).not.toContain(SOURCE_IDS[0]);
    expect(stage.text).not.toContain(SOURCE_IDS[1]);
  });

  function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
  }

  it('base_lon y base_lat derivan del MISMO draw de NULL, rama y radio/ángulo (nunca un random() independiente por coordenada)', () => {
    const statements = buildCorpusBatch({ seed: 1, batchIndex: 0, batchSize: 10, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const stage = findStatement(statements, /CREATE TEMP TABLE/i);

    // Cada señal compartida aparece EXACTAMENTE 3 veces: su declaración en
    // "draws" (1 random()) más su uso en base_lon Y en base_lat (2). Si
    // lon/lat leyeran random() por separado (el bug corregido), cada nombre
    // de columna aparecería como mucho 2 veces — igual que un draw NO
    // compartido (p. ej. el del bbox peninsular, comprobado más abajo) — así
    // que esta cuenta exacta sí distingue "compartido" de "independiente".
    for (const sharedDraw of [
      'location_null_draw',
      'location_branch_draw',
      'location_radius_draw',
      'location_angle_draw',
    ]) {
      expect(occurrences(stage.text, sharedDraw)).toBe(3);
    }

    // La rama del bbox peninsular sí puede usar un draw distinto por
    // coordenada (no es un círculo, es un rectángulo): cada uno aparece
    // exactamente dos veces — su declaración en "draws" y un único uso
    // (lon o lat), nunca compartido entre ambas coordenadas.
    expect(occurrences(stage.text, 'location_bbox_lon_draw')).toBe(2);
    expect(occurrences(stage.text, 'location_bbox_lat_draw')).toBe(2);
  });

  it('group_size se decide con un único draw materializado (70/25/5%), no con random() encadenados que sesgan la distribución', () => {
    const statements = buildCorpusBatch({ seed: 1, batchIndex: 0, batchSize: 10, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const stage = findStatement(statements, /CREATE TEMP TABLE/i);

    // Declaración (1 random()) + dos usos en el mismo CASE WHEN/WHEN/ELSE
    // (0.70 y 0.95) = 3. Un random() encadenado (el bug corregido) no
    // produciría ninguna columna "group_size_draw" en absoluto.
    expect(occurrences(stage.text, 'group_size_draw')).toBe(3);
    expect(stage.text).not.toMatch(/CASE WHEN random\(\) < 0\.70 THEN 1/);
  });

  it('el radio de Madrid es lineal en random() (denser at the centre), no sqrt(random()) (densidad uniforme por área)', () => {
    const statements = buildCorpusBatch({ seed: 1, batchIndex: 0, batchSize: 10, anchorIso: ANCHOR_ISO, sourceIds: SOURCE_IDS });
    const stage = findStatement(statements, /CREATE TEMP TABLE/i);

    expect(stage.text).not.toMatch(/sqrt\(random\(\)\)/);
    expect(stage.text).toMatch(/25\.0 \* draws\.location_radius_draw/);
  });
});
