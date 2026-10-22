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

import { count, eq, inArray, sql } from 'drizzle-orm';

import { mergeCatalogues } from './catalogue-merge.js';
import { createDb } from './db.js';
import type { Database } from './db.js';
import { IMPORTED_MUNICIPALITY_CATALOGUE } from './municipality-catalogue.generated.js';
import { assertValidMunicipality, MUNICIPALITY_CATALOGUE } from './seed-data.js';
import type { MunicipalitySeed } from './seed-data.js';
import { geographyPointWkt } from './spatial.js';
import { locations, sources, zones } from './tables.js';

// ROADMAP 1.13 (diseño DD-2, arbitraje CR-15) — catálogo por defecto: la
// fusión PURA del hand-cited y el importado, nunca los dos sembrados por
// separado (ver `mergeCatalogues` para el porqué). Mientras el placeholder
// de `municipality-catalogue.generated.ts` siga vacío (R7), esto es una
// fusión sin efecto — Granada se siembra exactamente igual que antes de
// ROADMAP 1.13.
const DEFAULT_CATALOGUE: readonly MunicipalitySeed[] = mergeCatalogues(
  MUNICIPALITY_CATALOGUE,
  IMPORTED_MUNICIPALITY_CATALOGUE
);

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
  catalogue: readonly MunicipalitySeed[] = DEFAULT_CATALOGUE
): Promise<void> {
  // COVERAGE-8a: la validación ocurre ANTES de abrir la transacción, así que
  // un catálogo inválido no llega a escribir nada, ni siquiera `sources`.
  catalogue.forEach(assertValidMunicipality);

  // ROADMAP 1.13 — el catálogo por defecto pasó de 1 entrada a 8132 al
  // importar el NGMEP real. El bucle original hacía TRES viajes por
  // municipio (insert → select id → insert), ~24 000 en total: ~25 s de
  // reloj, por encima de los tiempos de vitest y con la transacción en vuelo
  // bloqueando el `TRUNCATE` del test siguiente. Se inserta por lotes.
  //
  // El tamaño de lote existe por el límite del protocolo de PostgreSQL:
  // 65 535 parámetros por sentencia. `locations` liga 8 columnas por fila,
  // así que 8132 filas de golpe serían ~65 000 parámetros — justo en el
  // borde. 500 filas por lote deja margen de sobra sin renunciar al
  // rendimiento.
  const BATCH_SIZE = 500;

  await db.transaction(async (tx) => {
    await tx.insert(sources).values({ key: 'idealista', name: 'Idealista', kind: 'api' }).onConflictDoNothing({
      target: sources.key,
    });

    if (catalogue.length === 0) {
      return;
    }

    const filas = catalogue.map((entry) => ({
      ineCode: entry.ineCode,
      municipality: entry.municipality,
      province: entry.province,
      provinceCode: entry.provinceCode,
      autonomousCommunity: entry.autonomousCommunity,
      // ROADMAP 1.13 (DD-1) — nulo si la entrada no trae centroide
      // (catalogación manual sin coordenada, o fila del catálogo importado
      // que no pasó la puerta de cordura). `ON CONFLICT DO NOTHING` sigue
      // sirviendo solo para la idempotencia del re-seed (arbitraje CR-15):
      // la fusión con el catálogo hand-cited es responsabilidad de
      // `mergeCatalogues`, no de esta cláusula.
      centroid: entry.centroid ? geographyPointWkt(entry.centroid) : null,
      sweepRadiusM: entry.sweepRadiusM ?? null,
      population: entry.population ?? null,
      searchName: entry.searchName,
    }));

    for (let i = 0; i < filas.length; i += BATCH_SIZE) {
      await tx
        .insert(locations)
        .values(filas.slice(i, i + BATCH_SIZE))
        // ROADMAP 3.3 (decisión 249): las filas que ya existían antes de la
        // migración 0017 ganan su población en el re-seed SIN cambiar de id
        // (las zonas y los jobs cuelgan de él). Es lo ÚNICO que se
        // actualiza: el resto sigue siendo "no tocar". `coalesce` evita que
        // un catálogo sin población (p. ej. solo hand-cited) borre una ya
        // guardada.
        .onConflictDoUpdate({
          target: locations.ineCode,
          set: { population: sql`coalesce(excluded.population, ${locations.population})` },
        });
    }

    // Los ids se resuelven en bloque: una fila por `ine_code` del catálogo,
    // tanto las recién insertadas como las que ya existían por un re-seed.
    const codigos = catalogue.map((entry) => entry.ineCode);
    const encontradas: { id: string; ineCode: string }[] = [];
    for (let i = 0; i < codigos.length; i += BATCH_SIZE) {
      const lote = await tx
        .select({ id: locations.id, ineCode: locations.ineCode })
        .from(locations)
        .where(inArray(locations.ineCode, codigos.slice(i, i + BATCH_SIZE)));
      encontradas.push(...lote);
    }

    const idPorCodigo = new Map(encontradas.map((fila) => [fila.ineCode, fila.id]));
    const faltante = codigos.find((codigo) => !idPorCodigo.has(codigo));
    if (faltante !== undefined) {
      throw new Error(`No se pudo resolver locations.id para ine_code="${faltante}" recién sembrado.`);
    }

    const zonasNuevas = codigos.map((codigo) => ({ locationId: idPorCodigo.get(codigo) as string }));
    for (let i = 0; i < zonasNuevas.length; i += BATCH_SIZE) {
      await tx
        .insert(zones)
        .values(zonasNuevas.slice(i, i + BATCH_SIZE))
        .onConflictDoNothing({ target: zones.locationId });
    }
  });
}

// ROADMAP 3.4 (decisión 257; R5.1, R5.2) — variante del despliegue: no escribe nada si el catálogo ya está
// completo (la fuente `idealista` y TODAS las entradas con su localización y su zona), para que la segunda
// ejecución informe «seeds skipped». Si falta algo (catálogo ampliado, zona borrada), siembra con
// `seedReferenceData`, que es idempotente y no duplica. La validación del catálogo es la misma y ocurre antes.
export async function seedReferenceDataIfNeeded(
  db: Database,
  catalogue: readonly MunicipalitySeed[] = DEFAULT_CATALOGUE
): Promise<'seeded' | 'skipped'> {
  catalogue.forEach(assertValidMunicipality);

  const [source] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'idealista'));
  let complete = source !== undefined;
  const BATCH_SIZE = 500;
  let found = 0;
  for (let i = 0; complete && i < catalogue.length; i += BATCH_SIZE) {
    const codes = catalogue.slice(i, i + BATCH_SIZE).map((entry) => entry.ineCode);
    const [row] = await db
      .select({ total: count() })
      .from(locations)
      .innerJoin(zones, eq(zones.locationId, locations.id))
      .where(inArray(locations.ineCode, codes));
    found += row?.total ?? 0;
  }
  complete = complete && found === catalogue.length;

  if (complete) {
    return 'skipped';
  }
  await seedReferenceData(db, catalogue);
  return 'seeded';
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
