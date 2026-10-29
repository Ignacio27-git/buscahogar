// D.14 (decisión 187) — comprobación de existencia de la ficha FUERA de la página.
// Un layout se resuelve antes de que empiece a emitirse cualquier respuesta, así que
// `notFound()` aquí responde 404 de verdad; hecho desde la página, tras un límite de carga,
// la cabecera HTTP ya sería 200. La consulta es la misma que usan la página y `generateMetadata`
// (`loadPropertyHeader`, memoizado con `cache` de React), por lo que no añade ninguna consulta.
import { notFound } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import { propertyDetailParamsSchema } from '@buscahogar/core';

import { loadPropertyHeader } from '@/server/property-header';

interface PropertyLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ listingId: string }>;
}

export default async function PropertyLayout(props: PropertyLayoutProps): Promise<ReactElement> {
  const parsed = propertyDetailParamsSchema.safeParse(await props.params);

  // Un id malformado no describe ningún recurso: se corta antes de tocar la base de datos.
  if (!parsed.success) {
    notFound();
  }

  const header = await loadPropertyHeader(parsed.data.listingId);

  if (header === undefined) {
    notFound();
  }

  return <>{props.children}</>;
}
