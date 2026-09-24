// ROADMAP 1.13 Unit D — activa la suite de integración de `apps/web` solo
// cuando hay una base de datos real disponible (`DATABASE_URL`, cargada por
// `test/setup-env.ts`). Mismo patrón EXACTO que
// `packages/db/test/helpers/docker-gate.ts`.
import { describe } from 'vitest';

export function describeWithDb(name: string, factory: () => void): void {
  if (process.env.DATABASE_URL) {
    describe(name, factory);
  } else {
    describe.skip(name, factory);
  }
}
