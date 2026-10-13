// D.17 (decisión 210) — SOLO e2e (ver `e2e/inject/app/template.tsx`). Lanza al renderizar para
// activar `error.tsx` de verdad. `force-dynamic`: una página prerenderizada que lanza haría fallar
// `next build`.
import type { ReactElement } from 'react';

export const dynamic = 'force-dynamic';

export default function ErrorBoundaryPage(): ReactElement {
  throw new Error('E2E_ONLY: fallo forzado para capturar error.tsx');
}
