// ROADMAP 3.4 (decisión 261; SMV-9, ODbL) — atribución de las teselas en el HTML del servidor. Sin
// `'use client'`: lo usan la página de búsqueda y la sección «Ubicación» de la ficha. El texto va como
// nodo de texto (React lo escapa); el único enlace es el `href` fijado en `lib/tile-config.ts` (el de
// OpenStreetMap), nunca un valor de entorno.
import type { ReactElement } from 'react';

import type { TileAttribution as TileAttributionConfig } from '@/lib/tile-config';

export function TileAttribution({ attribution }: { readonly attribution: TileAttributionConfig }): ReactElement {
  return (
    <>
      {attribution.prefix}
      {attribution.href === null ? attribution.label : <a href={attribution.href}>{attribution.label}</a>}
    </>
  );
}
