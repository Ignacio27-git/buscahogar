'use client';

// D.14 (decisión 186) — frontera de último recurso: sustituye al layout raíz, así que aporta su
// propio `<html>` y `<body>`. Sin `metadata` (no se puede exportar desde aquí): el título va con
// un `<title>` de React. Sin clase de tema (el script de tema y el layout no existen) y con el
// mismo CSS autónomo que la página 429, que elige el esquema con `prefers-color-scheme`.
// D.22 (decisión 266): la franja lleva la marca como `<BrandMark />` (SVG incrustado, sin recurso servido).
// D.22 (decisión 269): ilustración «unavailable» como `<StateIllustration />`, copia cálida y UNA acción
// principal («Reintentar», receta `state-action` del CSS autónomo); «Ir a la búsqueda» queda como texto.
// Nunca muestra `error.message`, `stack` ni `digest`.
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { StateIllustration } from '@/components/state-illustration';
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
        <header className="standalone-header">
          <a className="standalone-header__brand" href="/">
            <BrandMark />
            Buscahogar
          </a>
        </header>
        <main className="standalone">
          <StateIllustration kind="unavailable" />
          <h1 ref={headingRef} tabIndex={-1}>
            Buscahogar no está disponible ahora mismo
          </h1>
          <p>Algo ha fallado al cargar la página; no has hecho nada mal. Puedes reintentarlo o volver a la búsqueda.</p>
          <div className="standalone__actions">
            <button
              type="button"
              className="state-action"
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
