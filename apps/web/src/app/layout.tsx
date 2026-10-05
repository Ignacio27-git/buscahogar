import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { THEME_INIT_SCRIPT } from '../server/theme-preference.js';

import './globals.css';

export const metadata: Metadata = {
  title: 'Agregador inmobiliario',
  description:
    'Plataforma que agrega ofertas inmobiliarias de varias fuentes y las normaliza en una búsqueda unificada',
};

// ROADMAP 1.13 (diseño A-3, DD-24) — atribución CC-BY/IGN, obligación legal
// bajo Orden FOM/2807/2015, no una cortesía. Vive en el footer de
// `layout.tsx` porque los datos derivados de CNIG (centroides de
// `locations`) influyen en TODA página que compone resultados de búsqueda,
// no solo en la de selección de zona — y `layout.tsx` es un Server
// Component, así que no cuesta JavaScript.
// Selector de tema (D.4, decisión 144). Server Component sin JavaScript: un formulario
// POST a `/theme` que guarda la cookie y vuelve a la página. El estado actual lo pinta
// solo el CSS según la clase de `<html>`. Provisionalmente en el pie; D.5 lo lleva a la
// cabecera.
function ThemeSelector(): ReactElement {
  return (
    <form method="post" action="/theme" className="theme-selector">
      <fieldset>
        <legend>Tema</legend>
        <button type="submit" name="theme" value="light" className="min-h-10 px-3 text-dense">
          Claro
        </button>
        <button type="submit" name="theme" value="dark" className="min-h-10 px-3 text-dense">
          Oscuro
        </button>
        <button type="submit" name="theme" value="system" className="min-h-10 px-3 text-dense">
          Sistema
        </button>
      </fieldset>
    </form>
  );
}

function AttributionFooter(): ReactElement {
  return (
    <footer>
      <p>
        Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de
        Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información
        Geográfica (CNIG), bajo licencia CC-BY 4.0.
      </p>
      <ThemeSelector />
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
      <body>
        {children}
        <AttributionFooter />
      </body>
    </html>
  );
}
