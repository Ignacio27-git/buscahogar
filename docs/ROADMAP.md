# Hoja de ruta

Secuencia de pasos para desarrollar el proyecto desde cero con Claude Code, con el prompt
exacto de cada uno, qué revisar antes de continuar y espacio para anotar lo ocurrido.

Es un documento vivo. Los pasos se reordenan, se parten o se descartan según avance el
desarrollo. Cuando eso pase, se anota el motivo en la propia entrada: esas desviaciones son
material para el capítulo de proceso de la memoria.

**Cómo usarlo.** Un paso por sesión de Claude Code, salvo que sean triviales. Revisar el
resultado antes de pasar al siguiente.

**Registro.** El agente actualiza la documentación al terminar cada tarea, según la sección
de registro obligatorio de `CLAUDE.md`. Eso cubre lo que el agente puede observar: sus
decisiones, sus errores corregidos y los prompts recibidos. Lo que el agente no puede
registrar es lo que hizo mal sin darse cuenta, así que las anotaciones que salgan de tu
revisión las añades tú.

Si al terminar un paso el agente no informa de qué documentación ha actualizado, pídeselo:
es señal de que la instrucción se ha perdido en el contexto.

**Estados:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[-]` descartado

---

# Fase 0 — Arranque

## [ ] 0.1 · Verificar que el contexto se ha cargado

**Objetivo.** Confirmar que Claude Code está leyendo la documentación antes de escribir nada.

```text
Antes de generar código, lee CLAUDE.md y docs/ARCHITECTURE.md y respóndeme sin
escribir ningún fichero:

1. Las reglas que consideras no negociables en este proyecto.
2. La diferencia entre las tablas listings y properties, y por qué están separadas.
3. Qué código puede llamar a las APIs externas y cuál no.

Si algo no está claro en la documentación, dímelo en lugar de suponerlo.
```

**Revisar.** Que las respuestas coinciden con lo escrito. Si algo falla aquí, el problema
está en la documentación y conviene corregirla antes de seguir.

**Notas:**

---

# Fase 1 — Sistema funcional de extremo a extremo

## [x] 1.1 · Esqueleto del monorepo

**Objetivo.** Estructura de carpetas, gestor de paquetes y TypeScript. Sin lógica.

```text
Monta el esqueleto del monorepo descrito en docs/ARCHITECTURE.md usando pnpm
workspaces. Necesito:

- apps/web (Next.js con App Router y TypeScript), apps/ingestion (proyecto Node
  con TypeScript), packages/core, packages/db, packages/config.
- TypeScript en modo estricto, con la configuración base compartida en
  packages/config y extendida por el resto.
- ESLint y Prettier configurados en packages/config y aplicados a todo el monorepo.
- Scripts en la raíz para dev, build, lint y test.
- .gitignore y .env.example con las variables previstas, sin valores reales.

No implementes lógica de negocio todavía: solo la estructura, la configuración y
los ficheros vacíos o con exports mínimos. Fija las versiones exactas en los
package.json y dime cuáles has elegido.
```

**Revisar.** Que la estructura coincide con `ARCHITECTURE.md`. Que `packages/core` no
depende de Next ni del ORM. Que `apps/web` y `apps/ingestion` no se importan entre sí.

**Después.** Anotar en `CLAUDE.md` la versión exacta de Next fijada, para reducir el riesgo
de que se cuelen patrones del Pages Router.

**Notas:**

Primera pasada (ciclo SDD): estructura de carpetas y ficheros de configuración creados,
pero SIN instalar ni verificar nada, con `react` fijado en una RC inventada y sin
`.env.example`. Marcado `[x]` en falso. Detalle en `AI-NOTES.md` (2026-09-04).

Ronda correctiva (2026-09-04): versiones corregidas a las fijadas abajo, `.env.example`
creado, `packageManager` restaurado, Tailwind v4 y runner de tests reañadidos, apps con
scope `@buscahogar/*`, `engines.node` alineado con Next 16, `--loader tsx` sustituido por
`tsx watch`, flat config de ESLint reestructurada. **Verificado de verdad:**

- `pnpm install` → OK, `pnpm-lock.yaml` generado y versionado.
- `pnpm -r build` → OK (core, db, ingestion con `tsc`; web con `next build`).
- `pnpm -r lint` → OK (5/5).
- `pnpm -r test` → OK (smoke tests de versión, 1 por paquete).

Tercera pasada — revisión completa (2026-09-04): la revisión manual encontró 13 hallazgos
que las cuatro puertas en verde no detectaban. Los cuatro serios: `apps/web` no aplicaba la
config ESLint compartida y se lintaba más laxo que el resto (verificado con
`eslint --print-config`); `engines.node: ">=20.9.0"` era insuficiente para el
`import.meta.filename` que usaba `apps/ingestion`, que en 20.9 devuelve `undefined` en
silencio; un clonado limpio no arrancaba porque los packages resuelven a `dist/`, que no se
versiona, y ningún script construía antes; y `packages/core` heredaba tipos del DOM,
debilitando en el typechecker la frontera que `CLAUDE.md` llama no negociable.

Todos corregidos. Además: linting con información de tipos (`strictTypeChecked`, de 68 a
123 reglas activas, con `no-floating-promises`), `test/` incluido en los tsconfig mediante
un `tsconfig.build.json` aparte, ficheros de configuración ya lintados, tests tautológicos
eliminados a favor de `passWithNoTests`, `.atl/` ignorado y `db:migrate` con mensaje
honesto. Decisiones 012 y 013; detalle en `AI-NOTES.md`.

**Estado verificado tras la revisión:**

- `pnpm install` → OK; `prepare` reconstruye los packages (clonado limpio comprobado).
- `pnpm -r build` → OK (5/5).
- `pnpm -r typecheck` → OK (5/5, script nuevo).
- `pnpm -r lint` → OK (5/5), con reglas de tipo activas y comprobadas contra un fichero de prueba.
- `pnpm -r test` → OK (2 tests de cadena de herramientas en `core`; el resto sin tests, por decisión 013).
- `pnpm format:check` → OK en todo el repo.

**Versiones exactas fijadas (sin `^` ni `~`):**

| Paquete                                              | Versión                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| next / eslint-config-next / @next/eslint-plugin-next | 16.3.4                                                                 |
| react / react-dom                                    | 19.2.8                                                                 |
| @types/react                                         | 19.2.18                                                                |
| @types/react-dom                                     | 19.2.7                                                                 |
| typescript                                           | 6.0.3 (no 7.0.2: `typescript-eslint` limita a `<6.1.0` — decisión 008) |
| typescript-eslint                                    | 8.69.0                                                                 |
| eslint                                               | 10.9.1                                                                 |
| prettier                                             | 3.9.6                                                                  |
| vitest                                               | 5.0.0                                                                  |
| vite                                                 | 8.2.2                                                                  |
| zod                                                  | 4.5.4                                                                  |
| drizzle-orm                                          | 0.45.2                                                                 |
| drizzle-kit                                          | 0.31.10                                                                |
| pg                                                   | 8.23.0                                                                 |
| @types/pg                                            | 8.23.1                                                                 |
| tsx                                                  | 4.23.13                                                                |
| tailwindcss / @tailwindcss/postcss                   | 4.3.3                                                                  |
| @types/node                                          | 22.20.1                                                                |
| pnpm (`packageManager`)                              | 11.25.0                                                                |
| engines.node                                         | >=20.9.0                                                               |

Decisiones nuevas de esta ronda: `DECISIONS.md` 008 (TypeScript 6.0.3), 009 (Vitest),
010 (Tailwind v4 retenido), 011 (config de ESLint de web sin `core-web-vitals`).

**Después (pendiente de la revisión manual):** confirmar que `packages/core` no importa
Next ni el ORM y que `apps/web` / `apps/ingestion` no se importan entre sí — a día de hoy
no hay imports cruzados porque los paquetes solo exportan una constante de versión.

---

## [x] 1.2 · Docker Compose con PostgreSQL y PostGIS

**Objetivo.** Base de datos levantada y accesible antes de definir el esquema.

```text
Crea el docker-compose.yml con el servicio de PostgreSQL con la extensión PostGIS
habilitada, con volumen persistente y las variables leídas del .env. Añade también
los servicios de web e ingestion, pero deja claro en comentarios que durante el
desarrollo se ejecutan en local y solo la base de datos se levanta con Docker.

Incluye en el README los comandos para levantar, parar y resetear la base de datos.
```

**Revisar.** Que la extensión PostGIS queda realmente habilitada al crear la base de datos,
no solo la imagen instalada.

**Notas:**

Ciclo SDD (2026-09-07): creado `docker-compose.yml` en la raíz con imagen fijada
`postgis/postgis:17-3.5`, `db` con `restart: unless-stopped`, healthcheck `pg_isready` y
volumen nombrado `buscahogar_postgres_data`. `web` e `ingestion` declarados bajo
`profiles: ['app']`, así que quedan fuera de un `docker compose up -d` por defecto.

Las variables de entorno que consume el servicio `db` — tomadas del propio
`docker-compose.yml` escrito en esta tarea, no de `.env`, que una regla de permisos impide
leer — son `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (con guarda `:?`, sin valor
por defecto) y `POSTGRES_PORT` (con valor por defecto `5432`). No ha sido posible
contrastarlas contra `.env.example`, pero `docker compose config -q` resuelve sin error
contra el `.env` real: eso prueba que las tres con guarda existen y no están vacías, aunque
no que sus valores sean los deseados.

**Verificación estructural (fase 2): superada.** Con Docker Desktop 29.7.2 / Compose v5.5.1
y el `.env` ya creado:

- 2.1 `docker compose config -q` → código 0, sin aviso de `version` obsoleta.
- 2.2 `docker compose config --services` → `db`.
- 2.3 `docker compose --profile app config --services` → `db`, `ingestion`, `web`.

El fallback de `profiles` comentados (tarea 2.4) **no se ha disparado**, y la fase 2 prueba
que no hace falta: 2.1–2.3 salieron limpias, que es justo lo contrario de la condición que
lo habría activado.

**Verificación de tiempo de ejecución (fase 3): superada** (2026-09-08, Docker 29.7.2,
motor `linux/x86_64`). Lo que responde la base, que es lo que pedía el apartado «Revisar»
de este paso:

```
postgis_version
3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1
```

- 3.1 `docker compose up -d` → código 0; volumen `buscahogar_postgres_data` y red creados;
  `docker compose ps --services` imprime exactamente `db`, así que `profiles: ['app']`
  cumple su función y `web`/`ingestion` no arrancan.
- 3.2 `db` alcanza `healthy` en ~10 s el primer arranque y en ~6 s los siguientes.
- 3.3 `SELECT PostGIS_Version();` devuelve la cadena de arriba con código 0. La extensión
  está **creada en la base**, no solo instalada en la imagen. El comando funciona tal y como
  está escrito en el README, sin necesidad de `-T`.
- 3.4 `down` → `up -d` conserva los datos.
- 3.5 `down -v` → `up -d` destruye el volumen y recrea PostGIS limpio, misma versión.

El criterio original de la tarea 3.4 era insuficiente y se reforzó: decía que obtener la
misma versión tras `down`/`up` probaba que los datos se conservan, y no lo prueba, porque un
volumen destruido reinicializaría Postgres y la extensión reaparecería con idéntica versión.
La comprobación real usó una tabla marcador escrita antes del `down`: sobrevivió al ciclo de
3.4 y desapareció (`relation "persistence_probe" does not exist`) tras el `down -v` de 3.5,
que es lo que distingue de verdad un volumen conservado de uno recreado.

La tarea 2.4 (fallback de `profiles` comentados) **no se ha disparado** y queda demostrado
que no hacía falta: su disparador era que 2.1–2.3 fallaran, y salieron limpias.

`pnpm format:check` falló en su primera ejecución (`docs/PROMPTS.md` y `docs/ROADMAP.md` con
estilo desalineado); tras `pnpm format`, la segunda ejecución salió con código 0 sobre todo
el repo.

**Verificación independiente (2026-09-08).** Se ejecutó la fase `verify` del ciclo SDD, que
volvió a correr todas las comprobaciones por su cuenta en lugar de aceptar lo ya informado:
`pnpm -r build`, `typecheck`, `lint` y `test` en 0, los tres `docker compose config` en 0, y
`pg_extension` confirmando `postgis 3.5.2` creado en la base `buscahogar`. Además provocó el
escenario negativo de la spec en vez de suponerlo: la misma consulta contra la base
`postgres` de mantenimiento devuelve `ERROR: function postgis_version() does not exist`,
mientras que `\dx` allí sale con código 0 — que es exactamente el falso positivo que motivó
elegir `SELECT PostGIS_Version();` como comprobación.

De sus hallazgos, tres se han resuelto:

- **Comentario del stanza `web`** (crítico). La spec exige que el comentario situado encima
  de `web` diga que en desarrollo los servicios se ejecutan en local con `pnpm dev:web` y
  `pnpm dev:ingestion`; esa frase estaba solo en la cabecera del fichero, cuarenta líneas
  más arriba. Corregido en el propio comentario. Detalle en `AI-NOTES.md`.
- **`DATABASE_URL` incoherente.** Conservaba los marcadores `USER`/`PASSWORD` del
  `.env.example` mientras `POSTGRES_USER` ya era `buscahogar`. Compose nunca lee esa
  variable —solo la aplicación—, así que ninguna comprobación de la fase 3 podía detectarlo;
  habría fallado al conectar Drizzle en el paso 1.3. Corregido el `.env` y recreado el
  volumen, porque Postgres solo aplica las credenciales sobre un `PGDATA` vacío. Conexión
  comprobada desde el host: usuario `buscahogar`, base `buscahogar`, PostGIS `3.5`.
- **Binarios ajenos en `docs/`.** Un instalador de 577 MB y un PDF, ninguno ignorado por
  git, que dejaban `pnpm format:check` en código 2 por un error de lectura y habrían entrado
  en el historial con un `git add -A`. Eliminados; el gate vuelve a 0 en todo el repo.

La tarea 2.4 sigue sin marcar por diseño: su disparador era que 2.1–2.3 fallaran.

**Ciclo cerrado (2026-09-08).** El paso entero está en el commit `d7d8f1b` («feat: docker
bbdd»): 6 ficheros, 555 inserciones y 6 supresiones. La verificación final salió en «pasa
con avisos», con cero hallazgos críticos y dos avisos que se aceptan en lugar de corregirse:
el tamaño del cambio (561 líneas, de las que 444 —el 79 %— son el registro documental que
exige `CLAUDE.md`, no código), y la ausencia de tabla de evidencia TDD, que no aplica a un
cambio de infraestructura sin lógica unitaria que probar; una aserción de vitest sobre el
YAML sería más débil que la validación del esquema de Compose y las consultas contra el
contenedor real, que es lo que se ha ejecutado.

El contenedor `buscahogar-db-1` queda levantado y sano sobre un volumen recién inicializado,
listo para el paso 1.3. A partir del momento en que existan migraciones, `docker compose
down -v` deja de ser gratuito: hoy solo cuesta un arranque, después costará rehacer el
esquema y los datos de prueba.

---

## [x] 1.3 · Esquema de base de datos

**Objetivo.** El paso más caro de corregir después. Revisar con calma.

```text
Implementa el esquema de base de datos en packages/db según docs/ARCHITECTURE.md,
con Drizzle. Tablas: sources, listings, properties, property_listings, zones,
coverage_jobs, locations y features.

Puntos que deben quedar bien resueltos:

- listings es en la práctica inmutable: un cambio de precio genera una versión
  nueva en lugar de sobrescribir. Modela el versionado de forma que se pueda
  recuperar el estado actual de un anuncio y también su histórico.
- property_listings debe guardar la puntuación, el desglose por señal y la
  estrategia que produjo la decisión, no solo el vínculo.
- listings necesita columna geográfica con índice espacial GiST, para el bloqueo
  de la deduplicación.
- zones guarda el identificador canónico, el estado y la fecha del último barrido.
- coverage_jobs es la cola: estados pending, running, done y failed.

Genera también la migración inicial y un script de seed vacío. Explícame las
decisiones de modelado que hayas tomado y que no estuvieran especificadas.
```

**Revisar.** Con detenimiento. Especialmente el versionado de `listings` y el desglose por
señal en `property_listings`: si esto se queda corto, hay que reprocesar todo más adelante.

**Notas:**

Dividido en cuatro fases encadenadas por el volumen estimado del cambio (700-850 líneas,
por encima del presupuesto de revisión de 400): fundamentos (PR 1), esquema espacial y
migración generada (PR 2), aplicación de la migración y suite de integración (PR 3,
bloqueada por Docker), documentación (PR 4).

**Fase 1 — Fundamentos (offline, PR 1): hecha y verificada.** `drizzle.config.ts`, la
inclusión de `drizzle.config.ts` en `tsconfig.json`, el enum `coverage_job_status`, el
`customType` `geographyPoint`, y las cinco tablas sin geometría (`sources`, `locations`,
`zones`, `coverage_jobs`, `features`). La migración `--custom` `0000_enable_postgis.sql`
crea la extensión antes de cualquier migración de esquema. `pnpm typecheck`, `pnpm lint`,
`pnpm format` y `pnpm format:check` pasan sin base de datos viva.

**Fase 2 — Esquema espacial, cliente y migración generada (PR 2): hecha y verificada.**
`listings` (identidad estable, con índice único natural sobre `source_id` y `external_id`),
`listing_versions` (instantáneas append-only, con índice único parcial `WHERE is_current`
que impone a nivel de base de datos una sola versión vigente por anuncio),
`listing_features`, `properties` y `property_listings` (puntuación escalar, identificación
de la estrategia, y desglose por señal en JSONB con índice GIN `jsonb_ops`). La columna
`geography` generada `STORED` lleva el índice GiST en `listings` y en `properties`, y todo
predicado de distancia pasa por `src/spatial.ts::withinMeters()`, punto único de cambio si
hubiera que recurrir a la alternativa `FB-GEOG-EXPR`. Se añaden además el barrel
`src/tables.ts` (deliberadamente fuera del glob de `drizzle-kit`, para que no recoja cada
tabla dos veces), el cliente `src/db.ts` con `createDb(connectionString)` sin lectura de
entorno, los tipos del desglose en `src/types.ts` y el seed vacío. `pnpm typecheck`,
`pnpm lint` y `pnpm format:check` pasan sin base de datos viva.

`CHK-ENUM-EMITTED`: **superada.** El SQL generado contiene
`CREATE TYPE "public"."coverage_job_status" AS ENUM('pending', 'running', 'done', 'failed');`,
así que exportar el `pgEnum` bastó para que `drizzle-kit` lo recogiera.

`CHK-SRID`: **fallida, y su alternativa aplicada.** `drizzle-kit` emitió
`"location" geometry(point)` —en minúscula y sin SRID— pese a declararse `srid: 4326` en el
esquema. Corregido con la migración `0002_fix_geometry_srid.sql`, que fija el tipo real a
`geometry(Point, 4326)` en ambas tablas. El detalle está en `docs/AI-NOTES.md`: es un caso
de esquema correcto con SQL generado incorrecto, que ninguna comprobación de TypeScript
podía detectar.

**Fase 3 — Migración aplicada e integración (PR 3): hecha y verificada.** Las cuatro
migraciones se aplican limpiamente sobre una base vacía, y la suite de integración (15
tests en 6 ficheros) pasa contra PostgreSQL 17 + PostGIS 3.5.2 real. **Los doce requisitos
marcados `[DOCKER-GATED]` quedan demostrados**, no supuestos.

`CHK-GEOG-STORED`: **superada**, pero tras diagnosticar un fallo distinto del previsto.
`pnpm db:migrate` falló con `SQLSTATE 42704` («type "geography(Point,4326)" does not
exist»), no con el `42P17` para el que estaba definida la alternativa `FB-GEOG-EXPR`, así
que la alternativa no se aplicó. La causa era un defecto de `drizzle-kit`, no del esquema:
está registrado en `docs/AI-NOTES.md` y corregido con la migración `0003`.

Estado verificado contra la base de datos: `listings.location` y `properties.location` con
SRID 4326 y tipo POINT; `location_geography` presente en ambas como `geography` generada
`ALWAYS`; índices GiST `listings_location_geography_idx` y
`properties_location_geography_idx` activos; cuatro migraciones registradas.

La prueba de metros usa dos puntos reales a 498,69 m: un radio de 400 m los excluye y uno
de 600 m los incluye, pasando por `withinMeters()`, el código de producción. La del índice
se comprobó falsable: con 3000 filas el planificador elige `Bitmap Index Scan` (11 ms), y
al desactivar `enable_indexscan` y `enable_bitmapscan` cae a `Seq Scan` (34 ms).

`CHK-POSTGIS-PRIV` (hueco G5) resuelto durante la fase.

**Fase 4 — Documentación (PR 4): esta entrada.** Se adelantó al orden de escritura del
propio prompt (que pide explicar las decisiones al terminar el esquema) porque las fases
2 y 3 dependen de trabajo aún no hecho o de un bloqueo de entorno, y el registro
obligatorio de `CLAUDE.md` exige documentar el trabajo ya completado en lugar de esperar
al cierre del paso completo.

El paso queda `[~]` en curso, no `[x]`: el modelo de datos y la migración completa aún no
existen.

---

## [x] 1.4 · Contratos y modelo de dominio en `core`

**Objetivo.** Tipos e interfaces, sin implementación.

```text
Implementa en packages/core el modelo de dominio y los contratos de
docs/ARCHITECTURE.md:

- El tipo Listing normalizado y los tipos auxiliares (Location, Feature,
  PropertyType, OperationType, AreaQuery, SourcePage, SimilarityResult).
- Las interfaces PropertySource, ListingNormalizer y DedupStrategy.
- Los esquemas Zod correspondientes a los tipos que cruzan una frontera externa.

SimilarityResult debe incluir la puntuación total y el desglose por señal.

Sin implementaciones concretas y sin importar Next ni el ORM: solo tipos,
interfaces y esquemas.
```

**Revisar.** Que no hay ningún import de `apps/` ni del ORM. Que los tipos no arrastran
particularidades de ninguna fuente concreta.

**Notas:**

Paso **ejecutado** el 2026-09-10, tras el ciclo SDD completo (propose → spec → design →
tasks → apply), retomado sobre la base dejada por el paso 1.5 (sonda de la API). El checkbox
se deja sin marcar hasta que `sdd-verify` confirme el resultado.

**Lo que se implementó.** Solo tipos, interfaces y esquemas Zod — sin implementación
concreta, como pedía el paso:

- `packages/core/src/types/`: `PropertyType`/`OperationType` (const tuples cerradas),
  `Coordinates`, `Location`, `Feature`/`AppliedFeature`, `SignalScore`/`SignalBreakdown`/
  `SimilarityResult`, `SourcePage<T>`.
- `packages/core/src/schemas/`: `listingSchema`/`Listing` (derivado con `z.infer`, objeto no
  estricto que elimina claves desconocidas) y `areaQuerySchema`/`AreaQuery` (derivado con
  `z.infer`, `z.strictObject()`, geográfica y sin `propertyType`).
- `packages/core/src/contracts/`: `PropertySource<T = unknown>`, `ListingNormalizer<T>` y
  `DedupStrategy` (con `readonly version: string`, añadido sobre lo que declaraba
  `docs/ARCHITECTURE.md` — ver decisión 028).
- Frontera de dependencias mecánica: `@typescript-eslint/no-restricted-imports` en
  `packages/core/eslint.config.mjs`, que hace fallar `pnpm lint` si el paquete importa
  `next`, `react`, `drizzle-orm`, `@buscahogar/db` o cualquier ruta de `apps/`.
- `packages/db/src/types.ts`: renombrada la familia de tipos de fila con sufijo `Row`
  (colisión de nombre con el `Listing` de dominio) y sustituidas las declaraciones a mano de
  `SignalScore`/`SignalBreakdown` por una reexportación de tipo desde `@buscahogar/core`.
- Documentación: `docs/ARCHITECTURE.md` (snippet de Contratos corregido), `docs/DECISIONS.md`
  (entradas 028–031), este mismo registro y `packages/core/README.md`.

**Verificación real ejecutada** (no solo reportada): `pnpm --filter @buscahogar/core test`,
`lint`, `typecheck` y `build`; `pnpm --filter @buscahogar/db typecheck`, `test` y `build`;
`pnpm -r typecheck` desde la raíz. Detalle completo en Engram
`sdd/core-domain-contracts/apply-progress`.

**Entrega en bloque único con excepción de tamaño.** La estimación de diseño (~1680 líneas,
tope 1900) supera varias veces el presupuesto de revisión por defecto. Se decidió en la
puerta de tareas (`sdd/core-domain-contracts/gate-decisions`) no encadenar PRs: los tipos se
referencian entre sí y trocear obligaría a revisar definiciones sin sus consumidores. No se
añade una fila nueva a la tabla de desviaciones solo por esto — la excepción de tamaño fue
una decisión explícita en la puerta, no una desviación silenciosa de cómo estaba escrito el
paso.

**Lo que queda pendiente para pasos posteriores, deliberadamente**: el rango de `score`
(0–1 / 0–100 / sin acotar) se difiere a ROADMAP 1.9; 8 de los 11 miembros de `PropertyType`
siguen sin confirmar contra datos reales (la sonda solo cubrió dos filtros y una zona,
`other` es la válvula).

**Nota corregida al cerrar el paso 1.13** (2026-09-22): este párrafo decía que ROADMAP 1.13
heredaba dos obligaciones sobre `AreaQuery` — seleccionar las claves relevantes de los search
params antes de parsear, y convertir string→number él mismo. Es incorrecto: ambas quedaron
cerradas por la **decisión 057**, durante el propio paso 1.11, no por 1.13. Verificado contra
`packages/core/src/schemas/search-query.schema.ts:50-94`: el `z.object()` no estricto de
`searchQuerySchema` selecciona las claves relevantes y `intParam`/`decimalParam` hacen la
conversión string→number. Se corrige la nota en vez de borrarla, como constancia de que
estaba equivocada — no queda ninguna obligación de `AreaQuery` pendiente para 1.13 por este
motivo.

**Cierre del reordenamiento 1.4 ↔ 1.5.** El paso 1.4 se detuvo deliberadamente a las puertas
de la propuesta para adelantar el 1.5 (sonda de la API), documentado más abajo. Con el 1.4
ya implementado sobre la evidencia de esa sonda, el reordenamiento se cierra: no queda
ningún trabajo de 1.4 pendiente de la investigación de 1.5, y el orden de la hoja de ruta
puede continuar como estaba fijado a partir de aquí.

---

## [x] 1.5 · Sonda de la API de la fuente

**Objetivo.** Conocer la forma real de los datos y el coste en cuota antes de construir nada
encima. Este paso gasta cuota: acotar mucho.

```text
Escribe un script aislado en apps/ingestion que haga una única llamada a la API de
Idealista sobre una zona muy pequeña, con el mínimo de resultados posible, y
guarde la respuesta cruda en un fichero de fixtures.

Requisitos:

- Nunca más de una petición por ejecución, sin bucle de paginación.
- Que registre por consola cuántas peticiones ha consumido.
- Credenciales desde variables de entorno.

Después de ejecutarlo, analiza la respuesta guardada y dime: qué campos trae, con
qué tipos, si las coordenadas parecen exactas u ofuscadas, cuántos resultados
devuelve por página y cómo se pagina.
```

**Revisar.** El punto crítico son las coordenadas. Si están ofuscadas, el radio de bloqueo
de la deduplicación tendrá que ser mucho más amplio. Anotarlo en `DECISIONS.md`.

**Notas:**

Paso **ejecutado** el 2026-09-10, adelantado por delante del 1.4, que quedó parado esperando
esta evidencia. Las 13 fases están hechas: el script, las dos llamadas reales, los fixtures y
el análisis. **Coste: exactamente dos peticiones de búsqueda facturables**, las presupuestadas.
Pendiente solo el cierre formal del ciclo SDD (`verify` y `archive`).

Estado de la implementación, comprobado ejecutando, no por autoinforme del agente:

- `pnpm --filter @buscahogar/ingestion test` → **43/43**, exit 0.
- `typecheck` y `lint` → exit 0.
- `build` → `dist/` contiene solo `index.*`. El script de sonda queda fuera del artefacto.
- No existe ningún fichero de fixtures, que es la prueba de que no se ha llamado a la API.

Decisiones de implementación que conviene retener:

- **El script vive en `apps/ingestion/scripts/`, hermano de `src/`, no dentro.** El `exclude`
  de TypeScript solo filtra el glob de `include`: no impide que un fichero entre por el grafo
  de imports. Desde `src/scripts/`, un import desde `src/index.ts` habría emitido la sonda
  dentro de `dist/` en silencio. Fuera de `src/`, el `rootDir` ya existente convierte esa
  inclusión accidental en un TS6059 y el build falla. Verificado: el `dist/` emitido solo
  contiene `index.*`.
- **Simulación por defecto.** Sin `--execute` explícito no se abre ninguna conexión. No hay
  entrada `:execute` en `package.json`: hay que teclearlo. Aplica la decisión 016.
- **El contador incrementa antes del `fetch`, no después** (líneas 156 y 201), de modo que una
  llamada que falle reporte una petición consumida y no cero. Cuenta peticiones de token y de
  búsqueda por separado, porque no está documentado si la llamada al endpoint de token
  consume cuota de búsqueda.
- **Ausencia de bucles impuesta con una regla AST de ESLint**, no con una búsqueda de texto:
  un grep no distingue código de comentarios ni de literales de cadena.
- **`maxItems=50`, no el mínimo** que pide la letra del paso. La cuota se cobra por petición,
  no por resultado, así que pedir uno o cincuenta cuesta lo mismo, y detectar ofuscación de
  coordenadas exige comparar varios puntos entre sí. Ver la tabla de desviaciones.

Pendiente antes de la fase 10: añadir a mano `IDEALISTA_API_KEY` e `IDEALISTA_API_SECRET` a
`.env.example`. Ese fichero está denegado para lectura y escritura en el entorno del agente,
así que es una acción del desarrollador.

### Resultado de la sonda

Dos respuestas de 50 elementos cada una, ambas HTTP 200. Token OAuth con `expiresIn` de 43200
segundos, es decir 12 horas.

**Coordenadas** (criterio de revisión del paso). Perfil `homes`, radio 300 m: 50 coordenadas
distintas de 50, distancia máxima al centro 299,6 m, precisión de 7 decimales en 92 de 100
valores. Perfil `premises`, radio 2000 m: 49 distintas de 50, máxima 1964,8 m. **No hay encaje
al centroide ni redondeo**, pero eso es una cota inferior y no prueba exactitud: un
desplazamiento aleatorio por anuncio conservaría unicidad y decimales. Registrado en la
decisión **026**, junto con un negativo útil: `showAddress` no sirve para poblar
`listings.coordinates_obfuscated`, porque ocultar la dirección no degrada la coordenada.

De paso queda **confirmada por observación directa** la unidad de `distance`: metros. Con radio
solicitado de 300 el elemento más lejano cae a 299,6 m, y con 2000 a 1964,8 m.

**Taxonomía.** El `propertyType` de la respuesta no es el vocabulario del filtro de petición:
enviando `homes` se reciben `flat`, `duplex` y `penthouse`; enviando `premises`, `premise` en
singular. La investigación documental previa había tomado el parámetro de petición por el campo
de respuesta. Registrado en la decisión **027**.

**Optatividad de campos**, que es lo que tenía parado el 1.4: `rooms`, `hasLift`,
`parkingSpace` y `luxuryVisibility` solo aparecen en `homes`; `ubicationInfo` solo en
`premises`; `externalReference` está en 40 de 50 elementos. El cruce de los dos perfiles es
justamente lo que permite distinguir un campo opcional de uno ausente por casualidad.

**Paginación.** `homes`: total 124 en 3 páginas. `premises`: total 358 en 8 páginas.
`itemsPerPage=50` aceptado, `paginable=true`, `hiddenResults` **ausente como clave** (no
`null`; ver la corrección de contradicción interna más abajo). La paginación es por número de
página, no por cursor opaco: el `cursor` de `SourcePage` será una envoltura de `numPage`.

**Datos personales.** `contactInfo` **no aparece como clave** en la respuesta, tampoco en la
cruda: esta API no lo devuelve en absoluto. Lo mismo con `hiddenResults`. La distinción no es
cosmética — para el normalizador del paso 1.6, una clave ausente se tipa `.optional()` y un
valor nulo `.nullable()`, y no son lo mismo. El barrido de texto libre reescribió 3 teléfonos dentro de `description` y no queda
ninguno residual. Los 8 valores de `externalReference` marcados para revisión resultaron ser
referencias internas de agencia con forma de teléfono (`RP1852026154742`): el anonimizador
acertó al marcarlos sin reescribirlos. Los ficheros crudos quedan fuera de git.

Sigue sin poder determinarse la **cuota mensual** ni si la llamada al endpoint de token
consume cuota de búsqueda. Solo lo cerraría el contador del panel de socio.

Artefactos del ciclo en Engram: `sdd/source-api-probe/{explore,proposal,spec,design,tasks,apply-progress}`.

---

## [x] 1.6 · Adaptador y normalizador de la primera fuente

```text
Implementa en apps/ingestion el adaptador de Idealista contra la interfaz
PropertySource de packages/core, y su ListingNormalizer.

Requisitos:

- La paginación debe tener corte explícito y un tope máximo de peticiones por
  barrido, configurable. Un bucle sin corte agota la cuota del mes.
- SourcePage devuelve el cursor siguiente para poder reanudar un barrido
  interrumpido sin repetir peticiones.
- El normalizador es una función pura sobre la respuesta cruda: sin red, sin
  base de datos.
- Tests del normalizador contra el fixture grabado en el paso anterior. Los tests
  no llaman nunca a la API real.
```

**Revisar.** Que el tope de peticiones existe y funciona. Que los tests pasan sin red.

**Notas:**

Paso **ejecutado** el 2026-09-14, tras el ciclo SDD completo (explore → research → propose →
spec → design → tasks → apply), sobre la base dejada por el paso 1.5 (sonda de la API) y el
1.4 (contratos y modelo de dominio en `core`). El checkbox se deja sin marcar hasta que
`sdd-verify` confirme el resultado.

**Lo que se implementó**, en `apps/ingestion/src/sources/idealista/`:

- Núcleo puro, sin I/O: `filters.ts` (tupla congelada de los cinco filtros de barrido),
  `raw-element.schema.ts` y `raw-envelope.schema.ts` (esquemas Zod `looseObject`,
  `.optional()` salvo evidencia de fixture de `null`), `property-type-map.ts` (mapa
  fuente→dominio, incluido el sintético `chalet→house`), `normalizer.ts`
  (`IdealistaListingNormalizer`, total salvo `price` inválido), `cursor.ts` (codec
  `"<filtro>:<numPage>"`, rechaza en vez de caer en un valor por defecto), `budget.ts`
  (contador de `search`/`token` separados, tope duro configurable), `sweep-planner.ts`
  (`planNext`, las cinco condiciones de terminación) y `errors.ts` (taxonomía uniforme,
  todo fallo lanza).
- Shell de I/O: `search-request.ts` (construcción de la petición), `scrub-credentials.ts`
  (reimplementación deliberada, ver decisión 033), `ports.ts` (interfaces inyectadas),
  `http-client.ts` (el único `fetch()` del adaptador) e `idealista-source.ts`
  (`createIdealistaSource`, orquestación, `PropertySource<IdealistaElement>` +
  `diagnostics()`).
- Barrido y reexport: `index.ts` del adaptador y barril de `apps/ingestion/src/index.ts`.
- Frontera de bucles: `eslint.config.mjs` extendido a los dos ficheros del adaptador que
  pueden emitir una petición (`http-client.ts`, `idealista-source.ts`), verificado en
  positivo y en negativo (bucle inyectado a propósito, confirmado el fallo, revertido).
- Documentación: este mismo registro, `docs/DECISIONS.md` (entradas 032–035),
  `docs/AI-NOTES.md` (contradicción `hiddenResults` corregida) y `docs/PROMPTS.md`.

**Verificación real ejecutada** (no solo reportada): `pnpm --filter @buscahogar/ingestion
test` (126 tests, 15 ficheros, verde), `lint`, `typecheck` y `build`, todos en verde. El
criterio de revisión del paso — que el tope de peticiones existe y funciona — se prueba con
un puerto falso que cuenta llamadas (`test/idealista-source-cap.test.ts`): con
`maxSearchRequestsPerSweep: 3` y páginas que siempre declaran más por delante, el barrido se
detiene EXACTAMENTE tras 3 peticiones y el error de tope lleva el cursor de reanudación
exacto de la 4ª. Detalle completo, incluida la tabla RED→GREEN por tarea, en Engram
`sdd/idealista-adapter-normalizer/apply-progress`.

**Tres conflictos spec↔diseño, reconciliados en la propia tarea de `sdd-tasks` (obs #106) y
no relitigados aquí**: (1) `totalPages` no fiable **lanza** `UntrustworthyEnvelopeError` con
el cursor de la MISMA página, no avanza en silencio al siguiente filtro como decía el texto
informal del spec — sigue el diseño y su propia razón anti-spin; registrado en decisión 032.
(2) `normalize()` conserva su propio throw de `price` (contrato directamente testeado) aunque
el diseño afirme que nunca lanza dentro del pipeline 1.6/1.7 — ambas cosas son ciertas en
puntos distintos: `rawElementSchema` ya filtra `price` inválido antes de que 1.7 invoque
`normalize()`, pero el tipo `IdealistaElement` no puede expresar esa garantía en compilación.
(3) La frontera del ban de bucles de ESLint se extiende a los dos ficheros del adaptador que
pueden emitir una petición: decidido "requerido", no opcional, con entrada propia en
`DECISIONS.md` (035) — el diseño lo había dejado a discreción de `sdd-tasks`.

**Deviación de ejecución dentro de la fase 2 del checklist de tareas**: `errors.ts` (tarea
2.12 en el checklist original) se escribió completo desde el principio de la fase 2, no tras
la tarea 2.11, porque `cursor.ts` (2.4), `budget.ts` (2.6) y `sweep-planner.ts` (2.11)
necesitan importar sus clases antes de esa tarea — el checklist lista las tareas en orden de
especificación, no en el orden físico de creación de ficheros posible. Ningún test ni ninguna
tarea se omitió; solo cambió el momento de creación del fichero. Ver la tabla de
desviaciones.

**Lo que queda pendiente para el paso 1.7, deliberadamente**: la llamada real a
`normalizer.normalize()` sobre los `items` de un barrido (y la decisión de si un elemento
rechazado aborta la página o se salta, explícitamente fuera de alcance del spec de este
paso); la persistencia en `listings`; el comando de CLI de barrido y su idempotencia; el
catálogo de `Feature` (D8, `features` se emite como `[]`); y el cableado de credenciales
reales en la raíz de composición (nunca dentro del adaptador, D5).

**No se ha llamado a la API real de Idealista en ningún momento de esta tarea.** Todos los
tests usan las dos fixtures commiteadas en el paso 1.5 o entradas sintéticas; el puerto
falso de la API real nunca se invoca.

---

## [x] 1.7 · Persistencia y barrido de una zona

```text
Implementa el pipeline de ingesta hasta la tabla listings: barrido de una zona,
normalización y escritura, respetando que listings no se sobrescribe sino que se
versiona.

Añade un comando de CLI en apps/ingestion para lanzar el barrido de una zona
concreta, con la zona y el tope de peticiones como parámetros.

El barrido debe ser idempotente: ejecutarlo dos veces sobre la misma zona no puede
duplicar registros ni generar versiones nuevas si nada ha cambiado.
```

**Revisar.** Lanzarlo sobre Granada con un tope bajo. Comprobar en la base de datos que los
datos están completos y que una segunda ejecución no duplica.

**Después.** Ya hay datos reales: **empezar a etiquetar pares** para el conjunto de
evaluación. No esperar al paso de deduplicación.

**Notas:**

Paso **iniciado** el 2026-09-14 con el ciclo SDD completo (explore → research → propose →
spec + design en paralelo → tasks → apply), cambio `zone-sweep-persistence`. La
planificación está terminada; la implementación se partió en cuatro fases y **solo la fase 1
está ejecutada**. El paso no está completo: se queda en `[~]`.

**Hecho — fase 1, núcleo puro sin I/O**, en `apps/ingestion/src/sweep/`: `store.ts`,
`options.ts`, `area.ts`, `listing-field-policy.ts`, `version-columns.ts`, `job-cursor.ts`,
`report.ts` y `sweep-runner.ts`, más siete ficheros de test en `apps/ingestion/test/`. 72
tests nuevos, TDD estricto con RED antes de GREEN en todos ellos. Verificación independiente
del orquestador: `pnpm --filter @buscahogar/ingestion test` → **198/198 en verde**, 22
ficheros, código de salida 0. Cero llamadas de red y cero accesos a base de datos. **Nada
commiteado**: los cambios están en el árbol de trabajo.

**Pendiente — fases 2, 3 y 4 (33 tareas)**, bloqueadas por el entorno, no por el diseño:
Docker Desktop no está arrancado en esta máquina, así que no hay contenedor PostgreSQL +
PostGIS contra el que probar la escritura, el versionado ni la idempotencia, que es
precisamente lo que esas tres fases verifican. Mismo tipo de bloqueo que ya partió el paso
1.2 y la fase 3 del 1.3.

**Actualización — fases 2, 3 y 4 completas**, una vez disponible el contenedor PostgreSQL +
PostGIS, en sesiones posteriores encadenadas (batches 2 a 4 de `sdd-apply`):

- **Fase 2** (dependencias declaradas, arnés de test respaldado por base de datos,
  `coverage-store.ts`, `reference-store.ts`): completa. La sesión que la ejecutó se
  interrumpió por el límite de tasa de una API externa antes de dejar su propio registro de
  progreso; el estado final se verificó de forma independiente en la sesión siguiente —
  ver tabla de desviaciones.
- **Fase 3** (`listing-writer.ts`: upsert de identidad, detección de cambio en espacio de
  columna, versionado con demote-antes-de-insertar): completa, con ciclo TDD de primera
  mano — 11 escenarios contra PostgreSQL real, incluida la trampa de redondeo de superficie
  fraccional (78.5→79, decisión 036) y la garantía de que el orden de escritura nunca
  dispara el índice único parcial de cabeza de versión.
- **Fase 4** (`scripts/sweep-zone.ts` como raíz de composición; extensión del seed de
  `packages/db` con el código INE real de Granada —18087, suministrado y confirmado por el
  responsable del proyecto, nunca fabricado, decisión 041; script `"sweep"`; barril de
  `apps/ingestion/src/index.ts`; documentación): completa.

Verificación final independiente: suite offline `pnpm --filter @buscahogar/ingestion test` →
**198/198**; suite respaldada por PostgreSQL `run test:db` → **25/25** (más 14 tests nuevos
del seed en `packages/db`, **29/29** en ese paquete); `typecheck`, `lint` y `build` en verde
en ambos paquetes. Cero llamadas a la API real de Idealista en cualquier test — todas las
suites usan fixtures grabadas o una base de datos real con fetch bloqueado.

**Ejecución de aceptación: hecha, con 2 peticiones reales en total.** El criterio de revisión
de este paso —lanzarlo sobre Granada con un tope bajo, comprobar que los datos están completos
y que una segunda ejecución no duplica— se ejecutó con autorización expresa del responsable del
proyecto, que fijó el tope mínimo.

Comando usado. Nótese que en este entorno `pnpm run <script> -- <args>` **no** separa el `--`,
así que hay que invocar el script directamente:

```text
cd apps/ingestion
node --env-file=../../.env --import tsx scripts/sweep-zone.ts   --zone 18087 --center 37.1773,-3.5986 --radius 1000 --operation sale --max-requests 1
```

- **Comprobación previa de coste cero**: con `--radious` en lugar de `--radius`, el comando
  responde `Unknown option '--radious'` y termina **antes de tocar la red**. La estrictura de
  `parseArgs` y de Zod corta antes de gastar cuota.
- **Primera ejecución**: `requestsSpent: 1`, `created: 50`, `versioned: 0`, `unchanged: 0`,
  `rejected: 0`, cursor de reanudación `homes:2`.
- **Segunda ejecución sobre la misma página**: `created: 0`, `versioned: 0`, **`unchanged: 50`**,
  `rejected: 0`. Esta es la prueba de idempotencia que pedía el enunciado.
- Para repetir la misma página hubo que **rebobinar el cursor a mano** (`update coverage_jobs
  set cursor = null`), porque la CLI no expone bandera de reinicio: una segunda invocación sin
  rebobinar reanuda en la página 2, lo que prueba reanudación, no idempotencia. Ver la tabla de
  desviaciones.
- **Estado en base de datos tras ambas ejecuciones**: 50 `listings`, 50 `listing_versions`,
  **50 cabezas vigentes** (exactamente una por anuncio), 50 claves naturales distintas, 50 con
  geometría y 50 con superficie. Precios entre 190.000 € y 1.495.000 €. La segunda pasada no
  hizo crecer ninguna tabla.

Nada de esta sesión está commiteado: los cambios quedan en el árbol de trabajo.

**Decisiones de producto confirmadas** en esta sesión, que condicionan el resto del paso:

- **P1.** Una zona resuelve a un área de búsqueda con `--center` y `--radius` explícitos;
  `--zone` es solo la etiqueta de registro, sin geometría. Descartados el centroide sembrado
  en `locations` desde CNIG/IGN (aplazado: la granularidad del cruce con el código INE no
  está confirmada) y el `locationId` de Idealista. Decisión 036.
- **P2.** Un «cambio» que justifica una fila nueva en `listing_versions` es una diferencia
  campo a campo sobre el `Listing` normalizado, comparada **en el espacio de columnas**. Sin
  migración de esquema. Decisión 037.
- **P3.** Un elemento que el normalizador rechaza se salta, se anota con su motivo y se
  cuenta; la página continúa. Nunca aborta la página, porque la petición HTTP ya está
  pagada. Resuelve lo que el paso 1.6 dejó explícitamente fuera de alcance. Decisión 038.
- **P4.** El barrido de CLI crea y actualiza una fila de `coverage_jobs`: ahí vive el cursor
  de reanudación que el paso 1.6 dejó sin destino, y el índice único parcial de la tabla
  hace de guarda de concurrencia.
- **P5.** Los datos de referencia (`sources`, `locations`, `zones`) se siembran extendiendo
  de forma idempotente el seed de `packages/db` con datos reales del INE. Esto rompe el
  no-op deliberado de `packages/db/src/seed.ts` (REQ-MIG-03): ver la tabla de desviaciones.
- **P6.** Que un anuncio no aparezca en un barrido **nunca** cambia `listings.status`. La
  ausencia no es prueba de retirada cuando la cobertura es parcial por construcción (P1). En
  este cambio `listings.status` no tiene ningún escritor. Decisión 039.

**Decisiones de ingeniería del diseño.** Una transacción por página, con el avance de
`coverage_jobs.cursor` **dentro** de ella, para que el cursor no pueda adelantarse a lo
commiteado (decisión 040). Y `db-client.ts` se duplica en `apps/ingestion`, pero
`docker-gate.ts` deliberadamente **no**: en su lugar, un `vitest.db.config.ts` aparte cuyo
fichero de setup lanza si falta `DATABASE_URL`, porque copiar la puerta habría saltado el
100% de los tests de base de datos en verde y para siempre. Detalle en `docs/AI-NOTES.md`.

**Tres errores de fase de planificación corregidos antes de implementar** —una dependencia
de runtime no declarada, un redondeo dominio↔columna que habría roto la propia idempotencia
que este paso existe para garantizar, y la puerta de tests siempre verde—, más una deriva
tareas↔diseño detectada al implementar. Los cuatro, en `docs/AI-NOTES.md`.

Artefactos del ciclo en Engram: exploración obs #112, decisiones de producto obs #113
(revisión 4), investigación obs #114 (`partial`), propuesta obs #115, diseño obs #116, spec
obs #117, tareas obs #118 y progreso de `sdd-apply` obs #119.

---

## [x] 1.8 · Bloqueo de candidatos

```text
Implementa la fase de bloqueo de la deduplicación en packages/core y packages/db:
generación de pares candidatos mediante consulta SQL, por proximidad geográfica,
banda de precio y margen de superficie, usando el índice espacial.

Los umbrales deben ser parámetros configurables, no constantes en el código:
se van a ajustar empíricamente sobre los datos.

Añade un comando que, sobre los datos ya ingeridos, muestre cuántos pares
candidatos genera cada combinación de umbrales, para poder calibrarlos.
```

**Revisar.** El número de candidatos. Si es enorme, el bloqueo es demasiado laxo; si es cero,
demasiado estricto o las coordenadas están ofuscadas.

**Notas:**

Ciclo SDD completo (explore → preproposal → proposal → spec → design → tasks → apply) bajo
Strict TDD, `size:exception` aceptado por el responsable (obs #130). `sdd-apply` corrió en dos
batches — el primero interrumpido por un límite de tasa del proveedor a mitad de la fase 2, el
segundo lo retomó verificando el árbol de trabajo real en vez del checkpoint persistido. Ver
`docs/PROMPTS.md` para el ciclo completo.

**Corpus (R2, decisión de diseño heredada).** El corpus real de la aceptación del paso 1.7
tiene 50 anuncios, una sola zona (Granada), 0/50 con coordenadas ofuscadas. Los conteos de
calibración a este tamaño son comparaciones *relativas* entre combinaciones de umbrales, no un
radio calibrado en sentido estadístico — no hay suficiente volumen para que un umbral concreto
tenga significado por sí solo. La calibración con valores concretos frente al corpus real
queda pendiente hasta que exista un corpus mayor.

**Qué prueban de verdad los dos índices (D-T2), y qué no.** `CHK-PARTIAL-IDX` (comprobación
sobre `toSQL()`, sin planificador) demuestra que `is_current` se emite de forma que el índice
parcial de precio/superficie es *matchable* — sigue en verde y es la prueba vinculante.
`CHK-GIST-SELFJOIN` (plan real a ~2000 filas, radio estrecho/banda ancha) demuestra que el
índice GiST se usa de verdad, pero solo después de reescribir el autojoin como una subconsulta
`LATERAL` correlacionada con una barrera de optimización interna (`.limit()`) — un self-join
plano, con el predicado geográfico en el `WHERE` o en el `ON` del `JOIN`, NO basta: Postgres
reordena libremente el árbol de `INNER JOIN` y prefiere el índice de precio por una
subestimación de coste, medido dos veces contra Postgres real. Esa misma reescritura, aplicada
con `FB-GIST-NOT-CHOSEN`, deja `CHK-PRICE-IDX` (radio ancho/banda estrecha) sin poder
demostrarse con esta forma de consulta — se retiró la aserción per `FB-PARTIAL-IDX-NOT-CHOSEN`
(no se relajó, se eliminó), y **no se reclama en la memoria del TFM** que el índice parcial se
elija en ese régimen. Detalle completo en decisiones 042-045, `docs/DECISIONS.md`.

**Escrituras.** Este cambio escribe cero filas en cualquier tabla — es una consulta de
lectura, tal como especifica el diseño.

**Corpus real perdido durante la sesión.** La suite de tests de `packages/db` trunca la base
de datos apuntada por `DATABASE_URL` (mecanismo preexistente, no introducido por este paso).
Los 50 anuncios reales de la aceptación del paso 1.7 fueron sustituidos por un corpus
sintético de 2000 filas al ejecutar las pruebas de plan de consulta de este mismo paso. La
evidencia de aceptación del 1.7 sobrevive solo en Engram (obs #122), no de forma reproducible
en la base de datos. Restaurar el corpus real cuesta cuota facturable (~2 peticiones, un
barrido nuevo) — decisión del responsable del proyecto, no ejecutada en esta sesión. Registrado
como decisión 046 en `docs/DECISIONS.md` y como incidente en `docs/AI-NOTES.md`.

**Verificación: FAIL en la primera pasada, bloqueo corregido.** `sdd-verify` encontró un
hallazgo crítico: la aserción negativa de `CHK-GIST-SELFJOIN` era vacua. Comprobaba
`not.toContain('Seq Scan on listings')` sobre un `EXPLAIN (FORMAT JSON)`, y ese literal no
existe en formato JSON, así que no podía fallar nunca — ni siquiera con el plan que
`FB-GIST-NOT-CHOSEN` existe para impedir. La implementación de la consulta era correcta; lo
roto era la prueba. Corregido recorriendo el árbol del plan y comparando campos, acotado a la
propiedad que importa: el lado interno `b` entra por `listings_location_geography_idx` y nunca
se recorre secuencialmente (`a` sí, por ser la relación conductora del autojoin). La nueva
aserción se validó en rojo a propósito con `enable_indexscan=off` antes de darla por buena.
Añadida además la cobertura BT-2a a nivel de fila que el verificador echó en falta: los campos
de diagnóstico de un `CandidatePair` devuelto (`surfaceDeltaM2` nulo y lado ofuscado) solo
estaban probados de forma agregada. Suite de bloqueo: 18 tests. Incidente registrado en
`docs/AI-NOTES.md`.

**Criterio de aceptación leído contra datos reales (2026-09-15).** Con el corpus sintético
perdido, se autorizó un barrido nuevo de Idealista con corte explícito en `--max-requests 2`:
**2 peticiones facturables gastadas, 100 anuncios creados, 0 rechazados**, zona 18087 (Granada),
centro `37.1773,-3.5986`, radio 1500 m, operación `sale`. Corpus resultante: 100 anuncios,
100 con geometría, **0 con coordenadas ofuscadas**, 100 con superficie en la versión vigente.

Calibración sobre ese corpus (banda de precio 20 000 €, margen de superficie ±10 m²):

| Radio | Pares candidatos |
| ----- | ---------------- |
| 25 m | 4 |
| 50 m | 4 |
| 100 m | 7 |
| 250 m | 27 |
| 500 m | 36 |
| 1000 m | 80 |

**Ni enorme ni cero, y monótono con el radio: el bloqueo discrimina.** Con 100 anuncios hay
4950 pares posibles; a 1000 m el bloqueo deja 80, un 1,6 % del total. A 100 m deja 7. La curva
es utilizable para fijar umbrales empíricamente, que es exactamente lo que este paso tenía que
entregar. El `0` de coordenadas ofuscadas confirma por segunda vez, sobre un corpus real
distinto, la decisión de tratar `coordinates_obfuscated` como dimensión del informe y no como
rama del predicado (Q4 del pre-proposal, obs #127).

**Estado.** Implementado, verificado (`pass_with_warnings`, 0 bloqueos) y con el criterio de
aceptación leído sobre datos reales. Paso cerrado.

---

## [x] 1.9 · Estrategia de puntuación

```text
Implementa la primera DedupStrategy basada en reglas sobre datos estructurados,
según los criterios de docs/DECISIONS.md (decisión 006).

- Decisión por acumulación de señales; ninguna señal decide por sí sola.
- La dirección solo cuenta como señal fuerte si la coincidencia es exacta.
- Sin comparación de imágenes en esta fase.
- El resultado incluye siempre el desglose por señal, que se persiste en
  property_listings junto con la decisión y el nombre de la estrategia.

Añade tests con pares etiquetados, incluyendo negativos difíciles: anuncios del
mismo bloque con superficie y precio similares que son viviendas distintas.
```

**Revisar.** Los falsos positivos, que son la prioridad. Revisar a mano una muestra de los
grupos formados.

**Notas:**

Implementada `ruleBasedDedupStrategy` (`packages/core/src/strategies/rule-based/`): siete
señales estructuradas (distancia, precio, superficie, dirección en dos niveles, habitaciones,
baños) acumuladas por peso EFECTIVO —no por peso total configurado, decisión 049— más un veto
de solo rechazo sobre `propertyType`/`operation` (decisión 048). `classify` banda el resultado
en `accept`/`undecided`/`reject` sobre dos umbrales (0.45/0.82) y un piso de evidencia mínima
(≥3 señales, ≥55 de peso efectivo) que impide que una única señal maximal normalice a `accept`.

**Cifra de colisión de direcciones corregida.** La fase de exploración (`sdd-explore`) había
afirmado que la cadena `"Piso en Trafalgar, Madrid"` colisionaba en ~40% de los pares. Medido
directamente contra el fixture real (`apps/ingestion/test/fixtures/idealista/search-homes-
2026-09-10.json`): son **10 de 50 anuncios (20%)** y **4,7% de los pares (57 de 1225)** — la
cifra de exploración confundía una frecuencia por anuncio con una tasa de colisión por par,
que está ponderada por n². El riesgo en sí era real (esa cadena genera 45 pares de viviendas
distintas que una igualdad ingenua trataría como coincidencia fuerte), pero la magnitud estaba
inflada. Detalle en `docs/AI-NOTES.md`.

**El falso positivo irreducible (RDS-7).** Dos anuncios idénticos en TODOS los campos
estructurados que la estrategia evalúa normalizan a score exactamente 1.0 por construcción —
ningún umbral por debajo de 1.0 puede evitar que acepten. Documentado explícitamente en el
corpus (`hn-8-identico-en-todo-falso-positivo-irreducible`) como límite conocido de una
estrategia solo de datos estructurados, no como negativo difícil superado: distinguir ese caso
de una vivienda genuinamente distinta que comparte por casualidad cada campo evaluado exigiría
una señal de imagen, diferida por decisión 006. Detalle en `docs/AI-NOTES.md`.

**Esto prueba mecánica, no calibración.** El corpus de 24 pares etiquetados
(`packages/core/test/dedup-corpus.ts`) es construido a mano, no muestreado: demuestra que la
estrategia hace lo que dice que hace (desglose completo, normalización por peso efectivo,
piso de evidencia, veto, bandeado), nunca que los pesos y umbrales concretos (versión 1.0.0)
sean los correctos a escala real. Ningún peso ni ninguno de los dos umbrales está validado
contra evaluación real. La evaluación real —falsos positivos y falsos negativos medidos sobre
datos reales, revisados a mano— llega en ROADMAP 1.10.

---

## [x] 1.10 · Consolidación de viviendas canónicas

```text
Implementa la fase que agrupa listings en properties a partir de las decisiones
del deduplicador, y consolida los valores de la vivienda canónica.

El precio mostrado es el más económico del grupo. El resto de atributos se toman
del anuncio más completo y actualizado. Se conserva el acceso individual a cada
anuncio de origen.

Añade un comando para reprocesar la deduplicación completa sobre los datos ya
ingeridos, sin llamar a ninguna fuente externa.
```

**Revisar.** Que el reproceso funciona sin gastar cuota. Es lo que permitirá comparar
estrategias más adelante.

**Notas:**

Implementados `buildPropertyGroups`/`selectWinningListing` (`packages/core/src/consolidation/`),
la hidratación y el escritor transaccional (`packages/db/src/{hydration,consolidation}.ts`) y el
comando `reprocess` (`apps/ingestion/scripts/reprocess-dedup.ts`). **Los anuncios sin duplicado
detectado también se consolidan**: cada listing recibe exactamente una fila en
`property_listings`, singleton incluido, con un marcador `selfGroup` de peso 0 en `signals`
(decisión de diseño D6, spec revisión 2, arbitrada en obs #162 — ver el prompt de esta entrada
en `docs/PROMPTS.md` para el razonamiento completo).

**La prueba de "cero cuota" (D11+D12) es doble y ninguna mitad basta por sí sola.** D12 es un
test de integración que corre con `fetch` sustituido para lanzar y ambas credenciales de
Idealista borradas del proceso: prueba que el camino REALMENTE EJECUTADO no llama a ninguna
fuente. D11 es una regla de eslint (`no-restricted-imports` sobre `**/sources/**`) que prohíbe
el import directo de cualquier módulo de `src/sources/**` desde `scripts/reprocess-dedup.ts` y
`src/dedup/**`: prueba la superficie de imports declarada, incluido código muerto que el test
nunca alcanzaría. **Ninguna cubre lo que la otra no cubre**: D12 no detecta un import nunca
ejecutado; D11 solo detecta la especificación textual del import, no el grafo de módulos
resuelto, así que un import transitivo (un módulo intermedio que a su vez importe de
`sources/`) queda fuera de su alcance. La verificación en tiempo de `apply` (tarea 4.8) confirmó
que el glob `'**/sources/**'` SÍ coincide con la forma relativa real
(`../src/sources/idealista/idealista-source.js`) bajo el minimatch instalado — se probó con una
importación deliberadamente violatoria, se confirmó el aviso de lint exacto, y se retiró. No
hizo falta ningún fallback.

**Obligación hacia adelante para ROADMAP 1.11 (N3).** Un único ganador por grupo (decisión 053)
significa que una propiedad puede quedar con un atributo `NULL` cuando un miembro no ganador sí
tenía ese dato y el ganador no. Un valor `NULL` en `bathrooms`/`propertyType` es invisible para
los filtros de «baños»/«tipo de inmueble» que 1.11 va a construir sobre estas mismas columnas.
No se rellena desde otro miembro en este paso — coste aceptado explícitamente, no un defecto.

**Obligación hacia adelante para ROADMAP 1.12 (R4).** `properties.id` no es estable entre
reprocesos (decisión 054, Q6): cada reproceso borra y reconstruye la caché completa con uuids
nuevos. Las páginas de detalle con URL propia que 1.12 va a construir no pueden usar
`properties.id` tal cual como parte de una URL durable.

**`packages/db`'s `vitest run` por defecto no prueba nada de este paso.** La puerta de tests que
sí lo hace es `pnpm --filter @buscahogar/db run test:consolidation` — la suite por defecto usa
la puerta `describeWithDb` que se salta en silencio sin base de datos, el mismo límite ya
documentado para el paso 1.8 (obs #129, nota A6). Confirmado directamente en la tarea 3.11 de
esta misma fase: la suite por defecto siguió en verde (29/29) sin ejercer ni una sola línea de
`hydration.ts`/`consolidation.ts`.

**`apps/ingestion` consume `@buscahogar/db` por su `dist/` compilado, no por su código fuente.**
Cualquier cambio en `packages/db`/`packages/core` necesita `pnpm --filter @buscahogar/db run
build` antes de que `apps/ingestion` (y, por la misma razón, `apps/web` en pasos futuros) pueda
verlo. La unidad D de esta fase lo sufrió directamente: el primer `test:db` contra el CLI recién
escrito falló con `TypeError: hydrateListingsForDedup is not a function` hasta reconstruir el
`dist/` desactualizado. Detalle en `docs/AI-NOTES.md`.

**El corpus real de Idealista (obs #142, 50 anuncios) ya no existe en la base de datos de
desarrollo.** Verificado directamente contra el contenedor `buscahogar-db-1`: `listings`,
`listing_versions`, `properties` y `sources` están en cero filas; solo `zones` conserva una fila.
La causa, con certeza razonable y no una simple sospecha: la decisión 046 (sin base de datos de
test separada) combinada con el número de ejecuciones de suites contra base de datos real que
este cambio —el mayor del arco, con tres configuraciones fail-loud distintas en `packages/db` y
`apps/ingestion`— disparó en una sola sesión, cada una truncando la base compartida. **Esto tiene
una consecuencia directa para la honestidad de la memoria del TFM: el agrupamiento no trivial
(D2/D3, cuando un componente reúne más de un anuncio) quedó demostrado exclusivamente contra
datos sembrados a propósito** — 18 tests puros de la Unidad B y 14 tests de integración de la
Unidad C, todos con corpus construido a mano para forzar el caso multi-miembro — **nunca contra
el corpus real**, que en su estado anterior (50 códigos de anuncio distintos entre 50 anuncios,
obs #142) probablemente no formaba ningún grupo de más de un miembro de todos modos. La ejecución
manual del comando `reprocess` contra la base de datos real (tarea 4.12) solo pudo demostrar la
forma y la finalización del informe (`listingsConsidered: 0`), no una agrupación no trivial sobre
datos reales — y no puede volver a intentarse sin volver a gastar la cuota facturable que costó
obtener esos 50 anuncios originalmente. Ningún paso posterior debe presentar el agrupamiento como
validado contra datos reales a partir de esta sesión.

---

## [x] 1.11 · Búsqueda y listado en Next

```text
Implementa la búsqueda en apps/web:

- Página de resultados como Server Component que consulta packages/db
  directamente, sin capa de fetching en cliente.
- Filtros en search params: operación, ubicación, rango de precio, rango de
  superficie, habitaciones, baños, tipo de inmueble. Validados con Zod.
- Ordenación por precio, superficie y fecha de actualización.
- Cada resultado muestra los datos consolidados y en cuántas fuentes aparece.
- Imágenes remotas mediante la optimización de imágenes de Next, con los dominios
  de la fuente configurados.

Nada de TanStack Query ni Zustand. El estado de búsqueda vive en la URL.
```

**Revisar.**

- Que una búsqueda es compartible copiando la URL.
- Que no hay llamadas a la API externa desde `web`.
- **MANUAL ACCEPTANCE (sin mecanismo de test, arbitraje obs #175):** el bundle de cliente no
  contiene la credencial de base de datos (requiere inspeccionar un `next build` de producción
  real). El rol de solo lectura rechaza un intento de escritura (requiere el rol real,
  prerrequisito del mantenedor). Abrir la URL de resultados en una sesión de navegador limpia
  reproduce exactamente la misma búsqueda (filtros/orden/página visibles e idénticos).

**Notas:**

Paso **planificado, no implementado**, el 2026-09-16. Ciclo SDD detenido tras el arbitraje, a
petición del usuario por cuota, en un límite limpio: no se ha ejecutado `sdd-tasks` ni se ha
escrito código. Artefactos en Engram: `explore` (#169), `preproposal-state` (#170 rev 2),
`proposal` (#171), `design` (#173), `spec` (#174 rev 2), `arbitration` (#175).

**Tres decisiones de producto, escaladas en un único prompt agrupado y confirmadas por el
usuario antes de la propuesta:**

- **PD-1, frontera de credenciales.** `apps/web` recibe su propio `DATABASE_URL` respaldado por
  un rol de PostgreSQL de solo lectura, nunca `NEXT_PUBLIC_*`. Obliga a enmendar la decisión 015
  (ver desviaciones). Descartado: el mismo `env_file` que `ingestion` (concede escritura
  innecesaria) y mantener la prohibición literal (haría el paso inimplementable).
- **PD-2, imágenes dentro del alcance.** El `thumbnail` de Idealista se captura de extremo a
  extremo y las filas existentes se rellenan con un backfill desde `listing_versions.raw`, que
  **no gasta cuota**: `rawElementSchema` es `z.looseObject` y ya preservaba la clave.
- **PD-3, filtro de ubicación por centro + radio** sobre `properties.locationGeography`, la
  única geografía con datos reales. `locationId` está a `NULL` en el 100 % de las filas.

**Siete decisiones técnicas delegadas a la propuesta (A-1…A-7):** recuento de fuentes como
`COUNT(DISTINCT listings.source_id)` en proyección correlacionada; NULL excluido mientras su
filtro está activo, sin rama de rescate; `NULLS LAST` explícito con desempate por uuid;
paginación por offset con tope duro y `hasNextPage` en vez de total; índices **re-aplazados**
con disparador de medición registrado (cierra la delegación de la decisión 051); esquema de
frontera nuevo en `packages/core` con parseo nombrado en vez de `z.coerce`; y `thumbnailUrl`
como `identity-column`.

**A-7 es la decisión que protege el histórico.** `VERSION_COLUMN_FIELDS` se deriva de
`LISTING_FIELD_POLICY`, así que clasificar el thumbnail como `version-column` habría metido cada
recorte de imagen del portal en la detección de cambios y habría fabricado filas falsas en
`listing_versions`. Coste aceptado: el thumbnail se congela en la primera vista.

**Prerrequisito humano que bloquea `sdd-apply`:** crear el rol de PostgreSQL de solo lectura y
poner su URL en el `.env` de la raíz como `WEB_DATABASE_URL` y en `apps/web/.env.local` como
`DATABASE_URL`. El agente no puede escribir ninguno de los dos ficheros.

**Previsión de tamaño: ~1364 líneas frente al presupuesto de 800.** Con `single-pr`, la decisión
de `size:exception` queda pendiente y debe tomarse antes de aplicar. Alternativa en tres tramos,
cada uno bajo presupuesto, registrada en la propuesta: thumbnail + backfill (~345),
core + db + spatial (~515), web + docs (~500).

**Tres escenarios del spec quedan como aceptación manual**, no como test, y pertenecen a la
lista de «Revisar» de arriba: que el bundle de cliente no contiene la credencial, que el rol de
solo lectura rechaza una escritura, y que abrir la URL en una sesión limpia reproduce la
búsqueda. Los otros tres que no tenían mecanismo se re-anclaron a comprobaciones estáticas o a
una función pura, sin añadir jsdom.

**Entradas pendientes en `DECISIONS.md` (056–060), a escribir durante `sdd-apply`:** 056
frontera de credenciales (enmienda la 015), 057 propiedad del esquema y la coerción de search
params (enmienda la 030), 058 semántica de la consulta de búsqueda, 059 clasificación del
thumbnail, 060 re-aplazamiento de los índices.

**Implementación — `sdd-apply`, 2026-09-17. Código completo para las 39 tareas del checklist;
verificación honestamente parcial por dos bloqueos ajenos al código escrito, no simulados:**

1. **Docker Desktop no está disponible en este entorno de ejecución.** Ningún test respaldado
   por PostgreSQL real pudo ejecutarse — ni los nuevos (`backfill-thumbnails.db.test.ts`) ni los
   YA EXISTENTES antes de este cambio (`spatial.test.ts`, `schema.test.ts`, `seed.test.ts`,
   `listing-writer.db.test.ts`, etc. — los 25 tests fail-loud de `apps/ingestion` y los
   correspondientes de `packages/db` fallan con `ECONNREFUSED`, confirmando que el bloqueo es de
   infraestructura, no una regresión de este cambio). La migración `0006` se generó
   (`drizzle-kit generate`) y `packages/db` compila limpio contra ella, pero **no se aplicó**
   (`pnpm db:migrate` requiere la base de datos viva). Consecuencia práctica: quien reanude este
   paso debe levantar `docker compose up -d`, ejecutar `pnpm db:migrate`, y entonces sí correr
   `pnpm --filter @buscahogar/ingestion test:db` para obtener la evidencia real de
   `backfillThumbnails` contra PostgreSQL (el código y el test ya están escritos y typecheckan
   limpio).
2. **El prerrequisito humano de WU3 sigue sin resolverse**: el rol de PostgreSQL de solo lectura
   y su URL en `.env`/`apps/web/.env.local` no existen todavía. Todo el código de WU3 que NO
   depende de una credencial real está escrito y probado (el camino fail-loud de
   `apps/web/src/server/db.ts`, las dos pruebas estáticas, el helper puro de miniatura); lo que
   falta son exclusivamente las tres comprobaciones de aceptación manual ya listadas arriba.

Todos los tests que SÍ pueden correr sin Docker pasan: `pnpm --filter @buscahogar/core test`
(380/380 incl. `search-query.schema.test.ts`), `pnpm --filter @buscahogar/ingestion test`
(231/231, excluye `test:db`), `pnpm --filter @buscahogar/db test` (29/29 sobre la config por
defecto, que excluye las suites fail-loud), `pnpm --filter @buscahogar/web test` (8/8).
`typecheck` y `lint` limpios en los cuatro workspaces tocados.

---

> **Cierre del paso (2026-09-17).** Los dos puntos de arriba que declaran Docker no disponible y
> el prerrequisito humano sin resolver eran ciertos cuando se escribieron, al final del primer
> lote de `sdd-apply`, y **han quedado superados**. Se conservan porque este registro es
> append-only. Estado final:
>
> - **39/39 tareas.** Docker operativo, migración `0006` aplicada, rol `web_readonly` creado y
>   probado, `DATABASE_URL` de `apps/web` apuntando a él.
> - **720 tests en verde**: core 383 · db 54 · ingestion 231 + 29 (BD) · web 8 ·
>   consolidación 15. `typecheck` sin errores, `lint` en exit 0.
> - **Tres defectos encontrados al ejecutar la aplicación por primera vez**, no por los tests:
>   la subconsulta del recuento de fuentes era SQL inválido (Postgres 42702) y la búsqueda no
>   había funcionado nunca; `result-card.tsx` importaba con sufijo `.js` que Turbopack no
>   resuelve; y el `:?` del compose. Los tres en `AI-NOTES.md` y en la tabla de desviaciones.
> - **`sdd-verify` devolvió `fail`** con 3 bloqueantes: escenarios de la especificación sin
>   ningún test que los ejecutara (tope de página, congelación del thumbnail al re-ver, thumbnail
>   consolidado del ganador). Confirmó de forma independiente los 715 tests de entonces y rehizo
>   dos sabotajes por su cuenta. Los tres huecos se han cubierto después con tests verificados en rojo: `PERSIST-3b`, `PROP-4a` y el bloque del tope de página.
> - **Re-ejecución de `sdd-verify` hecha: 0 bloqueantes, 0 hallazgos críticos.** Rehízo por su
>   cuenta el ciclo sabotaje→rojo→revertir de `PERSIST-3b` y descartó que `PROP-4a` fuera
>   tautológico (`fetchWinnerAttributes` y `fetchGroupMinPriceCents` son caminos independientes).
>   El veredicto nativo sigue siendo `fail` por un motivo estructural, no por un defecto:
>   `gentle-ai sdd-verify-validate` exige totales al 100 % de requisitos y escenarios, y **tres de
>   los escenarios están marcados MANUAL ACCEPTANCE en la propia especificación**, así que ningún
>   test puede cubrirlos. El 100 % es inalcanzable en este paso por construcción.
> - **El riesgo de los escenarios cubiertos solo por `.toSQL()` se ha cerrado en su parte de más
>   valor**, por decisión del mantenedor, en vez de archivarse como excepción. `search.db.test.ts`
>   pasa de 4 a 7 casos ejecutados contra Postgres, los tres nuevos verificados en rojo:
>   exclusión de NULL con el filtro activo (y su inclusión con el filtro ausente, que es la otra
>   mitad de la regla A-2), `NULLS LAST` en los dos sentidos con una fila de precio NULL real —el
>   caso DESC es el que importa, porque Postgres ordena NULLS FIRST por defecto ahí— y pedir una
>   página más allá de los datos dentro del tope. Total: **723 tests**.
> - La base de datos de desarrollo tiene 2 viviendas, restos de los tests. El corpus real se
>   borró durante el ciclo 1.10 y repoblarlo gasta cuota de Idealista.

## [x] 1.12 · Detalle y redirección a las fuentes

```text
Implementa la página de detalle de una vivienda: datos consolidados, galería de
imágenes, y el listado de todos los anuncios de origen con enlace a cada uno.

Cuando una vivienda proceda de varias fuentes, debe verse con claridad cuáles son
y qué precio ofrece cada una.
```

**Revisar.**

- **MANUAL ACCEPTANCE (sin mecanismo de test, arbitraje obs #193 AR-9):** el carrusel de
  `source-gallery.tsx` se desplaza correctamente con JavaScript deshabilitado (arrastre táctil /
  rueda + clic en las anclas `#source-slide-…`). Ninguna prueba de navegador en este stack lo
  observa; `renderToStaticMarkup` produce markup estático, no una interacción de scroll real.
  **PENDIENTE — nadie lo ha comprobado.** El paso se archivó sin esta revisión, por decisión
  explícita del mantenedor (2026-09-19). Lo único verificado es estructural: la página servida
  emite las utilidades `snap-x`, `snap-mandatory` y `snap-center` de Tailwind, y ningún fichero de
  `apps/web/src` declara `'use client'`. Que el desplazamiento funcione de verdad con JavaScript
  desactivado sigue sin observarse.
- **MANUAL ACCEPTANCE (misma arbitración):** el tono/maquetación de N=1 (una sola fuente) no se
  ve como una versión degradada de N>1. La mitad estructural (ninguna rama JSX condicionada a
  `sources.length === 1`) SÍ está cubierta por un test estático
  (`apps/web/test/no-single-source-branch.test.ts`); la mitad de percepción visual no.
  **PENDIENTE — nadie lo ha mirado.** El paso se archivó sin esta revisión, por decisión explícita
  del mantenedor (2026-09-19). La percepción visual no se ha juzgado. Además, cuando se juzgue será
  contra datos sintéticos: la única fila persistida es un fixture con URL de marcador
  (`https://example.test/anuncio`), porque el corpus real de 50 anuncios se perdió en el paso 1.10 y
  recuperarlo cuesta cuota facturable.

**Notas:** El paso se completó a través de dos sesiones de `sdd-apply`:

**Sesión 1 (2026-09-18)**: WU1 (numPhotos) y WU2 (capa de consulta) completos, 28/54 tareas. Se
completó con evidencia contra Postgres real (88 tests en verde entre core, db, ingestion). Se
detectó un bloqueo de infraestructura AR-9 (Vite/Rolldown rechazando JSX en `.tsx`) pero no se
resolvió en esa sesión.

**Sesión 2 (2026-09-19)**: WU3 (23/23 tareas: página, galería, lista, header) completado. El
bloqueo AR-9 se resolvió añadiendo `oxc.jsx: { runtime: 'automatic' }` a la configuración de
vitest (la clave correcta en Vite 8, que ignora `esbuild.jsx` cuando `oxc` está presente). Se
verificó primero con una prueba de humo aislada (`<div>hello</div>`) antes de tocar componentes
reales. Docker Desktop no estuvo disponible durante esta sesión, así que las cuatro puertas
fail-loud de `packages/db` no se pudieron re-ejecutar, pero se reportó honestamente como "no
ejecutado" (no "en verde").

**Sesión 3 (2026-09-19, `sdd-verify`)**: Independientemente de `sdd-apply`, la fase de verificación
re-ejecutó la suite completa en una máquina con Docker disponible:

- `pnpm test` → 739 tests (core 394, db 62, web 40, ingestion 243)
- `pnpm --filter @buscahogar/db run test:blocking` → 18 tests
- `pnpm --filter @buscahogar/db run test:consolidation` → 15 tests
- `pnpm --filter @buscahogar/db run test:detail` → 10 tests (nuevo en 1.12)
- `pnpm --filter @buscahogar/ingestion run test:db` → 32 tests

**Total: 814 tests, 0 fallos, 0 saltados.** Build `pnpm build` exitoso (next build con Turbopack).
`pnpm -r lint` y `pnpm -r typecheck` limpios. Todos los requerimientos de la spec (19 requisitos,
29 escenarios) verificados compliant. Todas las decisiones de arbitraje (obs #193/#194) verificadas
en código contra fuente, no contra narrativa. Ambas subconsultas correlacionadas ejecutadas contra
Postgres real (no `.toSQL()` solo) — misma lección que el paso 1.11 de DEFECT-1.

**Lo que se DECIDIÓ no entregar:**

La tarea pide "galería de imágenes" (`ROADMAP.md:1175`). La `developers.idealista.com` está tras
solicitud de socio (inaccesible 2026-09-19), sin endpoint de detalle documentado, sin términos de
licencia legibles, sin cuota conocida. Obs #189 (exploración del paso 1.5) capturó dos clientes
independientes de código abierto contra el endpoint real: ambos exponen solo `thumbnail` (URL única)
+ `numPhotos` (conteo), nunca un listado de fotos. **Que eso se implementa requiere el consentimiento
del socio de Idealista y constituye su propio paso en la hoja de ruta, no una responsabilidad del
detalle de 1.12.**

Lo que SÍ se entregó: un carrusel de una imagen por fuente + recuento de fotos (fechado, porque se
capturó en la primera sighting) + enlace de redirección a cada anuncio de origen. Decisión 063
registra el alcance real vs. la expectativa del enunciado.

**Estado de tareas:** 54/54 del checklist original, más 2 pruebas estáticas añadidas como evidencia
(confirmación de `notFound()` y ausencia de rama por `sources.length === 1`) — 814 tests en verde.
Dos escenarios permanecen como MANUAL ACCEPTANCE por diseño (arriba) — genuina limitación de
interacción de navegador, no un hueco.

El paso está **ARCHIVADO y CERRADO** per obs #202 (`sdd/property-detail-source-links/archive-report`).
La entrega ordinaria (commit/push/PR) sigue siendo decisión de política de repositorio.

---

## [~] 1.13 · Cobertura bajo demanda

```text
Implementa el mecanismo de cobertura bajo demanda de docs/ARCHITECTURE.md:

- Resolución de la ubicación introducida a un identificador canónico de zona, para
  que distintas formulaciones de la misma zona no generen barridos duplicados.
- Autocompletado de ubicación en la interfaz sobre zonas canónicas, en lugar de
  texto libre.
- Si la zona no está cubierta, se registra un coverage_job y la interfaz muestra
  el estado del proceso hasta que termina.
- El worker consulta coverage_jobs periódicamente y ejecuta barrido, normalización
  y deduplicación de la zona.
- Presupuesto diario de peticiones y tope de zonas nuevas por día y por sesión,
  con degradación explícita al alcanzarlo.
```

**Revisar.** Los límites de cuota, probándolos de verdad. Es lo que impide que una demo
descontrolada agote el mes.

**Notas:**

Paso **iniciado** el 2026-09-19 con el ciclo SDD completo (`/gentle-sdd-new`, cambio
`on-demand-coverage`): explore → research → propose → `sdd-spec`/`sdd-design` en paralelo →
arbitraje del orquestador → `sdd-tasks` → `sdd-apply` en cuatro unidades de trabajo
secuenciales (A→B→C→D, orden de seguridad, no de preferencia). **El paso queda en `[~]`,
no `[x]`**: dos tareas exclusivas del responsable del proyecto siguen sin hacer (10.5/10.6,
más abajo) y `sdd-verify` todavía no se ha ejecutado sobre el conjunto.

`sdd-spec` y `sdd-design` se ejecutaron en paralelo y produjeron cinco contradicciones reales
entre ambos artefactos, arbitradas por el orquestador antes de `sdd-tasks` a favor del diseño
en los cinco casos — el diseño había leído el código real, la especificación había razonado
desde la prosa de la propuesta. Detalle completo, con las cinco reglas y el porqué de cada
una, en Engram `sdd/on-demand-coverage/arbitration` (obs #217); ver también la tabla de
desviaciones más abajo para la más peligrosa de las cinco (CR-15).

**Unidad A — catálogo de zonas** (migración `0008`, fases 1-5). Añade `centroid`,
`sweep_radius_m` y `search_name` a `locations`, un índice único completo en `coverage_jobs`,
y los módulos puros de conversión del catálogo INE+NGMEP (`apps/ingestion/src/catalogue/`).
**El catálogo importado real (~8.100 municipios) sigue sin existir**: ningún agente puede
descargar los ficheros NGMEP/INE reales (restricción R7 de la propuesta), así que
`packages/db/src/municipality-catalogue.generated.ts` se entrega como un placeholder
honestamente vacío. La fusión (`mergeCatalogues`) con un catálogo importado vacío es un
no-op, así que Granada sigue sembrándose exactamente como antes de este cambio. El
responsable del proyecto debe ejecutar
`apps/ingestion/scripts/import-municipality-catalogue.ts` contra los ficheros reales, tras
rellenar `NGMEP_FIELD_MAP`/`INE_REGISTER_FIELD_MAP` según las cuatro comprobaciones que cita
la cabecera de `ngmep-parse.ts`, para que el catálogo deje de estar vacío. Atribución
CC-BY/IGN añadida en `apps/web/src/app/layout.tsx` y `docs/ARCHITECTURE.md` (decisión 067).

**La duda que la decisión 036 dejaba aplazada queda respondida.** Esa decisión no sabía si el
código de entidad del nomenclátor IGN/CNIG era compatible con el código INE de 5 dígitos de
`locations.ine_code` o un esquema paralelo incompatible. Fuente primaria (página de ayuda del
propio nomenclátor del INE, `https://www.ine.es/nomenclator/ayuda.htm`, obs #209 §Q3): el
código jerárquico completo es `provincia(2) + municipio(3) + EC + ES + NUC` — **el mismo
código de municipio de 5 dígitos, con hijos añadidos detrás**, no un esquema paralelo. El
hueco que quedaba abierto desde el paso 1.7 sí es resoluble; lo que queda pendiente es
exclusivamente la importación que debe ejecutar el responsable del proyecto (párrafo
anterior), no ninguna duda de compatibilidad de esquema.

**Unidad B — presupuesto diario persistente** (migraciones `0009`/`0010`, fases 6-7).
`reserveDailyBudget`/`reconcileDailyBudget` en `packages/db/src/budget-ledger.ts`, ledger
`daily_request_budget` que sobrevive a un reinicio del proceso. **Corregida tras
verificación independiente del orquestador, antes de asentar el trabajo**: la primera
versión no aplicaba el tope en la primera reserva de cada día UTC — ver
`docs/AI-NOTES.md`, entrada de esta misma fecha, para el relato completo con la causa
raíz (un hueco del propio diseño, DD-12) y la segunda corrección anidada que salió al
probar la primera contra Postgres real.

**Unidad C — worker de cobertura** (fases 8-9). `apps/ingestion/src/sweep/coverage-worker.ts`
sustituye el `main()` placeholder; reutiliza `composeStore`/`runSweep`/`buildReport` tal cual
los usa la CLI de un solo barrido, sin reescribirlos. Presupuesto comprobado antes de
reclamar el job (nunca infla `attempts` de un job nunca intentado). Deduplicación global tras
cada barrido, coalescida a lo sumo una vez por ciclo (decisión 068).

**Unidad D — disparador web** (fases 10-14). Autocompletado server-rendered sobre zonas
canónicas (sin JavaScript de cliente salvo el único componente ya permitido para el estado
del job), registro de `coverage_job` por un segundo rol de PostgreSQL `INSERT`-only
(decisión 064), degradación explícita con aviso nombrado cuando el tope de zonas nuevas del
día está agotado (decisión 065 para el estrechamiento del test de directivas de cliente).
**34/36 tareas hechas.** Las dos que faltan son exclusivas del responsable del proyecto y
ningún agente tiene permiso para completarlas: **10.5**, aprovisionar el segundo rol de
PostgreSQL (`INSERT` solo sobre `coverage_jobs`) y escribir `WEB_COVERAGE_DATABASE_URL` en
el `.env` de la raíz; y **10.6**, ejecutar en verde el test de privilegio negativo que lo
comprueba (`apps/web/test/db/coverage-role-privileges.test.ts`, 7 casos, escrito y gateado
pero nunca ejecutado — su resultado real es desconocido hasta entonces).

Registro completo de evidencia TDD, ficheros cambiados y desviaciones (todas explícitas,
ninguna oculta) por unidad en Engram: `sdd/on-demand-coverage/apply-progress` (obs #220,
unidades A y B), `apply-progress-2` (obs #223, unidad C), `apply-progress-3` (obs #226,
unidad D). Decisiones registradas: 064 a 068 (`docs/DECISIONS.md`), cinco entradas
consecutivas tras la 063.

**Gates finales de esta sesión de cierre** (`docker compose ps` comprobado en vivo al empezar,
no heredado de una sesión anterior — `buscahogar-db-1`, sana): `pnpm lint` limpio en los cinco
workspaces; `pnpm typecheck` limpio en los cinco; `pnpm -r test` en verde — core 416, db 112,
ingestion 294, web 74 pasados + 7 saltados (896 en total, cero llamadas reales a la API de
Idealista). Las cuatro suites respaldadas por Docker (`db` `test:blocking`/`test:consolidation`/
`test:detail`, `ingestion` `test:db`) pasaron en verde ejecutadas **una a una**, tras detectar
que ejecutarlas en paralelo contra la base de datos compartida (decisión 046: no hay base de
datos de test separada) produce un fallo de clave foránea espurio por condición de carrera entre
suites que truncan y siembran la misma base — no un defecto real. Resultado final, secuencial:
18/18 + 15/15 + 10/10 + 44/44, todo en verde.

---

## [ ] 1.14 · Segunda fuente

**Depende de** los accesos pendientes. Si no llegan, usar la alternativa prevista en
`DECISIONS.md`: feeds de sindicación o dataset con esquema distinto.

```text
Implementa un segundo adaptador contra la interfaz PropertySource, con un esquema
de datos claramente distinto al de la primera fuente.

El objetivo es validar que la abstracción funciona: añadir esta fuente no debe
requerir modificar packages/core, packages/db ni apps/web. Si algo del núcleo
necesita cambiar, dímelo antes de hacerlo, porque significa que la abstracción
está mal planteada.
```

**Revisar.** Qué ficheros ha tocado. Si ha modificado el núcleo, es un hallazgo relevante
para la memoria: anotarlo en `DECISIONS.md`.

**Notas:**

---

## [ ] 1.15 · Seguridad y cierre de fase

```text
Repasa la aplicación contra la sección de seguridad de docs/ARCHITECTURE.md y
corrige lo que falte:

- Validación con Zod de toda entrada externa, search params incluidos.
- Ninguna credencial accesible desde apps/web ni en variables NEXT_PUBLIC_*.
- Rate limiting en los endpoints públicos.
- Cabeceras de seguridad y política de contenido.
- Secretos fuera del control de versiones.

Dime qué has encontrado antes de corregirlo.
```

**Notas:**

---

# Fase 2 — Profundización

## [ ] 2.1 · Ampliar el conjunto etiquetado

Trabajo manual, no de Claude Code. Objetivo: volumen suficiente de pares, con negativos
difíciles bien representados.

**Notas:**

---

## [ ] 2.2 · Comparación de estrategias de deduplicación

```text
Implementa una segunda DedupStrategy con un enfoque distinto a la basada en
reglas, y un comando que ejecute varias estrategias sobre el mismo conjunto
etiquetado y reporte precisión, recall y F1 de cada una, además del efecto de
mover los umbrales.

La salida debe ser exportable para incluirla en la memoria.
```

**Notas:**

---

## [ ] 2.3 · Comparación de imágenes

```text
Añade la comparación de imágenes como señal adicional mediante perceptual hashing,
teniendo en cuenta que cada portal reescala y recomprime, por lo que la comparación
exacta no sirve.

Mide su aportación real frente a la deduplicación basada solo en datos
estructurados, sobre el mismo conjunto etiquetado.
```

**Notas:**

---

## [ ] 2.4 · Indexación y medición de rendimiento

```text
Genera un volumen de datos suficiente para que la indexación importe y mide el
rendimiento de las consultas de búsqueda:

- Analiza los planes de ejecución de las consultas principales.
- Propón los índices necesarios y aplícalos.
- Vuelve a medir y dame los tiempos antes y después.

Objetivo: búsqueda sobre datos indexados por debajo de 500 ms.
```

**Notas:**

---

## [ ] 2.5 · Refresco y retención

```text
Implementa la política de refresco y retención de docs/ARCHITECTURE.md:
refresco semanal para zonas con consultas recientes y menor para las inactivas,
marcado de anuncios desaparecidos como inactivos, y purga separada de anuncios
inactivos y de zonas sin consultas.
```

**Notas:**

---

## [ ] 2.6 · Vista de mapa

```text
Añade la vista de mapa con las viviendas resultantes de la búsqueda y búsqueda
por zona dibujada sobre el mapa.
```

**Notas:**

---

# Fase 3 — Si el tiempo lo permite

## [ ] 3.1 · Búsqueda mediante lenguaje natural

```text
Implementa la interpretación de consultas en lenguaje natural: transformar una
frase del usuario en los criterios estructurados del motor de búsqueda, validados
con el mismo esquema Zod que los filtros.

La consulta interpretada debe mostrarse al usuario de forma editable, para que
pueda corregir la interpretación antes de buscar.
```

**Notas:**

---

# Registro de desviaciones

Cambios sobre esta hoja de ruta y su motivo. Material directo para la memoria.

| Fecha      | Paso | Cambio                                                                                                                                                                                                                          | Motivo                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-04 | 1.1  | Ronda correctiva completa tras marcarse `[x]` en falso                                                                                                                                                                          | El ciclo SDD se autoinformó `done` sin ejecutar install/build/lint/test; `react` quedó en una RC inventada (regresión sobre la estable ya commiteada), sin `.env.example`, sin `packageManager`, sin Tailwind ni runner de tests. Detalle en `AI-NOTES.md`.                                                                                                                                   |
| 2026-09-04 | 1.1  | Añadidos no previstos en el prompt: `@next/eslint-plugin-next` y `apps/web/src/app/page.tsx`                                                                                                                                    | `eslint-plugin-react@7.37.5` (vía `eslint-config-next/core-web-vitals`) es incompatible con ESLint 10; se sustituye por el plugin de Next directo. `next build` no compila sin página raíz. Decisiones 011 y notas en `AI-NOTES.md`.                                                                                                                                                          |
| 2026-09-04 | 1.1  | Tercera pasada: revisión manual completa y corrección de 13 hallazgos                                                                                                                                                           | Las cuatro puertas en verde no prueban que se cumpla el requisito. `apps/web` no aplicaba la config ESLint compartida, `engines.node` era insuficiente para el código escrito, un clonado limpio no arrancaba y `packages/core` heredaba tipos del DOM. Decisiones 012 y 013; detalle en `AI-NOTES.md`.                                                                                       |
| 2026-09-07 | 1.2  | Partido en tres sesiones por bloqueos del entorno, no del código: fases 1, 2 y 4 el 07-09; fase 3 el 08-09                                                                                                                      | El paso se escribió y documentó entero el 07-09, pero la verificación de tiempo de ejecución tuvo que esperar a tres bloqueos encadenados del entorno: Docker se dio por no instalado siendo falso (ver `AI-NOTES.md`), luego faltaba WSL, y luego el componente «Plataforma de máquina virtual» de Windows. Resuelto el 08-09, la fase 3 pasó sin cambiar una línea de `docker-compose.yml`. |
| 2026-09-08 | 1.2  | Reforzado el criterio de la tarea 3.4 con una tabla marcador, en lugar de comparar solo la versión de PostGIS                                                                                                                   | El criterio escrito («la misma versión prueba que los datos se conservan») no distingue un volumen conservado de uno destruido: al recrearse, Postgres reinstala la extensión con idéntica versión. Se añadió una fila escrita antes del `down`, que sobrevive en 3.4 y desaparece en 3.5. Detalle en `AI-NOTES.md`.                                                                          |
| 2026-09-09 | 1.3  | Partido en cuatro fases encadenadas (PR 1-4) y ejecutado fuera del orden de escritura del propio prompt: la documentación (fase 4) se completó antes de terminar el esquema espacial (fase 2) y de probar la migración (fase 3) | El volumen estimado (700-850 líneas) supera el presupuesto de revisión de 400 líneas y obligó a encadenar PRs; la fase 3 quedó bloqueada por la caída del motor Linux de Docker, inalcanzable en esta sesión, y `CLAUDE.md` exige registrar el trabajo ya hecho en lugar de esperar al cierre completo del paso.                                                                              |
| 2026-09-10 | 1.4  | Reordenado: el paso se detiene en la puerta previa a la propuesta y se adelanta el 1.5 (sonda de la API). Quedan persistidas la exploración y la investigación, y confirmadas las decisiones de producto.                                | La investigación externa cerró en `partial`: la documentación oficial de la API de Idealista está tras solicitud de socio y no es legible, así que la unidad real de `distance`, el radio máximo, la cuota, el tope de resultados paginables y la magnitud de la ofuscación de coordenadas siguen sin confirmar. Ninguno de esos huecos bloquea la forma de los tipos, pero el usuario prefirió obtener evidencia de primera mano antes de fijar `AreaQuery` y `SourcePage`. Detalle en Engram `sdd/core-domain-contracts/research`. |
| 2026-09-10 | 1.5  | Adelantado por delante del 1.4. Ejecutado con `maxItems=50` en vez del mínimo que pide el prompt, con dos llamadas presupuestadas en vez de una, y entregado en bloque único aceptando excepción de tamaño a ~1891 líneas frente a las ~1170 estimadas.                | El paso se contradice a sí mismo: pide «el mínimo de resultados posible», pero su criterio de revisión hace de las coordenadas el punto crítico, y la ofuscación no se detecta con un solo punto. La contradicción se disuelve al ver que la cuota se cobra por petición y no por resultado: pedir 50 cuesta igual que pedir 1. La segunda llamada usa otro `propertyType` para cruzar payloads y averiguar qué campos de `Listing` son realmente opcionales, que es lo que tiene parado el 1.4. El exceso de volumen viene de cubrir con tests cuatro módulos puros por separado; el usuario reconfirmó la excepción sobre la cifra real. |
| 2026-09-14 | 1.6  | `errors.ts` (tarea 2.12 del checklist de `sdd-tasks`) se escribió completo desde el principio de la fase 2 del propio checklist, no tras la tarea 2.11. Entregado en bloque único con excepción de tamaño, sin encadenar las PRs A→B1→B2 que `sdd-tasks` había sugerido. | `cursor.ts` (2.4), `budget.ts` (2.6) y `sweep-planner.ts` (2.11) necesitan importar `IdealistaSweepError` y sus subclases antes de la tarea numerada 2.12: el checklist lista las tareas en el orden de especificación (para que la revisión pueda leerlas en el orden en que el diseño las justifica), no en el orden físico posible de creación de ficheros. Ningún test ni ninguna tarea se omitió, solo cambió el momento de creación de un fichero. Sobre el tamaño: la puerta de tareas registró `size:exception` explícito del usuario para esta sesión (`ask-on-risk` resuelto), documentado en Engram `sdd/idealista-adapter-normalizer/apply-progress`; no se reabre aquí como una desviación nueva, igual que el precedente del paso 1.4. |
| 2026-09-14 | 1.7  | Partido en cuatro fases; solo la fase 1 (núcleo puro, sin I/O) ejecutada. El paso queda en `[~]` con 33 tareas pendientes y nada commiteado. | Docker Desktop no está arrancado en esta máquina, así que no hay contenedor PostgreSQL + PostGIS contra el que probar la escritura, el versionado y la idempotencia, que es lo que verifican las fases 2 a 4. La fase 1 no necesita contenedor y se entregó completa y en verde (198/198). `CLAUDE.md` exige registrar el trabajo ya hecho en lugar de esperar al cierre del paso; mismo precedente que la fase 3 del 1.3. |
| 2026-09-14 | 1.7  | `packages/db/src/seed.ts` deja de ser el no-op deliberado que entregó el paso 1.3 y pasa a sembrar de forma idempotente `sources`, `locations` y `zones` con datos reales del INE (REQ-MIG-03). | El prompt del paso 1.3 pedía «un script de seed vacío» y así se entregó. El barrido del 1.7 necesita que esas tres tablas de referencia existan antes de escribir un solo `listing`, y sembrarlas a mano fuera del repositorio dejaría el paso irreproducible. Decisión de producto P5 de esta sesión. |
| 2026-09-14 | 1.7  | Estimación de volumen superada otra vez: `sdd-tasks` previó ~2020 líneas para el paso completo, y solo la fase 1 sumó 1333 frente a las ~710-800 que esa misma fase tenía estimadas. | Segunda subestimación consecutiva de la fase de tareas: el paso 1.6 previó ~1300 líneas y entregó ~1952. El patrón se repite —cubrir con tests varios módulos puros por separado bajo TDD estricto se estima sistemáticamente por lo bajo—, así que la cifra de `sdd-tasks` se registra como dato del proceso, no como un presupuesto fiable. |
| 2026-09-14 | 1.7  | La fase 2 (dependencias, arnés de base de datos, `coverage-store.ts`, `reference-store.ts`) quedó completa y en verde en el árbol de trabajo, pero no existe evidencia TDD por tarea (RED confirmado, recuento GREEN) para las tareas 2.1-2.14 individualmente. | El batch que ejecutó la fase 2 se interrumpió por el límite de tasa de una API externa antes de persistir su propio informe de progreso. El batch siguiente verificó el estado final de forma independiente —`typecheck` limpio, `test:db -- reference-store coverage-store` en verde (11/11)— y marca 2.1-2.14 como completas sobre esa base, pero es verificación de resultado, no un registro de primera mano del ciclo RED→GREEN. Se anota en vez de fabricar una traza paso a paso que esa sesión no presenció. Detalle en Engram `sdd/zone-sweep-persistence/apply-progress`. |
| 2026-09-14 | 1.7  | El script `"test:db"` de `apps/ingestion/package.json` (tarea 4.6) se añadió antes de tiempo, durante el batch de la fase 3, no en la fase 4 a la que pertenece la tarea. | Bloqueo real, no ampliación de alcance: sin ese script no se podía ejecutar la verificación de la propia fase 3 (`listing-writer.ts`) ni re-verificar la fase 2. La tarea 4.6 de la fase 4 solo tuvo que añadir después el script `"sweep"` que le faltaba. |
| 2026-09-14 | 1.7  | La ejecución de aceptación necesitó rebobinar a mano el cursor de `coverage_jobs` (`update coverage_jobs set cursor = null`) para volver a barrer la misma página. La CLI no expone ninguna bandera de reinicio, así que una segunda invocación idéntica reanuda en la página siguiente: eso prueba reanudación, no idempotencia. Sin el rebobinado, el criterio de revisión del paso —«una segunda ejecución no duplica»— no se puede comprobar con el comando tal cual. Queda como carencia conocida de la CLI: una bandera `--restart` explícita pertenece a un paso posterior, no se añade aquí de tapadillo. |
| 2026-09-14 | 1.8  | Corregido mid-paso el comentario falso de `apps/ingestion/src/sweep/listing-writer.ts:80-82` (tarea DOC-1, alcance añadido por la propia spec del 1.8, no del prompt original) | El comentario afirmaba que las coordenadas están ausentes de todo lo que emite el adaptador de Idealista; falso, y en la dirección peligrosa — `normalizer.ts:36-39` las emite siempre que la fuente las aporta, y el corpus real verificado (obs #127) tenía 50/50 filas con `location` poblada. Cero cambio de comportamiento, solo el comentario. Detalle en `docs/AI-NOTES.md`. |
| 2026-09-14 | 1.8  | `size:exception` aceptado explícitamente por el responsable del proyecto (obs #130) tras revisar el pronóstico de ~1345 líneas (rango 1300-1650) frente al presupuesto de sesión de 800 | El diseño requería, sin margen para recortar sin perder alcance del propio ROADMAP 1.8: el esquema de umbrales, el tipo `CandidatePair`, la consulta de bloqueo con su predicado compartido, la puerta de tests fail-loud, dos pruebas de plan de índice, la CLI de calibración completa y la documentación obligatoria. Se ofrecieron tres límites de corte para encadenar PRs y se declinaron a favor de una sola PR. |
| 2026-09-14/15 | 1.8  | El autojoin del diseño original (`D-Q1`: `alias()` + `lt(a.id,b.id)` como condición del `JOIN`, predicado geográfico en `WHERE`) se reescribió dos veces durante `apply`, hasta una subconsulta `LATERAL` correlacionada con `.limit()` como barrera de optimización — restructuración real de la consulta, no una aserción relajada | Medido contra PostgreSQL real: ni el `WHERE` ni el `ON` del `JOIN` bastan, porque Postgres reordena libremente el árbol de `INNER JOIN`s y prefería el índice de precio incluso con radio estrecho, por una subestimación de coste del planificador sobre un rango parametrizado. Permitido explícitamente por `FB-GIST-NOT-CHOSEN` ("restructure the query"). Consecuencia aceptada por el mismo fallback: `CHK-PRICE-IDX` dejó de ser demostrable con la nueva forma de consulta y se retiró (no se relajó) per `FB-PARTIAL-IDX-NOT-CHOSEN`. Detalle en decisiones 042-045, `docs/DECISIONS.md`. |
| 2026-09-15 | 1.9  | No se escribe nada en `property_listings` en este paso, pese a que el texto literal del paso dice "se persiste en property_listings junto con la decisión y el nombre de la estrategia" | Confirmado en el pre-proposal (Q1, obs #144): 1.9 se mantiene puro en `packages/core`, sin ninguna dependencia de `packages/db` ni conexión a base de datos — `score(a, b)` deriva todo de los dos valores `Listing` en memoria. El texto del paso queda satisfecho por disponibilidad de contrato, no por una inserción real: las columnas `score`/`signals`/`strategy_name`/`strategy_version` de `property_listings` ya existen (ROADMAP 1.3) y `SimilarityResult` ya trae todo lo que necesitan. La inserción real es ROADMAP 1.10. |
| 2026-09-15 | 1.9  | "Revisar a mano una muestra de los grupos formados" es estructuralmente inaplicable en este paso | ROADMAP 1.9 no forma ningún grupo — Q1 excluye explícitamente `findCandidatePairs`, la hidratación de `Listing` desde filas persistidas y la consolidación de `properties` (ROADMAP 1.10/1.11). No hay ningún grupo que muestrear. El artefacto revisable en su lugar es el corpus de 24 pares etiquetados con rationale (`packages/core/test/dedup-corpus.ts`), que es lo que el prompt original pedía explícitamente ("Añade tests con pares etiquetados, incluyendo negativos difíciles"). |
| 2026-09-15/16 | 1.10 | `sdd-spec` y `sdd-design` corrieron en paralelo y devolvieron una contradicción real, no un falso conflicto: si un anuncio sin duplicado detectado ("singleton") recibe o no su propia fila en `property_listings`. Arbitrada por el orquestador antes de `sdd-tasks` (obs #162) a favor del diseño; la especificación recibió su única re-ejecución correctiva (revisión 2) | La especificación original razonaba desde `property_listings` como tabla de coincidencias reales entre dos anuncios y negaba la fila a un singleton. El diseño exigía la fila (D6), forzado porque `score`/`signals` son `NOT NULL` en esa tabla y porque ROADMAP 1.11 consulta `properties`, no `listings` — bajo la lectura de la especificación, con el corpus real medido en la exploración (50 códigos de anuncio distintos entre 50 anuncios, obs #142), casi ningún anuncio real habría tenido fila en `properties` y la página de resultados de 1.11 habría vuelto vacía. Ninguno de los dos artefactos poseía por sí solo el criterio de desempate: fue leer el consumidor aguas abajo lo que lo resolvió. |
| 2026-09-15 | 1.10 | Las tareas 1.7/1.8 (decisiones 051/055) se difirieron erróneamente a la fase 5 por una instrucción de batch que contradecía la ubicación que las propias tareas de `sdd-tasks` ya les daban en la fase 1 | Corregido dentro de la misma unidad de trabajo (Unidad A), antes de empezar la Unidad B: los comentarios del propio esquema ya citaban "decisión 051"/"055" como si existieran, así que se siguió la ubicación original de las tareas en vez de la instrucción de batch conflictiva. Ningún código de producción se vio afectado; ambas decisiones quedaron redactadas en la fase 1 como estaba especificado. |
| 2026-09-15 | 1.10 | El texto literal de la tarea 3.1 especificaba un único fichero de `setupFiles` para la nueva config de vitest de consolidación, en vez de los dos que usa el precedente que la propia tarea cita como "reutilizado verbatim" (`vitest.blocking.config.ts:17`, paso 1.8) | Seguir el texto literal habría hecho fallar la suite incondicionalmente (sin `DATABASE_URL` en el entorno de shell ambiente, solo en `.env`), no "fallar alto solo cuando falta genuinamente" — justo el objetivo declarado de D10. Corregido a los dos ficheros del precedente, byte a byte en el mismo orden, antes de escribir ningún test contra la base de datos real; verificado en rojo con los errores de módulo-no-encontrado esperados, no con errores de entorno. |
| 2026-09-15 | 1.10 | `packages/db/test/helpers/db-client.ts`'s `truncateAll()` (infraestructura de test del paso 1.7) no incluía `dedup_runs`/`dedup_pair_evidence` en su lista de orden por dependencia FK, un hueco preexistente que solo esta fase podía descubrir porque esas tablas no existían cuando el helper se escribió | Descubierto por un recuento absoluto de filas fallando en la propia Unidad C (`4` en vez de `1` esperado) en el test de atomicidad de `writeConsolidation`. Corregido añadiendo ambas tablas explícitamente; reverificado sin regresión en las suites de los pasos 1.7-1.9 (29/29, 18/18), que nunca escriben esas tablas y por tanto nunca dependieron del hueco. El mismo defecto se buscó y se corrigió proactivamente en la copia equivalente del arnés en `apps/ingestion` durante la Unidad D, antes de que causara ningún fallo allí. |
| 2026-09-16 | 1.10 | El corpus real de Idealista (obs #142, 50 anuncios) desapareció de la base de datos de desarrollo durante esta sesión, confirmado directamente contra `buscahogar-db-1`: `listings`/`listing_versions`/`properties`/`sources` en cero filas | Consecuencia aceptada de la decisión 046 (sin base de datos de test separada) combinada con el número de ejecuciones de suites contra base de datos real que este cambio —el mayor del arco, con tres configuraciones fail-loud distintas— disparó en una sola sesión, cada una truncando la base compartida. No es un defecto de este paso, pero sí tiene una consecuencia real para la memoria: el agrupamiento no trivial de este paso (D2/D3) queda demostrado solo contra datos sembrados a propósito (32 tests entre las unidades B y C), nunca contra el corpus real, que ya no puede volver a usarse para el intento sin gastar cuota facturable de nuevo. Detalle completo en las notas de este paso y en `docs/PROMPTS.md`. |
| 2026-09-16 | 1.11 | El paso se parte: se ejecuta solo la planificación (explore → propuesta → spec/diseño → arbitraje) y se detiene antes de `sdd-tasks`, a petición del usuario por cuota disponible | Se prefirió cerrar en un límite limpio con el registro documental hecho antes que arrancar `sdd-tasks` y la implementación —el bloque más grande del paso, con una previsión de ~1364 líneas— y dejarlo a medias. Los cinco artefactos de planificación quedan persistidos en Engram y la reanudación es `/gentle-sdd-continue web-search-listing`. Ninguna decisión queda implícita: las tres de producto y las siete técnicas están registradas y arbitradas. |
| 2026-09-16 | 1.11 | La regla de `CLAUDE.md` «Credenciales solo en `apps/ingestion`. Nunca en `apps/web`» ha quedado obsoleta: contradice al propio `docs/ARCHITECTURE.md` y a la decisión 004, que exigen Server Components consultando `db` directamente | La contradicción estaba escrita en **tres** sitios a la vez (`CLAUDE.md`, la prosa de la decisión 015 y el comentario de `docker-compose.yml:64-65`) y ninguno era un descuido: la 015 la declara explícitamente «intencionada». Resuelta por decisión del usuario a favor de un rol de solo lectura propio para `web`. Se enmienda por entrada nueva (056) en vez de reescribir la 015, siguiendo la convención del propio repositorio —el título de la decisión 050 es literalmente «no enmienda la decisión 019»— porque el registro de decisiones es evidencia append-only del TFM. `CLAUDE.md` y el comentario del compose sí se reescriben: son instrucciones vivas, no evidencia. |
| 2026-09-16 | 1.11 | «Ubicación» como filtro no puede implementarse como se lee en el enunciado del paso: `properties.locationId` está a `NULL` en el 100 % de las filas reales | `normalizer.ts:59` fija `location: undefined` para Idealista porque la fuente no da datos de INE/provincia, así que un filtro de zona por igualdad habría devuelto cero resultados siempre, en silencio. Sustituido por centro + radio sobre `properties.locationGeography` (PD-3), la única geografía poblada. Obliga a generalizar `withinMeters()`, hoy fijada a `listings.locationGeography`. La resolución canónica de zonas que haría útil un filtro por `locationId` la sigue debiendo el paso 1.13. |
| 2026-09-16 | 1.11 | El requisito de imágenes no era implementable con el modelo de datos existente: no había ninguna URL de imagen persistida en ninguna tabla, pese a que los fixtures traen `thumbnail` en 100/100 elementos | `rawElementSchema` nunca declaró el campo. El paso absorbe la captura de extremo a extremo (normalizador, esquema, columna en `listings` y `properties`, consolidación) en vez de aplazarla a un micro-ciclo aparte, porque el coste resultó mucho menor de lo estimado: al ser `rawElementSchema` un `z.looseObject`, la clave ya está preservada dentro de `listing_versions.raw` y el relleno de las filas existentes es un backfill **sin gasto de cuota**. La exploración había estimado que haría falta reingestar; era falso. |
| 2026-09-17 | 1.11 | `sdd-apply` escribió y typecheckeó las 39 tareas del checklist, pero la migración `0006` no se aplicó y ninguna suite respaldada por PostgreSQL real (nueva o preexistente) pudo ejecutarse | Docker Desktop no está disponible en este entorno de ejecución: los 25 tests fail-loud de `apps/ingestion` y los de `packages/db` (incluidos ficheros sin tocar en este cambio, como `spatial.test.ts`) fallan por igual con `ECONNREFUSED`, confirmando bloqueo de infraestructura y no una regresión introducida aquí. `packages/db` compila limpio contra la migración generada. Mismo patrón que las fases bloqueadas por Docker de los pasos 1.2/1.3/1.7 — se registra el trabajo hecho en vez de esperar al cierre completo del paso. Reanudación: levantar `docker compose up -d`, aplicar `pnpm db:migrate`, y entonces ejecutar `pnpm --filter @buscahogar/ingestion test:db` para obtener evidencia real de `backfillThumbnails`. |
| 2026-09-17 | 1.11 | El prerrequisito humano (rol de PostgreSQL de solo lectura para `apps/web`) sigue sin resolverse; las tres comprobaciones de aceptación manual quedan pendientes | El código fail-loud de `apps/web/src/server/db.ts` y su test (DATABASE_URL ausente) están completos y verificados sin necesitar la credencial real. Las tres comprobaciones que sí la necesitan —bundle de cliente, rechazo de escritura, sesión limpia— pasan a la lista «Revisar» de este mismo paso, sin fabricar un test que fingiera demostrarlas. |
| 2026-09-17 | 1.11 | El cableado de la credencial de `web` usó `${WEB_DATABASE_URL:?...}` en `docker-compose.yml`, lo que rompía `docker compose up -d` para todos los perfiles y contradecía la garantía de la decisión 015 | La forma `:?` de Compose aborta la interpolación del fichero entero en tiempo de parseo, no del servicio que la contiene, así que una variable que solo necesita el perfil `app` se convertía en requisito global. Detectado por el orquestador al verificar el entorno con `docker compose ps`, no por ningún test: no existe ninguno que parsee el compose. Corregido a `${WEB_DATABASE_URL}`; el fallo ruidoso se conserva en `apps/web/src/server/db.ts`, que ya lanza un error nombrado citando la decisión 056 y está probado. Verificado: `docker compose config --services` devuelve solo `db`. Detalle en `AI-NOTES.md`. |
| 2026-09-17 | 1.11 | La subconsulta del recuento de fuentes (A-1) emitía `"id"` sin cualificar y Postgres la rechazaba con 42702; los 21 tests de `.toSQL()` estaban en verde y la consulta no había funcionado nunca | Interpolar columnas de Drizzle en una plantilla `sql` situada en la PROYECCIÓN las emite sin prefijo de tabla. Detectado al ejecutar la página por primera vez: las URL válidas daban 500 y las inválidas 200. Corregido con alias internos (`src_pl`/`src_l`) y correlación externa cualificada, más un fichero nuevo `packages/db/test/search/search.db.test.ts` que EJECUTA la consulta contra Postgres —su primer caso corre con las tablas vacías, porque 42702 es error de parseo— verificado en rojo. Matiza la estrategia de pruebas del diseño (D3): `.toSQL()` prueba la intención del constructor, no la validez del SQL. Detalle en `AI-NOTES.md`. |
| 2026-09-17 | 1.11 | `result-card.tsx` importaba `./thumbnail-source.js` y Turbopack no resolvía el módulo, pese a que `tsc --noEmit` pasaba limpio | El `tsconfig` compartido usa `moduleResolution: "Bundler"`, bajo el que TypeScript acepta el sufijo `.js` de NodeNext y lo mapea al `.ts`, pero el empaquetador de Next no. El resto de `apps/web` importa sin extensión (`@/components/result-card`), así que el fichero era el único fuera de convención. Detectado por el primer `next build` del paso; ninguna suite lo veía porque ninguna empaqueta. Corregido quitando la extensión. |
| 2026-09-18 | 1.12 | Sesión de `sdd-apply` partida: WU1 (numPhotos) y WU2 (capa de consulta) completos y verificados en verde contra Postgres real (28/54 tareas), WU3 (página web) detenida a las 4/23 tareas — solo dos ayudantes puros, nada de la ruta ni los componentes de renderizado | Instrucción explícita de conservar cuota a mitad de sesión: mismo precedente que la fase 3 del 1.11 (Docker caído) — se registra el trabajo hecho en vez de forzar un cierre completo a medias. A diferencia del 1.11, aquí no hubo bloqueo de entorno: Docker estuvo sano toda la sesión. Se descubrió además un bloqueo real de infraestructura para el arnés `renderToStaticMarkup` del arbitraje AR-9 — Vite/Rolldown rechaza JSX en `.tsx` porque `apps/web/tsconfig.json` exige `jsx: "preserve"` para el propio pipeline de Next — diagnosticado con una prueba de humo aislada, no resuelto, sin ningún fichero roto dejado en el árbol. Dos correcciones de diseño detectadas solo por ejecución real, ninguna por `.toSQL()`: el build de `@buscahogar/core` (no solo `@buscahogar/db`) es requisito de orden antes de testear `apps/ingestion`; la proyección de anchor con `min(uuid)` que proponía el diseño no existe en ningún PostgreSQL — se usó el propio fallback `ORDER BY … LIMIT 1` que el diseño ya documentaba sin saber que era obligatorio. Detalle completo en Engram `sdd/property-detail-source-links/apply-progress`. |
| 2026-09-19 | 1.12 | Sesión de `sdd-apply` reanudada: WU3 completo (23/23) y Fase 4 parcial. `Docker Desktop no estuvo disponible en esta máquina desde el arranque de la sesión`, así que las cuatro puertas fail-loud y la suite por defecto de `packages/db` no se pudieron re-ejecutar; se reporta como "no ejecutado", nunca como "en verde" | Mismo patrón que las fases bloqueadas por Docker de los pasos 1.2/1.3/1.7/1.11: se prioriza el trabajo que no depende de infraestructura (todo `apps/web`, que corre sobre node puro) y se deja constancia explícita de lo que queda sin re-confirmar. El bloqueo AR-9 heredado de la sesión anterior SÍ se resolvió, con presupuesto acotado: la clave correcta en Vite 8 (basado en Rolldown) es `oxc.jsx`, no `esbuild.jsx` — Vite 8 ignora las opciones de `esbuild` cuando `oxc` está presente, algo que el mensaje de aviso de la propia herramienta reveló al primer intento fallido. Verificado primero con una prueba de humo aislada (`<div>hello</div>` sin código de proyecto), antes de tocar ningún componente real — evitó re-diagnosticar el arnés desde dentro de un test con lógica de negocio. Un segundo hallazgo de infraestructura, menor: `vitest.config.ts` tampoco resuelve el alias `@/*` de `tsconfig.json` sin declararlo también en `resolve.alias` — ningún test lo había necesitado hasta que `page.tsx` (primer fichero bajo `test/**` que importa transitivamente algo con ese especificador) lo expuso. Detalle completo en `docs/AI-NOTES.md` y en Engram `sdd/property-detail-source-links/apply-progress` (revisión 4). |
| 2026-09-19 | 1.12 | Sesión de `sdd-verify` (independiente de `sdd-apply`): re-ejecución de 814 tests contra Postgres real en máquina con Docker disponible. Veredicto: **PASS** (0 fallos, 0 saltados). El paso se archiva y cierra per obs #202. | Docker Desktop estuvo inactivo durante `sdd-apply` en esta máquina, impidiendo re-confirmar las cuatro puertas fail-loud; la fase de verificación las re-ejecutó de forma independiente con éxito completo. Todas las subconsultas correlacionadas verificadas EJECUTANDO (no `.toSQL()` solo); ambas rulings de arbitraje realizadas con código/fuente (obs #193/#194). La galería de imágenes no se implementa deliberadamente: Idealista partner docs inaccesibles, sin endpoint de detalle documentado ni términos legibles — obs #189 documenta la evidencia; es su propio paso futuro. Lo que se envía: carousel de una imagen por fuente + conteo de fotos (fechado) + enlace a cada anuncio. Dos MANUAL ACCEPTANCE items permanecen como residuales por diseño (carrusel sin JS, N=1 tono visual), no como brechas. |
| 2026-09-21 | 1.13 | El tope por sesión que pide el enunciado del paso («y por sesión») **no se implementa, deliberadamente** — decisión de mantenimiento D5 | No existe ningún mecanismo de autenticación, cookie ni sesión en ningún punto del monorepo (grepado explícitamente: ningún paquete de sesión en ningún `package.json`, ningún middleware que lea una cookie). Un contador por proceso no significaría nada entre usuarios concurrentes reales. Publicar un tope que no hace nada, en silencio, es peor que no publicarlo y decirlo así. El presupuesto diario persistente (unidad B) sí es significativo y vive en la base de datos. |
| 2026-09-21 | 1.13 | `sdd-spec` y `sdd-design` corrieron en paralelo y produjeron **cinco contradicciones reales**, arbitradas por el orquestador (obs #217) a favor del diseño en los cinco casos, siempre porque el diseño había leído el código real y la especificación había razonado desde la prosa de la propuesta | La más peligrosa, CR-15: bajo `ON CONFLICT DO NOTHING` como mecanismo de fusión del catálogo (tal y como lo daba por hecho la especificación), el escenario de Granada de la propia especificación habría **probado la regresión que debía impedir** — Granada conserva su fila pero nunca gana centroide, la única zona que funciona hoy deja de ser barrible en silencio, y el test habría pasado en verde. Detalle completo de las cinco reglas en Engram `sdd/on-demand-coverage/arbitration` (obs #217). |
| 2026-09-21/22 | 1.13 | El ledger de intentos (`gentle-ai sdd-attempt`) bloqueó **dos veces** por contabilidad de líneas cambiadas, porque no se commiteó nada entre unidades de trabajo y cada intento nuevo se cobraba las líneas de las unidades ya terminadas | Requirió un `reset` autorizado explícitamente por el responsable del proyecto en ambas ocasiones. Lección para el proceso, registrada aquí para no repetirla: cada unidad de trabajo debe commitearse antes de adquirir el siguiente token de intento, no acumular varias unidades sin commitear en el mismo árbol de trabajo. |
| 2026-09-22 | 1.13 | La unidad de trabajo D (interfaz web) cerró en aproximadamente **4.200 líneas** frente a una previsión de ~1.050 en el desglose de `sdd-tasks`; el alcance no se comprimió para ajustar la cifra | Cubierto por la `size:exception` ya aceptada para el cambio completo (`delivery_strategy: exception-ok`, obs #211). El presupuesto constriñe cómo se trocea el trabajo, nunca el propio código: recortar comentarios, tests o alcance real solo para acercarse a la cifra estimada habría sido peor que reportar la cifra real y por qué no baja más. |
| 2026-09-22 | 1.13 | Las tareas 10.5 y 10.6 (aprovisionar el segundo rol de PostgreSQL `INSERT`-only sobre `coverage_jobs`, y ejecutar en verde el test de privilegio negativo que lo comprueba) quedan sin hacer; el paso se marca `[~]`, no `[x]` | Ningún agente tiene permiso para crear roles de PostgreSQL ni para leer o escribir `.env`. El test negativo (`apps/web/test/db/coverage-role-privileges.test.ts`, 7 casos) está escrito y gateado con `describeWithCoverageDb` (salta en silencio sin `WEB_COVERAGE_DATABASE_URL`, confirmado saltado esta sesión) pero **nunca se ha ejecutado en verde ni una sola vez** — su resultado real es desconocido hasta que el responsable del proyecto complete el aprovisionamiento. |
