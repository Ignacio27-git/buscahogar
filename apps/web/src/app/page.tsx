import type { ReactElement } from 'react';

import { searchQuerySchema } from '@buscahogar/core';
import { searchProperties } from '@buscahogar/db';

import { ResultCard } from '@/components/result-card';
import { getDb } from '@/server/db';
import { WEB_VERSION } from '@/version';

// ROADMAP 1.11 (diseño D9) — reutiliza la ruta `/` en vez de crear una
// nueva: `.next/types/routes.d.ts` (generado) declara `AppRoutes = "/"`, y
// `apps/web`'s `typecheck` es `tsc --noEmit` puro (sin build previo), así
// que una ruta nueva no typecheckaría en un clon limpio hasta que
// `next build` regenere el tipado de rutas.
//
// La interfaz de props se declara EN LOCAL, no con el helper ambiental
// `PageProps<'/'>`: en un clon limpio ese tipo global no existe todavía
// (solo lo genera un `next build` previo). La forma es estructuralmente
// idéntica a la declaración generada (`routes.d.ts:37-40`, leída de este
// propio repo), así que no es una suposición.
interface HomePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildPageHref(
  params: Record<string, string | string[] | undefined>,
  targetPage: number
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        query.append(key, entry);
      }
    } else {
      query.append(key, value);
    }
  }
  query.set('page', String(targetPage));
  return `/?${query.toString()}`;
}

// Server Component puro (D9/D10): `await props.searchParams` es una Dynamic
// API que por sí sola fuerza el renderizado por petición — sin
// `export const dynamic`, sin `revalidate`, sin `cacheComponents` en
// next.config.ts. Ningún `'use client'` en este cambio (D10).
export default async function HomePage(props: HomePageProps): Promise<ReactElement> {
  const rawSearchParams = await props.searchParams;
  const parsed = searchQuerySchema.safeParse(rawSearchParams);

  if (!parsed.success) {
    return (
      <main>
        <h1>Agregador inmobiliario</h1>
        <p role="alert">
          No se pudo interpretar la búsqueda: {parsed.error.issues.map((issue) => issue.message).join('; ')}
        </p>
      </main>
    );
  }

  // `safeParse`, no `parse` (D10): un typo del usuario en la URL renderiza
  // un rechazo nombrado, nunca un error 500.
  const criteria = parsed.data;
  const db = getDb();
  const { results, hasNextPage } = await searchProperties(db, criteria);

  return (
    <main>
      <h1>Agregador inmobiliario</h1>
      <p>Esqueleto del monorepo · v{WEB_VERSION}</p>
      <p>
        {results.length} {results.length === 1 ? 'resultado' : 'resultados'} en esta página
        {criteria.page > 1 ? ` · página ${String(criteria.page)}` : ''}
      </p>
      {results.length === 0 ? (
        <p>No se encontraron viviendas con esos filtros.</p>
      ) : (
        <ul>
          {results.map((result) => (
            <li key={result.id}>
              <ResultCard result={result} />
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Paginación de resultados">
        {criteria.page > 1 ? (
          <a href={buildPageHref(rawSearchParams, criteria.page - 1)}>Página anterior</a>
        ) : null}
        {hasNextPage ? <a href={buildPageHref(rawSearchParams, criteria.page + 1)}>Página siguiente</a> : null}
      </nav>
    </main>
  );
}
