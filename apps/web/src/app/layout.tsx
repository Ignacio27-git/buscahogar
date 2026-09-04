import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Agregador inmobiliario',
  description:
    'Plataforma que agrega ofertas inmobiliarias de varias fuentes y las normaliza en una búsqueda unificada',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
