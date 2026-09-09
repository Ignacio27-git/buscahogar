// Carga `DATABASE_URL` (y el resto de variables de `.env` de la raíz del
// monorepo) en `process.env` antes de que arranque cualquier test. Usa la
// API nativa de Node (`process.loadEnvFile`), que lee el fichero
// directamente sin que este código —ni quien lo ejecuta— vea ni imprima su
// contenido. `packages/db` normalmente nunca lee `process.env` (CLAUDE.md),
// pero esta suite de integración es la excepción explícita: necesita una
// conexión real a PostgreSQL para verificar el esquema contra Docker
// (ROADMAP 1.2), no contra fixtures.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}
