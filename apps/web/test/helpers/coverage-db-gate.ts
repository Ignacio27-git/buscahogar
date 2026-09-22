// ROADMAP 1.13 Unit D — activa la suite de privilegios del rol INSERT-only
// solo cuando `WEB_COVERAGE_DATABASE_URL` está definida. Mismo patrón EXACTO
// que `packages/db/test/helpers/docker-gate.ts`, distinta variable: R3 (el
// rol todavía no existe, tarea 10.5, maintainer-only) hace que esta suite se
// OMITA (`describe.skip`), nunca falle, hasta que el mantenedor provisione
// el rol y añada la variable al `.env` de la raíz.
import { describe } from 'vitest';

export function describeWithCoverageDb(name: string, factory: () => void): void {
  if (process.env.WEB_COVERAGE_DATABASE_URL) {
    describe(name, factory);
  } else {
    describe.skip(name, factory);
  }
}
