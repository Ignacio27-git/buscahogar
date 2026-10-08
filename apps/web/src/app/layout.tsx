import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { SHELL_CONTAINER } from '@/components/shell-container';
import { SiteHeader } from '@/components/site-header';
import { THEME_INIT_SCRIPT } from '@/server/theme-preference';

import './globals.css';

export const metadata: Metadata = {
  // D.5 (decisión 148): la home usa `default`; las páginas hijas rellenan `%s`.
  title: { default: 'Buscahogar', template: '%s · Buscahogar' },
  description:
    'Busca vivienda en un solo sitio: reúne anuncios de varias fuentes, agrupa los que son la misma vivienda y muestra su precio más bajo.',
};

// ROADMAP 1.13 (diseño A-3, DD-24) — atribución CC-BY/IGN, obligación legal
// bajo Orden FOM/2807/2015, no una cortesía. Vive en el footer de
// `layout.tsx` porque los datos derivados de CNIG (centroides de
// `locations`) influyen en TODA página que compone resultados de búsqueda,
// no solo en la de selección de zona — y `layout.tsx` es un Server
// Component, así que no cuesta JavaScript.
function AttributionFooter(): ReactElement {
  return (
    <footer className="border-t border-rule">
      <div className={`${SHELL_CONTAINER} py-6 text-dense text-ink-muted`}>
        <p className="max-w-prose">
          Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de
          Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información
          Geográfica (CNIG), bajo licencia CC-BY 4.0.
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Script estático: aplica la clase de tema antes del primer pintado. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        <SiteHeader />
        {/* El layout es el único dueño de `main`: las páginas devuelven fragmentos. */}
        <main
          id="contenido"
          tabIndex={-1}
          className={`${SHELL_CONTAINER} flex-1 py-6 focus-visible:outline-hidden`}
        >
          {children}
        </main>
        <AttributionFooter />
      </body>
    </html>
  );
}
