import type { ReactElement } from 'react';

import { WEB_VERSION } from '@/version';

// Página placeholder del esqueleto. El listado real llega en el paso 1.11.
export default function HomePage(): ReactElement {
  return (
    <main>
      <h1>Agregador inmobiliario</h1>
      <p>Esqueleto del monorepo · v{WEB_VERSION}</p>
    </main>
  );
}
