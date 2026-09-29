// ROADMAP 2.4 (search-indexing-performance) — measure.test.ts (diseño
// decisión 7, "Query Plan Capture"; fase 2, tarea 2.3). Dos unidades PURAS:
// `percentile()` (nearest-rank, sin red de por medio) y `summarizePlan()`
// (recorre el árbol de un `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` ya
// parseado). El fixture `explain-sample.json` está construido A MANO para
// este test — NO es una captura de un `EXPLAIN` real contra PostgreSQL — y
// solo pretende tener la FORMA correcta del JSON de Postgres (Node
// Type/Relation Name/Index Name/Shared Hit Blocks/Shared Read Blocks/JIT/
// SubPlan anidado) para ejercitar el recorrido, igual que
// `packages/db/test/blocking/blocking-plan.test.ts` hace contra un plan SÍ
// capturado de un contenedor real.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EmptySampleError, percentile, summarizePlan } from '../../src/bench/measure.js';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/bench/explain-sample.json', import.meta.url));

describe('percentile (nearest-rank, diseño decisión 7)', () => {
  it('lanza EmptySampleError sobre una muestra vacía', () => {
    expect(() => percentile([], 50)).toThrow(EmptySampleError);
  });

  it('p50 de 10 muestras (1..10) es 5 — nearest-rank, no interpolado', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(samples, 50)).toBe(5);
  });

  it('p95 de 10 muestras (1..10) es el máximo (10) — caso límite documentado en el diseño', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(samples, 95)).toBe(10);
  });

  it('funciona igual sobre una muestra desordenada de tamaño distinto (triangulación)', () => {
    const samples = [40, 10, 30, 20];
    expect(percentile(samples, 50)).toBe(20);
    expect(percentile(samples, 95)).toBe(40);
  });
});

describe('summarizePlan (diseño, "Query Plan Capture" — recorrido de EXPLAIN JSON)', () => {
  const rawPlan: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

  it('extrae Execution Time y Planning Time del nivel superior del plan', () => {
    const summary = summarizePlan(rawPlan);
    expect(summary.executionMs).toBe(3.671);
    expect(summary.planningMs).toBe(0.842);
  });

  it('recorre TODO el árbol y recoge nodeType/relationName/indexName de cada nodo, incluidos los SubPlan anidados', () => {
    const summary = summarizePlan(rawPlan);
    const nodeTypes = summary.nodes.map((node) => node.nodeType);
    // 8 nodos en el fixture: Limit, Index Scan(properties), Aggregate(SubPlan
    // 1), Nested Loop, Seq Scan(src_pl), Index Scan(src_l), Limit(SubPlan 2),
    // Index Scan(anchor_pl).
    expect(nodeTypes).toHaveLength(8);
    expect(nodeTypes).toContain('Nested Loop');

    const indexNames = summary.nodes.map((node) => node.indexName).filter((name) => name !== undefined);
    expect(indexNames).toEqual(
      expect.arrayContaining(['properties_updated_at_id_idx', 'listings_pkey', 'property_listings_property_id_listing_id_idx'])
    );
  });

  it('toma Shared Hit/Read Blocks SOLO del nodo raíz del plan (corrección: los contadores por nodo de PostgreSQL ya son inclusivos de sus hijos — sumarlos todos los cuenta varias veces)', () => {
    const summary = summarizePlan(rawPlan);
    // El nodo raíz (Limit) del fixture declara 120/6, ya inclusivo de todo
    // el árbol que cuelga de él (ver explain-sample.json). Sumar los 8
    // nodos daría 130, un valor inflado que NO corresponde a ninguna
    // cantidad real reportada por PostgreSQL.
    expect(summary.sharedHit).toBe(120);
    expect(summary.sharedRead).toBe(6);
  });

  it('sharedHit/sharedRead son exactamente los del nodo raíz cuando el plan no tiene hijos (triangulación: la raíz ES el único nodo)', () => {
    const flatPlan = [
      {
        Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'properties', 'Actual Loops': 1, 'Shared Hit Blocks': 3, 'Shared Read Blocks': 1 },
        'Planning Time': 0.1,
        'Execution Time': 1.2,
      },
    ];
    const summary = summarizePlan(flatPlan);
    expect(summary.sharedHit).toBe(3);
    expect(summary.sharedRead).toBe(1);
  });

  it('extrae el tiempo total de JIT cuando el bloque JIT está presente', () => {
    const summary = summarizePlan(rawPlan);
    expect(summary.jitMs).toBe(9.712);
  });

  it('jitMs es null cuando el plan no trae bloque JIT (triangulación)', () => {
    const withoutJit = JSON.parse(JSON.stringify(rawPlan)) as Array<Record<string, unknown>>;
    const [firstResult] = withoutJit;
    if (firstResult) {
      delete firstResult.JIT;
    }
    const summary = summarizePlan(withoutJit);
    expect(summary.jitMs).toBeNull();
  });

  it('maxSubPlanLoops toma el máximo de Actual Loops entre los nodos SubPlan (25 en el fixture)', () => {
    const summary = summarizePlan(rawPlan);
    expect(summary.maxSubPlanLoops).toBe(25);
  });

  it('maxSubPlanLoops es 0 cuando el plan no tiene ningún nodo SubPlan (triangulación)', () => {
    const flatPlan = [
      {
        Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'properties', 'Actual Loops': 1, 'Shared Hit Blocks': 3, 'Shared Read Blocks': 0 },
        'Planning Time': 0.1,
        'Execution Time': 1.2,
      },
    ];
    const summary = summarizePlan(flatPlan);
    expect(summary.maxSubPlanLoops).toBe(0);
  });
});
