// Seed de datos iniciales. Vacío a propósito: todavía no hay datos de
// referencia que insertar (REQ-MIG-03). Existe para que el pipeline de
// migración + seed esté completo desde ahora, sin bloquear la Fase 3 con un
// script por escribir.
//
// Es la segunda de las dos únicas excepciones a la regla de que
// `packages/db` nunca lee `process.env` (la otra es `drizzle.config.ts`):
// es un punto de entrada de línea de comandos para desarrolladores y CI, no
// código que importen `apps/web` ni `apps/ingestion` (por eso no se exporta
// desde `src/index.ts`).
import { createDb } from './db';

async function seed(): Promise<void> {
  const { pool } = createDb(process.env.DATABASE_URL ?? '');
  try {
    // Sin inserciones (REQ-MIG-03): este script solo confirma que la
    // conexión configurada funciona contra una base de datos ya migrada.
    await pool.query('SELECT 1');
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
