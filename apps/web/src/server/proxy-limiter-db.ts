// ROADMAP 3.4 (decisión 255, D5/PD9; decisión 256) — handle de base de datos del limitador del proxy.
//
// Hermano deliberado de `./coverage-db.ts`, no el mismo módulo: `coverage-db.ts` importa `server-only`
// y el runtime de Proxy no admite ese guard (decisión 081; igual que `env.ts` y `proxy-rate-limit.ts`),
// así que reutilizarlo rompería el proxy. Usa la MISMA credencial acotada `web_coverage`
// (`WEB_COVERAGE_DATABASE_URL`, URL del pooler): el limitador solo toca `proxy_rate_limit` (S/I/U/D),
// nunca la credencial de propietario ni la de lectura.
//
// PROXY-REACHABLE (decisión 081): sin `import 'server-only'`.
//
// Plazos de PD9 (R1.7, tope total de 200 ms): `connectionTimeoutMillis: 150` acota la obtención de
// conexión y `query_timeout: 150` la consulta (del lado del cliente; el `statement_timeout` en el
// servidor no se puede asumir detrás del pooler). La red de seguridad final, el `Promise.race` de
// 200 ms, vive en `proxy-rate-limit.ts`.
import { createDb, createPgProxyRateLimitStore } from '@buscahogar/db';
import type { Database, DbPoolOptions, ProxyRateLimitStore } from '@buscahogar/db';

import { readCoverageDatabaseUrl } from './env';

export const PROXY_LIMITER_POOL_OPTIONS: DbPoolOptions = {
  max: 4,
  connectionTimeoutMillis: 150,
  query_timeout: 150,
};

// Clave de caché en `globalThis` propia: reutilizar `buscahogarCoverageDb` devolvería el pool de
// registro de cobertura (2 conexiones, sin plazos de 150 ms).
const globalForProxyLimiterDb = globalThis as unknown as {
  buscahogarProxyLimiterDb?: ReturnType<typeof createDb>;
};

export function getProxyLimiterDb(): Database {
  if (globalForProxyLimiterDb.buscahogarProxyLimiterDb === undefined) {
    globalForProxyLimiterDb.buscahogarProxyLimiterDb = createDb(readCoverageDatabaseUrl(), PROXY_LIMITER_POOL_OPTIONS);
  }
  return globalForProxyLimiterDb.buscahogarProxyLimiterDb.db;
}

// Almacén del limitador ligado al pool de arriba. El pool se crea de forma perezosa en la primera
// petición; `async` convierte una credencial ausente (`MissingCoverageDatabaseUrlError`) en un rechazo,
// que `createProxyRateLimiter` trata como almacén no disponible (fallo abierto + línea de error).
export const proxyLimiterStore: ProxyRateLimitStore = {
  async hit(key, nowMs, params) {
    return createPgProxyRateLimitStore(getProxyLimiterDb()).hit(key, nowMs, params);
  },
};
