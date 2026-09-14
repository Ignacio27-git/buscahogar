// Seed de datos de referencia — paso 1.7 (diseño D8). Deja de ser el no-op
// deliberado que entregó el paso 1.3 (REQ-MIG-03): el barrido de una zona
// (ROADMAP 1.7) necesita `sources`, `locations` y `zones` pobladas antes de
// escribir un solo `listing` (PERSIST-9), y sembrarlas a mano fuera del
// repositorio dejaría el paso irreproducible (decisión 039).
//
// Es una de las dos únicas excepciones a la regla de que `packages/db` nunca
// lee `process.env` (la otra es `drizzle.config.ts`): es un punto de entrada
// de línea de comandos para desarrolladores y CI, no código que importen
// `apps/web` ni `apps/ingestion` (por eso no se exporta desde `src/index.ts`).
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { createDb } from './db.js';
import type { Database } from './db.js';
import { assertValidMunicipality, MUNICIPALITY_CATALOGUE } from './seed-data.js';
import type { MunicipalitySeed } from './seed-data.js';
import { locations, sources, zones } from './tables.js';

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      'DATABASE_URL no está definida. El seed necesita una conexión real: nunca cae a los ' +
        'valores por defecto de libpq con una cadena vacía.'
    );
  }
}

// Unidad de trabajo IO: recibe una `Database` ya conectada (testeable
// inyectando la conexión de test, mismo patrón que listing-writer.ts) e
// inserta, de forma idempotente (COVERAGE-7), la fuente 'idealista' y el
// catálogo de municipios.
//
// Validación estructural de TODO el catálogo ANTES de escribir una sola fila
// (COVERAGE-8): un catálogo con una entrada inválida no siembra
// parcialmente el resto — falla entero, nombrando la entrada ofensiva, en
// vez de dejar `sources` o unas `locations` sembradas a medias sin su
// `zones` correspondiente. Envuelto en una transacción por el mismo motivo:
// todo o nada.
export async function seedReferenceData(
  db: Database,
  catalogue: readonly MunicipalitySeed[] = MUNICIPALITY_CATALOGUE
): Promise<void> {
  catalogue.forEach(assertValidMunicipality);

  await db.transaction(async (tx) => {
    await tx.insert(sources).values({ key: 'idealista', name: 'Idealista', kind: 'api' }).onConflictDoNothing({
      target: sources.key,
    });

    for (const entry of catalogue) {
      await tx
        .insert(locations)
        .values({
          ineCode: entry.ineCode,
          municipality: entry.municipality,
          province: entry.province,
          provinceCode: entry.provinceCode,
          autonomousCommunity: entry.autonomousCommunity,
        })
        .onConflictDoNothing({ target: locations.ineCode });

      const [location] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.ineCode, entry.ineCode));
      if (!location) {
        throw new Error(`No se pudo resolver locations.id para ine_code="${entry.ineCode}" recién sembrado.`);
      }

      await tx.insert(zones).values({ locationId: location.id }).onConflictDoNothing({ target: zones.locationId });
    }
  });
}

export async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  const { db, pool } = createDb(databaseUrl);
  try {
    await seedReferenceData(db);
  } finally {
    await pool.end();
  }
}

// Se ejecuta solo como entrypoint (pnpm db:seed), nunca al importarlo desde
// un test — mismo patrón que scripts/probe-idealista.ts (paso 1.5) y
// apps/ingestion/src/index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
