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

## [ ] 1.3 · Esquema de base de datos

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

---

## [ ] 1.4 · Contratos y modelo de dominio en `core`

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

---

## [ ] 1.5 · Sonda de la API de la fuente

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

---

## [ ] 1.6 · Adaptador y normalizador de la primera fuente

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

---

## [ ] 1.7 · Persistencia y barrido de una zona

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

| Fecha      | Paso | Cambio                                                                                                        | Motivo                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-04 | 1.1  | Ronda correctiva completa tras marcarse `[x]` en falso                                                        | El ciclo SDD se autoinformó `done` sin ejecutar install/build/lint/test; `react` quedó en una RC inventada (regresión sobre la estable ya commiteada), sin `.env.example`, sin `packageManager`, sin Tailwind ni runner de tests. Detalle en `AI-NOTES.md`.                                                                                                                                   |
| 2026-09-04 | 1.1  | Añadidos no previstos en el prompt: `@next/eslint-plugin-next` y `apps/web/src/app/page.tsx`                  | `eslint-plugin-react@7.37.5` (vía `eslint-config-next/core-web-vitals`) es incompatible con ESLint 10; se sustituye por el plugin de Next directo. `next build` no compila sin página raíz. Decisiones 011 y notas en `AI-NOTES.md`.                                                                                                                                                          |
| 2026-09-04 | 1.1  | Tercera pasada: revisión manual completa y corrección de 13 hallazgos                                         | Las cuatro puertas en verde no prueban que se cumpla el requisito. `apps/web` no aplicaba la config ESLint compartida, `engines.node` era insuficiente para el código escrito, un clonado limpio no arrancaba y `packages/core` heredaba tipos del DOM. Decisiones 012 y 013; detalle en `AI-NOTES.md`.                                                                                       |
| 2026-09-07 | 1.2  | Partido en tres sesiones por bloqueos del entorno, no del código: fases 1, 2 y 4 el 07-09; fase 3 el 08-09    | El paso se escribió y documentó entero el 07-09, pero la verificación de tiempo de ejecución tuvo que esperar a tres bloqueos encadenados del entorno: Docker se dio por no instalado siendo falso (ver `AI-NOTES.md`), luego faltaba WSL, y luego el componente «Plataforma de máquina virtual» de Windows. Resuelto el 08-09, la fase 3 pasó sin cambiar una línea de `docker-compose.yml`. |
| 2026-09-08 | 1.2  | Reforzado el criterio de la tarea 3.4 con una tabla marcador, en lugar de comparar solo la versión de PostGIS | El criterio escrito («la misma versión prueba que los datos se conservan») no distingue un volumen conservado de uno destruido: al recrearse, Postgres reinstala la extensión con idéntica versión. Se añadió una fila escrita antes del `down`, que sobrevive en 3.4 y desaparece en 3.5. Detalle en `AI-NOTES.md`.                                                                          |
