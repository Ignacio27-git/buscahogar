// ROADMAP 1.11 — backfill de miniaturas a coste de cuota CERO (diseño D6).
// Rellena `listings.thumbnail_url` para filas ya ingeridas, leyendo
// EXCLUSIVAMENTE el jsonb `raw` que `listing_versions` ya persiste desde el
// paso 1.7 — nunca vuelve a pedir nada a la fuente. Este fichero NO importa
// nada de `src/sources/**` (prueba estática en
// test/backfill-thumbnails-no-sources-import.test.ts, verificado en rojo):
// es la misma frontera reforzada que scripts/reprocess-dedup.ts (D11,
// CHK-NOSOURCES-LINT).
//
// `thumbnailUrl` es identity-column (docs/DECISIONS.md, decisión 059): se
// congela en la PRIMERA versión de cada anuncio, así que este backfill lee
// la más antigua (`version ASC`), no la vigente — leer la vigente haría que
// una fila rellenada por el backfill y una escrita en vivo por
// listing-writer.ts registrasen cosas distintas para el mismo concepto.
import { fileURLToPath } from 'node:url';

import { createDb, listings } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

export class BackfillEnvError extends Error {}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export interface BackfillEnv {
  readonly databaseUrl: string;
}

// Nunca lee `process.env` directamente (mismo contrato que
// scripts/reprocess-dedup.ts): recibe el entorno como parámetro, para que el
// fallo se pueda testear sin tocar el proceso real.
export function readEnv(env: Readonly<Record<string, string | undefined>>): BackfillEnv {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new BackfillEnvError('Falta la variable de entorno DATABASE_URL: debe estar definida y no vacía.');
  }
  return { databaseUrl: parsed.data.DATABASE_URL };
}

// Único punto que interpreta el jsonb crudo. `unknown` estrechado, nunca
// `any` (CLAUDE.md). Cadena vacía tratada igual que ausencia: no hay
// diferencia útil entre "sin miniatura" y "miniatura vacía".
export function extractThumbnailUrl(raw: Record<string, unknown> | null): string | undefined {
  const value = raw?.['thumbnail'];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export interface BackfillOutcome {
  readonly updated: number;
  readonly skippedNoThumbnail: number;
}

interface EarliestRawRow {
  readonly listingId: string;
  readonly raw: unknown;
}

// `DISTINCT ON (listing_id) ... ORDER BY listing_id, version ASC` — la
// versión más antigua de cada anuncio, en una única consulta. Filtra por
// `listings.thumbnail_url IS NULL` en el propio SELECT (no solo en el
// UPDATE): así una segunda ejecución no vuelve a traer a memoria filas ya
// rellenadas, que es lo que hace esta operación barata de repetir.
async function fetchListingsNeedingBackfill(db: Database): Promise<EarliestRawRow[]> {
  const result = await db.execute<{ listing_id: string; raw: unknown }>(sql`
    SELECT DISTINCT ON (lv.listing_id) lv.listing_id, lv.raw
    FROM listing_versions lv
    INNER JOIN listings l ON l.id = lv.listing_id
    WHERE l.thumbnail_url IS NULL
    ORDER BY lv.listing_id, lv.version ASC
  `);
  return result.rows.map((row) => ({ listingId: row.listing_id, raw: row.raw }));
}

// Bucle principal (D6): una fila sin miniatura en su raw más antiguo se
// cuenta como `skippedNoThumbnail` y se deja en NULL — nunca se escribe ''
// (NULL es el "desconocido" honesto, y no cuesta nada reintentarla en una
// corrida posterior si el problema era del propio dato de origen).
//
// El UPDATE repite `thumbnail_url IS NULL` en su WHERE aunque el SELECT ya
// filtró por lo mismo: defensa en profundidad frente a una carrera entre dos
// ejecuciones concurrentes del propio backfill, no una necesidad del caso de
// uso normal (una sola ejecución programada).
export async function backfillThumbnails(db: Database): Promise<BackfillOutcome> {
  const rows = await fetchListingsNeedingBackfill(db);

  let updated = 0;
  let skippedNoThumbnail = 0;
  for (const row of rows) {
    const thumbnailUrl = extractThumbnailUrl(row.raw as Record<string, unknown> | null);
    if (thumbnailUrl === undefined) {
      skippedNoThumbnail += 1;
      continue;
    }
    await db
      .update(listings)
      .set({ thumbnailUrl })
      .where(and(eq(listings.id, row.listingId), isNull(listings.thumbnailUrl)));
    updated += 1;
  }

  return { updated, skippedNoThumbnail };
}

export async function main(): Promise<void> {
  const { databaseUrl } = readEnv(process.env);
  const { db, pool } = createDb(databaseUrl);
  try {
    const outcome = await backfillThumbnails(db);
    console.log(JSON.stringify(outcome, null, 2));
  } finally {
    await pool.end();
  }
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/reprocess-dedup.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
