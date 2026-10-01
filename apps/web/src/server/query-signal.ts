// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102) — registro de la
// señal de demanda de una zona. Cada búsqueda que resuelve una zona con
// centroide inserta como mucho una fila (zona, día UTC) con el rol
// `web_coverage` (INSERT-only; `ON CONFLICT DO NOTHING`, ver
// `packages/db/src/query-signals.ts`). El worker de `apps/ingestion` la lee
// para decidir la cadencia de refresco y la purga.
//
// Nunca lanza (QSR-3): la señal es telemetría de demanda, no parte de la
// respuesta. Un fallo del INSERT, una `WEB_COVERAGE_DATABASE_URL` ausente o
// cualquier otro valor lanzado se captura y se registra con un mensaje sin
// credenciales; la búsqueda se sigue renderizando. Este módulo no importa
// nada de `apps/ingestion` ni de los adaptadores de fuente, y no hace
// ninguna llamada HTTP (QSR-6): la web solo escribe en NUESTRA base de datos.
//
// El handle de escritura llega como FÁBRICA perezosa (`getWriteDb`), igual que
// en `resolveCoverageForZone`: `getCoverageDb()` falla alto en su primera
// llamada si la URL no está definida, y ese fallo debe caer DENTRO del
// `try`. Además, así `coverage-db.ts` conserva un único importador
// (`page.tsx`, test `coverage-db-import-boundary`).
import 'server-only';

import { recordZoneQuerySignal } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

// Una cadena de conexión dentro de un mensaje de error de `pg` puede incluir
// usuario y contraseña; se sustituye entera por un marcador antes de
// registrar nada.
const CONNECTION_STRING_PATTERN = /postgres(?:ql)?:\/\/\S+/gi;

function scrubbedMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split('\n')[0] ?? '';
  return firstLine.replace(CONNECTION_STRING_PATTERN, '[cadena de conexión omitida]');
}

function defaultLog(line: string): void {
  // Único canal de diagnóstico del servidor; el mensaje ya va sin credenciales.
  console.error(line);
}

export async function recordZoneQuerySignalSafely(
  getWriteDb: () => Database,
  zoneId: string,
  log: (line: string) => void = defaultLog
): Promise<void> {
  try {
    await recordZoneQuerySignal(getWriteDb(), zoneId);
  } catch (error) {
    log(`query-signal: no se pudo registrar la señal de demanda de la zona: ${scrubbedMessage(error)}`);
  }
}
