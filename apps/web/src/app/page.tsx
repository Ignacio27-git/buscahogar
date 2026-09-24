import type { ReactElement } from 'react';

import { normalizeSearchName, searchQuerySchema, zoneQuerySchema } from '@buscahogar/core';
import { resolveZoneGeometry, searchProperties, suggestZones } from '@buscahogar/db';
import type { ZoneSuggestion } from '@buscahogar/db';

import { CoverageStatus } from '@/components/coverage-status';
import { ResultCard } from '@/components/result-card';
import { resolveCoverageClientLimit } from '@/server/coverage-client';
import { getCoverageDb } from '@/server/coverage-db';
import { getDb } from '@/server/db';
import { resolveCoverageForZone, resolveNewZonesDailyCap } from '@/server/coverage';
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

// ROADMAP 1.13 Unit D (DD-19) — techo de sugerencias por consulta de
// autocompletado. Constante de servidor, nunca un parámetro de URL — mismo
// principio que `PAGE_SIZE` en `packages/db/src/search.ts`.
const ZONE_SUGGESTION_LIMIT = 10;

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

// ROADMAP 1.13 Unit D (DD-19) — el enlace de cada sugerencia sustituye
// `zoneQuery` por `zone=<ineCode>` y reinicia `page` (una zona nueva es un
// conjunto de resultados distinto de la página que se venía viendo),
// preservando cualquier otro filtro ya presente en la URL.
function buildZoneSelectionHref(params: Record<string, string | string[] | undefined>, ineCode: string): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || key === 'zoneQuery' || key === 'zone' || value === undefined) {
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
  query.set('zone', ineCode);
  return `/?${query.toString()}`;
}

// ROADMAP 1.13 Unit D (D8/A-7) — enlace de recarga PLANO: la misma URL
// actual, un `href` real, sin JavaScript. `<CoverageStatus/>` (el único
// componente 'use client') es una MEJORA sobre este enlace, nunca la única
// vía de comprobar el estado.
function buildCurrentHref(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
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
  return `/?${query.toString()}`;
}

function firstStringValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function ZoneSuggestions({
  suggestions,
  rawSearchParams,
}: {
  readonly suggestions: readonly ZoneSuggestion[];
  readonly rawSearchParams: Record<string, string | string[] | undefined>;
}): ReactElement {
  return (
    <section aria-label="Sugerencias de zona">
      {suggestions.length === 0 ? (
        <p>Ningún municipio coincide con esa búsqueda.</p>
      ) : (
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.ineCode}>
              <a href={buildZoneSelectionHref(rawSearchParams, suggestion.ineCode)}>
                {suggestion.municipality} ({suggestion.province})
              </a>
              {/* CR-12 (arbitraje, DD-5): un municipio sin centroide APARECE
                  igual, marcado — nunca oculto. */}
              {!suggestion.sweepable ? ' — sin cobertura disponible' : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatJobStatus(status: string): string {
  if (status === 'pending') return 'pendiente';
  if (status === 'running') return 'en curso';
  if (status === 'done') return 'completado';
  if (status === 'failed') return 'falló, reintento pendiente';
  return status;
}

// Server Component puro (D9/D10): `await props.searchParams` es una Dynamic
// API que por sí sola fuerza el renderizado por petición — sin
// `export const dynamic`, sin `revalidate`, sin `cacheComponents` en
// next.config.ts. El único `'use client'` de este cambio es
// `<CoverageStatus/>` (DD-23), importado más abajo — nunca este fichero.
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

  // ROADMAP 1.13 Unit D (DD-19, CR-10) — la lista de sugerencias vive en la
  // MISMA respuesta que los resultados, nunca en una ruta separada:
  // decisión del mantenedor D6 exige que la notificación/sugerencia y los
  // resultados ya-cubiertos aparezcan JUNTOS.
  const rawZoneQuery = firstStringValue(rawSearchParams.zoneQuery);
  const zoneQueryParsed = rawZoneQuery !== undefined ? zoneQuerySchema.safeParse(rawZoneQuery) : undefined;
  const suggestions =
    zoneQueryParsed?.success === true
      ? await suggestZones(db, normalizeSearchName(zoneQueryParsed.data), ZONE_SUGGESTION_LIMIT)
      : null;

  // ROADMAP 1.13 Unit D — resolución de zona y de cobertura. `criteria.zone`
  // y cualquiera de lat/lng/radius son mutuamente excluyentes (CR-6, ya
  // rechazado más arriba si ambos llegaran juntos), así que `criteria.geo`
  // solo puede venir de una zona resuelta y CUBIERTA — para cualquier otro
  // caso (no cubierta, sin centroide, tope agotado, desconocida) la
  // búsqueda se degrada a un resultado sin filtro geográfico, nunca a cero
  // resultados silenciosos (D6).
  let coverageNotice: ReactElement | null = null;
  let coverageStatusSection: ReactElement | null = null;
  let effectiveCriteria = criteria;

  if (criteria.zone !== undefined) {
    const zoneGeometry = await resolveZoneGeometry(db, criteria.zone);

    if (zoneGeometry === null) {
      coverageNotice = (
        <p role="status">No se ha encontrado ningún municipio con el código {criteria.zone}.</p>
      );
    } else if (zoneGeometry.state === 'covered' && zoneGeometry.centroid !== null) {
      effectiveCriteria = {
        ...criteria,
        geo: {
          lon: zoneGeometry.centroid.longitude,
          lat: zoneGeometry.centroid.latitude,
          radiusMeters: zoneGeometry.sweepRadiusM ?? 0,
        },
      };
    } else {
      const newZonesDailyCap = resolveNewZonesDailyCap();
      // ROADMAP 1.15 (security-hardening, diseño decisión 079): resuelto
      // ANTES de resolveCoverageForZone — cuando el limitador por cliente
      // está deshabilitado (D1a), devuelve `null` sin llamar a
      // `next/headers` en absoluto (validador notes obs #263).
      const clientLimit = await resolveCoverageClientLimit();
      const outcome = await resolveCoverageForZone(db, getCoverageDb, zoneGeometry, newZonesDailyCap, clientLimit);

      if (outcome.kind === 'not-sweepable') {
        coverageNotice = (
          <p role="status">
            No hay cobertura disponible para {zoneGeometry.municipality} en este momento (sin datos de
            ubicación suficientes para barrer la zona).
          </p>
        );
      } else if (outcome.kind === 'cap-exhausted') {
        coverageNotice = (
          <p role="status">
            No se ha podido programar el barrido de {zoneGeometry.municipality}: se ha alcanzado el límite
            diario de zonas nuevas. El límite se restablece a las 00:00 UTC — vuelve a intentarlo mañana.
          </p>
        );
      } else if (outcome.kind === 'client-cap-exhausted') {
        // spec #261 "A Per-Client Limit Hit Is The Distinct Outcome
        // client-cap-exhausted, Never cap-exhausted" (D6): mensaje DISTINTO
        // del anterior — este bloquea a UN cliente, no a todos.
        coverageNotice = (
          <p role="status">
            No se ha podido programar el barrido de {zoneGeometry.municipality}: has alcanzado tu límite
            personal de solicitudes de hoy. Vuelve a intentarlo mañana.
          </p>
        );
      } else if (outcome.kind === 'registered' && outcome.job !== null) {
        const job = outcome.job;
        coverageStatusSection = (
          <section aria-label="Estado del barrido">
            <p role="status">
              Barrido de {zoneGeometry.municipality}: {formatJobStatus(job.status)}
              {job.startedAt !== null ? ` · iniciado ${job.startedAt.toISOString()}` : ''}
            </p>
            <a href={buildCurrentHref(rawSearchParams)}>Comprobar de nuevo</a>
            <CoverageStatus job={job} />
          </section>
        );
      }
    }
  }

  const { results, hasNextPage } = await searchProperties(db, effectiveCriteria);

  return (
    <main>
      <h1>Agregador inmobiliario</h1>
      <p>Esqueleto del monorepo · v{WEB_VERSION}</p>
      {suggestions !== null ? <ZoneSuggestions suggestions={suggestions} rawSearchParams={rawSearchParams} /> : null}
      {coverageNotice}
      {coverageStatusSection}
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
