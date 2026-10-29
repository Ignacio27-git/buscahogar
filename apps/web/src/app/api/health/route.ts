// ROADMAP 3.4 (decisión 263, D8; R4.1-R4.3) — GET /api/health. `select 1` con la credencial de SOLO
// LECTURA (`getDb`), sin llamadas externas (NF1), sin autenticación y sin caché. El proxy no la limita ni
// escribe en `proxy_rate_limit` (el `matcher` de `proxy.ts` excluye `api/health$`, R1.8).
import { pingDatabase } from '@buscahogar/db';

import { getDb } from '@/server/db';
import { buildHealthResponse, HEALTH_TIMEOUT_MS, runHealthCheck } from '@/server/health';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  // `getDb()` puede lanzar (credencial ausente): dentro de la sonda, para que cuente como `degraded`.
  const status = await runHealthCheck(() => pingDatabase(getDb()), HEALTH_TIMEOUT_MS);
  return buildHealthResponse(status);
}
