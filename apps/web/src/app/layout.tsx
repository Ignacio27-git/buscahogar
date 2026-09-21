import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

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
function AttributionFooter(): ReactElement {
  return (
    <footer>
      <p>
        Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de
        Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información
        Geográfica (CNIG), bajo licencia CC-BY 4.0.
      </p>
    </footer>
  );
}

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="es">
      <body>
        {children}
        <AttributionFooter />
      </body>
    </html>
  );
}
