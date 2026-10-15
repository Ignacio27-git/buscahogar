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
import type { CoverageJobState, ZoneGeometry, ZoneSuggestion } from '@buscahogar/db';

import { AppliedFilters } from '@/components/applied-filters';
import { CoverageNotice, isReloadable, noticeForOutcome } from '@/components/coverage-notice';
import type { CoverageNoticeVariant } from '@/components/coverage-notice';
import { CoverageStatus } from '@/components/coverage-status';
import { CriteriaForm } from '@/components/criteria-form';
import { EmptyResults } from '@/components/empty-results';
import { FilterBar } from '@/components/filter-bar';
import { Pagination } from '@/components/pagination';
import { ResultCard } from '@/components/result-card';
import { SearchMap } from '@/components/search-map';
import type { MapPointView } from '@/components/search-map-types';
import { SearchTextForm } from '@/components/search-text-form';
import { SortPresets } from '@/components/sort-presets';
import { StepIndicator } from '@/components/step-indicator';
import { scopeEmptyResultsFilters, selectEmptyResultsKind } from '@/lib/empty-results';
import { formatPriceCents } from '@/lib/format-price';
import { PLACE_SUGGESTION_LIMIT, classifyPlaceMatches } from '@/lib/place-match';
import { buildPropertyDetailHref } from '@/lib/property-href';
import {
  buildCurrentHref,
  buildViewHref,
  buildZoneSelectionHref,
  canonicalizeFormSubmission,
} from '@/lib/search-href';
import {
  countAppliedFilters,
  describeAppliedFilters,
  formatListCount,
  formatMapCount,
  formatSearchIssue,
  rejectedParamKeys,
} from '@/lib/search-labels';
import { pickSearchReturnParams } from '@/lib/search-return-params';
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

// D.15 (F4, decisión 196): ids de las alertas de rechazo, a las que apuntan `aria-describedby` de
// los campos rechazados. Una por rama de la página: la de la home, la del panel y la del texto.
const FILTERS_ALERT_ID = 'filters-alert';
const CRITERIA_ALERT_ID = 'criteria-alert';
const SEARCH_TEXT_ALERT_ID = 'search-text-alert';

// D.15 (F2, decisión 194): id del texto de ayuda de teclado del mapa, que el lienzo enlaza con
// `aria-describedby` en el contenedor de Leaflet. El texto se pinta en el servidor, visible.
const MAP_KEYBOARD_HELP_ID = 'map-keyboard-help';

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
    // D.7 (decisión 160): sin jerga («q:») y con la salida a seguir. El límite de 200
    // se nombra porque es lo que la persona tiene que corregir.
    const message =
      typeof rawQ !== 'string'
        ? 'La dirección de la página repite el texto de búsqueda. Escríbelo de nuevo en el campo de arriba.'
        : rawQ.trim().length === 0
          ? 'El campo está vacío. Escribe qué vivienda buscas.'
          : 'Tu texto tiene más de 200 caracteres. Acórtalo y vuelve a pulsar «Convertir en filtros».';
    return (
      <>
        <h1>Buscar vivienda</h1>
        <StepIndicator current={1} />
        <SearchTextForm value={shown} errorId={SEARCH_TEXT_ALERT_ID} />
        <p id={SEARCH_TEXT_ALERT_ID} role="alert">
          {message}
        </p>
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
  const reviewIssues = validated.success ? [] : validated.error.issues;

  return (
    <>
      <h1>Buscar vivienda</h1>
      <StepIndicator current={2} />
      <SearchTextForm value={queryParsed.data} />
      <CriteriaForm
        values={interpretation.params}
        zoneChoices={zoneChoices}
        selectedZone={selectedZone}
        unrecognised={unrecognised}
        conflicts={interpretation.conflicts}
        issues={reviewIssues.map(formatSearchIssue)}
        criteria={validated.success ? validated.data : null}
        placeText={interpretation.placeText}
        rejectedKeys={rejectedParamKeys(reviewIssues)}
        alertId={CRITERIA_ALERT_ID}
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
  // D.7 (decisión 157): «inicio» se decide con lo ENVIADO, no con lo canonicalizado:
  // un envío del formulario de criterios con todo en blanco canonicaliza a vacío
  // pero no es el inicio.
  const isPlainHome = Object.keys(submittedParams).length === 0;
  const parsed = searchQuerySchema.safeParse(rawSearchParams);

  // ROADMAP 2.6 (decisión 118): `view` tiene esquema propio, fuera del
  // criterio. Un valor inválido es el mismo rechazo nombrado que cualquier
  // otro parámetro, nunca un valor por defecto silencioso.
  const viewParsed = searchViewSchema.safeParse(rawSearchParams.view);

  if (!parsed.success || !viewParsed.success) {
    const issues = [
      ...(parsed.success ? [] : parsed.error.issues),
      // `view` se valida suelto (su esquema no es un objeto): sus problemas llegan sin camino y
      // se les pone el de la clave para que el detalle lleve su rótulo.
      ...(viewParsed.success ? [] : viewParsed.error.issues.map((issue) => ({ ...issue, path: ['view'] }))),
    ];
    // D.6a: la barra se pinta con lo recibido para poder corregirlo, pero no
    // reenvía como oculto ningún parámetro que el esquema haya rechazado.
    const rejectedKeys = new Set<string>(rejectedParamKeys(issues));
    if (!viewParsed.success) {
      rejectedKeys.add('view');
    }
    return (
      <>
        <h1>Buscar vivienda</h1>
        <SearchTextForm value="" />
        <p id={FILTERS_ALERT_ID} role="alert">
          Algún filtro no es válido; corrígelo abajo y vuelve a buscar. Detalle: {issues.map(formatSearchIssue).join(' ')}
        </p>
        <FilterBar params={rawSearchParams} rejectedKeys={rejectedKeys} alertId={FILTERS_ALERT_ID} open />
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
  // solo puede venir de una zona resuelta.
  //
  // D.18 (decisión 224, reemplaza la 213 y enmienda la 190): una zona con centroide Y radio de
  // barrido SIEMPRE se aplica (`effectiveCriteria.geo`), cubierta o no; la resolución de cobertura
  // no cambia y solo decide el aviso. Una zona inlocalizable (desconocida, o sin centroide o sin
  // radio) no consulta nada: lista vacía y su aviso. Antes degradaba a una búsqueda sin zona.
  // D.13 (decisión 181): un único `now` por petición; el aviso lo muestra
  // `CoverageNotice` (única región viva) y el enlace de recarga solo aparece
  // donde recargar puede cambiar el estado.
  const now = new Date();
  let coverageVariant: CoverageNoticeVariant | null = null;
  let coverageJob: CoverageJobState | null = null;
  let effectiveCriteria = criteria;
  // Nombre del municipio ya resuelto para el chip de zona: sin consulta nueva.
  let zoneName: string | null = null;
  let zoneUnlocatable = false;

  if (criteria.zone !== undefined) {
    const zoneGeometry = await resolveZoneGeometry(db, criteria.zone);
    zoneName = zoneGeometry?.municipality ?? null;

    if (zoneGeometry === null) {
      coverageVariant = { kind: 'unknown-zone' };
      zoneUnlocatable = true;
    } else {
      await recordDemandSignal(zoneGeometry);
      if (!(zoneGeometry.state === 'covered' && zoneGeometry.centroid !== null)) {
        const newZonesDailyCap = resolveNewZonesDailyCap();
        // ROADMAP 1.15 (security-hardening, diseño decisión 079): resuelto
        // ANTES de resolveCoverageForZone — cuando el limitador por cliente
        // está deshabilitado (D1a), devuelve `null` sin llamar a
        // `next/headers` en absoluto (validador notes obs #263).
        const clientLimit = await resolveCoverageClientLimit();
        const outcome = await resolveCoverageForZone(db, getCoverageDb, zoneGeometry, newZonesDailyCap, clientLimit);
        // spec #261 (D6): el tope por cliente es un resultado DISTINTO del global;
        // `noticeForOutcome` los mantiene separados.
        coverageVariant = noticeForOutcome(outcome, zoneGeometry.municipality, now);
        coverageJob = outcome.kind === 'registered' ? outcome.job : null;
      }
      if (zoneGeometry.centroid !== null && zoneGeometry.sweepRadiusM !== null) {
        effectiveCriteria = {
          ...criteria,
          geo: {
            lon: zoneGeometry.centroid.longitude,
            lat: zoneGeometry.centroid.latitude,
            radiusMeters: zoneGeometry.sweepRadiusM,
          },
        };
      } else {
        zoneUnlocatable = true;
      }
    }
  }

  // D.17 (B5): un solo panel. El aviso (región viva), la frase de refresco automático y, al final, el
  // enlace de recarga; el orden del DOM es el visual y no queda hueco entre el panel y «Ver mapa».
  const coverageSection =
    coverageVariant === null ? null : isReloadable(coverageVariant) ? (
      <section aria-label="Actualización de la zona" className="coverage-panel">
        <CoverageNotice variant={coverageVariant} />
        {coverageJob !== null ? <CoverageStatus job={coverageJob} /> : null}
        <p className="coverage-panel__reload">
          <a href={buildCurrentHref(rawSearchParams)}>Comprobar de nuevo</a>
        </p>
      </section>
    ) : (
      <CoverageNotice variant={coverageVariant} />
    );

  // D.17 (B6): los pasos «Describe · Revisa · Busca» solo se muestran en la home sin parámetros y en
  // la revisión de `?q=`: son el recorrido del texto libre. Con una búsqueda ya hecha (filtros, zona,
  // mapa) la persona ya salió de ese recorrido y el indicador sería ruido sobre los resultados.
  const header = (
    <>
      <h1>Buscar vivienda</h1>
      {isPlainHome ? <StepIndicator current={1} /> : null}
      <SearchTextForm value="" />
      <FilterBar params={rawSearchParams} activeCount={countAppliedFilters(criteria)} />
      {suggestions !== null ? <ZoneSuggestions suggestions={suggestions} rawSearchParams={rawSearchParams} /> : null}
      {coverageSection}
      <p className="view-toggle">
        <a href={buildViewHref(rawSearchParams, view === 'map' ? 'list' : 'map')}>
          {view === 'map' ? 'Ver lista' : 'Ver mapa'}
        </a>
      </p>
    </>
  );

  // D.8a (decisión 163, enmienda la 118) — lista y mapa conviven: toda petición
  // válida corre las DOS consultas, en paralelo y una sola vez, y renderiza las
  // dos secciones. `view` solo decide, por CSS bajo 64rem, cuál se ve; desde 64rem
  // se ven ambas. Todo el texto de la sección del mapa se renderiza en el
  // servidor, así que el recuento y los avisos existen sin JS.
  // D.18 (decisión 224): una zona inlocalizable no consulta nada; el vacío lo explica su aviso.
  const [{ results, hasNextPage }, { points, total, truncated }] = zoneUnlocatable
    ? [
        { results: [], hasNextPage: false },
        { points: [], total: 0, truncated: false },
      ]
    : await Promise.all([searchProperties(db, effectiveCriteria), searchMapPoints(db, effectiveCriteria)]);
  // D.9 (decisión 171): una sola vez; las filas llevan los parámetros de la búsqueda
  // (con `page`) a la ficha. Los puntos del mapa siguen planos: el popup los añade en el cliente.
  const returnParams = pickSearchReturnParams(rawSearchParams, { includePage: true });
  // D.14 (decisión 190): qué explica cada sección vacía. Con un polígono las dos consultas dan el
  // mismo total. El alcance se calcula una vez y lo comparten la lista y el mapa. D.18 (224): la
  // zona es un filtro más; solo el polígono vacío se acota.
  const polygonEmpty = criteria.polygon !== undefined && total === 0;
  const emptyScope = scopeEmptyResultsFilters({
    filters: describeAppliedFilters(criteria, zoneName),
    polygonEmpty,
  });
  const listEmptyKind =
    results.length === 0
      ? selectEmptyResultsKind({ page: criteria.page, polygonEmpty, filters: emptyScope.filters })
      : null;
  const mapEmptyKind =
    total === 0 ? selectEmptyResultsKind({ page: 1, polygonEmpty, filters: emptyScope.filters }) : null;
  const pointViews: readonly MapPointView[] = points.map((point) => ({
    id: point.id,
    lat: point.lat,
    lon: point.lon,
    priceLabel: formatPriceCents(point.minPriceCents),
    href: point.anchorListingId === null ? null : buildPropertyDetailHref(point.anchorListingId),
  }));

  return (
    <>
      {/* D.13b: los grupos de la cabecera comparten un ritmo vertical (gap de 1rem). */}
      <div className="search-header">
        {header}
        {/* D.18 (decisión 227): ordenación como enlaces predefinidos; solo con resultados. */}
        {results.length > 0 ? (
          <SortPresets params={rawSearchParams} sort={criteria.sort} dir={criteria.dir} />
        ) : null}
        {/* El recuento de la lista vive aquí, compartido por las dos secciones. */}
        <AppliedFilters
          criteria={criteria}
          params={rawSearchParams}
          zoneName={zoneName}
          count={formatListCount(results.length, criteria.page, hasNextPage)}
        />
        {/* DAS-11: región compartida; con polígono las dos consultas dan el mismo
            total, así que M === 0 vale también en páginas posteriores de la lista. */}
        {polygonEmpty ? <CoverageNotice variant={{ kind: 'outside-polygon' }} /> : null}
      </div>
      <div className="search-results" data-view={view}>
        <section aria-label="Resultados" className="search-results__list">
          {results.length === 0 ? (
            listEmptyKind !== null ? (
              <EmptyResults kind={listEmptyKind} params={rawSearchParams} keepOnClear={emptyScope.keepOnClear} />
            ) : null
          ) : (
            <ul className="result-list">
              {results.map((result) => (
                <li key={result.id}>
                  <ResultCard result={result} returnParams={returnParams} />
                </li>
              ))}
            </ul>
          )}
          <Pagination params={rawSearchParams} page={criteria.page} hasNextPage={hasNextPage} />
        </section>
        <section aria-label="Mapa de resultados" className="search-results__map">
          <p className="font-semibold tabular-nums">{formatMapCount(total)}</p>
          {truncated ? (
            <p>
              Mostrando {points.length} de {total}
            </p>
          ) : null}
          {/* El marco es del servidor: el aviso de carga, el lienzo y el noscript
              comparten dimensiones, y sin JS el noscript queda dentro del marco. */}
          <div className="search-map__frame">
            <SearchMap
              points={pointViews}
              polygon={criteria.polygon ?? null}
              baseParams={rawSearchParams}
              keyboardHelpId={MAP_KEYBOARD_HELP_ID}
            />
            <noscript>
              <p>El mapa interactivo necesita JavaScript.</p>
              <a href={buildViewHref(rawSearchParams, 'list')}>Ver la lista de resultados</a>
            </noscript>
          </div>
          {/* D.17 (B3): sobre el mapa solo va el recuento; los avisos, con la ayuda de teclado, en un pie. */}
          <div className="search-map__notes">
            {/* El vacío del mapa va aquí y no entre el recuento y el marco: así el marco queda alineado con la
                primera caja de la lista también sin viviendas con ubicación. */}
            {mapEmptyKind === 'filtered' ? <p>Ninguna vivienda con ubicación coincide con tu búsqueda.</p> : null}
            {mapEmptyKind === 'unfiltered' ? <p>Todavía no hay viviendas con ubicación.</p> : null}
            <p id={MAP_KEYBOARD_HELP_ID}>
              Con el mapa enfocado, usa las flechas para moverte y + o − para acercar o alejar. Con Tab llegas a cada
              vivienda y con Intro abres su ventana.
            </p>
            <p>Las posiciones del mapa pueden ser aproximadas.</p>
            {criteria.polygon === undefined ? (
              <p>
                Este recuento puede diferir del total de la lista: las viviendas sin ubicación no aparecen en el mapa.
              </p>
            ) : null}
          </div>
          {/* SMV-9 (ODbL): atribución también en el HTML del servidor. */}
          <p>
            © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
          </p>
        </section>
      </div>
    </>
  );
}
