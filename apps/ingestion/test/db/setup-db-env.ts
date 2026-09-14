// Paso 1.7 — carga el .env de la raíz, retira las credenciales de Idealista
// del proceso de test y aborta duro si DATABASE_URL sigue ausente (diseño
// D2, resuelve D-a). `test/setup-no-network.ts` (fase 1) ya deja el proceso
// sin red y va PRIMERO en `setupFiles`; este fichero es la segunda
// excepción explícita a "nunca leer process.env fuera de apps/ingestion" —
// aquí sí corresponde: esta suite necesita una base de datos real.
//
// Sin test propio: su propiedad de "lanzar cuando falta DATABASE_URL" queda
// demostrada por assert-database-url.test.ts contra la función pura que
// reutiliza (nota de ordenación 5 de la lista de tareas).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertDatabaseUrlOrThrow } from '../../src/sweep/db-env-guard.js';

const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

// Esta suite no necesita ni debe poder usar por accidente las credenciales
// de Idealista: se retiran del proceso inmediatamente tras cargar el .env.
delete process.env.IDEALISTA_API_KEY;
delete process.env.IDEALISTA_API_SECRET;

assertDatabaseUrlOrThrow(process.env);
