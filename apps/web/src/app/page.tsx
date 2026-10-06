import type { ReactElement } from 'react';

import {
  interpretSearchText,
  nlQuerySchema,
  normalizeSearchName,
  searchQuerySchema,
  searchViewSchema,
  zoneQuerySchema,
} from '@buscahogar/core';
import { resolveZoneGeometry, searchMapPoints, searchProperties, suggestZones } from '@buscahogar/db';
import type { ZoneGeometry, ZoneSuggestion } from '@buscahogar/db';

import { AppliedFilters } from '@/components/applied-filters';
import { CoverageStatus } from '@/components/coverage-status';
import { CriteriaForm } from '@/components/criteria-form';
import { FilterBar } from '@/components/filter-bar';
import { Pagination } from '@/components/pagination';
import { ResultCard } from '@/components/result-card';
import { SearchMap } from '@/components/search-map';
import type { MapPointView } from '@/components/search-map-types';
import { SearchTextForm } from '@/components/search-text-form';
import { formatPriceCents } from '@/lib/format-price';
import { PLACE_SUGGESTION_LIMIT, classifyPlaceMatches } from '@/lib/place-match';
import { buildPropertyDetailHref } from '@/lib/property-href';
import {
  buildCurrentHref,
  buildViewHref,
  buildZoneSelectionHref,
  canonicalizeFormSubmission,
} from '@/lib/search-href';
import { countTrayFilters, formatListCount, formatMapCount } from '@/lib/search-labels';
import { resolveCoverageClientLimit } from '@/server/coverage-client';
import { getCoverageDb } from '@/server/coverage-db';
import { getDb } from '@/server/db';
import { resolveCoverageForZone, resolveNewZonesDailyCap } from '@/server/coverage';
import { recordZoneQuerySignalSafely } from '@/server/query-signal';

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

// El mensaje por defecto de Zod para un enum («Invalid option: …») no nombra el
// parámetro; la alerta debe nombrarlo (spec search-filters), así que se antepone.
function describeIssue(issue: { readonly path: readonly PropertyKey[]; readonly message: string }): string {
  const name = issue.path[0];
  return typeof name === 'string' && !issue.message.includes(name) ? `${name}: ${issue.message}` : issue.message;
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

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102, QSR-3) — señal de
// demanda: una búsqueda real sobre una zona con centroide, sea cual sea su
// estado, ANTES de la resolución de cobertura. Nunca lanza
// (`recordZoneQuerySignalSafely` captura y registra sin credenciales), así que
// la búsqueda se renderiza igual.
//
// `after()` de `next/server` existe y está tipado en 16.3.4 (verificado en el
// paquete instalado), pero su comportamiento en la página de un Server
// Component NO se pudo confirmar con Context7 en este apply (la herramienta no
// estaba disponible) — por eso se usa el respaldo previsto en el diseño: una
// llamada `await`ada que nunca lanza. Pasar a `after()` es un cambio local a
// esta función.
async function recordDemandSignal(zoneGeometry: ZoneGeometry): Promise<void> {
  if (zoneGeometry.centroid !== null) {
    await recordZoneQuerySignalSafely(getCoverageDb, zoneGeometry.zoneId);
  }
}

// ROADMAP 2.6 (DAS-11, decisión 118) — aviso genérico de un polígono sin
// coincidencias. Un polígono nunca consulta cobertura ni registra señal de
// demanda ni consume cuota: el aviso lo dice.
function OutsideCoverageNotice(): ReactElement {
  return (
    <p role="status">
      No hay viviendas de nuestra base en la zona dibujada; puede que la zona no esté cubierta. La zona dibujada no
      solicita barridos de cobertura.
    </p>
  );
}

function formatJobStatus(status: string): string {
  if (status === 'pending') return 'pendiente';
  if (status === 'running') return 'en curso';
  if (status === 'done') return 'completado';
  if (status === 'failed') return 'falló, reintento pendiente';
  return status;
}

// ROADMAP 3.1 (decisión 122) — rama `?q=`: interpretar y pedir confirmación,
// NUNCA buscar. Aquí no se llama a `searchProperties`, `searchMapPoints`,
// `resolveZoneGeometry`, la cobertura, la señal de demanda ni la cuota por
// cliente: una zona mal interpretada registraría un barrido y gastaría cuota.
// Solo se lee la base de datos con la credencial de solo lectura
// (`suggestZones`); `apps/web` no llama a ninguna fuente externa.
//
// El texto se valida con `nlQuerySchema` y lo interpretado con el MISMO
// `searchQuerySchema` de la búsqueda normal (no hay un segundo esquema): un
// rango invertido sale como su rechazo nombrado y los campos siguen editables.
async function renderInterpretation(rawQ: string | string[]): Promise<ReactElement> {
  const shown = typeof rawQ === 'string' ? rawQ : '';
  const queryParsed = typeof rawQ === 'string' ? nlQuerySchema.safeParse(rawQ) : undefined;

  if (queryParsed?.success !== true) {
    const message =
      typeof rawQ !== 'string'
        ? 'q debe aparecer una sola vez.'
        : rawQ.trim().length === 0
          ? 'q: escribe qué quieres buscar.'
          : 'q: el texto no puede superar los 200 caracteres.';
    return (
      <>
        <h1>Buscar vivienda</h1>
        <SearchTextForm value={shown} />
        <p role="alert">No se pudo interpretar la búsqueda: {message}</p>
      </>
    );
  }

  const interpretation = interpretSearchText(queryParsed.data);
  const unrecognised = [...interpretation.unrecognised];
  let zoneChoices: readonly ZoneSuggestion[] = [];
  let selectedZone: string | null = null;

  if (interpretation.placeText !== null) {
    const suggestions = await suggestZones(
      getDb(),
      normalizeSearchName(interpretation.placeText),
      PLACE_SUGGESTION_LIMIT
    );
    const match = classifyPlaceMatches(interpretation.placeText, suggestions);
    if (match.kind === 'zone') {
      zoneChoices = [match.zone];
      selectedZone = match.zone.ineCode;
    } else if (match.kind === 'choose') {
      zoneChoices = match.zones;
    } else {
      unrecognised.push(`en ${match.text}`);
    }
  }

  const validated = searchQuerySchema.safeParse({
    ...interpretation.params,
    ...(selectedZone !== null ? { zone: selectedZone } : {}),
  });

  return (
    <>
      <h1>Buscar vivienda</h1>
      <SearchTextForm value={queryParsed.data} />
      <CriteriaForm
        values={interpretation.params}
        zoneChoices={zoneChoices}
        selectedZone={selectedZone}
        unrecognised={unrecognised}
        conflicts={interpretation.conflicts}
        issues={validated.success ? [] : validated.error.issues.map((issue) => issue.message)}
      />
    </>
  );
}

// Server Component puro (D9/D10): `await props.searchParams` es una Dynamic
// API que por sí sola fuerza el renderizado por petición — sin
// `export const dynamic`, sin `revalidate`, sin `cacheComponents` en
// next.config.ts. El único `'use client'` de este cambio es
// `<CoverageStatus/>` (DD-23), importado más abajo — nunca este fichero.
export default async function HomePage(props: HomePageProps): Promise<ReactElement> {
  const submittedParams = await props.searchParams;

  // `q` presente (aunque vacío) es SIEMPRE la rama de interpretación, aunque
  // lleve además parámetros de criterio: la búsqueda solo corre sin `q`.
  if (submittedParams.q !== undefined) {
    return renderInterpretation(submittedParams.q);
  }

  // Decisión 123: quita la marca del formulario de criterios y sus campos en
  // blanco antes de validar; todos los href de abajo parten de esta copia.
  const rawSearchParams = canonicalizeFormSubmission(submittedParams);
  const parsed = searchQuerySchema.safeParse(rawSearchParams);

  // ROADMAP 2.6 (decisión 118): `view` tiene esquema propio, fuera del
  // criterio. Un valor inválido es el mismo rechazo nombrado que cualquier
  // otro parámetro, nunca un valor por defecto silencioso.
  const viewParsed = searchViewSchema.safeParse(rawSearchParams.view);

  if (!parsed.success || !viewParsed.success) {
    const issues = [
      ...(parsed.success ? [] : parsed.error.issues),
      ...(viewParsed.success ? [] : viewParsed.error.issues),
    ];
    // D.6a: la barra se pinta con lo recibido para poder corregirlo, pero no
    // reenvía como oculto ningún parámetro que el esquema haya rechazado.
    const rejectedKeys = new Set<string>(
      issues.flatMap((issue) => (typeof issue.path[0] === 'string' ? [issue.path[0]] : []))
    );
    if (!viewParsed.success) {
      rejectedKeys.add('view');
    }
    return (
      <>
        <h1>Buscar vivienda</h1>
        <SearchTextForm value="" />
        <p role="alert">No se pudo interpretar la búsqueda: {issues.map(describeIssue).join('; ')}</p>
        <FilterBar params={rawSearchParams} rejectedKeys={rejectedKeys} open />
      </>
    );
  }
  const view = viewParsed.data;

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
  // Nombre del municipio ya resuelto para el chip de zona: sin consulta nueva.
  let zoneName: string | null = null;

  if (criteria.zone !== undefined) {
    const zoneGeometry = await resolveZoneGeometry(db, criteria.zone);
    zoneName = zoneGeometry?.municipality ?? null;

    if (zoneGeometry === null) {
      coverageNotice = (
        <p role="status">No se ha encontrado ningún municipio con el código {criteria.zone}.</p>
      );
    } else if (zoneGeometry.state === 'covered' && zoneGeometry.centroid !== null) {
      await recordDemandSignal(zoneGeometry);
      effectiveCriteria = {
        ...criteria,
        geo: {
          lon: zoneGeometry.centroid.longitude,
          lat: zoneGeometry.centroid.latitude,
          radiusMeters: zoneGeometry.sweepRadiusM ?? 0,
        },
      };
    } else {
      await recordDemandSignal(zoneGeometry);
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

  const header = (
    <>
      <h1>Buscar vivienda</h1>
      <SearchTextForm value="" />
      <FilterBar params={rawSearchParams} activeCount={countTrayFilters(criteria)} />
      {suggestions !== null ? <ZoneSuggestions suggestions={suggestions} rawSearchParams={rawSearchParams} /> : null}
      {coverageNotice}
      {coverageStatusSection}
      <p>
        <a href={buildViewHref(rawSearchParams, view === 'map' ? 'list' : 'map')}>
          {view === 'map' ? 'Ver lista' : 'Ver mapa'}
        </a>
      </p>
    </>
  );

  // ROADMAP 2.6 (decisión 118) — la vista de mapa REEMPLAZA a la lista: una
  // sola consulta por vista, sin paginación. Todo el texto de esta sección se
  // renderiza en el servidor, así que el recuento y los avisos existen sin JS.
  if (view === 'map') {
    const { points, total, truncated } = await searchMapPoints(db, effectiveCriteria);
    const pointViews: readonly MapPointView[] = points.map((point) => ({
      id: point.id,
      lat: point.lat,
      lon: point.lon,
      priceLabel: formatPriceCents(point.minPriceCents),
      href: point.anchorListingId === null ? null : buildPropertyDetailHref(point.anchorListingId),
    }));

    return (
      <>
        {header}
        <AppliedFilters criteria={criteria} params={rawSearchParams} zoneName={zoneName} count={formatMapCount(total)} />
        <section aria-label="Mapa de resultados">
          {criteria.polygon === undefined ? (
            <p>
              Este recuento puede diferir del total de la lista: las viviendas sin ubicación no aparecen en el mapa.
            </p>
          ) : null}
          {truncated ? (
            <p>
              Mostrando {points.length} de {total}
            </p>
          ) : null}
          {total === 0 ? <p>Ninguna vivienda con ubicación coincide con estos filtros</p> : null}
          {criteria.polygon !== undefined && total === 0 ? <OutsideCoverageNotice /> : null}
          <p>Las posiciones del mapa pueden ser aproximadas.</p>
          <SearchMap points={pointViews} polygon={criteria.polygon ?? null} baseParams={rawSearchParams} />
          <noscript>
            <p>El mapa interactivo necesita JavaScript.</p>
            <a href={buildViewHref(rawSearchParams, 'list')}>Ver la lista de resultados</a>
          </noscript>
          {/* SMV-9 (ODbL): atribución también en el HTML del servidor. */}
          <p>
            © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
          </p>
        </section>
      </>
    );
  }

  const { results, hasNextPage } = await searchProperties(db, effectiveCriteria);

  return (
    <>
      {header}
      {/* DAS-11: en lista solo en la página 1 con 0 resultados; en páginas
          posteriores cero filas no prueba cero coincidencias. */}
      {criteria.polygon !== undefined && criteria.page === 1 && results.length === 0 ? (
        <OutsideCoverageNotice />
      ) : null}
      <AppliedFilters
        criteria={criteria}
        params={rawSearchParams}
        zoneName={zoneName}
        count={formatListCount(results.length, criteria.page, hasNextPage)}
      />
      {results.length === 0 ? (
        <p>No se encontraron viviendas con esos filtros.</p>
      ) : (
        <ul className="result-list">
          {results.map((result) => (
            <li key={result.id}>
              <ResultCard result={result} />
            </li>
          ))}
        </ul>
      )}
      <Pagination params={rawSearchParams} page={criteria.page} hasNextPage={hasNextPage} />
    </>
  );
}
