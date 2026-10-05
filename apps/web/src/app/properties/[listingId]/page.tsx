// ROADMAP 1.12 (diseño D1/D2/D3; docs/DECISIONS.md, decisión 061; arbitraje
// obs #193/#194) — página de detalle de una vivienda, keyed en un
// `listings.id` (D1: `params` es una Dynamic API, `Promise`, se hace
// `await`; interfaz de props LOCAL, nunca el helper ambiental `PageProps`,
// que solo existe tras un `next build` previo — `apps/web/package.json`
// fija `typecheck` a `tsc --noEmit` puro, sin build antes).
//
// Server Component ASYNC puro: solo hace fetching, `notFound()` y
// composición (addendum obs #194, AR-13) — el markup de cabecera vive en
// `PropertyHeader`, un componente SÍNCRONO propio que SÍ cae dentro del
// alcance del arnés `renderToStaticMarkup` (AR-9). Sin `'use client'`
// (D10), enlaces con `<a href>` normal, nunca `next/link` (D1: este cambio
// SÍ crea una ruta nueva, así que no hereda el atajo D9 de 1.11 de reusar
// `/` — lo que sí mantiene es la mitad que de verdad hace typecheckear en
// limpio, la interfaz de props local).
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { propertyDetailParamsSchema } from '@buscahogar/core';
import { getPropertyDetailHeader, getPropertySources } from '@buscahogar/db';

import { PropertyHeader } from '@/components/property-header';
import { SourceGallery } from '@/components/source-gallery';
import { SourceList } from '@/components/source-list';
import { getDb } from '@/server/db';

interface PropertyDetailPageProps {
  readonly params: Promise<{ listingId: string }>;
}

// Server Component async (D1): `await props.params` es una Dynamic API que
// por sí sola fuerza el renderizado por petición, igual que
// `await props.searchParams` en `page.tsx` de la home (D9/D10 de 1.11).
export default async function PropertyDetailPage(props: PropertyDetailPageProps): Promise<ReactElement> {
  const rawParams = await props.params;
  const parsed = propertyDetailParamsSchema.safeParse(rawParams);

  // Un uuid malformado no describe NINGÚN recurso (D2, a diferencia del
  // filtro de búsqueda con typo de la home, que sigue describiendo una
  // página que existe): `notFound()`, nunca un rechazo nombrado en línea.
  // `notFound()` tipa `never`, así que TypeScript estrecha `parsed` a su
  // variante de éxito después de este bloque sin un `return` explícito.
  if (!parsed.success) {
    notFound();
  }

  const db = getDb();
  const header = await getPropertyDetailHeader(db, parsed.data.listingId);

  // `header === undefined` cubre, sin distinguirlos (AR-2, diseño Q1 walk),
  // los dos casos "bien formado pero sin `property_listings`": el listing
  // no existe en absoluto, y el listing barrido tras el último
  // `reprocess-dedup` (alcanzable HOY, en cada barrido entre reprocesos) —
  // ambos son `notFound()` idéntico, nunca una redirección (threat-matrix).
  if (header === undefined) {
    notFound();
  }

  // Un anuncio retirado (`status` `'inactive'`/`'removed'`) SIGUE con su
  // fila `property_listings` (Q1 walk, obs #191): la URL nunca deja de
  // resolver por ese motivo — `getPropertySources` no filtra por `status`,
  // solo lo proyecta para que `SourceList` marque esa fuente como no
  // disponible.
  const sources = await getPropertySources(db, header.id);

  return (
    <>
      <PropertyHeader property={header} />
      <SourceGallery sources={sources} />
      <SourceList sources={sources} />
    </>
  );
}
