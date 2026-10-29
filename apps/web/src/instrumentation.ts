// ROADMAP 3.4 (decisión 263 parte C; D22; R10.4) — gancho de arranque de Next 16 (`instrumentation.ts`,
// documentado en node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// `register` se llama una vez al iniciar la instancia del servidor, en TODOS los runtimes; el módulo de avisos
// usa `console` y el clasificador de entorno, así que se carga solo en Node (`NEXT_RUNTIME === 'nodejs'`).
//
// Solo producción: en desarrollo y en los tests el entorno cambia a cada arranque y los avisos serían ruido.
// Lo que se registra y cómo: `server/startup-warnings.ts`.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') {
    return;
  }
  const { emitStartupWarnings } = await import('./server/startup-warnings');
  emitStartupWarnings(process.env);
}
