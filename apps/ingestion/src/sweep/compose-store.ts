// Paso 1.7 — composeStore: compone las dos mitades de SweepStore (store.ts,
// fase 1): listing-writer.ts escribe listings/listing_versions,
// coverage-store.ts gestiona coverage_jobs/zones. sweep-runner.ts depende
// solo del puerto combinado, nunca de Database directamente (diseño D1).
//
// ROADMAP 1.13 Unit C (diseño CR-2, DD-17): extraída de
// `scripts/sweep-zone.ts` (donde vivía como función privada desde el paso
// 1.7) a `src/sweep/` para que `src/sweep/coverage-worker-ports.ts`
// (composition-root REAL del worker, DD-17) la reutilice EXACTAMENTE —
// "reused, not rewritten" (CR-2) — sin invertir la dirección de dependencia
// habitual de este paquete: `scripts/**` consume `src/**`, nunca al revés.
// El cuerpo de la función no cambió, solo su fichero; `scripts/sweep-zone.ts`
// ahora la importa desde aquí.
import type { Database } from '@buscahogar/db';

import { createCoverageStore } from './coverage-store.js';
import { createListingWriter } from './listing-writer.js';
import type { SweepStore } from './store.js';

export function composeStore(db: Database): SweepStore {
  const listingWriter = createListingWriter(db);
  const coverageStore = createCoverageStore(db);
  // Reenvío explícito por llamada, no una referencia directa al método: una
  // propiedad de función tomada de un objeto (`listingWriter.persistPage`)
  // se considera "unbound" por el linter (no puede probar que el método
  // ignora `this`), así que se envuelve en su propia función flecha.
  return {
    persistPage: (input) => listingWriter.persistPage(input),
    claimJob: (zoneId, sourceId, fingerprint) => coverageStore.claimJob(zoneId, sourceId, fingerprint),
    finishJob: (jobId, outcome) => coverageStore.finishJob(jobId, outcome),
  };
}
