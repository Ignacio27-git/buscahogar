# Decisiones de arquitectura

Registro cronológico. Cada entrada: qué se decidió, qué alternativas se descartaron y por
qué. Sirve de material directo para la memoria del TFM.

Formato: `## NNN — Título` · Estado: aceptada / revisada / revertida.

---

## 001 — Ingesta programada en lugar de consulta en tiempo de búsqueda

**Estado:** aceptada

**Decisión.** El sistema no consulta las fuentes cuando el usuario busca. Ingiere de forma
programada o bajo demanda y sirve las búsquedas contra su propio índice.

**Alternativa descartada.** Modelo _pass-through_, sin escritura en base de datos, con
consulta directa a las APIs en cada búsqueda.

**Motivo.** Tres razones independientes, cualquiera de ellas suficiente:

1. **Cuota.** La API concedida tiene un límite mensual de peticiones. Con consulta directa,
   cada ajuste de filtro gastaría cuota; los propios tests de integración la agotarían.
2. **Latencia.** La deduplicación necesita el conjunto completo antes de agrupar, así que no
   se pueden mostrar resultados parciales. El usuario esperaría a la fuente más lenta más la
   paginación más el procesado, en un producto cuyo argumento es ser más rápido que abrir
   varias pestañas.
3. **Reproducibilidad.** Sin corpus estable no hay conjunto etiquetado, no se pueden comparar
   estrategias de deduplicación sobre la misma entrada, y no se puede reproducir ningún
   número citado en la memoria.

**Encuadre.** No se replica el portal: se mantiene un índice con caducidad. Se refresca, se
retira lo que desaparece, las imágenes se enlazan sin almacenarse y todo resultado conduce
al anuncio original.

**Consecuencia asumida.** Solo se puede buscar en zonas ingeridas. Se mitiga con la
cobertura bajo demanda (decisión 005).

---

## 002 — Separación entre `listings` y `properties`

**Estado:** aceptada

**Decisión.** Dos tablas distintas más una de relación: `listings` (un anuncio de una
fuente), `properties` (vivienda canónica) y `property_listings`.

**Alternativa descartada.** Una única tabla de propiedades con las fuentes como campo
anidado.

**Motivo.** Permite reprocesar la deduplicación completa sin volver a consultar las fuentes,
comparar estrategias distintas sobre el mismo conjunto de datos, y obtener el histórico de
precios como consecuencia del versionado de `listings`.

---

## 003 — Monorepo con worker separado; sin NestJS

**Estado:** aceptada

**Decisión.** `apps/web` (Next), `apps/ingestion` (worker Node), `packages/core` y
`packages/db`. Comunicación solo por base de datos.

**Alternativa descartada.** Backend NestJS independiente; o todo dentro de Next.

**Motivo.** El barrido de fuentes es trabajo programado y de larga duración, incompatible con
el ciclo de vida de una petición HTTP y con los límites de tiempo de las funciones
serverless. NestJS aportaría la complejidad de un framework de backend completo para una API
de lectura de pocos endpoints.

---

## 004 — Next.js con App Router y estado en la URL

**Estado:** aceptada

**Decisión.** Server Components consultando la base de datos directamente. Filtros en search
params. Sin TanStack Query ni Zustand en la ruta principal.

**Motivo.** El listado es mucha data con poca interactividad. Los filtros en la URL hacen las
búsquedas compartibles y reproducibles, y eliminan la necesidad de una capa de estado
servidor en cliente. La optimización de imágenes de Next es relevante porque el listado es
esencialmente una cuadrícula de fotos de terceros.

---

## 005 — Cobertura bajo demanda, unidad municipio

**Estado:** aceptada

**Decisión.** Si la zona solicitada no está cubierta, se registra un `coverage_job`, el
worker la barre y la zona queda cubierta para consultas posteriores. La unidad es el
municipio.

**Alternativa descartada.** Cobertura fija con lista cerrada de zonas.

**Motivo.** Escala a todo el ámbito sin barrerlo de antemano y gasta cuota solo donde hay
demanda real. Provincia sería demasiado costosa en un solo barrido; barrio fragmentaría el
índice sin ganancia.

**Requisitos derivados.** Resolución canónica de zonas (para no ingerir la misma zona bajo
distintas formulaciones), cola en base de datos, y presupuesto de cuota para que el uso del
buscador no agote las peticiones disponibles.

---

## 006 — Criterios de deduplicación

**Estado:** aceptada

**Decisión.** Decisión por acumulación de señales sobre datos estructurados. La dirección
solo cuenta como señal fuerte si es exacta. La comparación de imágenes queda para la fase de
profundización.

**Motivo.** Un mismo bloque genera anuncios con ubicación, superficie y precio muy similares
que corresponden a viviendas distintas: son los falsos positivos más difíciles. Las imágenes
son la señal más concluyente, pero requieren _perceptual hashing_ porque cada portal
reescala y recomprime; aplazarlas permite además medir su aportación real frente a la
deduplicación estructurada.

**Consolidación.** Al agrupar, el precio mostrado es el más económico del grupo.

**Prioridad.** Minimizar falsos positivos por encima de maximizar recall.

---

## 007 — Refresco semanal y retención en dos planos

**Estado:** aceptada

**Decisión.** Refresco semanal para zonas con consultas recientes, menor para las inactivas.
Los anuncios desaparecidos se marcan inactivos y salen de la búsqueda, pero se conservan.
Purga separada para anuncios inactivos y para zonas sin consultas.

**Motivo.** El refresco uniforme gastaría cuota en zonas que nadie consulta. Los inactivos
siguen siendo útiles para el histórico y para el conjunto de evaluación. Las condiciones de
uso de cada fuente prevalecen sobre estos plazos si fijan un máximo de retención.

---

## 008 — TypeScript fijado en 6.0.3, no en la última (7.0.2)

**Estado:** aceptada

**Decisión.** Todo el monorepo usa TypeScript `6.0.3`, no la última publicada (`7.0.2`).

**Alternativa descartada.** TypeScript `7.0.2` (última) renunciando a `typescript-eslint`,
o esperando a que `typescript-eslint` amplíe el rango de peer.

**Motivo.** `typescript-eslint@8.69.0` (el que impone la config de lint compartida y
`eslint-config-next`) declara `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. `6.0.3` es
la versión más alta compatible. Con `7.0.2` el lint con reglas de tipo deja de resolver el
parser. El linting estricto de TypeScript pesa más que ir a la última en un esqueleto sin
lógica todavía. Se revisará cuando `typescript-eslint` soporte la rama 7.

**Consecuencia.** `baseUrl` está deprecado en TS 6 y se elimina en TS 7; se ha quitado de
`tsconfig.base.json` (los alias `@/*` se declaran por paquete donde hagan falta, sin
`baseUrl`).

---

## 009 — Vitest como runner de tests

**Estado:** aceptada

**Decisión.** El runner de tests del monorepo es **Vitest** (`vitest run` por paquete;
`pnpm -r test` en la raíz). Config mínima por workspace en `vitest.config.ts`.

**Alternativa descartada.** `node:test` + `tsx`; Jest.

**Motivo.** `node:test` obligaría a una capa de transpilación aparte para TypeScript y ESM
y no da _watch_ ni _snapshot_ cómodos. Jest arrastra su propio ecosistema de transformación
(`ts-jest` / `babel-jest`) y config pesada, y su soporte de ESM sigue siendo incómodo.
Vitest usa la misma resolución que el resto del _tooling_ (Vite/esbuild), arranca sin
config, y encaja con los tipos de test que pide `CLAUDE.md` (normalización con fixtures,
pares etiquetados de deduplicación, construcción de consultas). Los tests se concentran
donde está la lógica; no se persigue cobertura global.

**Nota.** Los tests actuales son solo _smoke tests_ de versión: el esqueleto no tiene
lógica que probar todavía.

---

## 010 — Tailwind CSS v4 retenido en apps/web

**Estado:** aceptada

**Decisión.** `apps/web` mantiene **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/postcss`,
`postcss.config.mjs`, `@import 'tailwindcss';` en `src/app/globals.css`).

**Alternativa descartada.** Quitar Tailwind y usar solo CSS Modules / CSS global; o
Tailwind v3 con `tailwind.config.js` y directivas `@tailwind`.

**Motivo.** El scaffold inicial (create-next-app) ya venía con Tailwind v4 y la interfaz de
búsqueda (paso 1.11) es esencialmente una cuadrícula de tarjetas: utilidades primero encaja
bien. v4 sobre v3: configuración por CSS (`@theme`) sin fichero JS, y es lo que instala CNA
en esta versión de Next. Import v4 confirmado en `node_modules/next/dist/docs/` (una sola
regla `@import 'tailwindcss';`, sin `@tailwind base/components/utilities`).

---

## 011 — Config de ESLint de apps/web sin `eslint-config-next/core-web-vitals`

**Estado:** aceptada

**Decisión.** `apps/web/eslint.config.mjs` combina `eslint-config-next/typescript` con
`@next/eslint-plugin-next@16.3.4` importado directamente (rule-sets `recommended` y
`core-web-vitals`). No se usa `eslint-config-next/core-web-vitals`.

**Alternativa descartada.** Usar `eslint-config-next/core-web-vitals` tal cual (lo
recomendado por Next); bajar ESLint a la rama 9.

**Motivo.** `eslint-config-next/core-web-vitals` arrastra `eslint-plugin-react@7.37.5`, que
llama a `context.getFilename()` (eliminado en ESLint 10) y rompe `eslint src/` con un
`TypeError`. En el registro de este entorno no hay `eslint-plugin-react` más nueva. Bajar
ESLint a la 9 chocaría con el resto del _tooling_ fijado en la 10. La combinación elegida
conserva las reglas propias de Next (App Router, `<img>`, scripts síncronos, fuentes) y las
de `typescript-eslint`, que son las que importan en este proyecto.

**Consecuencia asumida.** De momento no corren las reglas de `eslint-plugin-react` ni
`eslint-plugin-jsx-a11y`. Se reevalúa al introducir componentes de UI reales (paso 1.11),
cuando exista una versión de `eslint-plugin-react` compatible con ESLint 10 o se decida
usar `@next/eslint-plugin-next` como única fuente. Ver `AI-NOTES.md`.
**Nota (revisión 2026-09-04).** En la primera versión de esta decisión, `apps/web` dejó de
reexportar además la configuración compartida de `packages/config`, quedando con un
conjunto de reglas más laxo que el resto del monorepo. Eso incumplía el requisito del paso
1.1. Corregido: `apps/web/eslint.config.mjs` compone ahora `strictTypeChecked` + las reglas
de Next + los bloques compartidos, estos últimos al final para que prevalezcan. Ver
decisión 012 y `AI-NOTES.md`.

---

## 012 — Linting con información de tipos (`strictTypeChecked`)

**Estado:** aceptada

**Decisión.** La configuración compartida usa `tseslint.configs.strictTypeChecked` con
`parserOptions.projectService`, no el conjunto puramente sintáctico. Se exporta como
factoría (`createSharedConfig(tsconfigRootDir)` y `sharedBlocks(tsconfigRootDir)`) porque
el análisis con tipos necesita la raíz del workspace analizado y el fichero vive en
`packages/config`.

**Alternativa descartada.** `tseslint.configs.strict` (sin tipos), más rápido y sin
necesidad de resolver el programa de TypeScript.

**Motivo.** Sin información de tipos no corren las reglas que más valen en este proyecto:
`no-floating-promises` (un `await` olvidado en la ingesta o en una consulta a base de datos
falla en silencio), `no-misused-promises` y `no-unnecessary-condition`. El pipeline de
ingesta y la capa de acceso a datos son asíncronos de principio a fin: es exactamente el
tipo de código donde esas reglas pagan su coste. El linting pasa de 68 a 123 reglas activas.

**Consecuencia.** `eslint` es más lento y cada workspace debe pasar `import.meta.dirname`.
Los ficheros de configuración (`*.config.ts`, `*.config.mjs`) se lintan con
`disableTypeChecked`, porque no forman parte del programa de TypeScript.

---

## 013 — Sin tests tautológicos: `passWithNoTests` mientras no haya lógica

**Estado:** aceptada

**Decisión.** Los workspaces que aún no tienen lógica (`packages/db`, `apps/web`,
`apps/ingestion`) declaran `passWithNoTests: true` y no contienen tests. `packages/core`
conserva un único test de cadena de herramientas que comprueba que TypeScript estricto,
ESM, la resolución de dependencias bajo pnpm y Vitest funcionan juntos.

**Alternativa descartada.** Mantener un smoke test por workspace afirmando la constante de
versión contra su propio literal (`expect(CORE_VERSION).toBe('0.0.1')`).

**Motivo.** Ese test no puede fallar salvo que alguien edite las dos líneas a la vez, así
que no aporta señal: solo produce un "4 tests passed" que da confianza falsa sobre un
esqueleto sin probar. Un cero honesto es más informativo que un verde vacío. El test de
cadena de herramientas sí puede fallar de verdad — si se rompe la resolución de workspace,
la configuración de TypeScript o el runner — y por eso se conserva.

**Consecuencia.** `pnpm -r test` reporta `No test files found` en tres workspaces hasta que
lleguen la normalización (1.6), la deduplicación (1.9) y la búsqueda (1.11), que son los
puntos donde `CLAUDE.md` concentra los tests.

---

## 014 — Imagen PostGIS fijada en `17-3.5`; la extensión la activa la imagen, sin script de init

**Estado:** aceptada

**Decisión.** `docker-compose.yml` fija la imagen `postgis/postgis:17-3.5` (sin `latest`, sin
rango). La activación de PostGIS en la base de datos de la aplicación se delega por completo
al script `initdb-postgis.sh` de la propia imagen, que se ejecuta en el primer arranque sobre
un volumen vacío. No se añade ningún script propio en `/docker-entrypoint-initdb.d`.

**Alternativa descartada.** Añadir un script propio de inicialización (`init.sql` con
`CREATE EXTENSION IF NOT EXISTS postgis;`) "por idempotencia".

**Motivo.** Un script en `/docker-entrypoint-initdb.d` se dispara con el mismo trigger exacto
que ya usa la imagen: volumen `PGDATA` vacío. Contra un volumen ya inicializado, ninguno de
los dos se ejecuta. Añadir el script no cubre ningún caso adicional; solo añade un fichero más
que mantener sincronizado con la imagen. Se justificaría únicamente si en el futuro hicieran
falta extensiones fuera del conjunto por defecto de la imagen (`pg_trgm`, `unaccent`), lo cual
es una cuestión del paso 1.3, no de este.

**Consecuencia.** La verificación de que PostGIS quedó realmente creado (no solo instalado en
la imagen) corre por cuenta de la comprobación documentada en el README
(`SELECT PostGIS_Version();`), no de un script de inicialización.

**Aviso para subir de versión.** Las etiquetas `17-*` (y anteriores) montan el volumen en
`/var/lib/postgresql/data`. A partir de la serie `18-*` la imagen mueve la ruta a
`/var/lib/postgresql` (sin `/data`). Revisar `docker-compose.yml` antes de cambiar el tag
mayor.

---

## 015 — `web` e `ingestion` fuera del perfil por defecto; frontera de credenciales

**Estado:** aceptada

**Decisión.** `web` e `ingestion` llevan `profiles: ['app']` en `docker-compose.yml`, así que
un `docker compose up -d` sin `--profile` levanta únicamente `db`, sin resolver siquiera su
contexto de build. `ingestion` recibe `env_file: [.env]`; `web` no recibe ni `env_file` ni
`environment`: no debe llegarle ninguna credencial de base de datos ni de las fuentes, y nunca
una variable `NEXT_PUBLIC_*`.

**Alternativa descartada.** Levantar los tres servicios por defecto, o dar a `web` el mismo
`env_file` que `ingestion` "por si acaso".

**Motivo.** Hoy no existe ningún `Dockerfile` para `web` ni para `ingestion`; sin `profiles`,
`docker compose up -d` fallaría al intentar resolver un contexto de build inexistente. Además,
`CLAUDE.md` prohíbe explícitamente que las credenciales lleguen a `apps/web`. Declarar el
servicio sin ninguna vía de credenciales, en lugar de omitirlo, dice con claridad que la
ausencia es intencionada y no un olvido, y establece la frontera antes de que exista ningún
`Dockerfile` que la pueda violar.

**Consecuencia.** Cualquier cambio futuro que quite `profiles: ['app']` de `web` o le añada
`environment`/`env_file` debe releerse contra esta decisión y contra `CLAUDE.md` antes de
aceptarse.

**Enmendada por la 056** (ROADMAP 1.11): `web` sí recibe una `environment:` propia, acotada a
una credencial de base de datos de solo lectura. La prohibición de credenciales de fuentes
externas y de escritura permanece vigente sin cambios.

---

## 016 — El ciclo de vida de Docker se documenta en el README, sin scripts de `package.json`

**Estado:** aceptada

**Decisión.** Los comandos para levantar, parar y resetear la base de datos (`docker compose
up -d` / `stop` / `down` / `down -v`) se documentan como prosa y bloques `bash` en el README,
sección «Base de datos». No se añade ningún script `db:up`, `db:down` ni `db:reset` a
`package.json`.

**Alternativa descartada.** Envolver los comandos de Docker en scripts `db:*` de la raíz.

**Motivo.** El prefijo `db:` ya tiene un significado establecido en este monorepo: operación
delegada al workspace `@buscahogar/db` (`db:migrate` → `pnpm --filter @buscahogar/db run
migrate`). Reutilizarlo para un mecanismo distinto (Docker Compose, sin relación con
`@buscahogar/db`) confundiría el propietario de la operación. Además, un alias `db:reset`
escondería detrás de una palabra amistosa un comando que borra el volumen de forma
irreversible; exigir escribir `docker compose down -v` explícitamente mantiene visible que la
operación es destructiva.

**Consecuencia.** Si en el futuro se quieren envoltorios de conveniencia para el ciclo de vida
de Docker, deben usar un prefijo distinto (`infra:` o `docker:`), nunca `db:`.

---

## 017 — El almacén de artefactos del ciclo SDD se declara en `openspec/config.yaml`

**Estado:** aceptada

**Decisión.** Se crea `openspec/config.yaml` con `sdd.artifact_store: engram`. Esa carpeta
contiene únicamente esa declaración: los artefactos del ciclo (propuesta, spec, diseño,
tareas, informes) siguen viviendo en memoria persistente, no en el repositorio.

**Alternativa descartada.** No declarar nada y seguir distinguiendo a mano, en cada fase,
entre «el almacén está mal resuelto» y «este paso no se ha empezado».

**Motivo.** Sin declaración, la herramienta asume `openspec`, resuelve por presencia de
directorio, no encuentra `openspec/changes/` y da los seis artefactos por ausentes con
`nextRecommended: sdd-new`. Ese estado es indistinguible de un paso sin empezar, y ya obligó
a corregir el rumbo a mano en tres fases seguidas del paso 1.2 (`apply`, `verify` y
`archive`). El riesgo no es teórico: basta con que una fase se crea el diagnóstico para que
rehaga trabajo terminado. Con la declaración puesta, la herramienta lee los artefactos y
responde `nextRecommended: archived` por su cuenta, comprobado sobre el propio paso 1.2.

**Consecuencia.** Una clave mal escrita **no da error**: se ignora en silencio y se vuelve a
`openspec`. Las formas válidas comprobadas son `sdd.artifact_store`, `artifact_store` en la
raíz y `artifactStore`; `store:`, `persistence:` y `artifact_store: { mode: ... }` se
descartan sin avisar. Si algún día se quiere pasar a artefactos versionados en el repositorio,
el cambio es de esta clave a `openspec` (o `hybrid`), no de estructura de carpetas. El nombre
del proyecto se deduce del remoto de git, así que un worktree sin remoto resolvería a otro
proyecto.

---

## 018 — Versionado de anuncios: identidad estable + histórico, con procedencia opcional de versión en la decisión de deduplicación

**Estado:** aceptada

**Decisión.** `listings` guarda la identidad estable de un anuncio (uno por anuncio y
fuente) y nunca se sobrescribe; cada cambio de precio o contenido añade una fila nueva en
`listing_versions`, con un índice único parcial `(listing_id) WHERE is_current` que
garantiza como mucho una versión vigente por anuncio. `property_listings` referencia la
identidad del anuncio (`listing_id`), no una versión concreta, y añade una columna
adicional y anulable `scored_listing_version_id` que apunta a la versión exacta que
produjo la puntuación.

**Alternativa descartada.** FK de `property_listings` solo a la identidad, sin procedencia
de versión; y, en el extremo opuesto, FK solo a la versión vigente.

**Motivo.** Solo a la identidad: la decisión de deduplicación queda registrada, pero se
pierde qué instantánea exacta de datos la produjo, que es justo la evidencia que exige el
TFM y no se puede reconstruir después. Solo a la versión: cada cambio de precio movería o
invalidaría la relación, cuando el vínculo anuncio-vivienda no depende del precio vigente.

**Consecuencia.** `scored_listing_version_id` usa `ON DELETE SET NULL`: si la versión
referenciada se purgara alguna vez, la decisión y su desglose sobreviven; solo se pierde el
puntero a la instantánea exacta.

---

## 019 — Semántica métrica del bloqueo geográfico: columna `geography` generada y GiST sobre ella

**Estado:** aceptada

**Decisión.** `listings.location` y `properties.location` se declaran
`geometry(Point,4326)`, y cada tabla añade una columna generada `location_geography`
(`STORED`, `geography(Point,4326)`), calculada como `location::geography`, con el índice
GiST sobre esa columna generada, no sobre la geometría. Toda consulta de distancia pasa
por una única función exportada (`withinMeters`), con un mecanismo de reserva nombrado
(`CHK-GEOG-STORED` / `FB-GEOG-EXPR`) por si el `CAST` no se acepta como expresión
`GENERATED ALWAYS` (SQLSTATE `42P17`).

**Alternativa descartada.** Aplicar el `CAST ::geography` en línea dentro de cada consulta,
contra un índice GiST declarado sobre la columna `geometry`.

**Motivo.** `ST_DWithin` sobre `geometry(Point,4326)` mide en grados, no en metros;
ejecutar así el bloqueo de deduplicación no falla, no avisa, y busca un radio equivocado en
órdenes de magnitud. Aplicar el `CAST` en cada consulta deja sin resolver si un índice GiST
declarado sobre la columna geometría se sigue usando contra una expresión `::geography` en
el predicado (hueco de investigación sin confirmar); materializar la columna en el propio
esquema hace la conversión una sola vez, en la escritura, y el índice se declara
directamente sobre lo que se consulta.

**Consecuencia.** Si el motor rechaza la expresión generada por no considerarla inmutable,
el mecanismo de reserva documentado en el diseño sustituye la columna generada por un
índice de expresión (`CREATE INDEX ... USING gist ((location::geography))`) y cambia
únicamente el cuerpo de `withinMeters`; ningún punto de llamada cambia. `CHK-GEOG-STORED`
quedó ejecutada implícitamente contra PostgreSQL real a partir del paso 1.7 (barrido y
escritura reales) y de nuevo en el paso 1.8 (bloqueo de candidatos, `listings_location_
geography_idx` usado en los planes reales de `CHK-GIST-SELFJOIN`): la columna generada fue
aceptada por el motor, `FB-GEOG-EXPR` nunca se necesitó.

---

## 020 — Evidencia de deduplicación: `signals` en JSONB, puntuación escalar aparte, índice GIN `jsonb_ops`

**Estado:** aceptada

**Decisión.** `property_listings.signals` es una columna `jsonb` tipada
(`SignalBreakdown`, sin `any`) que guarda el desglose completo por señal, junto a columnas
escalares independientes para `score`, `strategy_name` y `strategy_version`. El índice
sobre `signals` usa la clase de operadores por defecto, `jsonb_ops`, no `jsonb_path_ops`.

**Alternativa descartada.** Índice GIN con `jsonb_path_ops`.

**Motivo.** `jsonb_path_ops` produce índices más pequeños y búsquedas de contención más
rápidas, pero solo soporta `@>`, `@?` y `@@`, y no genera entradas para estructuras sin
valor (por ejemplo `{"a":{}}`), lo que fuerza un recorrido completo en esos casos.
`jsonb_ops` soporta además `?`, `?|` y `?&`, que es lo que hace falta para preguntar por la
existencia de una señal concreta cuando se incorpore una estrategia nueva. Un cambio de
índice es reversible sin migrar datos; la forma del JSONB no lo es.

**Consecuencia.** El índice ocupa más espacio del mínimo posible. Aceptable: el volumen de
`property_listings` está acotado por el número de anuncios, no crece sin límite.

---

## 021 — Tipos de columna: `uuid` para claves primarias, `bigint` para céntimos, `timestamptz` para fechas

**Estado:** aceptada

**Decisión.** Toda clave primaria es `uuid().defaultRandom()`. Los importes monetarios
(`price_cents`, `min_price_cents`) son `bigint` con `{ mode: 'number' }`. Todas las
columnas de fecha/hora son `timestamp(..., { withTimezone: true })`, con sufijo `_at`.

**Alternativa descartada.** `bigserial` para las claves primarias; `numeric` o `real` para
los importes; `timestamp` sin zona horaria.

**Motivo.** `bigserial` es secuencial y enumerable, lo que filtraría el tamaño del corpus a
través de una URL pública y permitiría enumerar anuncios por fuerza bruta; `uuid` no. Un
importe en céntimos como entero de 32 bits desborda pasados los 21,4 millones de euros;
`numeric` se mapea en Drizzle como cadena y su modo de uso no estaba verificado en la
versión instalada; `real` trunca precisión, y el precio es justo la evidencia que no puede
perder exactitud. `timestamp` sin zona horaria es ambiguo en cuanto `web` e `ingestion`
corren en contenedores o entornos distintos: una hora ingenua mal interpretada corrompería
el histórico de precios.

**Consecuencia.** `{ mode: 'number' }` en `bigint` asume que los céntimos se mantienen muy
por debajo de `2^53`; es una elección consciente para evitar la fricción de serializar
`bigint` de JavaScript en JSON, verificada contra el tipo instalado de `drizzle-orm`
(`bigint(name, config)`, con `mode` obligatorio y sin valor por defecto).

---

## 022 — `pgEnum` solo para `coverage_jobs.status`; el resto usa `text` con `CHECK`

**Estado:** aceptada

**Decisión.** El único enum nativo de PostgreSQL declarado es `coverage_job_status`
(`pending`, `running`, `done`, `failed`), siempre exportado desde `src/schema/enums.ts`.
El estado de `zones`, el tipo de `sources` y el estado de `listings` se modelan como
`text` con una restricción `CHECK` explícita.

**Alternativa descartada.** Un `pgEnum` por cada conjunto de valores cerrado.

**Motivo.** PostgreSQL 17 no tiene `DROP VALUE` para tipos enum: quitar un valor exige
recrear el tipo entero, mientras que añadir uno es barato. El conjunto de estados de
`coverage_jobs` es normativo y cerrado por el propio dominio del scheduler; los demás
(estado de zona, tipo de fuente, estado de anuncio) son más susceptibles de cambiar
mientras el proyecto avanza, y una restricción `CHECK` se sustituye con una migración
trivial (`DROP CONSTRAINT` / `ADD CONSTRAINT`).

**Consecuencia.** Un `pgEnum` no exportado puede omitirse silenciosamente de la generación
de `CREATE TYPE`; por eso `coverageJobStatus` se exporta explícitamente y su presencia en
el SQL generado se verifica con una comprobación nombrada (`CHK-ENUM-EMITTED`, fase 2 del
paso 1.3).

---

## 023 — Sin Zod dentro de `packages/db`

**Estado:** aceptada

**Decisión.** `packages/db` no depende de Zod ni de `drizzle-zod`. El contrato de tipos
hacia el resto del monorepo son los tipos inferidos por Drizzle (`$inferSelect` /
`$inferInsert`), reexportados desde `src/types.ts`.

**Alternativa descartada.** `drizzle-zod`, para derivar esquemas de validación a partir de
las tablas.

**Motivo.** `CLAUDE.md` exige validar con Zod toda entrada externa, pero una fila de base
de datos ya persistida no es entrada externa: es el resultado de datos que, en algún punto
anterior del pipeline, ya se validaron al entrar. Añadir `drizzle-zod` sería una segunda
validación redundante sobre datos de confianza, y una dependencia más que mantener
sincronizada con cada cambio de esquema.

**Consecuencia.** Los límites externos reales (parámetros de búsqueda, payloads de las
fuentes) siguen validándose con Zod en `packages/core` y en los adaptadores de
`apps/ingestion`, nunca aquí.

---

## 024 — Inyección de credenciales vía `createDb(connectionString)`; el paquete nunca lee `process.env`

**Estado:** aceptada

**Decisión.** `packages/db/src/db.ts` expone `createDb(connectionString: string)`, que
recibe la cadena de conexión como parámetro. Ningún fichero de `packages/db/src` lee
`process.env` directamente.

**Alternativa descartada.** Leer `process.env.DATABASE_URL` dentro de `db.ts`, al estilo de
un singleton de conexión inicializado al importar el módulo.

**Motivo.** Un `process.env.DATABASE_URL` a nivel de módulo se ejecutaría también si
`apps/web` importase por error ese fichero, lo que abriría una vía estructural para que
credenciales de base de datos llegasen a un entorno con variables `NEXT_PUBLIC_*`
(decisión 015). Exigir el parámetro hace ese camino imposible de compilar, no solo de
evitar por convención.

**Consecuencia.** `drizzle.config.ts` y `src/seed.ts` son los dos únicos puntos, ambos de
invocación por CLI y nunca importados por una app, donde sí se lee
`process.env.DATABASE_URL`.

---

## 025 — Forma de `locations` y `features`: jerarquía administrativa por municipio y catálogo de amenities ligado a la versión

**Estado:** aceptada

**Decisión.** `locations` es una jerarquía administrativa canónica, con clave natural
`ine_code` (código INE de municipio) y las columnas `municipality`, `province`,
`province_code` y `autonomous_community`. `features` es un catálogo de amenities (`key`
único, `label_es`), y `listing_features` vincula ese catálogo a `listing_versions`, no a
`listings`.

**Alternativa descartada.** Guardar la localización como columnas sueltas repetidas en
cada anuncio; modelar las amenities como columnas booleanas anchas en la propia tabla de
versión, o como un bloque JSONB.

**Motivo.** `zones` ya necesita un identificador de municipio canónico para el barrido bajo
demanda, así que una tabla `locations` separada evita repetir y desincronizar esa
jerarquía en cada anuncio, y sirve de base para el autocompletado. Las amenities como
columnas anchas obligarían a una migración por cada amenity nueva; JSONB perdería la
integridad referencial y la posibilidad de consultar por amenity con un índice normal.
`listing_features` cuelga de la versión, no de la identidad, porque una versión es una
instantánea completa: las amenities pueden cambiar entre versiones igual que el precio.

**Consecuencia.** El paso 1.4 (`packages/core`, modelo de dominio) hereda esta forma tal
cual: la jerarquía de `locations` y el catálogo de `features` quedan fijados aquí y no
deben volver a decidirse en 1.4, solo tipar sus contratos externos con Zod donde
corresponda.

---

## 026 — Las coordenadas de Idealista no están agrupadas ni redondeadas, pero eso es una cota inferior, no una prueba de exactitud

**Estado:** aceptada

**Decisión.** El radio de bloqueo geográfico de la deduplicación (pasos 1.8 y 1.9) se
dimensiona **sin** asumir que las coordenadas estén encajadas al centroide del edificio ni
redondeadas, pero **tampoco** como si fueran exactas al metro. Además, `showAddress` **no** se
usa para poblar `listings.coordinates_obfuscated`: no es un indicador válido de ofuscación.

**Alternativa descartada.** Dos, en direcciones opuestas. (a) Tratar las coordenadas como
exactas y fijar un radio estrecho, del orden de decenas de metros. (b) Asumir ofuscación
fuerte y ensanchar el radio a varios cientos de metros «por si acaso». Descartada también
(c) derivar `coordinates_obfuscated` del campo `showAddress` de la respuesta, que era el
candidato obvio.

**Motivo.** Evidencia de la sonda del paso 1.5, dos respuestas reales de 50 elementos cada
una (`apps/ingestion/test/fixtures/idealista/`):

- **Perfil `homes`**, radio solicitado 300 m: 50 coordenadas distintas de 50 elementos,
  ninguna repetida. Distancia máxima al centro 299,6 m. Histograma de precisión decimal:
  5 decimales × 1, 6 × 7, 7 × 92.
- **Perfil `premises`**, radio solicitado 2000 m: 49 coordenadas distintas de 50. Distancia
  máxima 1964,8 m. Precisión: 6 decimales × 12, 7 × 88.

La unicidad prácticamente total descarta el encaje al centroide, que se manifestaría como
coordenadas repetidas entre anuncios del mismo edificio. La precisión de 7 decimales
—resolución centimétrica— descarta la ofuscación por redondeo, que aparecería como un
histograma cargado en 3 o 4 decimales.

**Lo que la evidencia NO descarta**, y por eso esto es una cota inferior: un desplazamiento
aleatorio por anuncio conserva tanto la unicidad como el número de decimales. Es indetectable
desde una sola página sin verdad de campo. Y contrastar contra un geocodificador no lo
resolvería, porque los geocodificadores devuelven ellos mismos el centroide del portal: una
concordancia de 20-30 m no distingue una coordenada exacta de una encajada.

Sobre `showAddress`, el resultado es un negativo útil. Ocultar la dirección **no** degrada la
coordenada: los 49 elementos de `homes` con `showAddress=false` tienen 49 coordenadas
distintas y la misma precisión alta, y los 42 de `premises` con `showAddress=false`, 42
distintas. El único par de coordenadas repetidas de toda la muestra está, al contrario, entre
los 8 elementos de `premises` con `showAddress=true` — dos locales en el mismo punto con
dirección visible, que es una coincidencia real del mundo, no una ofuscación.

**Consecuencia.** El paso 1.8 puede partir de un radio de bloqueo del orden de la decena de
metros en lugar del centenar, lo que reduce mucho el número de pares candidatos, pero debe
dejarlo como **parámetro configurable y medido contra el conjunto etiquetado**, no como
constante. Dado que la prioridad declarada del proyecto es minimizar falsos positivos, ante
la duda se ensancha. La columna `listings.coordinates_obfuscated` se queda sin fuente fiable
por ahora: no se puede derivar de `showAddress`, y determinar su valor real exige verdad de
campo sobre direcciones conocidas, que no forma parte de este paso.

**Nota de método.** La unidad de `distance` queda **confirmada en metros por observación
directa**, no ya por inferencia: con radio solicitado de 300 el elemento más lejano está a
299,6 m, y con 2000 a 1964,8 m.

---

## 027 — El `propertyType` de la respuesta no es el mismo vocabulario que el de la petición

**Estado:** aceptada

**Decisión.** El tipo `PropertyType` de `packages/core` (paso 1.4) se modela sobre el
vocabulario de la **respuesta**, no sobre el de la petición. El valor del filtro de búsqueda
(`homes`, `premises`, …) es un detalle del adaptador de Idealista y no entra en el dominio.

**Alternativa descartada.** Usar el conjunto cerrado de cinco valores del parámetro de
búsqueda (`homes`, `offices`, `premises`, `garages`, `bedrooms`) como base del tipo de
dominio, que es lo que sugería la investigación documental previa a la sonda.

**Motivo.** La sonda del paso 1.5 demuestra que son dos vocabularios distintos:

| Filtro enviado | `propertyType` observado en la respuesta | `typology` | `subTypology` |
| --- | --- | --- | --- |
| `homes` | `flat`, `duplex`, `penthouse` | `flat` | `duplex`, `penthouse` |
| `premises` | `premise` | `premise` | `commercialProperty` |

Es decir: el filtro es una categoría gruesa de búsqueda, y la respuesta trae una
clasificación más fina. Tres de los miembros fijados para `PropertyType` en el paso 1.4
—`flat`, `duplex`, `penthouse`— aparecen **literalmente** como valores reales. La
investigación previa, basada en clientes de terceros, había concluido que solo existía el
conjunto grueso de cinco y que esos miembros eran «reportados» y sin confirmar. Era una
lectura del parámetro de petición tomada por la del campo de respuesta.

`commercial` corresponde al `premise` de Idealista, en singular, que no coincide con el
`premises` del filtro. `house`, `studio`, `land`, `garage`, `storage_room` y `building` no
aparecen en esta muestra, que solo cubrió dos filtros y una zona: no están descartados.

**Consecuencia.** El adaptador del paso 1.6 traduce el `propertyType` de la respuesta al tipo
de dominio, y no reutiliza el valor del filtro. La unión cerrada de `PropertyType` se
mantiene como estaba, ahora con tres miembros confirmados contra datos reales en lugar de
inferidos. El paso 1.4 puede reanudarse sobre esta base.

**Nota.** `typology` y `subTypology` son un segundo eje: para los pisos, `typology` vale
`flat` en los 50 elementos mientras `propertyType` varía. `propertyType` parece ser el
aplanado de ambos. El adaptador debe leer `propertyType`, no `typology`.

---

## 028 — `DedupStrategy.version`, y corrección de `docs/ARCHITECTURE.md`

**Estado:** aceptada

**Decisión.** La interfaz `DedupStrategy` de `packages/core` (paso 1.4) añade
`readonly version: string` junto a `name` y `score`. `docs/ARCHITECTURE.md` se corrige para
reflejarlo: el `## Contratos` snippet original solo declaraba `name` y `score`.

**Alternativa descartada.** Dejar `docs/ARCHITECTURE.md` como estaba y añadir `version` solo
en el código, con la divergencia documentada aparte.

**Motivo.** La decisión 020 fija `property_listings.strategy_version` como columna
`NOT NULL`, y no existe ninguna otra fuente de dominio de la que ese valor pueda salir: la
propia `DedupStrategy` tiene que declararlo. `CLAUDE.md` exige señalar una regla de
`ARCHITECTURE.md` obsoleta o incorrecta en vez de divergir en silencio, así que corregir el
documento en el mismo cambio es obligatorio, no una mejora aparte.

**Consecuencia.** Cualquier implementación futura de `DedupStrategy` (ROADMAP 1.9+) debe
declarar `version` desde el primer commit; no hay periodo de gracia.

---

## 029 — `Listing`: forma plana de salida del normalizador, `propertyType` obligatorio, `coordinatesObfuscated` tri-estado

**Estado:** aceptada

**Decisión.** `Listing` (paso 1.4, `packages/core`) es una forma plana orientada a la salida
del normalizador, no un espejo de la separación `listings`/`listing_versions` de
`packages/db` (decisión 018). `propertyType: PropertyType` es **obligatorio** en `Listing`,
aunque `listing_versions.property_type` sigue siendo texto libre nulable en la base de
datos. `coordinatesObfuscated?: boolean` es opcional y tri-estado: `undefined` significa
"sin señal fiable", nunca se infiere como `false`.

**Alternativa descartada.** Hacer `Listing` un espejo 1:1 de las columnas persistidas
(incluyendo `id`, `status`, marcas de tiempo de la tubería, `raw`); dejar `propertyType`
opcional igual que la columna; o poblar `coordinatesObfuscated` a partir de `showAddress`.

**Motivo.** `ListingNormalizer.normalize(raw): Listing` y `DedupStrategy.score(a, b)` leen
ambos contra un único valor plano — el `id`, el `status` y los timestamps de la tubería no
los produce ningún normalizador, y `raw` es específico de cada fuente por definición
(decisión 006 la excluye del dominio). `propertyType` es obligatorio porque el paso 1.4 ya
fija una unión cerrada con `other` como válvula de seguridad (decisión 027): la columna
nullable de la base de datos solo reflejaba la ausencia previa de esa unión, no una
propiedad genuina del dominio. `coordinatesObfuscated` como tri-estado sigue la decisión 026
al pie de la letra: esa decisión ya estableció que `showAddress` no es un indicador válido
de ofuscación y que no existe hoy una fuente fiable; un booleano obligatorio forzaría a todo
normalizador a afirmar `false`, una afirmación positiva de exactitud que la evidencia no
respalda.

**Consecuencia.** Un adaptador que no pueda clasificar un `propertyType` debe usar `other`,
nunca omitir el campo. La columna `listing_versions.property_type` no se endurece con un
`CHECK` en este cambio — eso queda para cuando `core` haya demostrado el vocabulario en
producción.

---

## 030 — `AreaQuery`: solo geográfica, sin `propertyType`, esquema estricto y sin coerción

**Estado:** aceptada

**Decisión.** `AreaQuery` (paso 1.4, `packages/core`) declara únicamente `center`,
`radiusMeters` y `operation` (obligatorio), derivada con `z.infer` de un
`z.strictObject(...)`. No declara `propertyType` ni `locationId`. El esquema no aplica
ninguna coerción de tipos: los valores de search params se convierten *antes* de llegar a
`areaQuerySchema` (obligación que queda abierta para el paso 1.13).

**Alternativa descartada.** Añadir `propertyType: PropertyType` a `AreaQuery` para que un
barrido pueda acotarse por tipo de propiedad; usar `z.object()` (no estricto) igual que
`listingSchema`; o coercionar `radiusMeters` con `z.coerce.number()` para aceptar strings de
search params directamente.

**Motivo.** El argumento decisivo no es de alcance sino de vocabulario (decisión 027): la
API de la fuente separa el filtro de petición (`homes`, `premises`, …, un conjunto grueso de
cinco) del `propertyType` de respuesta (el vocabulario de once miembros que modela
`PropertyType`). Añadir `propertyType: PropertyType` a `AreaQuery` lo tiparía en el
vocabulario de respuesta y luego exigiría una retro-traducción N:M con pérdida hacia el
vocabulario de petición — un error de modelado, no una simplificación. `operation` sí es
obligatorio porque `sale`/`rent` es el mismo vocabulario en petición y en respuesta, y
particiona genuinamente qué cobertura representa el barrido. `AreaQuery` es una frontera
externa real (CLI de ingesta hoy, search params de búsqueda en 1.13), construida por un
llamador editable; `z.strictObject()` convierte una clave mal escrita en un rechazo nombrado
en vez de en un radio por defecto silencioso — caro en un sistema con cuota limitada por
petición. Sin coerción: `z.coerce.number()` aceptaría `''` → `0` y `true` → `1`,
reintroduciendo el mismo fallo silencioso que la estrictura existe para evitar.

**Consecuencia.** ROADMAP 1.13 hereda dos obligaciones: seleccionar del `URLSearchParams`
solo las claves relevantes antes de parsear (un `strictObject` recibiendo
`Object.fromEntries(searchParams)` tal cual rechazaría cualquier URL con `utm_source` u
otro parámetro de seguimiento), y realizar la conversión string→number él mismo, antes de
`areaQuerySchema.safeParse`.

---

## 031 — `SignalScore`/`SignalBreakdown` pasan a `packages/core`; `contracts/` sobre `strategies/`; sufijo `Row` en `packages/db`

**Estado:** aceptada

**Decisión.** Tres piezas del mismo cambio (ROADMAP 1.4):

1. `packages/core` declara `SignalScore` y `SignalBreakdown`; `packages/db/src/types.ts`
   sustituye su declaración a mano por `export type { SignalScore, SignalBreakdown } from
   '@buscahogar/core'`, una reexportación de solo tipos, erasable en compilación.
2. El directorio de contratos de `packages/core` se llama `contracts/`, no `strategies/`
   como sugería el README original de ese paquete.
3. `packages/db/src/types.ts` renombra toda su familia de tipos de fila con el sufijo
   `Row`: `Listing` → `ListingRow`, y así sucesivamente para `NewListing`, `ListingVersion`,
   `NewListingVersion`, `ListingFeature`, `NewListingFeature`, `Property`, `NewProperty`,
   `PropertyListing` y `NewPropertyListing`.

**Alternativa descartada.** Mantener las dos declaraciones de `SignalScore`/`SignalBreakdown`
fijadas de forma independiente en `core` y en `db`; llamar `strategies/` al directorio de
contratos tal como sugería el README; o limitar el sufijo `Row` únicamente a
`Listing`/`NewListing`, que son los dos nombres que de verdad colisionan.

**Motivo.** (1) Las dos declaraciones describen la misma columna JSONB
(`property_listings.signals`); mantenerlas independientes las deja libres para divergir sin
que nadie lo note, lo que es peor que un error de compilación el día que diverjan.
`packages/db/package.json` ya declaraba `"@buscahogar/core": "workspace:*"` y
`packages/db/src/index.ts` ya documentaba la dependencia, pero ningún fichero la importaba:
este cambio activa una dependencia declarada y dormida, no crea una nueva. La forma es
byte-idéntica, así que `propertyListings.$inferSelect` no cambia. (2) El README de
`packages/core` ya reservaba `strategies/` para "1.9+: implementaciones concretas de
estrategias de deduplicación"; nombrar `contracts/` al directorio del paso 1.4 mantiene esa
reserva intacta y separa el contrato de sus futuras implementaciones. (3) `@buscahogar/core`
(ROADMAP 1.4) exporta un `Listing` de dominio, y `docs/ARCHITECTURE.md` fija ese nombre para
el dominio en las tres interfaces de contratos — `packages/db` es el lado que colisiona, así
que es el que renombra. El radio de impacto verificado es cero: ningún fichero de
`packages/db/src`, `packages/db/test` ni `apps/**` importa ninguno de estos tipos de fila
(se reexportan con `export *` desde `src/index.ts` pero no se usan). Como el coste de
renombrar toda la familia es idéntico al de renombrar solo dos nombres, se extendió a toda
la familia por consistencia interna.

**Consecuencia.** `packages/db` debe reconstruirse (`pnpm --filter @buscahogar/core build`)
antes de typecheckearse en un clon limpio con `--ignore-scripts`, porque resuelve
`@buscahogar/core` a través de su `dist/index.d.ts` — el script `prepare` de la raíz ya
cubre el flujo normal (`pnpm install` sin ese flag). Cualquier código futuro que importe los
tipos de fila de `packages/db` debe usar el sufijo `Row`.

---

## 032 — Cursor de barrido: codifica filtro + página sobre una tupla congelada, valida por nombre, rechaza en vez de defaultear

**Estado:** aceptada

**Decisión.** El cursor de `IdealistaSource.fetchArea` es la cadena `"<filtro>:<numPage>"`,
donde `<filtro>` es uno de la tupla congelada `IDEALISTA_FILTERS = [homes, offices,
premises, garages, bedrooms]` (orden significativo: la posición de un filtro implica que
todos los anteriores ya están agotados) y `<numPage>` un entero positivo. Se valida por
**nombre**, nunca por índice. Un cursor malformado — filtro desconocido, página no entera o
no positiva, separador ausente — **rechaza** con `InvalidCursorError`; nunca cae en un valor
por defecto como `homes:1`.

Segunda parte de la misma decisión, resuelta durante `sdd-tasks` (obs #106) sobre un punto
que el spec y el diseño de este cambio dejaban en dos sitios distintos: cuando el envelope
de una página no es fiable (`totalPages` ausente, no entero, o mayor que
`MAX_TRUSTED_TOTAL_PAGES`), el adaptador **lanza** `UntrustworthyEnvelopeError` con
`resumeCursor` igual a la MISMA página — nunca avanza en silencio al siguiente filtro.

**Alternativa descartada.** Validar el cursor por índice numérico sobre la tupla (`"0:1"`
en vez de `"homes:1"`); defaultear un cursor malformado a `homes:1` en vez de rechazarlo; y,
para el envelope no fiable, avanzar en silencio al siguiente filtro tratándolo como agotado
(la lectura literal del texto de escenario del spec de este cambio).

**Motivo.** Por nombre, no por índice: si la tupla de filtros se reordena alguna vez, un
cursor por índice apuntaría en silencio a OTRO filtro sin que nada lo detecte; un nombre
desconocido rechaza con un error explícito. Rechazar en vez de defaultear: un cursor
malformado que cayera en `homes:1` volvería a pedir peticiones que el barrido ya pagó —
exactamente el tipo de gasto silencioso que la cuota mensual limitada no permite. Sobre el
envelope no fiable: el diseño de este cambio (D5, taxonomía de errores) y su propio flujo de
datos son internamente consistentes en que lanza, con el mismo razonamiento anti-spin que
ya regía la decisión 018 (nunca una página vacía con el mismo cursor, porque reintroduciría
el problema que el tope de peticiones existe para evitar); el texto del escenario del spec
("no repite la misma página indefinidamente") es el resto informal de una redacción
anterior al diseño, y queda superseded por esta decisión. Documentado también en
`sdd/idealista-adapter-normalizer/tasks` (obs #106), Reconciliación #1.

---

## 033 — Presupuesto de peticiones por barrido: contador propio de la instancia, token contado aparte y con tope duro de 1

**Estado:** aceptada

**Decisión.** `createIdealistaSource` recibe `maxSearchRequestsPerSweep` (por defecto 10),
un contador de peticiones de búsqueda propio de la instancia que persiste entre llamadas a
`fetchArea`. Superarlo lanza `SweepBudgetExhaustedError` con el cursor de reanudación exacto
— nunca una página vacía. El token OAuth se cuenta en el MISMO objeto de presupuesto pero
con su propio contador, tope duro de 1 independiente de `maxSearchRequestsPerSweep`, se
adquiere una única vez por instancia y se cachea en memoria (nunca en disco, nunca
reintentado) durante toda la vida del barrido. Los dos contadores se informan siempre por
separado y **nunca se suman**.

**Alternativa descartada.** Un contador global compartido entre `search` y `token` (una
única cifra "peticiones de esta ejecución"); un `TokenQuotaPolicy: 'billable' |
'not-billable'` explícito que declarase si el token consume cuota de búsqueda; refrescar o
reintentar el token dentro del propio barrido si expira a mitad de camino.

**Motivo.** `10` es una cota de contención de blast-radius razonable para el desarrollo, no
un número derivado de la cifra anecdótica de "100 peticiones al mes" que ningún documento
oficial confirma (la investigación de este cambio no encontró ninguna cifra documentada,
igual que ya constataba la decisión sobre la sonda del paso 1.5). Los contadores nunca se
suman por el mismo motivo que `probe/ledger.ts` (paso 1.5, verificado en
`probe-ledger.test.ts:57`) no lo hacía: no está documentado si la petición de token consume
cuota de búsqueda, así que una cifra agregada afirmaría un hecho que no se conoce. Un flag
`TokenQuotaPolicy` se descartó porque enviaría hoy una rama sin alcanzar nunca en producción
y sin ningún test que la ejercite — un revisor leería sus dos miembros como un hecho
establecido cuando R3 (proposal) dice explícitamente que no se sabe. Reintentar el token
dentro del barrido implicaría una segunda petición de token no planeada, contra la premisa
de que cada `fetchArea` emite como mucho una petición de búsqueda — un 401 a mitad de
barrido termina el barrido; el llamador reanuda con una instancia nueva y un token nuevo.

**Consecuencia.** Si en el futuro se confirma que el token sí consume cuota de búsqueda, el
cambio queda confinado al cuerpo de `createSweepBudget().spend` y a su propio test — ningún
punto de llamada, puerto, fuente ni cursor cambia, porque los dos contadores ya viven detrás
de una única función de entrada.

---

## 034 — Esquemas crudos de Idealista: `looseObject`, ausencia tipada `.optional()`; corrección de `docs/ROADMAP.md:538`

**Estado:** aceptada

**Decisión.** `rawElementSchema` y `rawEnvelopeSchema` (`apps/ingestion/src/sources/idealista/`)
usan `z.looseObject`, nunca `z.strictObject` ni el `.strip()` implícito por defecto. Un
campo se tipa `.optional()` cuando la evidencia de fixture muestra la CLAVE ausente;
`.nullable()` solo se reserva para un campo donde una fixture commiteada muestre un `null`
JSON literal, citado por línea — verificación de este cambio: cero apariciones de `null`
JSON en los 100 elementos y los dos envelopes de las dos fixtures del paso 1.5. Ningún campo
del esquema usa `.nullable()`.

Consecuencia directa: se corrige `docs/ROADMAP.md:538`, que afirmaba `hiddenResults=null`
—contradiciendo su propia línea 542, que ya decía correctamente que la clave está ausente—.
Ver `docs/AI-NOTES.md`, entrada 2026-09-14.

**Alternativa descartada.** `z.strictObject` (rechazaría una página ya pagada por una clave
nueva del vendor) o el `.strip()` por defecto de Zod (descartaría en silencio bytes que el
paso 1.7 querrá persistir sin modelar); `.nullish()` en vez de `.optional()` para todo campo
opcional, que oculta cuál de las dos formas produce realmente la API y habría hecho
infalsificable en código la propia contradicción de `docs/ROADMAP.md:538`.

**Motivo.** La pregunta decisiva no es estricto-vs-laxo en abstracto, sino qué lado del
fallo cuesta dinero: aceptar en silencio una clave nueva no cuesta nada (es asunto del
vendor); rechazar una página ya pagada por una clave nueva SÍ cuesta, porque no se puede
volver a pedir gratis. `looseObject` además preserva los bytes no modelados, que el paso 1.7
necesita persistir tal cual. Mismo precedente ya usado en `TokenResponseSchema`
(`scripts/probe-idealista.ts:63`, solo lectura). La regla `.optional()`-por-defecto /
`.nullable()`-solo-con-cita hace que la distinción sea verificable en el propio código, no
solo en prosa — que es exactamente lo que expuso la contradicción de la línea 538.

---

## 035 — El ban de bucles de ESLint sigue la superficie que emite peticiones, no el paquete completo

**Estado:** aceptada

**Decisión.** `apps/ingestion/eslint.config.mjs` extiende el bloque `no-restricted-syntax`
introducido en el paso 1.5 (antes solo `scripts/probe-idealista.ts`) a dos ficheros más:
`src/sources/idealista/http-client.ts` e `src/sources/idealista/idealista-source.ts` — los
dos únicos ficheros del adaptador de Idealista que pueden emitir una petición HTTP. El resto
del adaptador (`sweep-planner.ts`, `normalizer.ts`, `property-type-map.ts`, etc.) queda
fuera del bloque a propósito: son módulos puros que sí necesitan iterar arrays.

**Alternativa descartada.** Dejar el glob sin cambios (el ban se detendría en el fichero más
antiguo del paquete mientras el código nuevo que sí toca la red queda sin esa guarda);
extender el ban a todo `src/sources/idealista/**` (incorrecto: el planificador debe recorrer
la tupla de cinco filtros y el normalizador debe construir arrays de salida; ambos son puros
y no pueden emitir ninguna petición).

**Motivo.** El principio ya estaba escrito para la sonda del paso 1.5
(`scripts/probe/options.ts:117-119`: "el ban de bucles de ESLint solo alcanza al fichero que
toca la red") — este cambio lo aplica de nuevo, no introduce uno nuevo. El diseño de este
cambio dejó esta entrada marcada como opcional por precedente (el paso 1.5 introdujo el ban
sin una entrada dedicada en este fichero) y delegó la decisión final a `sdd-tasks` (obs
#106): se decidió **requerida**, no opcional, porque extender una regla a través de una
frontera de paquete es, si acaso, más notable que introducirla por primera vez, y
`CLAUDE.md` exige registrar aquí toda decisión de arquitectura no especificada de antemano.
Verificado en positivo y en negativo durante `sdd-apply`: un bucle `for` inyectado a
propósito en `idealista-source.ts` hace fallar `pnpm lint` con el mensaje actualizado;
revertido, `pnpm lint` vuelve a salir en verde sobre el código real entregado.

**Consecuencia.** Como en el paso 1.5, esta regla AST no cubre recursión ni
`.map`/`.forEach`/`.reduce` sobre una llamada de red — de eso sigue encargándose el tope
duro del presupuesto (`budget.ts`, decisión 033), no el linter.

---

## 036 — Una zona resuelve a un área de búsqueda con `--center` y `--radius` explícitos; `--zone` solo etiqueta

**Estado:** aceptada

**Decisión.** El comando de barrido del paso 1.7 recibe el área geográfica en dos parámetros
explícitos, `--center` (par de coordenadas) y `--radius` (metros), que son los que construyen
el `AreaQuery`. `--zone` es únicamente la etiqueta de registro con la que se anota el
barrido: no lleva geometría asociada y no interviene en el cálculo del área.

**Alternativa descartada.** Dos: (1) añadir una columna de centroide a `locations` y
sembrarla desde un dataset del CNIG/IGN, de modo que `--zone` bastara por sí solo; (2) usar
el `locationId` propio de Idealista.

**Motivo.** El centroide sembrado se aplaza, no se descarta: la granularidad del cruce entre
el código INE de `locations` y la entidad de población del dataset no está confirmada, y
sembrar sobre una correspondencia no verificada dejaría centroides plausibles y equivocados
—barridos que parecen correctos y cubren otro sitio—. El `locationId` de Idealista se
descarta por tres razones independientes: su contrato con el vendor no está confirmado (la
misma barrera de documentación que cerró la investigación del paso 1.5 en `partial`), no es
derivable de un código INE, y averiguar su coste en cuota exige gastar cuota.

**Consecuencia asumida.** Un municipio no es un círculo. La cobertura de una zona barrida por
centro y radio es aproximada por construcción: sobra área fuera del término y falta área en
sus extremos. Es la misma parcialidad deliberada en la que se apoya la decisión 039.

---

## 037 — Detección de cambio campo a campo en el espacio de columnas, sin columna de hash

**Estado:** aceptada

**Decisión.** Un anuncio genera una fila nueva en `listing_versions` cuando difiere campo a
campo del último estado persistido, y esa comparación se hace **en el espacio de columnas**:
los valores del `Listing` normalizado se proyectan a los tipos de columna antes de
compararse, no se comparan en los tipos del dominio. No requiere migración de esquema.

**Alternativa descartada.** (1) Una columna de hash de contenido persistida. (2) Comparar
solo el precio.

**Motivo.** El hash exige migración y, peor, invalida todos los hashes históricos cada vez
que cambie la lista de campos que lo alimenta: el histórico dejaría de ser comparable
consigo mismo, que es justo lo que la decisión 002 conserva. Comparar solo el precio
contradice `docs/ARCHITECTURE.md`, que define la versión sobre el anuncio y no sobre un
campo. Y el espacio de columnas no es un detalle de implementación sino la condición misma
de la idempotencia: `surfaceM2`, `rooms` y `bathrooms` viajan como `z.number()` en el dominio
y como `integer` / `smallint` en la columna, así que un `78.5` se escribe `79` y un
comparador del lado del dominio insertaría una versión nueva en cada barrido,
indefinidamente. Ver `docs/AI-NOTES.md`, entrada 2026-09-14.

---

## 038 — Un elemento rechazado por el normalizador se salta, se anota con su motivo y se cuenta

**Estado:** aceptada

**Decisión.** Cuando el normalizador rechaza un elemento de una página, el barrido lo salta,
lo anota con su motivo en el informe de la ejecución y lo suma a un recuento; la página
continúa con los elementos restantes. Un elemento inválido nunca aborta la página. Esto
resuelve el punto que el paso 1.6 dejó explícitamente fuera de alcance.

**Alternativa descartada.** Abortar la página completa ante el primer elemento inválido.

**Motivo.** La petición HTTP que trajo esa página ya está pagada y no se puede volver a pedir
gratis. Abortarla tira los elementos válidos que venían en el mismo payload y obliga a gastar
cuota otra vez para recuperarlos; bastaría un único elemento con `price` inválido —el único
caso en que `normalize()` lanza, decisión 034— para inutilizar una página entera.

**Consecuencia.** Un barrido puede terminar correctamente habiendo descartado elementos, así
que el recuento por motivo no es información accesoria: es lo que distingue «no había nada
que ingerir» de «se rechazó todo». Sin él, un rechazo sistemático por un cambio de forma del
vendor sería indistinguible de una zona vacía.

---

## 039 — La ausencia de un anuncio en un barrido nunca cambia `listings.status`

**Estado:** aceptada

**Decisión.** Ningún camino de código de este cambio escribe `listings.status`. Que un
anuncio ya persistido no aparezca en un barrido no se interpreta como retirada.

**Alternativa descartada.** Reconciliar por diferencia: marcar como retirado todo anuncio
presente en la base y ausente del barrido, que es lo habitual en una ingesta que se supone
exhaustiva.

**Motivo.** Esa inferencia solo es válida si el barrido es exhaustivo sobre la zona, y aquí
no lo es por construcción: el área es un círculo aproximado (decisión 036) y el barrido tiene
un tope duro de peticiones (decisión 033), así que un anuncio puede faltar por caer fuera del
radio, por quedar más allá del tope o porque el barrido terminó antes. Confundir «no lo he
visto» con «ya no existe» retiraría anuncios vivos, y la decisión 001 encuadra el sistema
como un índice con caducidad: retirar es una afirmación sobre la fuente, y un barrido parcial
no tiene evidencia para hacerla.

**Consecuencia.** La retirada real queda para el refresco y la retención (decisión 007, paso
2.5), que sí pueden comprobar un anuncio concreto en lugar de deducirlo de una ausencia.

---

## 040 — Una transacción por página, con el avance del cursor de `coverage_jobs` dentro

**Estado:** aceptada

**Decisión.** El barrido abre una transacción por página de resultados. La escritura de los
`listings` y `listing_versions` de esa página y el avance de `coverage_jobs.cursor` ocurren
dentro de la misma transacción y confirman juntos.

**Alternativa descartada.** Avanzar el cursor fuera de la transacción, antes o después; o
envolver el barrido entero en una única transacción.

**Motivo.** Con el cursor fuera, un fallo entre el commit de las filas y el del cursor deja el
barrido reanudable en un punto que no corresponde a lo confirmado: adelantado, se saltarían
páginas ya pagadas sin haberlas escrito —pérdida silenciosa que solo se descubre al no
encontrar los datos—; atrasado, se repetirían peticiones que la cuota mensual no regala. Con
el avance dentro, el cursor no puede apuntar nunca más allá de lo commiteado. Una transacción
única para todo el barrido se descarta por lo contrario: un fallo en la última página tiraría
todas las anteriores y con ellas la cuota gastada en traerlas.

**Contexto.** El cursor vive en la fila de `coverage_jobs` que el propio comando de CLI crea y
actualiza, que es también donde encaja el cursor de reanudación que el paso 1.6 dejó sin
destino (decisión 032); el índice único parcial de esa tabla hace de guarda de concurrencia.

---

## 041 — El seed valida el catálogo entero antes de escribir una sola fila; siembra atómica

**Estado:** aceptada

**Decisión.** `seedReferenceData` (`packages/db/src/seed.ts`) valida estructuralmente cada
entrada del catálogo de municipios (`assertValidMunicipality`) antes de tocar la base de
datos. Si cualquier entrada falla, no se escribe ninguna fila de ninguna entrada, ni
siquiera la fuente `sources`. Las escrituras que sí llegan a ejecutarse van dentro de una
única transacción.

**Alternativa descartada.** Validar y escribir entrada por entrada, dejando sembradas las
entradas válidas anteriores a la que falla.

**Motivo.** COVERAGE-8 exige que una entrada sin código INE verificado falle «insertando
cero filas para esa entrada», pero no especifica si el resto del catálogo debe sembrarse de
todos modos. Con un catálogo de una sola entrada real (Granada) la diferencia es hoy
invisible, pero deja de serlo en cuanto se añada una segunda zona (pendiente, ver
`ROADMAP.md`): sembrar parcialmente dejaría el resultado del script dependiente del orden
del array, silenciosamente distinto entre una ejecución y la siguiente si el catálogo
cambia. Fallar entero, nombrando la entrada ofensiva, es la misma disciplina de «nunca
fabricar, nunca parchear en silencio» que ya rige el resto de P5.

**Consecuencia.** Añadir una segunda zona al catálogo con un código INE aún sin verificar
bloquea también la siembra de las zonas ya verificadas hasta corregirlo — comportamiento
deliberado, no un efecto secundario a evitar.

---

## 042 — Autojoin de bloqueo de candidatos: subconsulta LATERAL correlacionada con `.limit()` como barrera de optimización, no un self-join plano

**Estado:** aceptada

**Decisión.** `findCandidatePairs`/`countCandidatePairs` (`packages/db/src/blocking.ts`)
comparten un único predicado (`pairCandidatesSubquery`): una subconsulta `LATERAL`
correlacionada con la fila externa (`a`/`va`), con `a.id < b.id` como condición de
emparejamiento y un `.limit(Number.MAX_SAFE_INTEGER)` interno como barrera de optimización.

**Alternativa descartada.** Un self-join plano de dos pares `alias()` (`a`/`va`, `b`/`vb`)
con `lt(a.id, b.id)` como condición del `JOIN` y el predicado geográfico en el `WHERE` o en
el propio `ON` del `JOIN`.

**Motivo.** Medido contra PostgreSQL real, dos veces: ni el `WHERE` ni el `ON` del `JOIN`
influyen en el plan, porque para `INNER JOIN` el planificador reordena libremente el árbol de
uniones sin mirar dónde se escribió cada condición. Con una banda de precio ancha, subestima
la selectividad de un rango de precio parametrizado en un bucle anidado y prefiere unir
`va`/`vb` por el índice de precio antes que aplicar la restricción geográfica — un producto
intermedio de ~2000×2000 filas antes de tocar el índice GiST. Solo una subconsulta `LATERAL`
con una barrera de optimización (`LIMIT`/`OFFSET`) impide que Postgres la aplane de vuelta al
árbol de uniones del padre y reordene igual.

**Consecuencia.** `CHK-GIST-SELFJOIN` pasa: el plan usa `listings_location_geography_idx` en
un bucle anidado real. Pero la misma estructura fija el orden de acceso siempre por geometría
primero, así que `CHK-PRICE-IDX` (el índice parcial de precio/superficie, en el régimen de
radio ancho/banda estrecha) deja de ser demostrable con esta forma de consulta — ver decisión
044 y `FB-PARTIAL-IDX-NOT-CHOSEN` en `docs/ROADMAP.md`, notas del paso 1.8.

---

## 043 — `.offset(0)` no es una barrera de optimización en Drizzle 0.45.2; se usa `.limit()` con un valor alto

**Estado:** aceptada

**Decisión.** La barrera de optimización que impide a Postgres aplanar la subconsulta
`LATERAL` de `pairCandidatesSubquery` es `.limit(Number.MAX_SAFE_INTEGER)`, no `.offset(0)`.

**Alternativa descartada.** `.offset(0)` — el modismo clásico de Postgres para impedir el
"pull-up" de una subconsulta sin alterar el resultado (ningún registro se descarta con
offset cero).

**Motivo.** Probado y medido: `.offset(0)` no tiene ningún efecto en Drizzle 0.45.2, porque
`pg-core/dialect.js:287` renderiza la cláusula `OFFSET` con
`offset ? sql\`offset ${offset}\` : void 0`, y `0` es falso en JavaScript — la cláusula nunca
llega a formar parte del SQL enviado a Postgres (confirmado inspeccionando `toSQL()`: ningún
"offset" en el texto). `.limit()` (`dialect.js:286`) comprueba en cambio
`typeof limit === 'number' && limit >= 0`, sin ese defecto, así que un límite muy alto actúa
como barrera real sin descartar ninguna fila.

**Consecuencia.** Cualquier futuro código de este repositorio que necesite una barrera de
optimización sobre una subconsulta de Drizzle debe usar `.limit()` con un valor alto, nunca
`.offset(0)`. Registrado también en `docs/AI-NOTES.md` como hallazgo de IA corregido en la
propia sesión.

---

## 044 — `is_current` emitido como columna booleana desnuda; precio y superficie como rangos sobre las columnas indexadas

**Estado:** aceptada

**Decisión.** Dentro de `blocking.ts`, `isCurrentHead(v)` emite `sql\`${v.isCurrent}\`
(columna booleana desnuda, sin parámetro ligado), y el predicado de precio se escribe como
`vb.price_cents BETWEEN va.price_cents - banda AND va.price_cents + banda` (rango sobre la
columna indexada), nunca `abs(...)`. El mismo criterio se aplica a la superficie.

**Alternativa descartada.** `eq(v.isCurrent, true)` (renderiza un parámetro ligado) y
`abs(va.price_cents - vb.price_cents) <= banda` (entierra la columna en una expresión).

**Motivo.** El índice parcial `listing_versions_price_surface_current_idx` tiene como
predicado la expresión desnuda `is_current` (`listing-versions.ts:66-68`). Postgres solo usa
un índice parcial cuando puede *probar* que el predicado de la consulta implica el del
índice — con un parámetro ligado esa prueba depende del tipo de plan (protocolo extendido
con o sin nombre), no es una garantía. Emitir la misma forma sintáctica que el índice hace la
implicación trivial, sin depender del planificador. El rango sobre la columna indexada, en
vez de `abs()`, es lo único que puede convertirse en un recorrido de índice real dentro del
bucle anidado.

**Consecuencia.** `CHK-PARTIAL-IDX` (comprobación sobre `toSQL()`, independiente del
planificador y del volumen de filas) queda como la prueba vinculante de que el índice parcial
es *matchable*; que el planificador lo *elija* realmente con la forma de consulta que exige
decisión 042 no quedó demostrado — ver `FB-PARTIAL-IDX-NOT-CHOSEN` en `docs/ROADMAP.md`,
notas del paso 1.8. No se reclama en la memoria del TFM.

---

## 045 — Manejo asimétrico de NULL: la superficie ausente rescata el par, la geometría ausente lo excluye; umbrales absolutos en la unidad de cada columna

**Estado:** aceptada

**Decisión.** Cuando `surface_m2` es NULL en cualquiera de los dos lados de un par
candidato, el par se emite igualmente (`surfaceDeltaM2: null`). Cuando
`location`/`location_geography` es NULL en cualquiera de los dos lados, el par se excluye,
sin rescate. Los tres umbrales (`radiusMeters`, `priceBandCents`, `surfaceToleranceM2`) son
absolutos, en la unidad propia de cada columna, nunca relativos ni porcentuales.

**Alternativa descartada.** Tratar ambas ausencias igual (o bien rescatando las dos, o bien
excluyendo las dos); umbral de precio relativo (porcentaje) en vez de absoluto.

**Motivo.** La superficie es un *refinamiento* del conjunto candidato — bajo lógica
trivaluada SQL, un `BETWEEN` sobre NULL evalúa a `UNKNOWN`, indistinguible de "fuera de
margen": rescatarla evita una pérdida silenciosa (un par que nunca se emite no se puede
recuperar en ROADMAP 1.9). La geometría es la propia *clave* del bloqueo, no un
refinamiento: rescatarla degeneraría la consulta en un cruce completo del corpus por precio y
superficie, justo lo contrario de bloquear. Un umbral de precio relativo necesitaría
`least()`/`greatest()` para mantenerse simétrico, lo que entierra la columna en una expresión
y anula el índice (igual razón que la decisión 044); un umbral absoluto es simétrico por
construcción y legible directamente en la rejilla de calibración.

**Consecuencia.** Un umbral de precio absoluto es proporcionalmente más estricto en el
extremo caro del corpus. Limitación deliberada, no un descuido — registrada, no corregida
aquí; si la evaluación de ROADMAP 1.9 muestra pérdida de recall en ese extremo, el umbral
relativo es el parámetro a revisar entonces.

---

## 046 — La suite de tests de `packages/db` trunca la base de datos del propio desarrollador; sin base de datos de test separada

**Estado:** pendiente — problema registrado, sin solución aplicada en este cambio

**Decisión.** Se deja constancia del problema y se pospone su solución a un paso posterior.
`packages/db/test/helpers/db-client.ts` (`truncateAll`) ejecuta
`TRUNCATE ... RESTART IDENTITY CASCADE` contra `process.env.DATABASE_URL` sin distinguir una
base de datos de test de la base de datos real de desarrollo — que son la misma en este
entorno, porque no existe una segunda `DATABASE_URL` dedicada a tests ni ningún guardián que
rechace truncar una base de datos que no sea la designada para ello.

**Alternativa descartada.** Corregirlo dentro de este cambio (ROADMAP 1.8), añadiendo una
`DATABASE_URL` de test separada o un guardián de nombre/marca en la base de datos antes de
truncar.

**Motivo.** El problema es preexistente — los mismos síntomas ya los tenían
`packages/db/test/integration/coverage.test.ts` y `dedup-recompute.test.ts` antes de este
cambio — y su arreglo correcto (una segunda base de datos de test, o un guardián que
verifique el nombre/rol antes de truncar) toca infraestructura de test compartida por toda la
suite de `packages/db`, no solo por el bloqueo de candidatos. Ampliar el alcance de este
cambio para arreglarlo sería la misma clase de deriva que `CLAUDE.md` pide evitar.

**Consecuencia.** Ejecutar `pnpm --filter @buscahogar/db test` o `test:blocking` en un
entorno donde `DATABASE_URL` apunta a datos reales los destruye sin aviso. Ocurrió durante la
sesión de este mismo paso (1.8): los 50 anuncios reales de Idealista ingeridos en la
aceptación del paso 1.7 fueron sustituidos por un corpus sintético de 2000 filas
(`external_id` `bulk-N`) al ejecutar los tests de plan de consulta. La evidencia de
aceptación del paso 1.7 sobrevive solo en Engram (obs #122), no de forma reproducible en la
base de datos. Queda como pendiente explícito más abajo, en "Pendientes de decidir".

---

## 047 — Definición operacional de "dirección exacta": normalización de cuerpo, precondición de token de calle, vocabulario en dos niveles

**Estado:** aceptada

**Decisión.** Para que dos direcciones cuenten como coincidencia fuerte (`addressExact`,
peso 25) hace falta algo más que la igualdad literal de cadena: (1) normalizar ambas
cadenas (plegado de acentos, minúsculas, colapso de espacios); (2) recortar el prefijo
`"<Tipo> en "` anclando en el ÚLTIMO `" en "` antes de la primera coma; (3) exigir que el
primer segmento (hasta la primera coma) empiece por un token de nivel de calle reconocido
(`calle`, `cl`, `glorieta`, `plaza`, medidos; más una lista convencional no medida aún).
Dos cuerpos iguales pero sin token de calle cuentan solo como coincidencia débil de zona
(`addressZone`, peso 8). Dos cuerpos distintos cuentan como desacuerdo débil (peso 8,
valor 0) — nunca peso 0 y nunca la banda fuerte.

**Alternativa descartada.** Igualdad ingenua `a.address === b.address` (la regla que
implementa `AcmeDedupStrategy` en `packages/core/test/contracts.test.ts` como fixture de
compilación, nunca como estrategia enviada); descartar la dirección como señal fuerte por
completo; parseo completo de calle/número.

**Motivo.** La igualdad ingenua colisiona sobre el 20% de los anuncios reales medidos en
un único barrio-cadena street-less (`"Piso en Trafalgar, Madrid"`, 10/50 anuncios, 45
pares — obs #143), y sobre el 4,7% de los pares del corpus completo (57/1225):
recompensaría con peso fuerte a viviendas distintas del mismo bloque. Descartar la
dirección por completo tira evidencia real (decisión 006 la nombra explícitamente).
Parsear calle/número es desproporcionado para una cadena de formato libre de una sola
fuente, y el propio fixture de `premises` demuestra que ni siquiera es auto-consistente:
tres direcciones llevan un doble `" en "` y una lleva la palabra de tipo de vía despojada
por el portal (`apps/ingestion/test/fixtures/idealista/search-premises-2026-09-10.json:21,
1916, 2389, 2751`). Anclar en el ÚLTIMO `" en "`, no en el primero, es lo que clasifica
correctamente el caso del doble `" en "` como nivel de calle.

**Consecuencia.** Una fuente que use tokens de nivel de calle como etiqueta de zona (p.
ej. `"Piso en Plaza de España"` significando el barrio, no la calle) degradaría de forma
insegura. No se ha observado ese patrón en ninguna de las dos fuentes comprometidas; la
mitigación es re-medir cuando llegue una segunda fuente (decisión 020 hace ese re-medido
obligatorio vía bump de versión, no opcional).

---

## 048 — Banda de tres salidas con veto de solo rechazo, y el rango de `score` fijado en [0, 1]

**Estado:** aceptada

**Decisión.** `classify(result: SimilarityResult)` clasifica en tres salidas —
`accept`/`undecided`/`reject` — a partir de dos umbrales (`T_LOW = 0.45`, `T_HIGH = 0.82`,
versión 1.0.0) y un veto que solo puede forzar `reject`, nunca `accept` ni `undecided`:
si `propertyType` u `operation` no coinciden, el resultado es `reject` sin importar el
score acumulado, comprobado ANTES que los umbrales. El rango de `score` en
`SimilarityResult` (`types/similarity.ts`) queda fijado en el intervalo cerrado [0, 1],
retirando la deferencia de ROADMAP 1.4.

**Alternativa descartada.** Sin veto — dejar que la acumulación de señales decida en todos
los casos, incluido un desacuerdo de tipo de inmueble u operación.

**Motivo.** Decisión 006 prohíbe que una única señal DECIDA una coincidencia, pero no dice
nada sobre que una única señal FUERCE un rechazo — y su prioridad declarada es minimizar
falsos positivos. Sin veto, dos anuncios en las mismas coordenadas, mismo precio y
superficie pero de tipos distintos (un piso y un local, o el mismo piso en venta y en
alquiler) acumularían un score muy alto por evidencia estructural compartida, aceptando
por error algo que decisión 006 pide evitar activamente. El veto se comprueba antes que
los umbrales, nunca después, para que ningún score alto pueda enmascararlo.

**Consecuencia.** `propertyTypeMatch`/`operationMatch` son dos claves siempre presentes en
`signals`, siempre a peso 0 (decisión 049 las excluye de la acumulación y del piso de
evidencia) — `classify` deriva el veto de su `value`, no de una entidad de marcador
separada (BAND-3 del diseño).

---

## 049 — Normalización por peso efectivo y piso de evidencia mínima anclado en distance+price+surface

**Estado:** aceptada

**Decisión.** `score()` divide la suma ponderada de valores entre la suma de los pesos
REALMENTE aplicados (las señales no marcadas como ausentes), nunca entre la suma de los
pesos máximos configurados (110). Esto abre un agujero — un par con una única señal
evaluable y máxima normaliza a 1.0 — que se cierra con un piso de evidencia mínima antes de
que `classify` pueda devolver `accept`: al menos 3 señales evaluadas (peso > 0, contando
solo las siete claves acumuladas) Y al menos 55 unidades de peso efectivo acumulado. 55 es
exactamente `distance(25) + price(15) + surface(15)` — el conjunto base que el propio
texto de ROADMAP 1.9 nombra. El piso solo puede empujar hacia `undecided`/`reject`, nunca
hacia `accept`.

**Alternativa descartada.** Dividir por el peso TOTAL configurado (110) en vez de por el
peso efectivamente aplicado.

**Motivo.** Dividir por peso total penaliza sistemáticamente a los pares `premises`
(locales, garajes, trasteros), que casi nunca tienen `rooms`/`bathrooms` — perderían 30
puntos de peso configurado sin ninguna relación con si son o no la misma unidad, sesgo de
tipo de inmueble que decisión 006 no pide. Medido: el mismo par `premises` (sin
rooms/bathrooms, resto idéntico) puntúa 0.984 bajo normalización efectiva y solo 0.716 bajo
normalización total — cruzando de `accept` a `undecided` solo por el tipo de inmueble, no
por ninguna diferencia real entre los dos anuncios.

**Consecuencia.** El piso de evidencia mínima es una invariante independiente de versión,
no derivada automáticamente de los pesos: para la versión 1.0.0 el caso de dos señales más
ricas posible (`distance` + `addressExact`, 25+25=50) ya se queda por debajo de 55, así que
el recuento de "≥3 señales" es hoy redundante con el peso — pero se mantiene como regla
explícita para que un futuro cambio de pesos (bump de versión, decisión 020) no pueda
volver alcanzable un `accept` de dos señales sin que sea una decisión deliberada.

---

## 050 — Segunda expresión de distancia geográfica en el monorepo: no enmienda la decisión 019

**Estado:** aceptada

**Decisión.** `packages/core/src/geo/distance.ts` añade `haversineDistanceMeters`, una
distancia de círculo máximo pura sobre una esfera (R = 6 371 000 m), independiente de
PostGIS y del ORM. `packages/db/src/spatial.ts:1-4` sigue afirmando, citando la decisión
019, que es el "único punto donde se expresa una distancia geográfica" — esa frase gobierna
el lado SQL y no se toca aquí; esta entrada registra la segunda expresión sin enmendar 019.

**Alternativa descartada.** Reexportar o llamar de algún modo a `ST_DWithin`/`ST_Distance`
desde `packages/core` (imposible: ROADMAP 1.9 exige que `score(a, b)` derive todo de los
dos valores `Listing` en memoria, sin conexión a base de datos — Q1 confirmado, obs #144);
editar la decisión 019 para que hable también del lado en memoria.

**Motivo.** El alcance puro de Q1 hace inevitable una segunda expresión: no existe forma
de que una función pura sobre dos `Listing` consulte PostGIS. La divergencia entre ambas
expresiones (esfera vs. WGS84 geodésico) está acotada en ≲0.5% — a la escala del radio de
bloqueo (150-600 m) son ≲1.5 m; a la escala de un mismo bloque (≈25 m) son ≲0.1 m. Cota
derivada, no medida contra el motor real: no hubo base de datos disponible en esta fase.
La señal `distance` (`packages/core/src/strategies/rule-based/signals.ts`) decae de forma
continua y sin ningún salto cerca de esos radios, así que esa magnitud de divergencia no
cambia ninguna clasificación.

**Consecuencia.** Existe una tercera expresión duplicada, fuera del alcance de este cambio:
`apps/ingestion/scripts/probe/summarise.ts:133`, cuyo propio comentario dice que existe
solo porque `core` estaba pausado en el paso 1.4. Colapsarla sobre este nuevo export queda
registrada como trabajo de seguimiento, no realizado aquí. Un cotejo real contra PostGIS
con base de datos disponible queda pendiente para ROADMAP 1.10.

---

## 051 — Siete columnas de atributo consolidado en `properties` como caché recalculada, un único índice compuesto

**Estado:** aceptada

**Decisión.** `properties` gana siete columnas nulables —`propertyType`, `operation`, `address`,
`bathrooms`, `floor`, `title`, `description`— que reflejan el contenido del anuncio ganador de
cada consolidación (migración 0004), siguiendo el mismo patrón de caché recalculada que ya
declaran `minPriceCents`/`surfaceM2`/`rooms` (`properties.ts:1-4`). Un único índice compuesto,
`properties_operation_property_type_idx` sobre `(operation, property_type)`, es el único índice
nuevo sobre estas columnas.

**Alternativa descartada.** Limitar la consolidación a las columnas ya existentes, sin ampliar el
esquema; un `canonicalListingId` con FK al anuncio ganador, resuelto por join en el momento de la
búsqueda en vez de materializar los atributos; y un índice independiente por cada columna de baja
cardinalidad, en vez de uno solo compuesto.

**Motivo.** El texto de ROADMAP 1.10 exige que una vivienda consolidada exponga los mismos
atributos que un anuncio individual, y ROADMAP 1.11 ya nombra filtros de búsqueda (`tipo de
inmueble`, `baños`) que necesitan columnas indexables, no una recomputación por consulta. Resolver
por join en cada búsqueda de 1.11 es exactamente el coste que la caché recalculada evita — el
mismo razonamiento que ya justifica `minPriceCents`. El índice compuesto sirve `operation` sola,
como prefijo, y ambas columnas juntas a la vez — los dos filtros de baja cardinalidad que toda
búsqueda de 1.11 aplicará—, mientras que un índice por cada columna de rango sería especulativo
sin conocer las formas de consulta reales, que 1.11 es quien define.

**Consecuencia.** Las siete columnas son nulables: `properties` no tiene filas de producción hoy,
pero `NOT NULL` fallaría contra cualquier fila transitoria, mientras que nulable más un CHECK
(`operation IN ('sale', 'rent')`, que pasa con NULL, igual que `listings_status_check`) es aditivo
y seguro. En la práctica `operation` y `propertyType` se escriben siempre, porque son enums
obligatorios en `Listing`; la nulabilidad es una propiedad de la migración, no una afirmación de
modelado. Un índice por filtro adicional sobre las columnas de rango queda diferido a ROADMAP
1.11, que es quien mide las consultas reales antes de construir el instrumento.

---

## 052 — Agrupación por unión-búsqueda sobre aristas `accept`; un componente en conflicto se rechaza entero, nunca se divide

**Estado:** aceptada

**Decisión.** `buildPropertyGroups` (`packages/core/src/consolidation/grouping.ts`) forma
propiedades canónicas mediante cierre transitivo (unión-búsqueda) sobre los pares clasificados
como `accept` únicamente. El chequeo de conflicto se ejecuta después, sobre la partición ya
completa: si dos miembros de un mismo componente fueron clasificados `reject` entre sí, el
componente entero se rechaza — ninguna propiedad resultante contiene a ambos, pero tampoco se
intenta dividir el componente para salvar una fusión parcial. Cada miembro de un componente
rechazado pasa a ser su propia propiedad de un solo anuncio (singleton). Un par nunca comparado
por el bloqueo y un par clasificado `undecided` no son conflictos: ninguno de los dos bloquea ni
causa una fusión.

**Alternativa descartada.** División iterativa del componente eliminando en cada paso la arista
`accept` de menor puntuación hasta que el conflicto desaparezca (la propuesta original). Descartada
por cuatro motivos independientes: (1) es una heurística sin garantía de calidad — la forma
correcta de dividir un grafo para separar los extremos de un `reject` es un corte mínimo, y con
varios `reject` es clustering por correlación, NP-duro; la heurística puede eliminar una arista que
ni siquiera está en el camino entre los dos extremos en conflicto, destruyendo una fusión correcta
sin resolver el conflicto; (2) la decisión 006 (minimizar falsos positivos) apunta directamente
hacia el rechazo: una división emite una agrupación derivada de evidencia contradictoria sin nada
que respalde a quien sobrevive, mientras que un rechazo no emite ninguna, fallando hacia el falso
negativo que la decisión 006 exige preferir; (3) el rechazo es determinista sin necesitar ningún
orden total adicional, mientras que una división determinista exigiría uno (`score`, `listingAId`,
`listingBId`) — y los empates de puntuación no son hipotéticos: dos anuncios con campos idénticos
puntúan exactamente 1.0; (4) un componente rechazado es una unidad revisable de un vistazo (la cola
de revisión manual que ROADMAP 1.9 ya había diferido); uno dividido heurísticamente exige entender
la heurística para poder revisarlo, y la propia división añade iteración, recomputación, un orden
total y sus tests a un cambio ya muy por encima del presupuesto de revisión.

**Motivo.** La reversibilidad es la que decide entre las dos opciones: el rechazo es estrictamente
más conservador, y si la evaluación futura muestra que cuesta demasiado recall, una división puede
añadirse después como un salto de versión de estrategia con mediciones reales en la mano. Publicar
la división primero y descubrir que fabricó falsos positivos significaría que esos falsos positivos
ya habrían entrado en las cifras medidas del TFM. Un par `undecided` es un tercer estado distinto
del par nunca comparado (Q2a): ambos deben quedar fuera del chequeo de conflicto, y cada uno tiene
su propio test para no confundirlos.

**Consecuencia.** Rechazar el componente entero NO significa descartar sus anuncios: cada uno sigue
formando su propia propiedad, singleton incluida — un anuncio ausente de `groups` desaparecería por
completo de la búsqueda de ROADMAP 1.11. El orden de entrada de los pares no afecta el resultado:
la partición que produce la unión de aristas `accept` es el cierre transitivo, independiente del
orden por definición; la compresión de camino y la unión por rango solo varían qué nodo actúa de
raíz, y la raíz nunca se expone — cada grupo se ordena por `listings.id` (uuid, orden total) antes
de devolverse, así que el mismo corpus produce siempre el mismo resultado, byte a byte.

---

## 053 — Un único listing ganador por grupo; completitud sobre los siete campos opcionales, desempate por `capturedAt`, `listingId` como clave final de orden total

**Estado:** aceptada

**Decisión.** `selectWinningListing` (`packages/core/src/consolidation/winner.ts`) elige, para cada
grupo, exactamente un listing ganador que aporta TODOS los atributos consolidados de la propiedad
— nunca una fusión campo a campo entre miembros. El comparador tiene tres claves, en este orden:
(1) `countCompleteness`, el número de campos no ausentes entre los siete campos opcionales de
contenido de `Listing` (`surfaceM2`, `rooms`, `bathrooms`, `floor`, `title`, `description`,
`address`) — descendente; (2) `capturedAt` de la versión actual del listing (recencia de CAMBIO de
contenido, no de re-observación) — descendente, y solo desempata entre candidatos de completitud
igual; (3) `listingId` — ascendente, desempate final. El precio consolidado (`minPriceCents`) NO
sale del ganador: es el mínimo de precio entre todos los miembros del grupo (cruza con la decisión
sobre `properties.ts`, D5 del diseño, obs #160).

**Alternativa descartada.** Completitud ponderada por campo (pesos arbitrarios que necesitarían su
propia calibración — exactamente el problema que `docs/ROADMAP.md` ya señala para los pesos de la
propia estrategia de deduplicación); usar `listings.lastSeenAt` como señal de recencia (avanza en
cada barrido del anuncio, incluso sin ningún cambio de contenido, así que todo anuncio vivo
empataría); detener el comparador en dos claves (completitud y `capturedAt`), sin una tercera clave
de desempate total.

**Motivo.** `operation` y `propertyType` son enums obligatorios en `Listing`, presentes siempre en
cualquier candidato — no discriminan nada, y contarlos solo induciría a pensar que sí lo hacen.
`coordinates` queda fuera deliberadamente y es inerte de cualquier forma: el bloqueo excluye todo
par con geometría ausente, así que todo miembro de un grupo con más de un anuncio tiene coordenadas
por construcción, y un singleton no tiene con qué comparar. La tercera clave no es un adorno
defensivo: `capturedAt` es `defaultNow()` y `now()` de Postgres es la hora de INICIO de la
transacción, así que toda versión que un mismo barrido inserta comparte `capturedAt` exactamente —
el empate entre dos candidatos de igual completitud tras un mismo barrido es el caso COMÚN, no el
raro. Sin la tercera clave, el ganador dependería del orden en que el driver devolviera las filas,
el reproceso dejaría de ser reproducible, y el determinismo de la agrupación (decisión 052) se
rompería en el punto de la consolidación aunque la agrupación en sí siguiera siendo determinista.
`listings.id` es un uuid único, así que esta clave sí es un orden total genuino.

**Consecuencia.** Con un único ganador por grupo (Q3), la propiedad puede quedar con un atributo
`NULL` cuando un miembro no ganador tenía ese dato y el ganador no — coste aceptado explícitamente
(N3 del diseño), no un defecto, y sin obligación alguna de rellenar el hueco desde otro miembro.
Queda anotado como obligación hacia adelante para ROADMAP 1.11, cuyos filtros de `baños`/`tipo de
inmueble` no verán ese valor si el ganador no lo tenía.

---

## 054 — `properties.id` no es estable entre reprocesos; obligación hacia adelante para las URLs de 1.12

**Estado:** aceptada

**Decisión.** El comando de reproceso (`apps/ingestion/scripts/reprocess-dedup.ts`) borra por
completo `properties`/`property_listings` y los reconstruye desde cero en cada corrida (decisión
055): cada `properties.id` que resulta de una corrida es un uuid nuevo, generado por esa corrida,
sin ninguna relación garantizada con el id que la vivienda equivalente tuvo en la corrida anterior
(Q6). No hay ningún mecanismo — ni de "misma vivienda, mismo id" ni de redirección — que preserve
la identidad de una vivienda consolidada de una corrida a la siguiente.

**Alternativa descartada.** Una columna de generación con intercambio atómico (`generation` +
`UPDATE ... SET current = false` seguido de un `INSERT`/`swap`) en vez de borrar-y-reconstruir,
que sí permitiría conservar el mismo `properties.id` entre corridas cuando el grupo resultante es
el mismo conjunto de anuncios — nombrada explícitamente en el diseño (D8, `FB-TX-TOO-LONG`) como
el rediseño que además reduciría la duración de la transacción a gran escala. Descartada aquí
porque nada publicado depende todavía de la estabilidad de estos ids (Q6 ya está confirmada por el
maintainer) y porque el coste de implementarla — intercambio atómico, resolución de qué grupo de
la corrida anterior corresponde a cuál de la nueva — no tiene ningún consumidor real en este
cambio.

**Motivo.** Q6 fija explícitamente que el reproceso puede reasignar identificadores; el diseño
(D8) elige borrar y reconstruir la caché entera en una única transacción precisamente porque es la
forma más simple de garantizar "en todo momento existe exactamente una generación de
`properties`", y esa simplicidad tiene como contrapartida directa la no persistencia del id. Es
una decisión ya tomada por el diseño (D8) y confirmada por el maintainer (Q6); esta entrada
documenta la consecuencia para quien construya sobre `properties.id` más adelante, no reabre la
elección.

**Consecuencia.** ROADMAP 1.12 (páginas de detalle con URL propia) no puede usar `properties.id`
tal cual como parte de una URL durable: un reproceso posterior puede reasignar el id de la misma
vivienda real. Queda anotado como obligación hacia adelante para 1.12, que deberá resolver su
propio esquema de identificador estable (por ejemplo, anclado a `listings.id`/`external_id` en vez
de a `properties.id`, o adoptando el intercambio de generación descartado arriba si la estabilidad
resulta imprescindible). REPRO-3 (obs #161) es la contraparte de especificación de esta misma
decisión.

---

## 055 — Ledger de evidencia por corrida, separado de la caché de `properties`/`property_listings`; `property_listings` no se migra

**Estado:** aceptada

**Decisión.** Dos tablas nuevas, `dedup_runs` y `dedup_pair_evidence` (migración 0005), forman un
ledger de apéndice que nunca se borra: cada fila de evidencia queda delimitada por `runId` (FK a
`dedup_runs`, cascada), y persiste el score, el desglose completo por señal y la banda —
`accept`, `undecided` y `reject` por igual— de todo par candidato que la estrategia puntúa. Es
estructuralmente distinto del ciclo de vida de `properties`/`property_listings`, que se borran y
reconstruyen por completo en cada reproceso. `property_listings` no recibe ninguna migración:
toda vivienda —incluida la que no tiene ningún duplicado detectado— obtiene exactamente una fila
en esa tabla ya existente, reutilizando sus columnas `score`/`signals` (ya `NOT NULL`) con un
marcador de peso 0 (`{ selfGroup: { value: 1, weight: 0, ... } }`) para el caso de un solo
anuncio, en vez de añadir una columna nueva.

**Alternativa descartada.** Para el ledger: truncarlo en cada corrida; delimitar el chequeo de
conflicto por `(strategyName, strategyVersion)` en vez de por corrida; hacer upsert sobre
`(listingAId, listingBId)` quedándose solo con la última decisión; añadir `runId` también a
`properties`. Para `property_listings`: añadir una columna dedicada (por ejemplo, un booleano
`isSingleton`) para marcar el caso sin duplicado, en vez de reutilizar `score`/`signals`; y,
antes de eso, la lectura que la primera revisión de la especificación había dado a este punto
—que `property_listings` solo recibe fila para un anuncio que termina en un grupo de verdad
formado, dejando sin fila alguna a los anuncios cuya única relación con otros es `undecided` o
`reject`.

**Motivo.** Los umbrales de bloqueo (`radius`, banda de precio, margen de superficie) son
argumentos de la CLI de reproceso, no una constante de la versión de estrategia: dos corridas de
la MISMA versión con un `--radius` distinto producen conjuntos de candidatos distintos, así que
delimitar por versión de estrategia dejaría que un `reject` de una corrida bloqueara una fusión
que otra corrida ni siquiera llegó a proponer —el mismo fallo que ya se evita dentro de una
corrida al no tratar un par nunca comparado como un conflicto, reapareciendo entre corridas por
la puerta trasera. Truncar el ledger en cada corrida sería correcto para ese chequeo, pero
destruye la evidencia no reconstruible que CLAUDE.md exige conservar, y con ella la posibilidad
de comparar estrategias —el propio objetivo de esta tabla. Sobre `property_listings`: `score` y
`signals` ya son `NOT NULL` (`property-listings.ts:37,40`), así que una vivienda sin pareja
puntuada no tiene con qué llenarlos si no se decide algo explícitamente. La especificación
(obs #161) y el diseño (obs #160) discreparon en este punto exacto, y la arbitración (obs #162)
lo resolvió a favor del diseño: la búsqueda de ROADMAP 1.11 consulta `properties`, no `listings`,
y la exploración midió 50 códigos de anuncio distintos entre 50 anuncios reales del corpus vivo
(obs #142) —bajo la primera lectura de la especificación, casi ningún anuncio real habría tenido
fila en `properties` y la página de resultados de 1.11 habría vuelto vacía. Un anuncio sin
duplicado detectado sigue siendo una vivienda. El marcador de peso 0 no es una invención para
esta ocasión: `weight: 0` ya es el idioma establecido en el repositorio para "presente, no
contribuye" (`weights.ts:9-12`, `classify.ts:12-15`), y sigue siendo consultable mediante el
mismo índice GIN `jsonb_ops` que ya sirve `property_listings.signals` (`property-listings.ts:54`),
a través del operador `?`.

**Consecuencia.** `property_listings` conserva exactamente su esquema, pero su significado se
amplía: ya no solo relaciona un anuncio con una vivienda por coincidencia real, sino que también
aloja el caso "vivienda de un solo anuncio". `dedup_pair_evidence` sigue siendo la única tabla que
retiene el desglose completo de una decisión `reject`/`undecided` —la superficie analítica para
comparar estrategias sigue siendo esa tabla, nunca `property_listings`.

---

## 056 — `apps/web` recibe su propia credencial de solo lectura; enmienda la frontera de la decisión 015

**Estado:** aceptada

**Decisión.** La decisión 015 acota su frontera: «ninguna credencial de base de datos ni de las
fuentes» pasa a leerse como «ninguna credencial de **fuentes externas** ni de **escritura**».
`apps/web` (paso 1.11) recibe su propia credencial de PostgreSQL, respaldada por un rol creado
por el mantenedor con permiso **únicamente de `SELECT`**. En `docker-compose.yml`, el servicio
`web` pasa de no tener ninguna vía de credenciales a una `environment:` propia y acotada,
`DATABASE_URL: '${WEB_DATABASE_URL}'` — nunca el mismo

> **Corrección (2026-09-17).** La redacción original de esta decisión escribía
> `${WEB_DATABASE_URL:?falta WEB_DATABASE_URL en .env}`. Esa forma aborta la interpolación del
> `docker-compose.yml` ENTERO en tiempo de parseo, con independencia de los perfiles, y rompía
> la garantía de la decisión 015 de que `docker compose up -d` sin `--profile` levanta solo `db`.
> El fallo ruidoso vive en `apps/web/src/server/db.ts`, que lanza un error nombrado citando esta
> misma decisión cuando la variable falta. Ver `AI-NOTES.md`, 2026-09-17.
`env_file` que `ingestion`. En local (`pnpm dev:web`), el valor va en `apps/web/.env.local`
(gitignored, convención propia de Next), bajo el nombre llano `DATABASE_URL` dentro del
contenedor/proceso de `web`; en el `.env` de la raíz del monorepo se llama `WEB_DATABASE_URL`
para no colisionar con la credencial de escritura de `ingestion`, que vive en ese mismo fichero.
Ninguna de las dos rutas usa `NEXT_PUBLIC_*`.

**Alternativa descartada.** Dar a `web` el mismo `env_file: [.env]` que `ingestion` (concede
escritura y credenciales de fuentes que `web` no necesita); mantener la decisión 015 literal
(haría el paso 1.11 —y la propia decisión de producto 004, Next.js con Server Components sobre
la base de datos— inimplementables).

**Motivo.** CLAUDE.md prohíbe que `apps/web` llame a una fuente externa o reciba sus
credenciales — esa parte de la decisión 015 sigue vigente sin cambios. Lo que la decisión 015 no
había anticipado es que `apps/web` sí necesita SU PROPIA conexión a la base de datos para
consultar `properties` directamente desde un Server Component (decisión 004), y que esa
necesidad es de LECTURA, nunca de escritura. Dar a `web` el `env_file` completo de `ingestion`
concedería de más: la credencial de escritura y las credenciales de las fuentes, ninguna de las
cuales `web` usa o debería poder usar. Un rol de PostgreSQL con permiso `SELECT` únicamente hace
que un intento de escritura desde `web` —por error de programación, no por diseño— sea
rechazado por la propia base de datos, no solo por convención de código.

**Consecuencia.** La creación del rol de solo lectura y el volcado de su URL en ambos ficheros
(`.env` de la raíz y `apps/web/.env.local`) es un prerrequisito exclusivamente del mantenedor:
ningún agente puede leer ni escribir esos ficheros. `apps/web/src/server/db.ts` falla alto y
nombra esta decisión cuando `DATABASE_URL` no está definida, en vez de degradar a un valor por
defecto o a una lista de resultados vacía. Pointer: enmienda la decisión 015, que permanece
en su redacción original como evidencia histórica del TFM (convención de la decisión 050: se
enmienda por entrada nueva, nunca reescribiendo la anterior).

---

## 057 — `packages/core` posee la coerción string→number de los search params de búsqueda; parseo nombrado, no `z.coerce`

**Estado:** aceptada

**Decisión.** `searchQuerySchema` (paso 1.11, `packages/core/src/schemas/search-query.schema.ts`)
convierte cada parámetro numérico de `string` a `number` mediante expresiones regulares
nombradas (`intParam`/`decimalParam`) seguidas de `.transform(Number)`, nunca con
`z.coerce.number()`. Esto enmienda el puntero «ROADMAP 1.13» que dejó abierto la decisión 030
(`AreaQuery`: solo geográfica…, `packages/core/src/schemas/area-query.schema.ts:36-37`): la
obligación de convertir string→number antes de `areaQuerySchema.safeParse` ahora la posee
`searchQuerySchema`, en el paso 1.11, no en un paso 1.13 que ya no existe con ese alcance.

**Alternativa descartada.** `z.coerce.number()` sobre cada campo numérico de la petición.

**Motivo.** `z.coerce.number()` convierte `''` en `0` y `true`/`false` en `1`/`0` de forma
silenciosa — exactamente el fallo que la frontera de `searchQuerySchema` existe para impedir
(«Empty string is not zero», REVISION 2 del spec). Una expresión regular nombrada por campo
(`^\d+$` para enteros sin signo, `^-?\d+(\.\d+)?$` para decimales con signo opcional) rechaza
con un mensaje que identifica el parámetro exacto, en vez de aceptar en silencio un valor que
nunca fue el que el usuario escribió en la URL.

**Consecuencia.** `packages/core` sigue siendo el único punto de conversión string→number para
los search params de esta página; `packages/db/src/search.ts` recibe siempre `number` (o
`undefined`), nunca `string`, y sigue sin importar Zod (decisión 023).

---

## 058 — Semántica de `buildPropertySearchQuery`: recuento de fuentes sin join, exclusión de NULL activa, `NULLS LAST` explícito, paginación por offset con `hasNextPage`

**Estado:** aceptada

**Decisión.** `buildPropertySearchQuery` (paso 1.11, `packages/db/src/search.ts`) fija cuatro
comportamientos como parte del contrato de la consulta, no como detalles de la implementación
actual: (1) el recuento de fuentes distintas se calcula como `COUNT(DISTINCT
listings.source_id)` en una subconsulta correlacionada de la proyección, sin unir la tabla
`sources` — válido porque `listings.source_id` es `NOT NULL REFERENCES sources.id`, así que
ambos recuentos son idénticos para cualquier fila que pueda existir; (2) un filtro activo
EXCLUYE cualquier fila cuya columna filtrada sea NULL, y un filtro ausente no añade ningún
predicado — sin ninguna rama de rescate `OR … IS NULL`, al contrario que el bloqueo de
candidatos (`blocking.ts`, decisión implícita en D-Q3), donde NULL sí rescata el par; (3) todo
`ORDER BY` fija `NULLS LAST` explícitamente en ambas direcciones, con `properties.id ASC` como
desempate determinista; (4) la paginación es por offset con un tamaño de página fijo
(`PAGE_SIZE`) y expone `hasNextPage` en vez de un recuento total —sin `COUNT(*) OVER ()`—,
pidiendo una fila de más (`LIMIT PAGE_SIZE + 1`) y recortándola.

**Alternativa descartada.** Para el recuento de fuentes: un join explícito contra `sources`, o
un join agrupado (`GROUP BY`) que calcularía el agregado para todas las filas coincidentes
antes de aplicar `LIMIT`. Para NULL: rescatar la fila con una rama `OR … IS NULL`, igual que el
bloqueo. Para la paginación: `COUNT(*) OVER ()` para un total exacto, o un cursor por clave
(keyset), o clampar una página fuera de rango a la última válida.

**Motivo.** Un join agrupado computa el agregado para TODO el conjunto filtrado antes de
recortar a una página, cuando solo hace falta para las filas ya paginadas — el peor patrón
posible para una consulta paginada. La exclusión de NULL en un filtro activo es lo que un
usuario espera de "quiero pisos con precio máximo X": un precio desconocido no es una prueba de
que cumpla el filtro. `COUNT(*) OVER ()` es un segundo recorrido completo del conjunto filtrado
que el ROADMAP nunca pidió — "hay página siguiente" es lo único que necesitan los controles de
paginación. Clampar una página fuera de rango devolvería datos de una página distinta de la que
la URL nombra, rompiendo la garantía de que compartir la URL reproduce la búsqueda (misma lógica
que el rechazo, no clamp, del propio parámetro `page` en `searchQuerySchema`).

**Consecuencia.** Un `properties.id` es un uuid sin orden temporal ninguno; el desempate por
`id ASC` es determinista dentro de una misma generación de la caché (decisión 054: un reproceso
puede reasignar esos ids). No existe ningún "está en la página 3 de 7" en la interfaz: solo
"hay más resultados" — un rediseño futuro que necesite un contador total tendrá que decidir
explícitamente pagar ese segundo recorrido, no heredarlo en silencio.

---

## 059 — `thumbnailUrl` como `identity-column`, fuera de `VERSION_COLUMN_FIELDS`

**Estado:** aceptada

**Decisión.** `thumbnailUrl` (paso 1.11) se clasifica en `LISTING_FIELD_POLICY`
(`apps/ingestion/src/sweep/listing-field-policy.ts`) como `identity-column`, igual que `url` o
`location`. Se escribe una sola vez, en la primera visión del anuncio, y nunca se sobrescribe en
una re-visión posterior (`listing-writer.ts`, `onConflictDoUpdate.set` sin tocar esta columna).
Al quedar fuera de `VERSION_COLUMN_FIELDS` (derivado de la política, nunca mantenido a mano, R2),
tampoco participa en la comparación campo a campo que decide si una re-visión abre una versión
nueva en `listing_versions`.

**Alternativa descartada.** Clasificarla como `version-column`, comparándola igual que
`priceCents` o `surfaceM2`.

**Motivo.** Cada portal reescala y recomprime sus imágenes (CLAUDE.md, «Imágenes no comparables
por hash exacto»), así que la URL de la miniatura de un mismo anuncio puede cambiar entre dos
barridos sin que ningún dato relevante para el histórico de precios haya cambiado. Clasificarla
como `version-column` habría hecho que un simple recorte de imagen del portal fabricara una fila
nueva en `listing_versions` en cada barrido — corrompiendo en silencio el histórico que esa tabla
existe para preservar (CLAUDE.md: «`listings` no se sobrescribe»; docs/DECISIONS.md, decisión 037).

**Consecuencia.** El thumbnail consolidado se congela en la primera vista de cada anuncio: si el
portal cambia la imagen más adelante, ese cambio nunca llega a `listings.thumbnail_url` salvo que
se reingiera el anuncio desde cero. Coste aceptado explícitamente en la propuesta (A-7):
protege el histórico de precios a cambio de una miniatura potencialmente desactualizada.

---

## 060 — Índices por filtro de búsqueda re-aplazados; disparador de medición explícito

**Estado:** aceptada

**Decisión.** `buildPropertySearchQuery` (paso 1.11, `packages/db/src/search.ts`) no añade
ningún índice nuevo sobre `properties` para sus siete filtros (operación, tipo, precio,
superficie, habitaciones, baños, geografía). El único índice compuesto ya existente
(`properties_operation_property_type_idx`, decisión 051) permanece sin cambios.

**Alternativa descartada.** Añadir un índice por cada filtro nuevo (precio, superficie,
habitaciones, baños) al introducir la consulta que los usa por primera vez.

**Motivo.** El corpus real tiene del orden de 100 filas en `properties` (ROADMAP 1.10): a ese
volumen cualquier afirmación sobre qué índice preferiría el planificador es, por definición,
inmedible — el precedente ya retractado de ROADMAP 1.8 (tarea 5.2, `CHK-PARTIAL-IDX` vs. el plan
real bajo volumen) es exactamente el mismo error: reclamar en la documentación un comportamiento
del planificador que nunca se verificó con `EXPLAIN` contra un volumen representativo. Añadir
índices no medibles hoy sería la misma clase de afirmación no falsificable.

**Consecuencia.** Disparador explícito para revisar esta decisión: cuando el corpus alcance un
volumen suficiente para que `EXPLAIN (ANALYZE, FORMAT JSON)` sobre `buildPropertySearchQuery`
muestre un `Seq Scan` costoso en `properties` bajo un filtro realista, medir con datos reales
antes de añadir cualquier índice — nunca a partir de una intuición sobre el volumen. Propietario:
quien retome ROADMAP 1.11 o 2.4 (indexación y medición de rendimiento).

---

---

## 061 — URL de detalle duradera, keyed en un `listings.id` miembro

**Estado:** aceptada

**Decisión.** El segmento de la ruta de detalle de vivienda (`/properties/[listingId]`, paso 1.12)
es un `listings.id` uuid, nunca `properties.id`. Resuelve a través del índice único
`property_listings_listing_id_idx` (`property-listings.ts:52`) a la vivienda que actualmente
contiene ese anuncio, con independencia de que `properties.id` se haya regenerado. Se cubre así el
cuarto caso de 404 identificado durante el diseño (arbitraje obs #193, AR-2): un listing barrido
después del último `reprocess-dedup` todavía no tiene fila `property_listings`, así que su URL
resuelve a `notFound()` — reachable hoy en cada barrido entre dos reprocesos, pero contenido: la
búsqueda solo lee `properties`/`property_listings`, así que ninguna tarjeta de resultado puede
enlazar jamás a un listing sin consolidar.

**Alternativa descartada.** `/properties/[id]` sobre `properties.id` directamente; un slug de clave
natural `/properties/[source]/[externalId]`; un hash del conjunto de miembros; un esquema de
generación intercambiada sobre `properties`.

**Motivo.** `properties.id` no es estable entre reprocesos (decisión 054/Q6: cada reproceso borra y
reconstruye `properties` con uuids nuevos), así que cualquier URL basada en él moriría en el
siguiente reproceso — justo lo que ROADMAP 1.12 (R4) advertía como obligación pendiente desde el
paso 1.11. `listings.id`, en cambio, es la identidad estable del anuncio-fuente (CLAUDE.md:
"`listings` no se sobrescribe") y el índice único ya garantiza que resuelve a lo sumo una vivienda.
Verificado contra el código real (design Q1, obs #191): ninguna etapa entre el bloqueo y la
escritura de consolidación filtra por `listings.status`, así que un anuncio retirado conserva su
fila `property_listings` y su URL sigue resolviendo — solo esa fuente se marca no disponible.

**Consecuencia.** El resultado de búsqueda necesita un anuncio ancla por vivienda para poder
construir el href sin una consulta extra por tarjeta — de ahí la proyección `anchorListingId` en
`search.ts` (decisión ligada a esta). Cuatro casos de 404 quedan documentados y probados: uuid
malformado, `listings` inexistente, listing barrido tras el último reproceso, y (no-404) fuente
retirada.

---

## 062 — `numPhotos` como `identity-column`, fuera de `VERSION_COLUMN_FIELDS`

**Estado:** aceptada

**Decisión.** `numPhotos` (paso 1.12) se clasifica en `LISTING_FIELD_POLICY`
(`apps/ingestion/src/sweep/listing-field-policy.ts`) como `identity-column`, igual que
`thumbnailUrl` (decisión 059). Se escribe una sola vez, en la primera visión del anuncio, y nunca
se sobrescribe en una re-visión posterior (`listing-writer.ts`, `onConflictDoUpdate.set` sin
tocar esta columna). Al quedar fuera de `VERSION_COLUMN_FIELDS` (derivado de la política, nunca
mantenido a mano, R2), tampoco participa en la comparación campo a campo que decide si una
re-visión abre una versión nueva en `listing_versions`.

**Alternativa descartada.** Clasificarla como `version-column`, comparándola igual que
`priceCents` o `surfaceM2`.

**Motivo.** Mismo argumento exacto que la decisión 059 para `thumbnailUrl`: un anuncio puede
ganar o perder fotos entre dos barridos sin que ningún dato relevante para el histórico de
precios haya cambiado, así que clasificarla como `version-column` fabricaría una fila nueva en
`listing_versions` en cada barrido que el anunciante actualizara su galería — corrompiendo en
silencio el histórico que esa tabla existe para preservar (CLAUDE.md: «`listings` no se
sobrescribe»). Razón independiente, verificada en el diseño (obs #191, D5): `FieldPolicy`'s brazo
`version-column` tipa `column: keyof VersionColumns`, así que clasificarla ahí exigiría además un
campo nuevo en `VersionColumns` y una columna `listing_versions.num_photos` — un cambio
estrictamente mayor además de incorrecto.

**Consecuencia.** El recuento consolidado se congela en la primera vista de cada anuncio: si el
número real de fotos cambia más adelante, ese cambio nunca llega a `listings.num_photos` salvo
que se reingiera el anuncio desde cero. Coste aceptado y declarado (ROADMAP 1.12): la interfaz
renderiza el recuento como una cifra observada en una fecha (`lastSeenAt`), nunca como un valor
en vivo, precisamente porque puede haberse quedado desactualizado.

---

## 063 — Alcance de la galería: una imagen por fuente, nunca varias por anuncio; navegación por ancla propia de cada slide

**Estado:** aceptada

**Decisión.** `source-gallery.tsx` (paso 1.12) renderiza EXACTAMENTE una imagen por anuncio de
origen (su `thumbnailUrl`), nunca varias fotos por listing. La navegación previa/siguiente no es
un control global fijo: cada slide lleva su propio par de anclas `<a href="#source-slide-…">`
apuntando al id del slide vecino que existe de verdad en el array — a N=1 no hay vecino, así que
no se renderiza ningún ancla, nunca una que apunte a un id inventado.

**Alternativa descartada.** Esperar a tener acceso a un endpoint de fotos por anuncio antes de
enviar la galería (bloquearía todo el paso 1.12 en un acceso externo no concedido); un control
previo/siguiente único y fijo (necesitaría saber cuál es el slide activo, algo que un Server
Component no puede observar sin JavaScript).

**Motivo.** obs #189 (investigación previa a este paso) documenta que no hay endpoint de fotos
confirmado, cuota publicada ni licencia legible para Idealista — traer más de una foto por anuncio
queda fuera de alcance por PD-2, con su propio paso de ROADMAP pendiente de esa aclaración fuera
de banda. Enviar la galería con una imagen por fuente es más honesto que no enviar nada: el
recuento de fotos fechado (decisión 062) y el enlace de salida de cada fuente (`source-list.tsx`)
le dicen al usuario dónde ver el resto. Sobre la navegación: un ancla "anterior"/"siguiente" fija
necesitaría conocer el slide actualmente visible para calcular su destino, y eso no es observable
desde un Server Component ni desde CSS puro sin `:target` — en cambio, cada slide conociendo a sus
propios vecinos en el array es información que el servidor sí tiene, así que el href nunca puede
apuntar a un id que no exista.

**Consecuencia.** Para un anuncio sin `thumbnailUrl`, ese anuncio simplemente no aporta slide (no
se renderiza una `<Image>` rota). Si ninguna fuente tiene miniatura, `SourceGallery` no renderiza
nada — degradación explícita, no un carrusel vacío con controles que no llevan a ningún sitio. El
desplazamiento sin JavaScript (arrastre táctil / rueda + clic en las anclas) queda como MANUAL
ACCEPTANCE (arbitraje obs #193 AR-9): no hay arnés de navegador en este stack, misma clase que el
escenario "Fresh session reproduces the search" del paso 1.11 (obs #174).

---

## 064 — Segundo rol de PostgreSQL, INSERT-only sobre `coverage_jobs`; enmienda a la decisión 056 igual que la 056 enmendó la 015

**Estado:** aceptada

**Decisión.** `apps/web` gana un SEGUNDO cliente de base de datos, `getCoverageDb()`
(`apps/web/src/server/coverage-db.ts`), hermano deliberado de `getDb()` (`apps/web/src/server/db.ts`,
decisión 056) y NUNCA fusionado con él. Lee una variable de entorno distinta
(`WEB_COVERAGE_DATABASE_URL`), cachea en una clave de `globalThis` distinta
(`buscahogarCoverageDb`, nunca `buscahogarDb`) y lanza su propia clase de error
(`MissingCoverageDatabaseUrlError`) cuando la credencial falta. El rol de PostgreSQL que respalda
esa variable tiene `INSERT` sobre `coverage_jobs` y nada más — ni `SELECT`, ni `UPDATE`, ni
`DELETE`, ni acceso a ninguna otra tabla.

**Alternativa descartada.** Reutilizar el rol de solo lectura de la decisión 056, ampliándolo con
`INSERT` sobre `coverage_jobs`; o un único cliente compartido con el privilegio más amplio de los
dos usos.

**Motivo.** La decisión 056 enmendó la 015 para dar a `apps/web` su propia credencial de solo
lectura, de forma que un `INSERT`/`UPDATE`/`DELETE` accidental en un camino de lectura lo rechace
PostgreSQL mismo, no la revisión de código. Un único handle compartido — o un rol de lectura
ampliado con escritura — borraría exactamente esa propiedad: cualquier bug en la ruta de búsqueda
que intentara escribir tendría éxito en silencio. Dos roles estrechos, cada uno con el mínimo
privilegio que su propio camino necesita, mantienen la garantía original de la 056 intacta para la
lectura Y la extienden a la escritura.

**Consecuencia — R3, sin resolver por ningún agente.** El rol INSERT-only real todavía no existe:
provisionarlo (`CREATE ROLE`, `GRANT INSERT ON coverage_jobs TO ...`) y escribir
`WEB_COVERAGE_DATABASE_URL` en el `.env` de la raíz es una tarea EXCLUSIVA del mantenedor — ningún
agente tiene permiso para crear roles de PostgreSQL ni para leer/escribir `.env`. La prueba
negativa que demuestra el rechazo real (`apps/web/test/db/coverage-role-privileges.test.ts`) está
escrita y lista, gateada en `WEB_COVERAGE_DATABASE_URL` (se omite, nunca falla, mientras la
variable no exista) — no se ha ejecutado en verde ni una sola vez todavía. El propio índice único
TOTAL de `coverage_jobs(zone_id, source_id)` (diseño DD-16, ver el comentario en
`packages/db/src/schema/coverage-jobs.ts`) es lo que hace segura una inserción `ON CONFLICT DO
NOTHING` sin `target` desde este rol: cualquier conflicto de unicidad —contra el índice parcial
heredado del paso 1.7 o contra este nuevo índice total— se trata como éxito, sin que el rol
necesite `SELECT` para comprobar nada antes de escribir.

## 065 — `no-client-directive.test.ts` se estrecha a un allowlist de UN fichero, no se elimina

**Estado:** aceptada

**Decisión.** La regla que ROADMAP 1.11 fijó (ningún fichero de `apps/web/src` declara `'use
client'`) deja de ser absoluta: `apps/web/src/components/coverage-status.tsx` es el ÚNICO fichero
permitido a declararla, y el propio test lo hace explícito con TRES aserciones — ninguno fuera del
allowlist la declara, cada entrada del allowlist existe de verdad en disco, y cada entrada SÍ
contiene la directiva. La cabecera del fichero se reescribe para describir la regla estrechada, no
la original.

**Alternativas descartadas.** (1) Meta-refresh (`<meta http-equiv="refresh">`) — recarga la página
completa a intervalo fijo, perdiendo cualquier estado de scroll/formulario, y no puede detenerse
cuando el barrido termina (un job `done` seguiría recargando indefinidamente). (2) Un enlace
manual únicamente, sin ningún refresco automático — dado como baseline sin JS (ya cubierto por el
enlace `href` plano de `page.tsx`), pero deja al usuario con JS habilitado sin ninguna mejora sobre
quien tiene JS deshabilitado, cuando la mejora es barata y bien acotada. (3) Streaming de Server
Component (`Suspense` + revalidación) — exigiría reestructurar `page.tsx` en torno a un límite de
streaming nuevo para un caso de uso (un job que tarda minutos, no milisegundos) que no encaja en
el modelo de streaming de Next.js, pensado para latencia de carga inicial, no para sondeo
prolongado.

**Motivo.** DD-19 lo argumenta con aritmética, no con intuición: un `<datalist>` con los ~8.131
municipios del catálogo es ~8.131 × ~40 B ≈ 325 KB de marcado en CADA carga de la página de
búsqueda, para un control que se usa una vez. La autocompletación de zona (DD-19) por eso queda
enteramente sin JavaScript de cliente — una lista de sugerencias servida por el servidor, un enlace
`<a href="/?zone=...">` plano por coincidencia — y es el estado de un barrido EN CURSO (DD-23),
nunca la autocompletación, lo que necesita refresco automático: `router.refresh()` en un intervalo
acotado tres veces (estado terminal, techo de refrescos, intervalo fijo). El hueco que esto abre en
la regla de 1.11 queda del ancho mínimo posible — un fichero, con su propia prueba de
autoverificación para que una entrada obsoleta falle en voz alta en vez de ensanchar el hueco en
silencio.

**Consecuencia.** Cualquier cambio futuro que quiera declarar `'use client'` en otro fichero debe
añadirlo al allowlist explícitamente y argumentar por qué en su propio registro de decisión — el
hueco no crece por accidente.

---

## 066 — Procedencia del catálogo importado, precedencia de la fusión, regla de no-truncación, y la definición de "hoy" del presupuesto diario

**Estado:** aceptada

**Decisión.** Cuatro reglas relacionadas, agrupadas en una única entrada porque las cuatro
protegen la misma propiedad — que ningún dato de este cambio (ROADMAP 1.13) se fabrique ni se
pierda en silencio — y porque el diseño (DD-25) las agrupó deliberadamente así, para no enterrar
ninguna de las cuatro bajo un encabezado que no la nombre:

1. **Forma del artefacto committeado.** El catálogo importado
   (`packages/db/src/municipality-catalogue.generated.ts`) lleva SIEMPRE una cabecera de
   procedencia (`apps/ingestion/src/catalogue/provenance.ts`): URLs de origen, fecha de descarga
   suministrada por el operador (nunca inferida), nombres de fichero, checksum SHA-256, el
   sistema de referencia declarado verbatim por el propio fichero (decisión 067), delimitador,
   codificación, y los recuentos de import (filas de entrada/emitidas, con/sin centroide, por
   tier de resolución, descartes por guarda de esparcimiento y por puerta de cordura). Una
   cabecera con cualquier campo vacío hace fallar la construcción del artefacto
   (`MissingProvenanceFieldError`) — nunca se emite un artefacto sin procedencia demostrable
   (P5, COVERAGE-8).
2. **Precedencia de la fusión (DD-2, arbitraje CR-15), nunca un accidente de orden de
   inserción.** `mergeCatalogues(handCited, imported)` es una función PURA, ejecutada antes de la
   transacción de siembra: identidad (nombre, provincia, comunidad autónoma) y la cita de fuente
   vienen SIEMPRE de la entrada hand-cited; centroide y radio se rellenan desde el importado SOLO
   si el hand-cited no trae ya uno propio; la fuente fusionada nombra ambas procedencias.
   `seedReferenceData` sigue recibiendo exactamente una lista y su
   `onConflictDoNothing({target: locations.ineCode})` (`seed.ts:62`) permanece byte-idéntico,
   sirviendo solo para la idempotencia del re-seed — nunca como mecanismo de fusión.
3. **Regla de no-truncación (DD-8, Q6).** Un `ine_code` de 6 dígitos aborta el join entero
   (`MalformedIneCodeError`), nombrando el código ofensivo, salvo que el operador pase de forma
   explícita `--ine-code-width=6`, en cuyo caso se truncan los 5 primeros dígitos y el recuento de
   filas truncadas queda registrado en la cabecera de procedencia. No se inventa ningún algoritmo
   de dígito de control (R4) — la bandera del operador ES la decisión registrada, nunca una
   suposición del código.
4. **La definición de "hoy" del presupuesto diario (DD-11, ROADMAP 1.13 Unit B).**
   `packages/db/src/time.ts` expone `utcDayStart()` como el ÚNICO punto donde se expresa el
   límite de día — día natural UTC, calculado siempre con el reloj del propio PostgreSQL
   (`now() at time zone 'utc'`), nunca con el del proceso Node que llama. El ledger de
   presupuesto (`budget-ledger.ts`, decisión futura 064/065 de Units C/D para su consumo en el
   worker) y el contador de zonas nuevas del día (`coverage.ts`, Unit D) consumen la misma
   función. El tope diario (columna `search_cap` de `daily_request_budget`) se guarda EN cada
   fila, no como una constante fija en código — es el tope vigente en el momento en que la fila
   se abrió, para que un tope cambiado a mitad de mes quede auditable. Su valor pretende derivarse
   de la cuota mensual (`monthly_quota / 31`, menos una reserva), pero esa cifra mensual NO está
   documentada por ningún fuente oficial (decisión 033 ya lo constató: "100 peticiones al mes" es
   anecdótico, sin confirmación) — así que ni `packages/db` ni este cambio fabrican ese número:
   `reserveDailyBudget(db, sourceId, reservation, searchCap)` recibe el tope como parámetro,
   calculado por quien lo llame (Unit C, la raíz de composición del worker), nunca inventado aquí.

**Alternativas descartadas.**
- Sembrar el catálogo hand-cited y el importado por separado, dejando que `ON CONFLICT DO
  NOTHING` decida por orden de inserción — pierde el centroide de Granada en un orden y su cita
  verificada en el otro (ver detalle en el motivo de CR-15 abajo).
- Inventar un algoritmo de dígito de control para aceptar un `ine_code` de 6 dígitos sin
  intervención del operador.
- Fijar el tope diario como una constante hardcodeada en código, en vez de una columna por fila.
- Definir "hoy" como día natural en `Europe/Madrid` o como ventana móvil de 24 horas — ambas
  descartadas por el motivo detallado abajo.

**Motivo.**
- **Sobre la fusión (CR-15):** `seed.ts:62` usa `onConflictDoNothing`, que NUNCA actualiza.
  Sembrar el catálogo hand-cited primero hace que Granada (`ine_code` 18087) pierda en silencio
  su centroide importado y se vuelva no barrible — una regresión en la única zona que funciona
  hoy. Sembrar el importado primero le hace perder su cita hand-cited (evidencia P5/COVERAGE-8 de
  que el código no se fabricó). Una fusión pura hace la precedencia una regla explícita y
  testeada, nunca un accidente de orden.
- **Sobre la definición de "hoy" (DD-11):** el reset horario real de Idealista no es públicamente
  legible (obs #209 §Q6), así que no hay ningún límite de vendedor que espejar — el límite diario
  es una decisión propia de racionamiento de una cuota MENSUAL. Entre las tres opciones
  consideradas, el día natural UTC es la única determinista y testeable: sin transiciones de
  horario de verano (que darían un día de 23h o de 25h en `Europe/Madrid`, un límite arbitrario de
  por sí) y sin necesidad de base de datos de zonas horarias. Una ventana móvil de 24h se descartó
  porque D6 exige poder anunciar una hora de reintento concreta cuando el tope se agota, y la
  respuesta honesta de una ventana móvil es "progresivamente" — exactamente la forma de cola sin
  ETA que D6 existe para evitar.
- **Sobre no fabricar el tope mensual:** decisión 033 ya estableció el precedente — ningún
  documento oficial de Idealista confirma una cifra de cuota mensual, y la investigación de este
  cambio tampoco encontró ninguna. Guardar un número inventado como si fuera la cuota real sería
  precisamente el tipo de hecho fabricado que CLAUDE.md prohíbe (P5).

**Consecuencia.** La cifra real del tope diario queda como una decisión operativa pendiente,
configurada por quien despliegue el worker (Unit C), no una constante de este cambio. Si en el
futuro Idealista publica su cuota mensual real, el cambio queda confinado a ese punto de
configuración — ni `packages/db/src/time.ts` ni `budget-ledger.ts` necesitan tocarse, porque
ninguno de los dos conoce ni fabrica esa cifra.

## 067 — Sin reproyección de coordenadas del catálogo NGMEP: juicio de ingeniería acotado por la precisión del centroide, no un hecho geodésico citado

**Estado:** aceptada

**Decisión.** El catálogo de municipios importado (ROADMAP 1.13, diseño DD-1/DD-3) almacena las
coordenadas del NGMEP tal como las declara el propio fichero, **sin reproyectar** a ningún
sistema de referencia distinto antes de guardarlas en `locations.centroid`
(`geography(Point,4326)`). El sistema de referencia verbatim que declara el fichero de origen
queda registrado, sin modificar, en la cabecera de procedencia del artefacto committeado
(`packages/db/src/municipality-catalogue.generated.ts`, campo `source_crs_string`).

**Alternativa descartada.** Reproyectar con una librería como `proj4` antes de escribir cada
centroide, buscando una equivalencia geodésica citable con ETRS89/EPSG:4326.

**Motivo.** Tres razones, ninguna dependiente de encontrar la cita que se buscó y no se
encontró:

1. **El fichero mezcla dos sistemas de referencia distintos** — ETRS89 para la península,
   Baleares, Ceuta y Melilla, y **REGCAN95 para Canarias**. Una única transformación `proj4`
   aplicada en bloque sería incorrecta para uno de los dos grupos; hacerlo bien exigiría una
   atribución de sistema de referencia por fila que este cambio no ha verificado que el fichero
   traiga. Reproyectar sin esa atribución es el riesgo mayor, no el menor.
2. **La divergencia que una reproyección corregiría queda dominada, por uno o más órdenes de
   magnitud, por un error que este mismo cambio ya acepta a propósito.** Cualquier discrepancia
   ETRS89/REGCAN95↔WGS84 está acotada por la deriva tectónica desde la época de referencia de
   mediados de los 90 — del orden de centímetros por año, así que como mucho unos pocos metros a
   día de hoy. La elección de fila representante por municipio (decisión de diseño DD-4, Q2)
   desplaza el punto almacenado cientos de metros o kilómetros respecto al centro real, y
   `sweep_radius_m` opera a escala kilométrica. Un desplazamiento de datum a escala de metros no
   puede cambiar qué anuncios entran en un círculo de ese tamaño.
3. **La decisión es reversible sin volver a descargar nada.** La cabecera de procedencia guarda
   el sistema de referencia de origen tal cual, así que un paso futuro que necesite precisión
   sub-métrica puede reproyectar a partir del artefacto committeado, con constancia exacta de
   desde qué sistema parte.

**Declarado explícitamente, y esto es la parte que importa registrar:** no existe ninguna fuente
geodésica autoritativa disponible para este proyecto que confirme un margen de error numérico
para esta equivalencia. Lo anterior es un **juicio de ingeniería acotado por la precisión del
propio centroide almacenado**, no un hecho citado — a diferencia del resto de las cifras de este
documento, que sí llevan una fuente primaria verificable.

**Disparador de falsificación.** Esta decisión se reabre en el momento en que cualquier
funcionalidad exija una precisión sub-10-metros a partir de `locations.centroid` — en ese punto,
la mezcla de sistemas de referencia deja de ser irrelevante frente al margen de error ya aceptado
y la reproyección (con atribución de sistema de referencia verificada por fila) vuelve a ser
necesaria.

**Consecuencia.** Ningún centroide de este catálogo debe usarse, sin revisar esta decisión antes,
para nada que exija una precisión mayor que la del propio radio de barrido (kilómetros). La
cabecera de procedencia es la vía por la que un futuro paso puede reproyectar sin volver a
descargar el fichero origen.

---

## 068 — La deduplicación tras un barrido dirigido por el worker sigue siendo GLOBAL, sin acotar por zona; el bloqueo permisivo de `blocking.ts` no se estrecha

**Estado:** aceptada

**Decisión.** El worker de cobertura bajo demanda (ROADMAP 1.13, diseño DD-10/DD-18) reutiliza,
sin ningún cambio, el mismo reproceso de deduplicación GLOBAL que `scripts/reprocess-dedup.ts`
introdujo en ROADMAP 1.10: bloqueo sobre el corpus completo (`blocking.ts`,
`fetchAllListingIds`), sin filtrar por zona, por fuente ni por el barrido que originó cada
anuncio. El worker coalesce las llamadas — como mucho un reproceso completo por ciclo de sondeo,
solo cuando algo se completó de verdad en ese ciclo (`src/sweep/coverage-worker.ts`, paso 12 de
la tabla del diseño) — pero **nunca** estrecha qué se compara.

**Alternativa descartada.** Un reproceso de deduplicación acotado a la zona recién barrida (o a
las zonas colindantes), para abaratar cada ciclo del worker.

**Motivo.**

1. **CLAUDE.md fija que un falso positivo (agrupar dos viviendas distintas) es peor error que un
   falso negativo (no detectar un duplicado real).** Acotar el bloqueo por zona fabrica
   exactamente el segundo error a propósito: una vivienda cuyas coordenadas caen a un lado y otro
   de una frontera administrativa (R5) nunca se compararía contra su duplicado real si el bloqueo
   quedara restringido a una sola zona.
2. `fetchAllListingIds` (`apps/ingestion/src/dedup/reprocess-core.ts`, extraído sin cambios desde
   `scripts/reprocess-dedup.ts` en esta misma unidad) no lleva ninguna cláusula `WHERE` — su
   propio comentario, verbatim desde 1.10, ya declara la intención: el reproceso debe ser tan
   permisivo como el bloqueo que reutiliza. El worker no reabre esa decisión.
3. **El coste de la permisividad cae en el eje equivocado para preocuparse por él aquí.** El
   reproceso gasta CPU y tiempo de base de datos — cero peticiones a Idealista. El recurso escaso
   de este proyecto es la cuota, no el cómputo; cambiar CPU por una entrada de deduplicación
   garantizada-completa es el intercambio correcto bajo la prioridad que el propio CLAUDE.md fija.
4. **Coalescer ya elimina el crecimiento por zona sin estrechar nada.** El reproceso es idempotente
   sobre el corpus completo y no depende del orden; N reprocesos tras N barridos completados
   equivalen a uno solo. El worker fija un indicador de "trabajo pendiente" en cada resultado
   `completed` y ejecuta como mucho un reproceso por ciclo, después del barrido, nunca dentro de
   su transacción.

**Consecuencia.** `blocking.ts:4-6` permanece exactamente como 1.8/1.10 lo dejaron: sin ningún
parámetro de zona, sin ningún filtro por origen del anuncio. Cualquier cambio futuro que quiera
acotar el bloqueo por zona debe reabrir esta decisión explícitamente, no colarse como una
optimización de rendimiento del worker.

---

## Pendientes de decidir

- **Umbrales concretos de bloqueo** (radio, banda de precio, margen de superficie): se
  determinan empíricamente sobre el corpus. Verificar antes si las coordenadas de la fuente
  están ofuscadas.
- **Segunda fuente:** depende de accesos aún no concedidos. Alternativa prevista: feeds de
  sindicación de agencias o dataset con esquema distinto.
- **Objetivos de precisión y recall:** tras las primeras mediciones sobre el conjunto
  etiquetado.
- **Segunda zona del corpus:** una de costa con mucha agencia local, a decidir cuando se
  conozca el coste en cuota de la primera.
- **Base de datos de test separada para `packages/db`** (decisión 046): la suite trunca hoy
  la base de datos apuntada por `DATABASE_URL`, que en desarrollo es la misma que contiene
  datos reales ingeridos. Requiere una segunda `DATABASE_URL` de test o un guardián que
  rechace truncar una base de datos que no sea la designada.
