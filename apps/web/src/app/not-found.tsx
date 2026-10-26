// D.14 (decisión 187) — 404 raíz. Sirve las URL que no casan con ninguna ruta y la ficha
// inexistente o malformada (su `layout.tsx` llama a `notFound()`); la ficha NO tiene un
// `not-found.tsx` propio. Componente de servidor dentro del layout del sitio, con la cabecera y
// el pie; sin eco del identificador ni jerga de estado. La salida es un enlace normal a `/`.
// D.22 (decisión 269): ilustración «not-found», copia cálida y UNA acción principal (receta `state-action`).
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { StateIllustration } from '@/components/state-illustration';

// Enlace normal a `/` (convención de la app, como en `site-header.tsx`): `next/link` añadiría
// JavaScript de cliente.
/* eslint-disable @next/next/no-html-link-for-pages */
export const metadata: Metadata = { title: 'Página no encontrada' };

export default function NotFound(): ReactElement {
  return (
    <section className="flex max-w-prose flex-col items-start gap-4 py-8">
      <StateIllustration kind="not-found" />
      <h1>No encontramos esta página</h1>
      <p className="text-ink-muted">
        Puede que el enlace esté mal escrito o que el anuncio ya no esté publicado. Desde la búsqueda puedes seguir
        mirando viviendas.
      </p>
      <p>
        <a className="state-action" href="/">
          Ir a la búsqueda
        </a>
      </p>
    </section>
  );
}
