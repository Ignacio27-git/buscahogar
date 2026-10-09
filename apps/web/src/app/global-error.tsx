'use client';

// D.14 (decisión 186) — frontera de último recurso: sustituye al layout raíz, así que aporta su
// propio `<html>` y `<body>`. Sin `metadata` (no se puede exportar desde aquí): el título va con
// un `<title>` de React. Sin clase de tema (el script de tema y el layout no existen) y con el
// mismo CSS autónomo que la página 429, que elige el esquema con `prefers-color-scheme`.
// Nunca muestra `error.message`, `stack` ni `digest`.
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import { focusHeading } from '@/lib/error-focus';
import { STANDALONE_PAGE_CSS } from '@/lib/standalone-page';

// Enlace normal a `/` (convención de la app, como en `site-header.tsx`): `next/link` añadiría
// JavaScript de cliente y, en `global-error`, no hay contexto de router.
/* eslint-disable @next/next/no-html-link-for-pages */
interface GlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

export default function GlobalError({ retry }: GlobalErrorProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // D.15 (F12, decisión 203): foco al título al aparecer. Sin limpieza: tras reintentar, esta
  // frontera sustituye a todo el documento y `main#contenido` aún no existe cuando se desmonta.
  useEffect(() => {
    focusHeading(headingRef.current);
  }, []);

  return (
    <html lang="es">
      <body>
        <title>Buscahogar no está disponible</title>
        <style dangerouslySetInnerHTML={{ __html: STANDALONE_PAGE_CSS }} />
        <main className="standalone">
          <h1 ref={headingRef} tabIndex={-1}>
            Buscahogar no está disponible ahora mismo
          </h1>
          <p>Algo ha fallado al cargar la página. Puedes reintentarlo o volver a la búsqueda.</p>
          <div className="standalone__actions">
            <button
              type="button"
              onClick={() => {
                retry();
              }}
            >
              Reintentar
            </button>
            <a href="/">Ir a la búsqueda</a>
          </div>
        </main>
      </body>
    </html>
  );
}
