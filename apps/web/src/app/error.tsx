'use client';

// D.14 (decisión 186) — frontera de error raíz. Cliente porque recibe `retry` (API estable desde
// Next 16.3: vuelve a pedir y a renderizar el contenido de la frontera). Se pinta DENTRO del
// layout raíz, así que la cabecera y el pie siguen ahí. Nunca muestra `error.message`, `stack` ni
// `digest`: son texto técnico y pueden contener datos internos (host, puerto, consulta).
import type { ReactElement } from 'react';

// Enlace normal a `/` (convención de la app, como en `site-header.tsx`): `next/link` añadiría
// JavaScript de cliente y, en `global-error`, no hay contexto de router.
/* eslint-disable @next/next/no-html-link-for-pages */
interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

export default function ErrorPage({ retry }: ErrorPageProps): ReactElement {
  return (
    <section className="flex max-w-prose flex-col items-start gap-4 py-8">
      <h1>No hemos podido cargar esta página</h1>
      <p className="text-ink-muted">
        Algo ha fallado al prepararla. Tus filtros siguen en la dirección, así que puedes
        reintentarlo sin perderlos.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => {
            retry();
          }}>
          Reintentar
        </button>
        <a href="/">Ir a la búsqueda</a>
      </div>
    </section>
  );
}
