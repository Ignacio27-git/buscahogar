// D.14 (decisión 189) — página 429 que devuelve `proxy.ts`. Módulo puro: construye la respuesta
// como cadena y cabeceras, sin JSX, sin `next/*` y SIN `server-only` (el proxy corre fuera del
// grafo de componentes de servidor; ver `test/server-only-boundary.test.ts`). Imports relativos.
//
// `Retry-After` conserva el valor que decide el limitador, sin recortar: lo leen clientes y
// cachés. El recorte (`Math.max(1, Math.ceil(n))`) solo afecta al texto que ve la persona. Sin
// `RateLimit-*` y con `no-store`: la respuesta es un estado del momento, no se cachea.
import { STANDALONE_PAGE_CSS } from '../lib/standalone-page';

const SECONDS_PER_MINUTE = 60;

export interface RateLimitResponseParts {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`;
}

// Tiempo de espera para mostrar: al menos 1 s, en segundos por debajo del minuto y en minutos
// (redondeando hacia arriba) desde ahí. Un valor no finito se muestra como 1 segundo.
function formatWait(retryAfterSeconds: number): string {
  const seconds = Number.isFinite(retryAfterSeconds) ? Math.max(1, Math.ceil(retryAfterSeconds)) : 1;
  return seconds < SECONDS_PER_MINUTE
    ? plural(seconds, 'segundo', 'segundos')
    : plural(Math.ceil(seconds / SECONDS_PER_MINUTE), 'minuto', 'minutos');
}

export function buildRateLimitResponse(retryAfterSeconds: number): RateLimitResponseParts {
  const title = 'Demasiadas peticiones seguidas';
  const body = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STANDALONE_PAGE_CSS}</style>
</head>
<body>
<main class="standalone">
<h1>${title}</h1>
<p>Has hecho muchas peticiones en poco tiempo. Es algo temporal. Espera ${formatWait(retryAfterSeconds)} y vuelve a cargar la página.</p>
</main>
</body>
</html>
`;
  return {
    body,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': String(retryAfterSeconds),
      'Cache-Control': 'no-store',
    },
  };
}
