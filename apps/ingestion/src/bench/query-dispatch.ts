// ROADMAP 2.6 (diseño, "Bench scenarios") — despacho por `kind`. Cada
// escenario mide la consulta de producción que le corresponde
// (`buildPropertySearchQuery`, `buildMapPointsQuery`, `buildMapCountQuery` de
// `@buscahogar/db`), nunca una reescrita a mano: el `EXPLAIN` sale del
// `.toSQL()` de la MISMA función. Este módulo no abre conexión ni lee
// `process.env`; ejecutar la consulta lo decide el script que lo invoca.
import { buildMapCountQuery, buildMapPointsQuery, buildPropertySearchQuery } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

import type { BenchCombination } from './query-matrix.js';

// Ejecuta la consulta del escenario y descarta el resultado (solo importa el
// tiempo de pared del cliente, decisión 6 del banco).
export async function runBenchQuery(db: Database, combination: BenchCombination): Promise<void> {
  switch (combination.kind) {
    case 'list':
      await buildPropertySearchQuery(db, combination.criteria);
      return;
    case 'map-points':
      await buildMapPointsQuery(db, combination.criteria);
      return;
    case 'map-count':
      await buildMapCountQuery(db, combination.criteria);
      return;
  }
}

// SQL y parámetros de la consulta del escenario, sin ejecutarla.
export function benchQuerySql(db: Database, combination: BenchCombination): { sql: string; params: unknown[] } {
  switch (combination.kind) {
    case 'list':
      return buildPropertySearchQuery(db, combination.criteria).toSQL();
    case 'map-points':
      return buildMapPointsQuery(db, combination.criteria).toSQL();
    case 'map-count':
      return buildMapCountQuery(db, combination.criteria).toSQL();
  }
}
