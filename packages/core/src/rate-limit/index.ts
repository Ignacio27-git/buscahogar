// Sub-barril interno de `rate-limit/` (mismo criterio que `types/index.ts`,
// `schemas/index.ts`, `contracts/index.ts`, comentado en `../index.ts`):
// agregación interna del paquete, no el contrato público — usa `export *`
// porque no cruza la frontera hacia consumidores externos por sí solo. El
// barril público (`../index.ts`) reexporta con nombre explícito directamente
// desde los ficheros concretos, siguiendo la misma convención que el resto
// de sub-barriles de este paquete.
export * from './fixed-window.js';
export * from './client-ip.js';
