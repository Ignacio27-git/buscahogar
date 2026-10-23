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
  teselas las descarga el navegador, no el servidor (decisión 112). Desde el paso 3.4 la plantilla de
  teselas, el host de la CSP y la atribución salen de `TILE_URL_TEMPLATE`/`TILE_ATTRIBUTION`
  (`lib/tile-config.ts`, decisión 261): OpenStreetMap por defecto, o un proveedor propio https con un
  único host y, si hace falta, una clave **publicable** restringida por dominio en la consulta (llega
  a todos los navegadores; nunca un secreto). El servidor las pasa al mapa como props. La CSP se evalúa
  al compilar: en Vercel un cambio exige redesplegar.
- Búsqueda en lenguaje natural (3.1): `interpretSearchText` (`core`, función pura y determinista)
  convierte la frase en una `NlSearchInterpretation`, que se valida con el mismo `searchQuerySchema`
  que los filtros. La rama `?q=` de `page.tsx` solo interpreta y muestra el resultado en un formulario
  editable (el envío lleva `form=criteria`): no ejecuta la búsqueda ni toca cobertura, señales ni
  cuota. El lugar se resuelve contra nuestra base de datos (`suggestZones`, solo lectura) y solo una
  coincidencia exacta selecciona la zona. Decisiones 120-124.
- Ordenación (D.18, decisión 227): cinco presets como enlaces (`lib/sort-presets.ts`, `buildSortHref`), sin JavaScript. El parámetro `order`
  solo existe en el formulario de revisión de `?q=` y `canonicalizeFormSubmission` lo convierte en `sort`/`dir`. La caja de lenguaje natural es
  `<search><details>` (decisión 228). Con centroide y radio, la zona se aplica siempre (decisión 224).
- El e2e lee con `web_readonly` y solo escribe contadores del limitador: el servidor «limitado» (puerto 3101) recibe un rol e2e-only creado
  por el seed (`web_limiter_e2e`, S/I/U/D solo sobre `proxy_rate_limit`, misma base `_e2e`); el servidor de 3100 no tiene credencial de
  escritura ni limitador (decisión 265, enmienda la 135).
- La imagen Docker de e2e fija Liberation Sans con una regla de `fontconfig` verificada en la build (decisión 217); el peso 600 se pinta como Bold.
- El sistema visual está documentado en `DESIGN.md` (raíz) y `.impeccable/design.json`, derivados de `globals.css`; `test/design-md.test.ts`
  comprueba que no se desvían (decisión 216).
- Las rutas de error solo para e2e se inyectan en tiempo de build únicamente dentro de la imagen Docker de e2e, desde
  `apps/web/e2e/inject/`, y nunca existen en `src/app`; un test de frontera lo vigila (decisión 209).
- No se usan TanStack Query ni Zustand en la ruta principal.
- Imágenes remotas servidas mediante la optimización de imágenes de Next; no se almacenan.

## Infraestructura

Docker Compose con tres servicios: PostgreSQL con PostGIS, `web`, `ingestion`, más el servicio de un solo uso `deploy` (perfil propio,
sin reinicio).

### Despliegue (paso 3.4, S4, decisiones 257 y 264)

Un único punto de entrada, `apps/ingestion/scripts/deploy.ts` (compilado a `dist-runtime/scripts/deploy.js` con
`pnpm --filter @buscahogar/ingestion build:runtime`), ejecuta los pasos de `@buscahogar/db/deploy` contra la **URL directa** del
propietario (`DIRECT_DATABASE_URL`, obligatoria y sin respaldo en `DATABASE_URL`):

1. **Conexión** (base inaccesible: salida 3).
2. **Migraciones** con el migrador de `drizzle-orm` (mismo registro que `drizzle-kit`, que no viaja a producción).
3. **Roles**: `web_readonly` y `web_coverage` se crean si faltan, con el verificador SCRAM-SHA-256 calculado en Node a partir de
   `WEB_READONLY_PASSWORD` / `WEB_COVERAGE_PASSWORD`. Si el rol existe y entra con el secreto actual, no se toca; solo se rota ante un
   28P01. Tras crear o rotar se vuelve a iniciar sesión; si falla, salida 4.
4. **Privilegios**: `bootstrap-roles-grants.sql` (GRANT primero, REVOKE al final) con huella de ACL antes y después.
5. **Catálogo municipal** (se omite si ya está completo) y **cuota mensual** (solo si la fuente no tiene ninguna fila y hay
   `SEED_MONTHLY_QUOTA_TOTAL` y `SEED_MONTHLY_QUOTA_RESERVE`; sin ellas, aviso y el worker sigue cerrando en fallo).
6. **Comprobaciones**: `SHOW jit` como `web_readonly` (si no es `off`, respaldo `ALTER DATABASE ... SET jit = off` y nueva comprobación)
   y matriz de privilegios efectivos de los dos roles (las tablas solo del propietario, invisibles para ambos).

Salidas: 0 hecho (incluida una ejecución sin cambios: `0 migrations, roles unchanged, privileges unchanged, seeds skipped`), 1 paso
fallido (nombrado), 2 configuración, 3 base inaccesible, 4 comprobación fallida. Una línea JSON por evento, sin secretos. Cada paso se
puede repetir. `WEB_READONLY_ROLE` y `WEB_COVERAGE_ROLE` permiten otros nombres de rol (dos entornos en un servidor; pruebas).

### Worker en producción (paso 3.4, S5a, decisión 258)

El worker se ejecuta como JavaScript compilado (`pnpm --filter @buscahogar/ingestion build:runtime` →
`dist-runtime/scripts/coverage-worker.js`) dentro de la imagen `apps/ingestion/Dockerfile`, que también ejecuta el despliegue con otro
comando. Construcción: `docker compose --profile app build ingestion` (contexto: la raíz del monorepo). Etapa `build` con
`node:22.23.4-bookworm-slim` y `pnpm@11.25.0` (`pnpm install --frozen-lockfile --filter "@buscahogar/ingestion..."`, compilación de
`core`/`db`/`ingestion` y `pnpm deploy --legacy --prod`: pnpm 11 exige `--legacy` salvo con `inject-workspace-packages=true`); etapa final
sin pnpm, `tsx` ni fuentes, como usuario `node`, `WORKDIR /app/apps/ingestion`. Compose no fija **política de reinicio** (es del host,
paso 3.5), sí `init: true` y `stop_grace_period: 20s`.

Dentro del proceso (`src/ops/`, orquestado por `worker-process.ts`; `scripts/coverage-worker.ts` solo cablea lo real y es el único lector de
`process.env`):

- **Registro**: una línea JSON por evento (`ts`, `level`, `component`, `msg` + campos) sin secretos (redacción de los valores
  configurados).
- **Arranque**: configuración inválida → `fatal`, espera de 30 s interrumpible, salida 2; conexión inicial con backoff 1 → 60 s y 8 intentos,
  salida 3 si sigue inaccesible; avisos de producción (`HEARTBEAT_URL` sin definir) una vez.
- **Supervisor**: caída inesperada → espera `min(1 s · 2^n, 300 s)`, cuenta que se reinicia tras 600 s estables, salida 1 a la décima
  caída seguida.
- **Parada** (SIGTERM/SIGINT): se interrumpen las esperas, no se arrancan ticks ni trabajo nuevo, y el barrido en curso termina **en el
  límite de página** con el desenlace `budget-exhausted` (job a `pending`, cursor confirmado, presupuesto reconciliado). Plazo
  `WORKER_STOP_GRACE_MS` (8000); vencido, o con una segunda señal, salida 1.
- **Latido**: `HEARTBEAT_URL` opcional; GET tras un tick correcto como mucho cada `HEARTBEAT_MIN_INTERVAL_MS` (60 000), con tiempo límite de
  5 s, contado en el presupuesto de salidas del tick (`MAX_OUTBOUND_CALLS_PER_TICK`, 4); un fallo se registra y no es fatal.

Salidas del worker: 0 parada limpia · 1 diez caídas seguidas o salida forzada · 2 configuración · 3 base inaccesible.

#### Arrendamiento del job y recuperación de `running` abandonados (paso 3.4, S5b, decisión 258 parte 2)

Un `SIGKILL`, un fallo del host o un OOM matan al worker sin parada ordenada y dejan su job en `running`, que ni la selección ni el reclamo
tocan (protegen al worker vivo). La migración `0021` añade `coverage_jobs.lease_renewed_at` (nullable): `claimJob` lo fija con el reloj
de la base de datos y cada avance de cursor de `persistPage` lo renueva en la misma transacción. En cada tick, antes de elegir trabajo (el
primero es el arranque), `reclaimStaleRunningJobs` pasa a `failed` (`error = 'stale-running-reclaimed'`) los jobs `running` cuyo
`coalesce(lease_renewed_at, started_at, requested_at)` supera `STALE_RUNNING_JOB_AFTER_MS` (900000 por defecto, mínimo 120000), como
mucho 50 por pasada. Se conservan el cursor y `cycle_started_at` (se retoma donde quedó) y `attempts` ya incluye el intento del worker muerto,
de modo que `COVERAGE_JOB_MAX_ATTEMPTS` (3) acota a un job que mata al worker. Cada pasada con resultados registra
`stale-running-reclaimed count=N job_ids=… alert_key=stale-reclaim:<día UTC>` y llama al gancho de alerta (la alerta se envía en S6).

- **Libro de cuota:** la recuperación no lo toca. La reserva del tick abortado queda sin conciliar: sobre-conteo, la dirección segura (decisión
  248), acotado por `MAX_SEARCH_REQUESTS_PER_SWEEP` + `TOKEN_RESERVE` por incidente.
- **Un solo worker (decisión 252):** con varios, un dueño lento podría terminar un job ya reclamado (benigno: `finishJob` fija el estado final).
- **Privilegios:** sin cambios (`web_coverage` solo `INSERT` en `coverage_jobs`, a nivel de tabla; `web_readonly` solo `SELECT`).
- **Respaldo manual:** el procedimiento de reclamación manual con SQL se documenta en el runbook, `docs/DEPLOYMENT.md`, apartado «Jobs
  `running` atascados».

#### Avisos operativos por Telegram (paso 3.4, S6, decisión 259)

El worker avisa al operador por Telegram de lo que hasta ahora solo quedaba en el registro. Todo vive en `apps/ingestion` (`apps/web` no
hace ninguna llamada externa) y la lógica es pura en `packages/core/src/alerts/`:

- `evaluateAlertChecks(foto, config)` convierte una foto del estado en candidatos `{dedupKey, severity, text, cooldownMs}`: jobs `failed`
  en la ventana (≥ umbral; un solo aviso agregado), jobs `running` recuperados (`stale-reclaim:<día UTC>`, el gancho
  `onStaleJobsReclaimed` de la decisión 258), cuota mensual al 80 % / 100 % / ausente (`quota-80:<mes>`…), reservas denegadas hoy y
  arranque del worker (enfriamiento de 1 h).
- `selectAlertsToSend` aplica el enfriamiento contra el último envío **persistido**, ordena por gravedad y respeta el tope: como mucho
  3 mensajes por tick y las plazas libres del presupuesto de salidas; el exceso se pliega en un resumen «+N avisos más».
- Tick (`runCoverageWorker`): al terminar sin lanzar se crea UN `OutboundBudget` (`MAX_OUTBOUND_CALLS_PER_TICK`, 4); corre el paso de avisos
  (`onAlertStep`) y después el latido, cada uno aislado. Los avisos dejan siempre 1 plaza para el latido.
- `alert_dispatch_log(dedup_key PK, last_sent_at)` (migración `0022`) guarda lo enviado, así que un reinicio dentro del enfriamiento no
  reenvía. Es una tabla **solo del propietario**: `REVOKE ALL` a `web_readonly` y `web_coverage` en la migración y en el bloque final del
  bootstrap, y presente en `OWNER_ONLY_TABLES` (matriz del `deploy`).
- Notificador (`src/alerts/telegram-notifier.ts`): `POST /bot<token>/sendMessage`, secuencial, ≥ 1000 ms entre mensajes, 5 s de tiempo
  límite, nunca lanza y el token se elimina de los errores. Sin `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (las dos o ninguna) los avisos
  quedan desactivados: cero lecturas y cero red.
- Pruebas: Telegram falso (`scripts/fake-telegram.ts`, `TELEGRAM_API_BASE_URL`), servidor HTTP en el bucle local; nunca la API real.

Fuera del alcance: colas externas, Redis, caché distribuida, autenticación.

### Copias de seguridad (paso 3.4, S7, decisión 260)

La base de datos se copia a un almacenamiento compatible con S3, cifrada antes de salir del host, con retención acotada y un simulacro de
restauración que prueba que la copia sirve. Todo vive en `ops/backup/` (bash); `apps/web` no interviene (NF1).

```
pg_dump -Fc (URL directa) ─► age -r $AGE_RECIPIENT ─► $TMP.age (0700, trap) ─► rclone copyto <n>.uploading
        ─► rclone size (= tamaño local) ─► rclone moveto <prefijo>-AAAAMMDDTHHMMSSZ.dump.age ─► retention.sh prune
```

- **Sin texto plano en disco.** El volcado pasa por una tubería directa a `age`; en disco solo hay texto cifrado, en un directorio temporal
  0700 que se borra en cualquier salida (éxito, error, `SIGINT`, `SIGTERM`). La tubería corre en su propio grupo de procesos para poder
  pararla a mitad. Del host solo se conoce la clave **pública** (`AGE_RECIPIENT`); la privada nunca está en el repositorio, la imagen ni el
  host de la copia (`ops/backup/README.md`).
- **Una subida a medias no es una copia.** Se sube como `<nombre>.uploading`, se verifica el tamaño y solo entonces se publica. La poda
  corre únicamente tras una publicación verificada; un fallo de cualquier paso sale con código 1 y no borra nada.
- **Retención 7 diarias + 4 semanales + 3 mensuales** (constantes de `retention.sh`, iguales a las que publica la página de privacidad):
  `daily` = los 7 días más recientes con copia, `weekly` = los 4 domingos más recientes no conservados, `monthly` = los 3 días 01 más
  recientes no conservados. La más reciente nunca se borra.
- **Códigos de salida:** 0 hecho · 1 un paso falló (volcado, cifrado, subida, retención) · 2 configuración inválida, antes de usar la red ·
  3 base o almacenamiento inaccesibles · 4 comprobación del simulacro fallida. Cada fallo escribe una línea JSON de nivel `error`.
- **Imagen** (`ops/backup/Dockerfile`): `backup` (pg_dump 17 + age + rclone) y `drill` (más `node` y `apps/ingestion/dist-runtime`).
- **Simulacro** (`restore-drill.sh`): descarga la última copia → descifra en streaming → `pg_restore --no-owner --no-privileges
  --single-transaction` en una base vacía → `deploy.js` (migraciones, roles, privilegios, jit) → `restore-verify.js`: extensión PostGIS,
  tablas núcleo, recuentos de filas, diario de migraciones = ficheros y la matriz de privilegios del despliegue (`checkPrivilegeMatrix`).
  Un desajuste sale con código 4 y nombra la comprobación. Rechaza un destino no vacío o igual al origen.
- **Pruebas:** `ops/backup/test/e2e.sh` (MinIO + dos PostGIS en `ops/backup/compose.yml`, aparte y sin volúmenes; claves age generadas en
  cada ejecución) y `retention.test.sh` (selección pura, sin Docker, también desde vitest).

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
  `X-Powered-By`. `img-src` admite UN solo host de teselas: el del proveedor configurado, OpenStreetMap
  por defecto (decisiones 112 y 261).
- Salud (paso 3.4, S2): `GET /api/health` hace `select 1` con la credencial de solo lectura y un plazo
  de 1 s; responde `{"status":"ok"}` (200) o `{"status":"degraded"}` (503), sin ningún otro campo, sin
  caché y sin llamadas externas. El proxy no la limita (decisión 255).
- Indexación (decisión 262): `SITE_INDEXING` apagado por defecto. Apagado, `robots.txt` con
  `Disallow: /`, `noindex, nofollow` en las páginas y `/sitemap.xml` con 404; encendido (con
  `SITE_URL`), se permite el rastreo y el mapa del sitio expone la home y las páginas legales. Se
  resuelve al compilar en Vercel.
- Páginas legales y pie (paso 3.4, S3, decisión 263): `/legal/privacy`, `/legal/cookies` y `/legal/notice`
  son Server Components estáticos en español, sin scripts ni llamadas externas, enlazados desde el pie
  de toda página (`components/site-footer.tsx`, único `contentinfo`, con la atribución CC-BY del IGN/CNIG).
  Las cifras de conservación del texto son las del sistema (180 días de señales y de tombstone, importadas
  de `packages/core`). La identidad del titular sale de `LEGAL_OWNER_NAME`, `LEGAL_OWNER_TAX_ID`,
  `LEGAL_OWNER_ADDRESS` y `LEGAL_OWNER_EMAIL` (opcionales; sin definir se muestran marcadores visibles).
  La única cookie es `theme`; `test/cookie-allowlist.test.ts` y el e2e lo vigilan.
- Módulos de `apps/web/src/server` con handles de base de datos o secretos guardados con
  `import 'server-only'`, para que un import accidental desde código de cliente falle en build.
- Secretos en variables de entorno, fuera del control de versiones.
