'use client';

// D.14 (decisión 186) — frontera de error raíz. Cliente porque recibe `retry` (API estable desde
// Next 16.3: vuelve a pedir y a renderizar el contenido de la frontera). Se pinta DENTRO del
// layout raíz, así que la cabecera y el pie siguen ahí. Nunca muestra `error.message`, `stack` ni
// `digest`: son texto técnico y pueden contener datos internos (host, puerto, consulta).
// D.22 (decisión 269): ilustración «unavailable», copia que no culpa a quien la lee y UNA acción principal
// («Reintentar», receta `state-action`); «Ir a la búsqueda» queda como enlace de texto secundario.
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import { StateIllustration } from '@/components/state-illustration';
import { focusHeading, restoreFocusToMain } from '@/lib/error-focus';

// Enlace normal a `/` (convención de la app, como en `site-header.tsx`): `next/link` añadiría
// JavaScript de cliente.
/* eslint-disable @next/next/no-html-link-for-pages */
interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

export default function ErrorPage({ retry }: ErrorPageProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // D.15 (F12, decisión 203): foco al título al aparecer; al desmontarse tras un reintento con
  // éxito, a `main#contenido` solo si el foco se perdió.
  useEffect(() => {
    focusHeading(headingRef.current);
    return (): void => {
      restoreFocusToMain(document);
    };
  }, []);

  return (
    <section className="flex max-w-prose flex-col items-start gap-4 py-8">
      <StateIllustration kind="unavailable" />
      {/* Sin contorno propio, como `main#contenido`: no es un control, el foco es programático. */}
      <h1 ref={headingRef} tabIndex={-1} className="focus-visible:outline-hidden">
        No hemos podido cargar esta página
      </h1>
      <p className="text-ink-muted">
        Algo ha fallado al prepararla; no has hecho nada mal. Vuelve a intentarlo en un momento.
      </p>
      <div className="flex flex-wrap items-center gap-4">
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
    </section>
  );
}
