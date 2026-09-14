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
`other` es la válvula); ROADMAP 1.13 hereda dos obligaciones sobre `AreaQuery` (seleccionar
las claves relevantes de los search params antes de parsear, y convertir string→number él
mismo, ver decisión 030).

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

## [ ] 1.8 · Bloqueo de candidatos

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

---

## [ ] 1.9 · Estrategia de puntuación

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

---

## [ ] 1.10 · Consolidación de viviendas canónicas

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

---

## [ ] 1.11 · Búsqueda y listado en Next

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

**Revisar.** Que una búsqueda es compartible copiando la URL. Que no hay llamadas a la API
externa desde `web`.

**Notas:**

---

## [ ] 1.12 · Detalle y redirección a las fuentes

```text
Implementa la página de detalle de una vivienda: datos consolidados, galería de
imágenes, y el listado de todos los anuncios de origen con enlace a cada uno.

Cuando una vivienda proceda de varias fuentes, debe verse con claridad cuáles son
y qué precio ofrece cada una.
```

**Notas:**

---

## [ ] 1.13 · Cobertura bajo demanda

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
