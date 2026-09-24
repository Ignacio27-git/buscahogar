// Paso 1.7 — db-env-guard.ts (diseño D2, resuelve D-a). Extraída a función
// pura para que la propiedad "lanza si falta DATABASE_URL" sea comprobable
// con describe/it normales — un setupFile de vitest no lo es. La usa
// test/db/setup-db-env.ts (2.6), que no tiene test propio: su comportamiento
// queda demostrado aquí.
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      'DATABASE_URL no está definida. La suite respaldada por PostgreSQL no puede omitirse en ' +
        'silencio (diseño D2): confirma que el contenedor está arriba y que .env define DATABASE_URL.'
    );
  }
}

// No se tipa con `NodeJS.ProcessEnv` a propósito: el test la invoca con
// objetos literales, no con `process.env` real, y el tipo real de
// `process.env` no es más preciso que `Record<string, string | undefined>`.
export function assertDatabaseUrlOrThrow(env: Record<string, string | undefined>): void {
  if (!env.DATABASE_URL) {
    throw new MissingDatabaseUrlError();
  }
}
