// Configuración de drizzle-kit para generar y aplicar migraciones.
//
// Este fichero es una de las dos únicas excepciones a la regla de que
// `packages/db` nunca lee `process.env` (la otra es `src/seed.ts`): es una
// herramienta de línea de comandos para desarrolladores y CI, no código de la
// librería que importan `apps/web` o `apps/ingestion`.
//
// `generate` es puramente de fichero a fichero y no necesita una conexión
// real; por eso `dbCredentials.url` cae a cadena vacía cuando `DATABASE_URL`
// no está definida. `migrate`, en cambio, sí necesita una base de datos real
// y fallará ruidosamente contra esa URL vacía, que es el comportamiento
// deseado: mejor un fallo explícito que una migración silenciosamente
// aplicada contra la base de datos equivocada.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/*.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
