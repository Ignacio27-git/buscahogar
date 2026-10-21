# Arquitectura

## Estructura

```text
apps/
  web/            Next.js (App Router) — interfaz y consultas de búsqueda
  ingestion/      worker Node — scheduler, adaptadores, pipeline, coverage jobs
packages/
  core/           modelo común, contratos, estrategias de deduplicación
  db/             esquema y cliente de base de datos
  config/         configuración compartida de TypeScript y linting
```

`web` e `ingestion` dependen de `core` y `db`. No se conocen entre sí; su única vía de
comunicación es la base de datos.

`core` no importa Next ni el ORM. Contiene el modelo de dominio y la lógica pura, lo que
permite testearla de forma aislada.

## Pipeline de ingesta

```text
API de la fuente
      ↓
Adaptador           respuesta cruda → RawListing
      ↓
Normalizador        RawListing → Listing
      ↓
tablas listings +   identidad del anuncio (listings) + instantáneas de precio y
listing_versions    contenido (listing_versions), una por versión
      ↓
Deduplicación       bloqueo + puntuación
      ↓
tabla properties    vivienda canónica
      ↓
Next.js — búsqueda
```

Los tres primeros pasos se ejecutan por fuente. Los dos últimos son globales y pueden
lanzarse por separado sobre datos ya persistidos, sin gastar cuota.

## Contratos

```typescript
interface PropertySource<T = unknown> {
  readonly id: string;
  fetchArea(area: AreaQuery, cursor?: string): Promise<SourcePage<T>>;
}

interface ListingNormalizer<T> {
  normalize(raw: T): Listing;
}

interface DedupStrategy {
  readonly name: string;
  readonly version: string;
  score(a: Listing, b: Listing): SimilarityResult;
}
```

`SourcePage<T = unknown>` incluye `nextCursor`, el cursor siguiente, para poder reanudar un
barrido interrumpido sin repetir peticiones. `T` es siempre el payload crudo de la fuente,
antes de normalizar — nunca un `Listing`.

`DedupStrategy.version` acompaña a `name` porque `property_listings.strategy_version` es
`NOT NULL` y no existe otra fuente de dominio para ese valor (decisión 020).

`SimilarityResult` incluye la puntuación total **y el desglose por señal**.

## Modelo de datos

- **`listings`** — identidad estable de un anuncio: un registro por anuncio y fuente,
  nunca sobrescrito.
- **`listing_versions`** — histórico de instantáneas de un anuncio, en orden de aparición:
  cada cambio de precio o contenido añade una versión nueva en lugar de modificar la
  existente. La versión vigente se marca con `is_current`.
- **`listing_features`** — amenities de una versión concreta de un anuncio (relación con
  `features`); cuelga de la versión, no de la identidad, porque una versión es una
  instantánea completa.
- **`properties`** — vivienda canónica; agrupación de uno o varios listings.
- **`property_listings`** — relación, con puntuación, desglose por señal y estrategia que
  produjo la decisión.
- **`sources`** — fuentes registradas.
- **`zones`** — zonas cubiertas: identificador canónico, estado, fecha del último barrido.
- **`coverage_jobs`** — cola de barridos (`pending`, `running`, `done`, `failed`), un job por
  (zona, fuente, **operación**) (decisión 250): venta y alquiler de una zona son jobs independientes,
  con cursores independientes. `last_completed_at` es la cobertura de (zona, operación).
- **`locations`**, **`features`** — datos normalizados auxiliares.

## Cobertura bajo demanda

El ámbito es España, pero el índice crece según la demanda. La unidad de cobertura es el
**municipio**.

```text
Consulta del usuario
        ↓
Resolución a identificador canónico de zona
        ↓
   ¿zona cubierta?
        │
   sí ──┴── no
   │          │
resultados   se registra un coverage_job
inmediatos    ↓
             el worker barre, normaliza y deduplica la zona
              ↓
             la zona queda cubierta y entra en los ciclos de refresco
```

**Identidad de zona.** Distintas formulaciones de la misma ubicación deben resolver al
mismo identificador canónico, o se ingiere lo mismo varias veces y se gasta cuota. La
interfaz ofrece autocompletado sobre zonas canónicas en lugar de texto libre.

**Cola.** `coverage_jobs` en la propia base de datos. No se introduce Redis ni un sistema
de colas externo.

**Cobertura por operación (decisión 250).** La clave de un job es `(zone_id, source_id, operation)`
con `operation` en `sale`/`rent`, y los dos índices únicos (el total y el parcial de
`pending`/`running`) la incluyen: un par sale+rent pendiente de la misma zona convive. Una
(zona, operación) está cubierta si y solo si su job tiene `last_completed_at`, que fija
`finishJob(completed)` y ningún refresco ni fallo limpia. `zones.state` queda como agregado y no decide.
`presweep_requested_at` marca el trabajo parcial del presweep (decisión 253).

**Un único worker (decisión 252).** El worker de `apps/ingestion` sirve venta y alquiler: la
operación de cada barrido es la de su job (`PollJob.operation`), con ella se construye el área y se
reclama el job. La variable `OPERATION` se retiró y `readEnv` la rechaza al arrancar. La
verificación de presencia no filtra por operación y nomina según la operación del job.

**Cobertura en la búsqueda (decisión 251).** `apps/web` decide la cobertura por operación con `coverage_jobs.last_completed_at`,
no con `zones.state`. Con filtro de operación se exige esa operación; sin filtro, venta y alquiler. Se registra un job por
cada operación que falta y aún no tiene fila (el par sale+rent convive y no se duplica), y el aviso enseña el estado del job
más vivo. El tope global de zonas nuevas cuenta zonas distintas (una zona con dos jobs ocupa una plaza) y la cuota por cliente
se consume una vez por zona. La web sigue solo con `INSERT` sobre `coverage_jobs`: sin `GRANT` nuevo.

**Prioridad del worker (decisión 251).** El carril a demanda se ordena por días con señal de la zona en los últimos 30 días UTC
(más primero), después `requested_at` y `id`; el carril de refresco conserva `requested_at`. Las señales de demanda las
escribe `apps/web` y las lee el worker (`zone_query_signals`).

**Cuota.** Presupuesto diario de peticiones y tope de zonas nuevas por día y por sesión.
Degradación explícita al alcanzarlo.

**Cuota mensual por carril (decisión 248).** Toda petición a la fuente se reserva con una única función,
`reserveRequestBudget` (`packages/db/src/budget-ledger.ts`), contra `monthly_request_budget`: una fila por
(mes UTC, fuente) con `total_cap`, `reserve` y el gasto por carril. El total y la reserva solo se fijan con
`set-monthly-quota` (sin valores por defecto); un mes nuevo hereda de la fila anterior más reciente con los
contadores a 0, y sin ninguna fila previa **ningún** carril gasta (fail-closed). Los carriles son tres: el
**batch** (presweep y barrido manual), el **refresco** (barrido de refresco y verificación de presencia) y la
**demanda** (on-demand). Batch y refresco comparten `total − reserva`; solo la demanda puede gastar la reserva,
hasta `total`. El batch recibe una concesión parcial (`min(pedido, margen)`) y solo reserva contra el mes; el
refresco y la demanda reservan además contra el cupo diario en la misma transacción (un rechazo diario revierte
el paso mensual). Consecuencia asumida: un batch grande puede dejar sin margen al refresco el resto del mes. Las
reglas puras de techo viven en `packages/core/src/quota/monthly-allowance.ts`. El registro es del propietario
(`apps/ingestion`): ni `web_readonly` ni `web_coverage` tienen ningún privilegio sobre la tabla (REVOKE explícito
en la migración 0019 y en `bootstrap-roles-grants.sql`, después de los `GRANT`/privilegios por defecto), así que
`apps/web` no gana ningún `GRANT`.

**Presweep de las ciudades más pobladas (decisión 253).** `apps/ingestion/scripts/presweep-top-cities.ts` barre las
N ciudades con más población conocida (`locations.population`, decisión 249), venta y alquiler de cada una, contra el
carril batch del registro mensual. Flujo: preflight de solo lectura (cuota utilizable y techo del batch, antes de pedir
ningún token) → candidatos (`selectPresweepCandidates`, `packages/db`) → plan puro (`planPresweep`, `packages/core`) →
por unidad, concesión `min(tope por barrido, tope de la ejecución restante, margen mensual del batch)`, reserva batch,
barrido con tope duro igual a lo concedido, cursor persistido y reconciliación con el gasto real. `--top`,
`--max-requests` y `--max-requests-per-sweep` son obligatorios y sin valor por defecto; la cuota sale solo del
registro. Cada unidad acaba con un motivo (`unit-exhausted`, `per-sweep-cap`, `run-cap`, `monthly-batch-ceiling`,
`upstream-signal`) y una unidad completada no se vuelve a barrer. El presweep nunca se ejecuta en el servidor web ni
durante una búsqueda.

**Promoción de trabajo parcial (decisión 253).** El reclamo batch del presweep marca el job (`presweep_requested_at`). El
worker lo ignora salvo que la zona tenga al menos un día con señal de demanda en los últimos 30 días UTC (la ventana de la
prioridad); entonces lo trata como trabajo a demanda (puede gastar la reserva) y su reclamo limpia la marca. La señal la
escribe `apps/web` al buscar en la zona.

## Atribución de datos geográficos

El catálogo de municipios (centroide y radio de barrido por municipio, ROADMAP 1.13) se deriva
del Nomenclátor Geográfico de Municipios y Entidades de Población (NGMEP), publicado por el
Instituto Geográfico Nacional (IGN) a través del Centro Nacional de Información Geográfica
(CNIG), bajo licencia **CC-BY 4.0**, según lo exige la Orden FOM/2807/2015. La atribución es
visible al usuario en el pie de página de `apps/web` (`layout.tsx`, Server Component, sin coste
de JavaScript) y queda registrada, con su procedencia exacta (URLs de origen, fecha de descarga,
checksum, sistema de referencia verbatim del fichero), en la cabecera del propio artefacto de
catálogo committeado (`packages/db/src/municipality-catalogue.generated.ts`).

## Refresco y retención

Implementado en el paso 2.5 (decisiones 102-111). La política es pura (`packages/core/src/retention`),
la aplican `packages/db` y el tick del worker de `apps/ingestion`, y todo el tiempo se mide con el
reloj de Postgres (días UTC).

**Demanda y cadencia.** Cada búsqueda que resuelve a una zona registra una señal
`(zona, día)` en `zone_query_signals` (`web_coverage`, solo `INSERT`). Con `d` = días desde la
última señal (o desde `coverage_jobs.requested_at` si no hay):

| `d` (días) | Cadencia |
|---|---|
| ≤ 30 | semanal (vence a los 7 días del último barrido) |
| 31 – 90 | mensual (30 días) |
| 91 – 179 | en espera, nunca vence; una consulta nueva la devuelve a semanal |
| ≥ 180 | purga de zona |

**Refresco.** El mantenimiento del tick (primer tick y luego cada `MAINTENANCE_EVERY_TICKS`) re-encola
los jobs vencidos en un carril propio, tras los jobs a demanda. El vencimiento es **por (zona, operación)**:
cada operación vence según su propio `last_completed_at`. El gasto de refresco y de
verificación tiene un techo sobre el gasto total del día (`REFRESH_BUDGET_FRACTION` × tope diario);
con fracción 0 no hay refresco.

**Anuncio que desaparece.** Un barrido completo solo nomina: los anuncios activos de la zona no vistos
en el ciclo entran en una cola. Se confirman con una petición por lote (`adIds`, hasta 50) sobre el
carril de refresco, y solo se retiran (`inactive` / `delisted`) si la sonda ha demostrado que la API
omite los anuncios dados de baja (`DELISTED_OMISSION_CONFIRMED`); cualquier respuesta dudosa deja el
anuncio activo. La sonda del 2026-09-30 confirmó la omisión (fixture `adids-2026-09-30`), así que la
retirada por verificación está activa cuando lo está el carril de refresco. Un anuncio inactivo sale de la búsqueda (`active_listing_count > 0`), se
conserva y se reactiva si la fuente vuelve a publicarlo.

**Purga en dos planos.**

- *Zonas*, a los 180 días sin consultas: la zona vuelve a `uncovered` (la fila de `zones` es el
  catálogo INE y no se borra), se borran sus jobs (venta y alquiler; se purga solo si ninguno está en
  curso) y sus señales, y los anuncios que solo cubría su
  círculo pasan a `inactive` / `zone_purged`. No gasta cuota.
- *Anuncios*, a los 180 días inactivos: tombstone. Se redactan la descripción y el `raw` de todas sus
  versiones y la miniatura, y pasan a `removed`. Se conservan el historial de precios y la
  evidencia de deduplicación (`dedup_pair_evidence`). `property_listings` se recalcula en cada
  reproceso de dedup, así que su puntuación y desglose reflejan la consolidación vigente. Es irreversible salvo que
  la fuente vuelva a publicar el anuncio.

Cada paso del tick está aislado: una avería de uno no detiene los demás ni el barrido.

**Plazo de la fuente.** Si las condiciones de uso de una fuente fijan un plazo máximo de retención,
ese plazo prevalece. Hoy ninguna lo fija en lo que se ha podido comprobar (decisión 111); los 180
días son una elección del proyecto y viven como constantes en `policy.ts`.

## Capa web

- Server Components consultando `db` directamente para listado y detalle.
- Filtros en search params, no en estado de cliente. Incluye la zona dibujada (`polygon`) y la
  vista (`view=map`), ROADMAP 2.6.
- Vista de mapa (2.6): el servidor calcula los puntos (máximo 500) y el recuento; un único envoltorio
  de cliente carga Leaflet con `next/dynamic` y dibuja en el navegador (decisiones 113-119). Las
  teselas de OpenStreetMap las descarga el navegador, no el servidor (decisión 112).
- Búsqueda en lenguaje natural (3.1): `interpretSearchText` (`core`, función pura y determinista)
  convierte la frase en una `NlSearchInterpretation`, que se valida con el mismo `searchQuerySchema`
  que los filtros. La rama `?q=` de `page.tsx` solo interpreta y muestra el resultado en un formulario
  editable (el envío lleva `form=criteria`): no ejecuta la búsqueda ni toca cobertura, señales ni
  cuota. El lugar se resuelve contra nuestra base de datos (`suggestZones`, solo lectura) y solo una
  coincidencia exacta selecciona la zona. Decisiones 120-124.
- Ordenación (D.18, decisión 227): cinco presets como enlaces (`lib/sort-presets.ts`, `buildSortHref`), sin JavaScript. El parámetro `order`
  solo existe en el formulario de revisión de `?q=` y `canonicalizeFormSubmission` lo convierte en `sort`/`dir`. La caja de lenguaje natural es
  `<search><details>` (decisión 228). Con centroide y radio, la zona se aplica siempre (decisión 224).
- La imagen Docker de e2e fija Liberation Sans con una regla de `fontconfig` verificada en la build (decisión 217); el peso 600 se pinta como Bold.
- El sistema visual está documentado en `DESIGN.md` (raíz) y `.impeccable/design.json`, derivados de `globals.css`; `test/design-md.test.ts`
  comprueba que no se desvían (decisión 216).
- Las rutas de error solo para e2e se inyectan en tiempo de build únicamente dentro de la imagen Docker de e2e, desde
  `apps/web/e2e/inject/`, y nunca existen en `src/app`; un test de frontera lo vigila (decisión 209).
- No se usan TanStack Query ni Zustand en la ruta principal.
- Imágenes remotas servidas mediante la optimización de imágenes de Next; no se almacenan.

## Infraestructura

Docker Compose con tres servicios: PostgreSQL con PostGIS, `web`, `ingestion`.

Fuera del alcance: colas externas, Redis, caché distribuida, autenticación.

## Rendimiento

- Índices para los filtros frecuentes.
- Índice espacial GiST para el bloqueo geográfico.
- Objetivo de búsqueda sobre datos indexados: por debajo de 500 ms.
- Búsqueda con cobertura bajo demanda: sin umbral cerrado; se reporta el tiempo desglosado
  por fase.

## Seguridad

- Validación con Zod de toda entrada externa: search params, variables de entorno de `apps/web`
  (`env.ts`, un lector Zod por cada grupo de variables, parseado en tiempo de llamada) y argumentos/filas CSV del conversor
  del catálogo municipal (`apps/ingestion`).
- Credenciales de fuentes solo en `ingestion`, nunca en variables públicas. `apps/web` usa dos
  credenciales de PostgreSQL de alcance mínimo, ninguna de propietario: lectura y una escritura
  restringida al rol `web_coverage` (pasos 1.13 y 1.15, `CLAUDE.md`).
- Consultas parametrizadas vía ORM.
- Rate limiting en endpoints públicos: cuota diaria por cliente en PostgreSQL para el registro de
  cobertura bajo demanda (clave HMAC-SHA256, nunca la IP cruda) más un limitador de ventana fija
  **compartido en PostgreSQL** (tabla `proxy_rate_limit`, decisión 255, que enmienda la 074) en
  `apps/web/src/proxy.ts` para el resto de peticiones — **deshabilitado por defecto**, activo solo
  cuando `CLIENT_IP_HEADER` está configurado detrás de un proxy inverso de confianza que sobrescriba
  ese header (en Vercel, `x-forwarded-for`, que lleva una sola IP; una lista con comas cae en el
  cubo `unknown`). Todas las instancias cuentan sobre las mismas filas: una sola sentencia atómica
  (purga acotada de ventanas vencidas + upsert) y la decisión la toma `fixedWindowVerdict` de
  `packages/core`, la misma lógica de ventana fija de siempre. **Falla abierto**: si la base de
  datos no responde, tarda más de 200 ms en total o no se puede ni abrir el pool, la petición se
  permite y se emite una línea JSON de error (como mucho una cada 10 s por instancia, sin clave ni
  IP). El proxy se excluye en `/api/health`. Presupuesto de cuota frente a fuentes externas y cuota
  por cliente de cobertura sin cambios, siguen cerrando en fallo (`apps/ingestion`, decisión 077).
- Conexiones de `apps/web` (decisión 256): en producción las dos credenciales web usan la URL del
  **pooler** de conexiones (Neon `-pooler`), con pools pequeños (lectura 5, registro de cobertura 2,
  limitador del proxy 4 con plazos de 150 ms) fijados por `createDb(url, poolOptions)`; `apps/web`
  no usa sentencias preparadas con nombre, `SET` de sesión, `LISTEN`, bloqueos consultivos ni
  tablas temporales (lo comprueba una prueba estática). `apps/ingestion`, las migraciones y el
  aprovisionamiento usan la URL **directa**.
- Cabeceras de seguridad y política de contenido: CSP estática sin nonces + conjunto OWASP
  (HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`/
  `X-Frame-Options: DENY`, COOP, CORP, sin COEP) vía `headers()` en `next.config.ts`; sin
  `X-Powered-By`. `img-src` admite el host de teselas de OpenStreetMap (decisión 112).
- Módulos de `apps/web/src/server` con handles de base de datos o secretos guardados con
  `import 'server-only'`, para que un import accidental desde código de cliente falle en build.
- Secretos en variables de entorno, fuera del control de versiones.
