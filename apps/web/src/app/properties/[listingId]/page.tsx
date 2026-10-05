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
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
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

// D.5 (decisión 148): `generateMetadata` y la página necesitan la misma cabecera. Un
// `cache()` de React, privado del módulo, la consulta una sola vez por petición y no
// guarda nada entre peticiones (a diferencia de `unstable_cache` o `'use cache'`).
const loadPropertyHeader = cache((listingId: string) => getPropertyDetailHeader(getDb(), listingId));

const FALLBACK_TITLE = 'Ficha de la vivienda';

// El título es el del anuncio, recortado; sin título (nulo, vacío o en blanco) se usa
// un texto fijo, nunca «No consolidado». La plantilla del layout añade « · Buscahogar».
export async function generateMetadata(props: PropertyDetailPageProps): Promise<Metadata> {
  const rawParams = await props.params;
  const parsed = propertyDetailParamsSchema.safeParse(rawParams);

  if (!parsed.success) {
    notFound();
  }

  const header = await loadPropertyHeader(parsed.data.listingId);

  if (header === undefined) {
    notFound();
  }

  const title = header.title?.trim() ?? '';
  return { title: title === '' ? FALLBACK_TITLE : title };
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

  const header = await loadPropertyHeader(parsed.data.listingId);

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
  const sources = await getPropertySources(getDb(), header.id);

  return (
    <>
      <PropertyHeader property={header} />
      <SourceGallery sources={sources} />
      <SourceList sources={sources} />
    </>
  );
}
