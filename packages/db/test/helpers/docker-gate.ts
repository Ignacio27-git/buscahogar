// Activa la suite de integración solo cuando hay una base de datos real
// disponible (`DATABASE_URL` cargada por `test/setup-env.ts`). Sin ella, los
// tests se OMITEN (`describe.skip`), no fallan: esta suite está pensada para
// ejecutarse contra Docker (ROADMAP 1.2), no como parte del pipeline offline
// de las Fases 1 y 2.
import { describe } from 'vitest';

// Envuelta en una función (en vez de reasignar `describe`/`describe.skip` a
// una constante) para que el tipo exportado sea simple y no dependa de
// tipos internos de vitest que TypeScript no puede nombrar en la
// declaración emitida.
export function describeWithDb(name: string, factory: () => void): void {
  if (process.env.DATABASE_URL) {
    describe(name, factory);
  } else {
    describe.skip(name, factory);
  }
}
