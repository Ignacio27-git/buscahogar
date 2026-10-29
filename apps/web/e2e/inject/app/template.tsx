'use client';

// D.17 (decisión 209) — SOLO e2e: `Dockerfile.e2e` copia este fichero a `src/app/` antes de
// `next build`; no existe en el árbol versionado ni en la build de producción (guard:
// `test/e2e-injection-boundary.test.ts`). La plantilla raíz queda por encima del límite de error
// raíz (Layout > Template > ErrorBoundary), así que un fallo lanzado aquí solo lo recoge
// `global-error.tsx`. Fuera de la ruta de prueba devuelve `children` tal cual, como la plantilla
// por defecto de Next.
import { usePathname } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

const GLOBAL_ERROR_PATH = '/e2e-only/global-error';

interface TemplateProps {
  readonly children: ReactNode;
}

export default function Template({ children }: TemplateProps): ReactElement {
  const pathname = usePathname();
  if (pathname === GLOBAL_ERROR_PATH) {
    throw new Error('E2E_ONLY: fallo forzado para capturar global-error');
  }
  return <>{children}</>;
}
