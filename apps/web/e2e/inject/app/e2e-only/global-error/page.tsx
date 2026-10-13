// D.17 (decisión 210) — SOLO e2e. No pinta nada: el fallo lo lanza la plantilla inyectada
// (`e2e/inject/app/template.tsx`) al ver esta ruta, por encima de `error.tsx`. `force-dynamic`
// por coherencia con la otra página de prueba.
import type { ReactElement } from 'react';

export const dynamic = 'force-dynamic';

export default function GlobalErrorPage(): ReactElement | null {
  return null;
}
