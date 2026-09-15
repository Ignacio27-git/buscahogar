// ROADMAP 1.8 (diseño D-T1) — LANZA cuando `DATABASE_URL` sigue ausente tras
// `test/setup-env.ts`. Duplica deliberadamente el guard de
// `apps/ingestion/src/sweep/db-env-guard.ts:18-22` en vez de importarlo: es
// acoplamiento de test entre paquetes, y `packages/db/src/index.ts` no
// exporta puntos de entrada de test/CLI (mismo criterio que las decisiones
// 033/034). `describeWithDb` (test/helpers/docker-gate.ts) OMITE en
// silencio sin contenedor — exactamente lo que esta suite nueva no puede
// permitirse: un verde que no demuestra nada.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está definida. La suite de bloqueo respaldada por PostgreSQL no puede omitirse en ' +
      'silencio (diseño D-T1): confirma que el contenedor está arriba y que .env define DATABASE_URL.'
  );
}
