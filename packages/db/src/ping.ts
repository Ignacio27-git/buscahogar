// ROADMAP 3.4 (decisión 263, D8) — sonda de salud de `apps/web` (`/api/health`): un `select 1`. Vive aquí
// porque `apps/web` no depende de drizzle-orm. Resuelve si la base responde y rechaza si no; el plazo lo
// pone el llamador. Sin lectura de `process.env` (decisión 024).
import { sql } from 'drizzle-orm';

import type { Database } from './db.js';

export async function pingDatabase(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
