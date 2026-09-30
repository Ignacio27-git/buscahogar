'use client';

// ROADMAP 2.6 (decisión 113, enmienda la 065) — ÚNICO fichero de la vista de
// mapa con la directiva de cliente. `next/dynamic` con `ssr: false` solo se
// admite en Client Components en Next 16, y así Leaflet (que toca `window` al
// importarse) nunca se evalúa durante el render de servidor ni entra en el
// bundle de la lista. Canvas, capa de clústeres y control de dibujo no llevan
// directiva: son código de cliente por el grafo de imports desde aquí.
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { SearchMapProps } from './search-map-types';

const SearchMapCanvas = dynamic(() => import('./search-map-canvas'), {
  ssr: false,
  loading: () => <p role="status">Cargando el mapa…</p>,
});

export function SearchMap(props: SearchMapProps): ReactElement {
  return <SearchMapCanvas {...props} />;
}
