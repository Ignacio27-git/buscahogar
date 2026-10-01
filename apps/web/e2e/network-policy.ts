// Paso D.1a (spec R8; diseño A5/A6, decisión 137) — clasificación pura de una
// petición del navegador durante el e2e. Sin dependencia de Playwright: la usa
// la fixture automática (`fixtures.ts`) y la prueba de vitest
// (`test/e2e-network-policy.test.ts`).
//
// - `app`: el origen de la aplicación (esquema + host + puerto exactos). Un
//   origen mejorado a https por `upgrade-insecure-requests` NO coincide, y
//   por tanto cae en `external`: así el propio guard delata un fallo de la CSP.
// - `tile`: el ÚNICO host externo admitido (decisión 112), solo por https. Se
//   sirve desde un PNG local, nunca desde la red.
// - `inline`: `data:`/`blob:` no salen a la red.
// - `external`: todo lo demás, incluida una URL ilegible (fallo cerrado).

export type RequestClass = 'app' | 'tile' | 'inline' | 'external';

const TILE_HOST = 'tile.openstreetmap.org';

export function classifyRequest(url: string, appOrigin: string): RequestClass {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'external';
  }

  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
    return 'inline';
  }
  if (parsed.origin === appOrigin) {
    return 'app';
  }
  if (parsed.protocol === 'https:' && parsed.hostname === TILE_HOST && parsed.port === '') {
    return 'tile';
  }
  return 'external';
}
