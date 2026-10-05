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

**Estado:** cerrada — el disparador se cumplió en ROADMAP 2.4 (decisión 100)

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

**Enmendada por la 113** (ROADMAP 2.6): el allowlist pasa a dos ficheros, `coverage-status.tsx` y
`components/search-map.tsx`. Las tres aserciones del test y el requisito de argumentar cada entrada
nueva permanecen.

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

## 069 — Los GRANT de `web_readonly`/`web_coverage` se versionan como un script de bootstrap committeado; el rol y la credencial siguen siendo tarea manual del responsable del proyecto

**Estado:** aceptada

**Decisión.** Los `GRANT` que dan forma a los dos roles de superficie acotada de `apps/web`
(decisiones 056 y 064) se versionan como un script SQL idempotente y committeado,
`packages/db/sql/bootstrap-roles-grants.sql`, que el responsable del proyecto puede re-ejecutar
en cualquier momento tras aprovisionar los roles o tras recrear la base de datos. El script
emite exactamente los cinco `GRANT`/`ALTER DEFAULT PRIVILEGES` que ya regían en la base de datos
viva (`CONNECT`, `USAGE` sobre `public`, `SELECT` sobre todas las tablas para `web_readonly`,
`INSERT` sobre `coverage_jobs` para `web_coverage`, y el privilegio por defecto que extiende
`SELECT` a cualquier tabla futura). **El script NUNCA crea los roles (`CREATE ROLE`) ni fija
ninguna contraseña** — aprovisionar los roles y su credencial sigue siendo una tarea EXCLUSIVA
del responsable del proyecto (ROADMAP 1.13, tarea 10.5), y ninguna credencial se escribe jamás
en este repositorio; el propio fichero lo declara en su cabecera, en español, como frontera
deliberada.

**Alternativas descartadas.** (1) No versionar nada, dejando los `GRANT` solo en la memoria del
responsable del proyecto y en la prosa de la decisión 064 — el estado que este cambio demostró
insuficiente (ver el motivo, abajo). (2) Documentar únicamente un runbook en prosa con los
`GRANT` exactos, sin ningún fichero ejecutable — más barato, pero no inspeccionable por `diff` ni
re-ejecutable sin volver a teclear cada sentencia a mano, exactamente el tipo de paso manual
propenso a error que ya falló una vez en esta misma sesión de verificación. (3) Expresar los
`GRANT` como una migración de `drizzle-kit` en `packages/db/migrations/` — descartada: las
migraciones aplican el ESQUEMA como el rol propietario en el momento del despliegue, mientras que
estos `GRANT` son aprovisionamiento del ENTORNO, condicionado a una decisión operativa (si los
roles ya existen) que `drizzle-kit` no tiene forma de expresar; además, el propio contenido
llevaría un hash de migración rastreado por `drizzle-kit`, que fallaría en cualquier entorno
donde los roles todavía no existan — el mismo tipo de acoplamiento indebido que la decisión 066
ya evitó para el catálogo importado.

**Motivo.** Demostrado por accidente en esta misma sesión de verificación (`sdd-verify`, obs
#231/#232): recrear la base de datos (`DROP DATABASE` + `CREATE DATABASE`) para probar la
corrección de la migración `0008` (hallazgo C2) borró los `GRANT` per-database de AMBOS roles
—`CREATE ROLE` es de nivel de servidor y los roles sobrevivieron, pero `GRANT ON` es por base de
datos y no— y ningún test lo detectó: toda la suite de integración de este proyecto conecta como
el propietario, nunca como `web_readonly` ni como `web_coverage`. Los `GRANT` se reemitieron a
mano, fuera de banda, y quedaron correctos — verificado de forma independiente contra
`information_schema.role_table_grants` — pero sin ningún artefacto versionado, un responsable de
proyecto que recupere un servicio caído bajo presión no tiene más referencia que esta prosa, y
podría sobre-conceder por error, erosionando en silencio exactamente la propiedad de seguridad
que la decisión 056 existe para proteger. Un script inspeccionable y re-ejecutable convierte esa
recuperación en un comando, no en una improvisación.

**Consecuencia.** La propiedad de seguridad de la decisión 056 —que `web_readonly` nunca puede
escribir— tiene ahora, además del script de bootstrap, su propia prueba negativa automática
(`apps/web/test/db/readonly-role-privileges.test.ts`), extendiendo a este rol el mismo patrón que
la decisión 064 ya exigía para `web_coverage` (`coverage-role-privileges.test.ts`). Antes de esta
entrada, la propiedad de la decisión 056 llevaba vigente desde el paso 1.11 sin ninguna prueba
automática que la comprobara contra PostgreSQL real; ahora ambos roles tienen la suya. Cualquier
tabla nueva que el esquema añada en el futuro queda cubierta por el `ALTER DEFAULT PRIVILEGES`
del script sin tocar el propio script, pero SÍ requiere volver a ejecutarlo tras cualquier
recreación de la base de datos — el script no se dispara solo.

---

## 070 — Adaptación del conversor de catálogo al fichero real: se elimina la resolución de niveles ES/NUC, el radio de barrido se deriva de la superficie publicada, se activa la mitad de integridad de la puerta de provincia, y `diccionario26.xlsx` queda sin usar

**Estado:** aceptada

**Decisión.** El responsable del proyecto entregó los ficheros reales del NGMEP
(`docs/BD_Municipios-Entidades/MUNICIPIOS.csv`, `PROVINCIAS.csv`, marzo 2026): 8132 filas, una
por municipio. Frente al diseño de la decisión 066 (pensado para `ENTIDADES.csv`, ~150k filas,
con varias entidades por municipio a desambiguar), se toman cuatro decisiones nuevas:

1. La resolución de niveles tier-1/2/3 (`join.ts`, "ES/NUC") se ELIMINA, no se deja inerte.
   `MUNICIPIOS.csv` ya es una fila por municipio: no hay ninguna entidad hermana que
   desambiguar, así que ninguna rama tier-2/tier-3 podría ejecutarse jamás contra el fichero
   real — mantenerla habría sido código muerto. Se sustituye por: derivar el código de 5
   dígitos de los 5 primeros caracteres de `COD_INE` (11 dígitos), y resolver la provincia
   (nombre + comunidad autónoma) contra `PROVINCIAS.csv`. Ambos pasos abortan explícito,
   nombrando el valor ofensivo, si el resultado no es válido — nunca se trunca ni se fabrica en
   silencio (mismo principio que el guarda de anti-truncamiento original).
2. El radio de barrido (`geo.ts`, `deriveSweepRadiusM`) se deriva ahora de `SUPERFICIE`
   (hectáreas, publicada por el propio fichero): `radio = sqrt(superficie_m2 / π)`, acotado por
   el mismo suelo/techo que antes. Sustituye a la heurística de esparcimiento entre entidades
   hermanas, que ya no hay forma de calcular sin `ENTIDADES.csv`.
3. Se activa la mitad de INTEGRIDAD de la puerta de provincia (`sanity.ts`): `COD_PROV`
   declarado por la fila debe coincidir con el prefijo de 2 dígitos del código derivado, con
   `PROVINCIAS.csv` como tabla maestra — nuevo motivo de fallo `'province-code-mismatch'`,
   ortogonal al `'province-mismatch'` geográfico existente (comparación de strings, no cajas
   delimitadoras). La mitad GEOGRÁFICA (`provinceBounds`) sigue inerte: ninguna fuente
   disponible en este proyecto puede verificar las 52 cajas delimitadoras reales sin arriesgarse
   a fabricar un dato incorrecto (mismo principio que R7) — no se fabrican aquí tampoco.
4. `docs/diccionario26.xlsx` (registro INE, "Relación de municipios y códigos... a 1 de enero de
   2026": `CODAUTO;CPRO;CMUN;DC;NOMBRE`) queda JUZGADO REDUNDANTE y sin usar en el import real.
   `MUNICIPIOS.csv` ya trae código, nombre y provincia; `PROVINCIAS.csv` aporta la comunidad
   autónoma que falta. Cruzar el dictionary como segunda fuente de verdad añadiría una
   dependencia sin aportar ninguna comprobación que `PROVINCIAS.csv` o el propio guarda de 5
   dígitos no cubran ya.

**Alternativas descartadas.** (1) Mantener `join.ts`/`ine-register.ts` sin tocar y adaptar
`MUNICIPIOS.csv` a la forma de `ENTIDADES.csv` (una fila = una entidad ficticia con sufijo
`000000`) — descartada: habría conservado ~200 líneas de lógica de desambiguación que nunca
podría ejercitarse, y el propio fichero de test (`join.test.ts`) habría quedado probando un
camino muerto. (2) Cruzar `diccionario26.xlsx` como segunda fuente de verdad de todos modos, "por
si acaso" — descartada: sin una comprobación concreta que aporte y no exista ya, es peso muerto
que el import real tendría que arrastrar y mantener en sincronía con el resto del pipeline. (3)
Reutilizar `provinceBounds` (cajas geográficas) para la comprobación de `COD_PROV`, calculando una
caja aproximada a partir de los propios centroides del fichero — descartada: fabricaría un dato
geográfico "verificado" a partir de los mismos datos que se están verificando, un razonamiento
circular que no detectaría un error sistemático del propio fichero.

**Motivo.** El diseño original de la decisión 066 no podía saber la forma exacta del fichero real
(R7, precondición nunca verificable sin el fichero en mano); al llegar el fichero real, la forma
resultó ser más simple de lo previsto (una fila por municipio, no una jerarquía de entidades) y
más rica en un eje (superficie publicada, tabla de provincias) — cada decisión de esta entrada usa
esa forma real en vez de forzar el fichero a encajar en el diseño hipotético anterior.

**Consecuencia.** `apps/ingestion/src/catalogue/join.ts` pierde el concepto de `tier`/hermanas por
completo; `import-municipality-catalogue.ts` pasa `tier: 'tier-1'` y `siblingCoordinates: []`
constantes a `checkSanity` (cada fila de `MUNICIPIOS.csv` es, en los términos del diseño
original, su propia fila autoritativa). El import real (8132/8132 filas, 0 sin centroide, 0
descartes de la puerta de cordura) confirma que ninguna de las dos mitades inertes
(`provinceBounds` geográfico, tier-2/3) hacía falta para cubrir el fichero real. Verificación
completa (spot-checks de coordenadas, RED→GREEN por módulo, salida de gates) en
`docs/PROMPTS.md`, entrada de esta fecha.

---

## 071 — Fixtures del feed de Kyero hand-authored a partir de la especificación (S1), no capturadas

**Estado:** aceptada

**Decisión.** `apps/ingestion/test/fixtures/kyero/feed-sample.xml` (paso 1.14) se escribe a
mano a partir de la especificación pública S1
(https://help.kyero.com/estate-agents/xml-import-specification, V3.9, 2024-09-03), no a partir
de una captura real de un feed en producción. `feed-sample.meta.json` registra la procedencia
(`"provenance": "hand-authored-from-spec"`), la versión y fecha de la especificación citada, y
los huecos de la investigación que quedan sin confirmar contra un feed real (G1-G4: anidado de
`desc`/`url` multilenguaje, anidado de coordenadas y de `surface_area`, forma de `image`).

**Alternativa descartada.** Esperar a conseguir acceso a un feed Kyero real (de un agente
suscrito) antes de escribir ningún test, igual que se hizo para Idealista (paso 1.5, sondeo
contra la API real antes de fijar `raw-element.schema.ts`).

**Motivo.** Kyero es un formato de sindicación de terceros: no existe un endpoint de prueba
público ni una cuenta de agente disponible en este proyecto para obtener un dump real (a
diferencia de Idealista, donde la propuesta original incluía credenciales de API). El paso
1.14 declaró explícitamente en su prompt que el objetivo es validar la abstracción
`PropertySource<T>`, no integrar un proveedor de datos concreto en producción — bloquear la
tarea hasta conseguir un acceso que no está previsto habría contradicho ese objetivo. El
research (obs Engram `sdd/second-property-source/research`) documenta la especificación citada
con evidencia de alta confianza para la forma general del feed, y grado medio para los cuatro
huecos de anidado (G1-G4), resueltos en el diseño con esquemas Zod tolerantes
(`z.looseObject`, uniones `string | objeto`) en vez de asumir una única forma rígida.

**Consecuencia.** Cualquier divergencia real entre la forma asumida (anidado de `desc`/`url`/
`location`/`images`) y un feed de producción real quedará sin detectar hasta que se conecte una
fuente real — el research ya registra ese riesgo (R1). Los esquemas tolerantes (uniones,
`.optional()`, `z.looseObject`) están diseñados para degradar sin lanzar ante una forma no
prevista en vez de rechazar la propiedad completa, mitigando el coste de un hueco no cubierto.

---

## 072 — Clasificación de Kyero: `sourceId`/`kind` = `'api'`, sin fila en `sources`, sin `thumbnailUrl` ni `address`

**Estado:** aceptada

**Decisión.** El adaptador de Kyero (paso 1.14) usa `sourceId`/`PropertySource.id` = `'kyero'`.
La columna `sources.kind` (ya existente, con CHECK `'api' | 'scrape'` en
`packages/db/src/schema/sources.ts`; ningún cambio en `packages/db` en este paso) clasificaría
esta fuente como `'api'` — obtención programática por HTTP de un feed, no scraping de HTML —
aunque ningún código del repositorio lee hoy ese valor. No se inserta
ninguna fila en `sources` (sin escritura en base de datos en absoluto, alcance de la propuesta).
El normalizador (`KyeroListingNormalizer`) deja `Listing.thumbnailUrl` y `Listing.address`
siempre `undefined`.

**Alternativa descartada.** Clasificar la fuente como `'scrape'`; insertar la fila de
`sources` ahora, por adelantado a la integración real; poblar `thumbnailUrl` desde la primera
imagen del feed; poblar `address` desde `town`/`province`.

**Motivo.** Kyero se consulta por HTTP a un endpoint de feed (no se parsea HTML de una página),
así que `'scrape'` describiría mal el mecanismo de acceso cuando se inserte su fila. La
fila de `sources` y la conexión a la base de datos son responsabilidad de un paso posterior de
integración real (fuera de alcance de la propuesta, que es minimal-scope: validar la
abstracción, no conectar el proveedor); insertarla ahora sin ese contexto sería especulativo.
`thumbnailUrl` no se puebla porque `apps/web/next.config.ts` no tiene el host de imágenes de
Kyero en su allowlist de `next/image` (tocar esa allowlist es un cambio en `apps/web`, fuera de
alcance por regla del proyecto) — poblarlo de todos modos produciría una URL que la interfaz
nunca podría renderizar. `address` no se puebla porque `town`/`province` no son una dirección
exacta (CLAUDE.md: "la dirección solo cuenta como señal fuerte si es exacta") — escribirla
contaminaría la señal de dirección que usa la deduplicación (`rule-based/signals.ts`), el mismo
riesgo que motivó dejar `location` sin resolución INE (diseño D8).

**Consecuencia.** Un listing de Kyero nunca muestra miniatura en `apps/web` (mismo trato visual
que un anuncio sin imagen conocida) hasta que un paso posterior amplíe la allowlist de
`next.config.ts` y decida cómo resolver `address`/`location` de forma fiable. La conexión real
del adaptador al barrido/persistencia (`sweep-runner.ts` genérico sobre `T`, inserción de la
fila `sources`) queda como trabajo futuro explícitamente nombrado en la propuesta.

La cobertura bajo demanda tampoco admite hoy una segunda fuente: `apps/web/src/server/coverage.ts`
fija `IDEALISTA_SOURCE_KEY = 'idealista'` al encolar un `coverage_job`, y `packages/db/src/seed.ts`
solo siembra la fila `'idealista'` de `sources`. Hallazgo para la memoria: el contrato del
núcleo (`PropertySource<T>`, `ListingNormalizer<T>`, `Listing`, `AreaQuery`) resistió sin
cambios, pero la suposición de "una sola fuente" sí se filtró fuera de él — en la siembra, en
la cobertura bajo demanda y en la allowlist de imágenes. No se corrige ahora: sin una segunda
fuente real no se sabe qué necesitará (host de imágenes, cobertura bajo demanda, estrategia de
obtención), y generalizar contra un feed supuesto sería especulativo.

---

## 073 — Política de inclusión del feed de Kyero: solo EUR, coordenadas obligatorias, `price_freq` ausente cae a venta, y mapa de tipos con `'other'`

**Estado:** aceptada

**Decisión.** El filtro de elegibilidad de `kyero-source.ts` (`isEligible`, `area-filter.ts`)
excluye — sin lanzar, solo contando — cualquier propiedad que cumpla alguna de estas
condiciones: (1) `currency` presente y distinto de `EUR`; (2) sin coordenadas resolubles (ni
`<location>` anidado ni `latitude`/`longitude` planos); (3) fuera del radio del área
(`haversineMeters`, R = 6 371 008.8 m, límite inclusivo `<= radiusMeters`); (4) `price_freq`
mapeado a una operación distinta de la solicitada. `price_freq` ausente se interpreta como
`sale` (no como un rechazo); cualquier valor de `price_freq` fuera de `{sale, month}` se mapea
a `'invalid'` y excluye. El mapa `type` → `PropertyType` (`property-type-map.ts`) usa una tabla
fija de 27 entradas y cualquier valor no reconocido cae a `'other'`, sin lanzar nunca.

**Alternativa descartada.** Convertir divisas no-EUR a EUR con un tipo de cambio; resolver
`town`/`province` a un código INE y usar eso en vez de exigir coordenadas; rechazar la
propiedad completa (lanzar) ante un `price_freq` desconocido o un `type` no mapeado.

**Motivo.** `Listing` no tiene un campo de divisa (decisión implícita del esquema original,
paso 1.4): `priceCents` asume EUR en todo el dominio, así que convertir en el adaptador
inventaría un tipo de cambio con el que ningún otro dato del sistema es consistente — mismo
razonamiento que motivó no convertir unidades en otros pasos (CLAUDE.md, "toda entrada externa
se valida"). Resolver `town`/`province` a INE exigiría un geocodificador o un diccionario de
topónimos que no forma parte del alcance minimal-scope de esta propuesta (nombrado
explícitamente como trabajo futuro, research R3) — exigir coordenadas explícitas es la opción
conservadora que prioriza minimizar falsos positivos de área (mismo principio que CLAUDE.md
aplica a la deduplicación: "agrupar dos viviendas distintas es peor que no detectar un
duplicado", extendido aquí a "incluir una vivienda fuera de área es peor que excluir una que sí
lo estaba"). `price_freq` ausente cayendo a `sale` sigue la lectura de confianza media de la
propia especificación S1 (research, evidencia S1); el mapa de tipos con `'other'` sigue
exactamente el precedente ya sentado por Idealista (`property-type-map.ts` del paso 1.6): un
`type` sin mapeo sigue siendo un anuncio real y vendible, nunca un motivo para descartarlo.

**Consecuencia.** Una vivienda con coordenadas ausentes en el feed de Kyero nunca aparece en
ningún resultado de búsqueda por área, aunque `town`/`province` la ubiquen de forma inequívoca
— coste aceptado explícitamente (D8 del diseño) a cambio de cero falsos positivos de radio. Un
`price_freq` legítimo pero no documentado en S1 (p. ej. si Kyero introduce un tercer valor en
una versión futura de la especificación) excluiría la propiedad en vez de asumir un valor por
defecto — requeriría una revisión de este mapa si se observa en un feed real.

---

## 074 — Rate limiting mixto: cuota por cliente en PostgreSQL para registros de cobertura, ventana fija en memoria para el resto

**Estado:** aceptada

**Decisión.** El paso 1.15 (seguridad) aplica dos mecanismos distintos según la superficie:
cuota diaria por cliente persistida en PostgreSQL (`coverage_client_quota`) para el registro de
NUEVOS `coverage_job`, y un limitador de ventana fija en memoria dentro de `apps/web/src/proxy.ts`
para el resto de peticiones.

**Alternativa descartada.** Redis (fuera del alcance de la infraestructura actual); aplicar
PostgreSQL a cada petición (coste de una escritura por petición, no solo por registro).

**Motivo.** D1/D1b del pre-proposal: el registro de cobertura es la única superficie con coste
real aguas abajo (cuota de la fuente externa) que merece persistencia entre procesos; el resto
de peticiones solo necesita frenar abuso dentro del mismo proceso. Limitación conocida y
documentada: el limitador en memoria es por proceso — se rompe con más de una instancia del
servicio web corriendo a la vez (advertencia de la propia documentación de Next sobre variables
globales en middleware/proxy).

---

## 075 — Identidad de cliente solo desde un header de confianza configurable; ausente/múltiple/no-IP cae en un bucket compartido `unknown`, nunca exento

**Estado:** aceptada

**Decisión.** `CLIENT_IP_HEADER` nombra el único header que se confía como IP del cliente. Si
está vacío o ausente, ambos limitadores por cliente (PostgreSQL y proxy) quedan deshabilitados y
solo rige el tope global `NEW_ZONES_DAILY_CAP`. Si está configurado, un valor ausente, con varios
elementos separados por coma, o que no sea una IP válida se resuelve al mismo bucket compartido
`unknown` — nunca se trata como exento o sin límite.

**Alternativa descartada.** Fallar abierto (sin límite) cuando el header falta; tomar el valor
más a la derecha de una lista `X-Forwarded-For` como hacen otros stacks.

**Motivo.** Omitir o falsificar el header nunca debe permitir escapar del límite (fail-closed).
MDN documenta explícitamente que `X-Forwarded-For` es fácil de falsificar si no lo sobrescribe un
proxy de confianza — de ahí que el propio nombre del header sea configurable y no se asuma un
estándar fijo.

---

## 076 — Clave de cuota por cliente: HMAC-SHA256 hex, clave primaria compuesta `(key_hash, day)`, purga perezosa en cada escritura

**Estado:** aceptada

**Decisión.** La fila de `coverage_client_quota` se indexa por el HMAC-SHA256 (hex) de la
identidad del cliente con secreto `CLIENT_IP_HMAC_KEY`, nunca por el valor crudo. Clave primaria
`(key_hash, day)`. Las filas de una ventana ya cerrada (`day < today`) se purgan como parte del
propio camino de escritura, en cada consumo.

**Alternativa descartada.** Hash sin clave (sin secreto); `key_hash` como única clave primaria
con lógica de `CASE` para resetear el contador; purga ejecutada solo desde el worker de
`apps/ingestion`.

**Motivo.** Un hash con clave (HMAC) es la práctica exigida por el principio de minimización de
datos (evidencia de investigación S8): sin la clave, nadie puede reconstruir la IP ni siquiera
por fuerza bruta de un espacio pequeño. La clave primaria compuesta evita cualquier lógica de
reseteo — un día nuevo es, estructuralmente, una fila nueva. Purgar solo desde `apps/ingestion`
añadiría acoplamiento (puertos nuevos) a un worker ya probado, sin necesidad, cuando la propia
escritura ya tiene que tocar la fila.

---

## 077 — Concurrencia de la cuota por cliente: una única sentencia atómica `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING`

**Estado:** aceptada

**Decisión.** `consumeClientQuota` ejecuta una única sentencia SQL atómica
(`INSERT ... SELECT ... WHERE 1::integer <= cap::integer ON CONFLICT (key_hash, day) DO UPDATE
SET registrations = registrations + 1 WHERE registrations + 1 <= cap::integer RETURNING`); una fila devuelta
significa permitido, ninguna fila significa denegado. Los parámetros numéricos se convierten con
`::integer`.

**Alternativa descartada.** `pg_advisory_xact_lock` seguido de un ciclo leer-modificar-escribir
(evidencia de investigación S7).

**Motivo.** PostgreSQL garantiza que un `INSERT ... ON CONFLICT DO UPDATE` es atómico bajo
concurrencia sin necesitar un bloqueo explícito ni una transacción adicional — mismo patrón ya
verificado en `reserveDailyBudget` (`packages/db/src/budget-ledger.ts`), incluida la conversión
explícita de tipos al comparar contra un parámetro de texto.

---

## 078 — Validación de entorno de `apps/web` centralizada en `env.ts`, parseada en tiempo de llamada; parámetros del limitador requeridos solo cuando el header está activo

**Estado:** aceptada

**Decisión.** `apps/web/src/server/env.ts` centraliza un lector Zod por variable de entorno,
parseado en tiempo de LLAMADA (nunca al cargar el módulo); las clases y mensajes de error
existentes se preservan. Los tres parámetros del limitador (`COVERAGE_PER_CLIENT_DAILY_CAP`,
`PROXY_RATE_LIMIT_MAX`, `PROXY_RATE_LIMIT_WINDOW_SECONDS`) son REQUERIDOS cuando
`CLIENT_IP_HEADER` está configurado, e IGNORADOS por completo —incluso si están presentes con un
valor inválido— cuando no lo está.

**Alternativa descartada.** Exigir los tres parámetros siempre, esté o no activo el limitador por
IP; validarlos "si están presentes" mientras el limitador permanece deshabilitado.

**Motivo.** Mantiene la postura fail-loud (decisión 066) sin forzar configuración para una
funcionalidad deshabilitada, y conserva el interruptor de un solo paso: quitar
`CLIENT_IP_HEADER` del entorno siempre funciona para deshabilitar el límite por IP, sin tocar
ninguna otra variable.

---

## 079 — Orden de comprobación en `resolveCoverageForZone`: tope global de solo lectura ANTES que el consumo por cliente

**Estado:** aceptada

**Decisión.** `resolveCoverageForZone` comprueba, en este orden: cobertura existente / job ya
en curso → tope global `NEW_ZONES_DAILY_CAP` (solo lectura) → cuota por cliente (escritura) →
registro. Cuando el tope global ya está agotado, la cuota del cliente NUNCA se consume, incrementa
ni siquiera se comprueba. Nuevo resultado distinto `client-cap-exhausted` (decisión D6 de las
decisiones de producto confirmadas tras la propuesta).

**Alternativa descartada.** Comprobar primero el límite por cliente y después el tope global —
la redacción original de la propuesta.

**Motivo.** El tope global es más barato (solo lectura) y comprobarlo primero evita consumir
nunca la cuota de un cliente para un registro que de todos modos iba a rechazarse. Preserva
además el invariante ya existente de que el handle de escritura perezoso (`getWriteDb`) no se
abre en la rama de tope global agotado. **Esta decisión obligó a re-ejecutar `sdd-spec` (spec
#261, revisión 2)**, que en su primera redacción había fijado el orden contrario.

---

## 080 — CSP estática ("Without Nonces") + cabeceras OWASP vía `headers()` asíncrona en `next.config.ts`; sin COEP; `poweredByHeader: false`

**Estado:** aceptada

**Decisión.** La política de contenido se define de forma ESTÁTICA (sin nonces) en la función
`headers()` de `next.config.ts`, calculada en tiempo de llamada (`isDev` no se fija al cargar el
módulo). En desarrollo se añade `'unsafe-eval'` a `script-src` y se omite
`upgrade-insecure-requests`; en producción, al revés. Se añade el conjunto OWASP completo (HSTS,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`) sin `Cross-Origin-Embedder-Policy`
(rompería recursos de terceros sin necesidad); `poweredByHeader: false` retira `X-Powered-By`.
`img-src` se limita a `'self' blob: data:` — las imágenes remotas pasan siempre por
`/_next/image`, mismo origen.

**Alternativa descartada.** Generar la CSP con nonces por petición; fijarla desde el proxy en vez
de `next.config.ts`.

**Motivo.** D2 del pre-proposal: la aplicación no emite hoy ningún script inline que necesite un
nonce, así que la política "Without Nonces" documentada oficialmente por Next es la opción más
simple que cumple el mismo objetivo. `next/image` ya se usa sin `unoptimized` en todo el proyecto,
así que restringir `img-src` al propio origen no rompe ninguna imagen existente.

**Enmendada por la 112** (ROADMAP 2.6): `img-src` admite además `https://tile.openstreetmap.org` para
las teselas del mapa. El resto de la política permanece vigente sin cambios.

---

## 081 — `server-only` en los módulos RSC con handles de base de datos o secretos; los módulos alcanzables por el proxy NO lo importan

**Estado:** aceptada

**Decisión.** `import 'server-only'` se añade a los cuatro módulos de `apps/web/src/server` que
sostienen handles de base de datos o secretos (`db.ts`, `coverage-db.ts`, `coverage.ts`,
`coverage-client.ts`). Los tres módulos alcanzables también desde `proxy.ts`
(`env.ts`, `client-identity.ts`, `proxy-rate-limit.ts`) NO lo importan. `vitest.config.ts` alía
`server-only` a un stub vacío (`apps/web/test/stubs/server-only.ts`) para que los tests puedan
importar los módulos guardados sin fallar.

**Alternativa descartada.** Guardar con `server-only` absolutamente todos los módulos del árbol
`server/`, incluidos los alcanzables por el proxy.

**Motivo.** En Next 16.3.4 el proxy corre en el runtime de Node.js (no Edge), pero no se ha verificado
cómo trata el bundling del proxy un import transitivo de `server-only`; es un riesgo que este
cambio prefiere no asumir sin comprobarlo. Ninguna variable de entorno sin prefijo `NEXT_PUBLIC_` se inlina
nunca en el cliente de todos modos, así que omitir el guardia en esos tres módulos no reintroduce
el riesgo original que `server-only` existe para prevenir. La frontera se refuerza con un test
estático (`server-only-boundary.test.ts`) que falla si algún fichero cambia de lado sin querer.

---

## 082 — Purga de `coverage_client_quota`: perezosa en la escritura Y programada en el ciclo periódico de `apps/ingestion` (D9)

**Estado:** aceptada

**Decisión.** Además de la purga perezosa ya prevista en la decisión 076 (una fila de ventana
cerrada se borra en el siguiente consumo que la toque), `apps/ingestion` purga también las filas
de ventana cerrada en cada ciclo de su worker de cobertura periódico (`coverage-worker.ts`),
usando su propia credencial de propietario. Esta decisión **enmienda** la cláusula de spec #261
que decía "no un paso programado aparte" — el maintainer la sobrescribió explícitamente tras
revisar el diseño (obs #263, D9).

**Alternativa descartada.** Purga solo perezosa, tal y como especificaba spec #261 en su
redacción original.

**Motivo.** La purga perezosa por sí sola solo se dispara cuando llega un consumo nuevo para esa
combinación `(key_hash, day)` concreta: un cliente que deja de registrar cobertura nunca vuelve a
disparar su propia purga, así que su fila de ventana cerrada podría persistir indefinidamente sin
cota temporal. El paso programado en `apps/ingestion` acota la retención con independencia de si
hay registros nuevos.

---

## 083 — El sobre-conteo de la cuota por cliente ante un registro fallido o en conflicto es fail-closed, nunca se revierte

**Estado:** aceptada

**Decisión.** `resolveCoverageForZone` consume la cuota del cliente (`consumeClientQuota`) y
registra el `coverage_job` (`registerCoverageJob`) en dos sentencias independientes, sin
transacción compartida. Si el consumo de cuota tiene éxito pero el registro posterior falla o
entra en conflicto, el incremento de cuota YA CONSUMIDO no se revierte: cuenta igual contra el
cliente.

**Alternativa descartada.** Envolver ambas escrituras en una única transacción y revertir el
consumo de cuota si el registro falla.

**Motivo.** Nota del validador de diseño (obs #263): envolver ambas escrituras en una transacción
compartida habría exigido reabrir el invariante del handle de escritura perezoso
(`getWriteDb()` solo se abre cuando hace falta) y complicar el camino feliz por un caso límite
raro. Entre sobre-contar (el cliente ve un límite ligeramente más estricto del que técnicamente
usó) y sub-contar (una condición de carrera de "descuento" que podría inflar el límite real
disponible), sobre-contar es la opción conservadora — coherente con el principio ya aplicado en
el resto del proyecto de minimizar falsos negativos de límite antes que optimizar la exactitud
del contador.

---

## 084 — CSP `frame-ancestors 'none'` y `X-Frame-Options: DENY`, no `'self'`/`SAMEORIGIN`

**Estado:** aceptada

**Decisión.** La directiva `frame-ancestors` de la CSP se fija a `'none'` y `X-Frame-Options` a
`DENY` — ningún origen, ni siquiera el propio, puede enmarcar la aplicación en un `<iframe>`.

**Alternativa descartada.** `frame-ancestors 'self'` con `X-Frame-Options: SAMEORIGIN` — valor
con el que `sdd-apply` entregó la PR2 inicialmente, razonando que debía ser consistente con
`SAMEORIGIN` por compatibilidad con navegadores previos a `frame-ancestors`.

**Motivo.** `apps/web` no tiene ningún caso de uso legítimo que necesite enmarcarse a sí mismo en
un `<iframe>`, propio o ajeno — no existe ningún flujo de la aplicación que dependa de ello. El
diseño (#262, decisión 080) ya especificaba la política "Without Nonces" de Next, que fija
`frame-ancestors 'none'`, y la investigación citaba `X-Frame-Options: DENY` de OWASP; la relajación a `'self'`/`SAMEORIGIN`
fue una desviación no autorizada del propio `sdd-apply`, detectada porque el test nuevo solo
comprobaba `toBeDefined()` en vez del valor exacto de la cabecera. Corregida por el orquestador:
el test se reforzó primero (RED confirmado contra el valor relajado) y después se restauró el
valor estricto del diseño (GREEN). Ver `docs/AI-NOTES.md` para el detalle completo del ciclo de
detección y corrección.

---

## 085 — Segunda `DedupStrategy`: Fellegi-Sunter con niveles graduados y m/u fijados a priori

**Estado:** aceptada

**Decisión.** La segunda estrategia de deduplicación (ROADMAP 2.2) implementa el modelo de
Fellegi-Sunter: cada campo comparado se clasifica en un nivel de acuerdo graduado (p. ej.
distancia ≤20 m / ≤100 m / más lejos), cada nivel tiene sus propios parámetros `m` (probabilidad
del nivel dado que el par es la misma vivienda) y `u` (probabilidad del nivel dado que NO lo es,
condicionada a la población YA bloqueada por ROADMAP 1.8 — donde vecinos del mismo bloque inflan
`u` respecto a una población sin bloquear), y aporta `bits = log2(m/u)` a un peso de coincidencia
total `M = prior + Σ bits(campo evaluado)`. La probabilidad final es `score = 1/(1+2^-M)`, forma
numéricamente estable de `2^M/(1+2^M)`. Los parámetros `m`/`u` están fijados a priori desde
literatura y razonamiento (decisión 086 detalla la exclusión de campos ausentes); no se ajustan
contra el corpus etiquetado.

**Alternativa descartada.** Regresión logística entrenada sobre el corpus etiquetado: sobreajusta
con n=24. TF-IDF sobre título/descripción: rompe el contrato de comparar exactamente dos
`Listing` estructurados que ya fija `DedupStrategy` (ROADMAP 1.9).

**Motivo.** El objetivo del paso 2.2 es comparar un enfoque distinto al basado en reglas, no
introducir un modelo entrenado que el propio corpus de 24 pares no puede validar con solvencia.
Fellegi-Sunter da una segunda familia de razonamiento (probabilístico, aditivo por campo) sin
depender de tener suficientes datos para entrenar nada, y su salida sigue siendo un `score` en
`[0,1]` con desglose por señal — mismo contrato (`DedupStrategy`) que rule-based.

---

## 086 — Un campo ausente EXCLUYE su contribución a M (MAR), nunca cuenta como desacuerdo

**Estado:** aceptada

**Decisión.** Cuando un campo comparado falta en cualquiera de los dos `Listing` (p. ej.
`surfaceM2` ausente en un lado), su nivel graduado devuelve `value: 0, weight: 0` — el campo
queda EXCLUIDO de la suma `M`, nunca se sustituye por un nivel de desacuerdo. La ausencia deja el
posterior donde estaba (en el prior más lo ya acumulado), nunca lo empuja hacia abajo.

**Alternativa descartada.** Tratar un campo ausente como un nivel de desacuerdo explícito
(missing-as-disagreement, MNAR): habría que decidir A QUÉ nivel de desacuerdo asignarlo sin
ninguna base real para esa elección.

**Motivo.** Missing-as-disagreement recrea exactamente el sesgo contra los pares `premises` (sin
`rooms`/`bathrooms`) que la decisión 049 (normalización por peso EFECTIVO, no por peso máximo
configurado) ya eliminó de rule-based — penalizar un campo ausente sería reabrir el mismo defecto
en la segunda estrategia. La investigación (obs #279, claim C4) documenta ambas convenciones como
no intercambiables; MAR-exclude es la que preserva el criterio ya fijado en decisión 049.

---

## 087 — Umbrales de FS (0.95 / 0.50), veto compartido, sin piso de evidencia explícito

**Estado:** aceptada

**Decisión.** `FS_BAND_THRESHOLDS = { high: 0.95, low: 0.50 }`. `FS_T_HIGH=0.95`: como mucho un
5% de falsos positivos esperados entre los `accept` (mismo criterio de decisión 006 aplicado a la
escala de probabilidad de FS). `FS_T_LOW=0.50`: el punto de Bayes (`M=0 ⇔ score=0.5`, sin
evidencia neta a favor ni en contra). El veto (`propertyType`/`operation`) es el MISMO criterio
binario que rule-based, vía `isVetoed` compartida (decisión 088). A diferencia de rule-based, FS
NO tiene un piso de evidencia mínima explícito (`MIN_EVALUATED_SIGNALS`/`MIN_EFFECTIVE_WEIGHT`):
la propia aritmética de `M` ya impide que dos campos opcionales fuertes por sí solos alcancen
0.95, así que el efecto es equivalente sin necesitar una regla aparte.

**Desviación documentada (D3, detectada en `sdd-apply`, no en el diseño).** El diseño ilustraba
este argumento con un cálculo a mano: "el mejor caso de dos campos es distancia≤20 m + dirección
exacta, con `M=2.807+3.000-3.170=2.637` y `p≈0.862 < 0.95`". Ese cálculo omite `price` por
completo. Pero `priceCents` es `z.int().positive()` — OBLIGATORIO en `listingSchema` — así que
ningún `Listing` real puede tener el precio ausente: `price` SIEMPRE se evalúa y SIEMPRE aporta
bits a `M`. El `M=2.637` exacto del diseño es, por tanto, inalcanzable por cualquier par real.
`sdd-apply` no ajustó `m`/`u` para forzar esa cifra (instrucción explícita de la orquestación);
en su lugar implementó la tabla `m`/`u` real tal y como está especificada y escribió los tests
sobre el mismo PRINCIPIO cualitativo con valores calculados por el código real: dos campos
opcionales fuertes (distancia cercana, dirección exacta) con `price` en una banda intermedia no
favorable (~4.76%, no ≤2%) puntúan `score≈0.806` (`undecided`, no `accept`); tres campos fuertes
incluyendo `price` en su mejor nivel (~0.50%) puntúan `score≈0.976` (`accept`). El principio
("hacen falta al menos tres campos de acuerdo, nunca dos") queda intacto y probado; solo la cifra
ilustrativa concreta del texto del diseño era inalcanzable.

**Alternativa descartada.** Umbrales compartidos 0.82/0.45 (los mismos números de rule-based, en
una escala distinta: probabilidad de Bayes, no score normalizado por peso). Un piso de evidencia
explícito en unidades de peso (como `MIN_EFFECTIVE_WEIGHT=55` de rule-based): FS no tiene una
unidad de peso comparable — sus "pesos" son bits de razón de verosimilitud, no una suma acotada
por un máximo configurado.

**Motivo.** 0.95/0.50 reutiliza el MISMO criterio de decisión 006 (tasa de falsos positivos
objetivo) sobre la escala propia de FS, en vez de trasplantar números que solo tenían sentido en
la escala de rule-based. La ausencia de piso explícito es honesta sobre el mecanismo real: en FS
la evidencia insuficiente ya se refleja en un `M` bajo, sin necesitar una regla redundante.

---

## 088 — `classify()` gana umbrales opcionales SOLO para evaluación offline; se acota (no se contradice) el principio de `weights.ts`

**Estado:** aceptada

**Decisión.** `classify(result, thresholds: BandThresholds = RULE_BASED_BAND_THRESHOLDS)`
(`classifyProbabilistic` sigue el mismo contrato con `FS_BAND_THRESHOLDS`). El segundo parámetro
es EXCLUSIVAMENTE para la CLI de evaluación offline
(`apps/ingestion/src/strategy-comparison/`, sin base de datos ni red): una banda calculada con
umbrales distintos de los de producción nunca se persiste — esa CLI no tiene ningún camino de
escritura hacia `property_listings`, solo hacia su propio reporte. `reprocess-core.ts`
(producción) sigue llamando a `classify()` SIN segundo argumento. El comentario de cabecera de
`weights.ts` (decisiones 020/049: los umbrales nunca son un parámetro en tiempo de ejecución, y
retunarlos exige un cambio de `version`) se reescribe para ACOTAR ese principio a producción, no
para contradecirlo — el principio sigue gobernando, sin excepción, todo lo que persiste.
`isVetoed(signals)` se extrae de `rule-based/classify.ts` para que `classifyProbabilistic` use el
MISMO criterio de veto, un contrato compartido entre estrategias.

**Alternativa descartada.** Un clasificador paralelo dentro de `apps/ingestion` que reimplemente
el bandeado con sus propios umbrales: duplica la lógica de `classify()` y arriesga que las dos
copias diverjan. Violar el comentario de `weights.ts` en silencio, sin actualizarlo: contradice
una decisión ya documentada sin dejar rastro del motivo.

**Motivo.** El validador de diseño hizo notar que un segundo parámetro opcional en `classify()`
parecía chocar literalmente con el texto de `weights.ts:1-7` ("nunca en tiempo de ejecución"). La
resolución no es elegir entre el override y el principio, sino precisar el ALCANCE del principio:
siempre ha sido sobre qué usa PRODUCCIÓN, no sobre si puede existir una superficie de evaluación
offline que nunca escribe en la base de datos real.

---

## 089 — Métricas de evaluación: `truth` (nunca `expected`), `undecided` como negativo, intervalos de Wilson 95%

**Estado:** aceptada

**Decisión.** Precisión, recall y F1 se calculan SIEMPRE sobre el campo `truth` del corpus
(verdad terreno, obs #284), nunca sobre `expected` (la banda DISEÑADA de rule-based, que sigue
existiendo solo para las pruebas de regresión de bandeado ya existentes). `undecided` cuenta como
NEGATIVO en la matriz de confusión (D2 del preproposal): un duplicado real clasificado
`undecided` es un fallo de recall, igual que uno rechazado explícitamente; la tasa de indecisos se
reporta como una cifra APARTE, nunca mezclada con P/R. F1 es `null` si precisión o recall es
`null` (sin ensayos), y `0` si ambos suman 0 (ningún acierto en absoluto) — nunca `null` en ese
caso, porque sí hay ensayos, solo que ninguno tuvo éxito. Los intervalos de confianza del 95% para
precisión, recall y tasa de indecisos usan el método de Wilson (`z=1.959963984540054`), no Wald.

**Alternativa descartada.** Evaluar contra `expected`: es circular, porque `expected` es la propia
salida diseñada de rule-based, no una etiqueta independiente — por ejemplo `hn-8` es `accept` por
diseño (un falso positivo irreducible documentado en su propia `rationale`) pero `distinct` en
verdad terreno. Intervalos de Wald: cobertura pobre con muestras pequeñas o proporciones cercanas
a 0/1 (investigación, obs #279, claim C10) — exactamente el régimen de n=24.

**Motivo.** El "CRITICAL FINDING" del diseño (obs #283) es que ningún resultado de evaluación
tiene valor si se mide contra la propia salida de una de las dos estrategias comparadas.
Separar `truth` de `expected` es lo que hace que comparar rule-based contra FS sea una comparación
real, no una tautología a favor de rule-based.

---

## 090 — El corpus etiquetado y `makeListing` se reubican a `packages/core/src/evaluation/`

**Estado:** aceptada

**Decisión.** `git mv packages/core/test/dedup-corpus.ts packages/core/src/evaluation/dedup-corpus.ts`.
`makeListing` se mueve de `packages/core/test/test-helpers.ts` a
`packages/core/src/evaluation/make-listing.ts`, y `test-helpers.ts` pasa a reexportarla sin
cambios — ningún test existente (`rule-based-strategy`, `winner`, etc.) cambia su import.

**Alternativa descartada.** Duplicar el corpus etiquetado (o una copia reducida) dentro de
`apps/ingestion` para que la CLI de comparación lo consuma sin depender de `packages/core`.

**Motivo.** El corpus y la métrica de evaluación necesitan ser accesibles desde
`apps/ingestion` (la CLI de comparación de estrategias, ROADMAP 2.2) sin publicarse en
`test/`, que no forma parte del paquete distribuido. Duplicarlo arriesga que la copia de
`apps/ingestion` divergiera del corpus real usado por los tests de `packages/core` — exactamente
el riesgo de deriva que la regla "una fuente única de verdad" del proyecto existe para evitar.

---

## 091 — CLI de comparación de estrategias: sin base de datos ni red, rejilla por defecto de 20 puntos, rechazo estricto de tuplas inválidas

**Estado:** aceptada

**Decisión.** `apps/ingestion/scripts/compare-dedup-strategies.ts` (`pnpm --filter
@buscahogar/ingestion compare-strategies`) no abre conexión a base de datos ni lee ninguna
variable de entorno — el corpus vive en memoria en `@buscahogar/core`. `--high`/`--low` son listas
separadas por comas, opcionales, pero deben darse JUNTAS o ambas ausentes; sin ellas se usa
`DEFAULT_SWEEP` (20 tuplas: `high∈{0.75,0.82,0.90,0.95,0.99} × low∈{0.30,0.45,0.50,0.60}`, que
incluye los dos puntos por defecto reales, 0.82/0.45 y 0.95/0.50) y se ECHA en el reporte
(`gridSource: 'default' | 'flags'`). La rejilla es el producto cartesiano, deduplicado y
ordenado. El conjunto ENTERO se rechaza con código de salida 2, nombrando el problema exacto, si
(a) supera las 64 combinaciones, o (b) CUALQUIER tupla tiene `low >= high` — nunca se filtra una
tupla inválida en silencio ni se produce salida parcial. El reporte se exporta en Markdown, JSON o
CSV; los tres formatos llevan el mismo caveat de muestra pequeña (`corpusSize=24` y el texto de
que es una prueba mecánica, no una calibración) y son deterministas (`toFixed(4)`, sin reloj ni
configuración regional) para que dos ejecuciones sobre la misma entrada produzcan bytes idénticos.

**Alternativa descartada.** Filtrar las tuplas inválidas de una rejilla y ejecutar solo con las
válidas: cambia en silencio la rejilla que el operador pidió — el mismo modo de fallo que el tope
de 64 combinaciones ya existe para evitar (blocking/grid.ts, paso 1.8).

**Motivo.** D6 (preproposal) fija que esta CLI es de comparación, no de producción: no debe poder
tocar ninguna fuente externa ni la base de datos real, así que no necesita `.env` para nada. El
rechazo estricto de rejillas inválidas sigue el mismo precedente ya establecido por
`blocking/grid.ts` (paso 1.8): una lista mal escrita debe fallar de forma ruidosa, nunca ejecutar
una versión distinta y silenciosa de lo que el operador pidió.

---

## 092 — El FN/TN exportado por la CLI de comparación de estrategias incluye los pares `undecided` correspondientes (corrección post-verify, WARNING-1)

**Estado:** aceptada

**Decisión.** En los tres formatos de `compare-dedup-strategies.ts` (Markdown, JSON, CSV), la
cifra de falsos negativos y verdaderos negativos EXPUESTA (`false_negative_incl_undecided`/
`true_negative_incl_undecided` en JSON/CSV, `FN (incl. indecisos)`/`TN (incl. indecisos)` en
Markdown) es `counts.falseNegative + counts.undecidedDuplicate` y
`counts.trueNegative + counts.undecidedDistinct` respectivamente — la aplicación, en la capa de
render, del mismo criterio D2 que `computeMetrics` (decisión 089) ya usa internamente para el
denominador de recall. `undecided_duplicate`/`undecided_distinct` se conservan como columnas/
campos de desglose ("de las cuales indecisas"), sin cambiar su cifra. `packages/core` no cambia:
`ConfusionCounts` conserva sus 6 casillas mutuamente excluyentes (decisión 089,
`metrics.test.ts`), y ningún valor de precisión, recall, F1, tasa de indecisos o intervalo de
Wilson se altera por esta corrección — la comparación antes/después de la CLI real sobre las filas
`is_default` de ambas estrategias lo confirma byte a byte en esas columnas.

**Alternativa descartada.** Redefinir `ConfusionCounts`/`computeMetrics` (`packages/core`) para que
`falseNegative`/`trueNegative` ya incluyan el `undecided` correspondiente: rompería el test que fija
las 6 casillas mutuamente excluyentes (`metrics.test.ts`, decisión 089) y mezclaría dos conceptos —
"rechazado explícitamente" e "indeciso" — en una sola casilla dentro del propio dominio, cuando el
desglose fino sigue siendo necesario para depurar el comportamiento banda a banda de cada
estrategia. El defecto no estaba en el cálculo (correcto y probado), sino en qué cifra cruda
reexponía cada renderer.

**Motivo.** `sdd-verify` (revisión #288, WARNING-1) detectó que el artefacto exportado (deliverable
de la memoria del TFM) no reconciliaba: la fila por defecto de rule-based mostraba
`false_negative=0` mientras el recall visible era 0.8000, un lector no podía reconstruir
`recall = TP/(TP+FN)` a partir de las columnas nombradas sin conocer además, y sumar a mano, la
columna `undecided_duplicate`. Corregir solo la capa de render (`apps/ingestion/src/
strategy-comparison/render.ts`) es la corrección de menor alcance que hace el artefacto
autoexplicativo: `TP+FP+FN+TN=24` y `recall=TP/(TP+FN)`, `precision=TP/(TP+FP)` valen ahora
directamente sobre las cifras visibles, en los tres formatos.

---

## 093 — Inyección de hashes de imagen: `ImageHashLookup` sobre `thumbnailUrl`, refs de corpus con esquema no descargable

**Estado:** aceptada

**Decisión.** `packages/core` recibe los hashes de imagen como DATOS, nunca como I/O propio: un
`ImageHashLookup = (listing: Listing) => ImageHashEntry | undefined`, construido en
`apps/ingestion` a partir de una tabla JSON precomputada e indexada por el campo `thumbnailUrl`
ya existente en `Listing` (ROADMAP 1.11), sin tocar su esquema. El corpus de 24 pares etiquetados
gana referencias mediante `fixture-image:eval/<pairId>-<a|b>` — un esquema deliberadamente no
descargable, no una URL real — atadas por `apps/core/src/evaluation/dedup-corpus-images.ts`
(`IMAGE_REFS` + `withCorpusImages(corpus)`, que devuelve copias del corpus con `thumbnailUrl`
poblado sin tocar `truth`). `dedup-corpus.ts` no se modifica.

**Alternativa descartada.** Un campo nuevo `Listing.imagePHash`: cambiaría el esquema de dominio
para un alcance que D7 fija como solo-evaluación. Indexar por `externalId`: generado por
contador en los fixtures, frágil ante reordenamiento. Un `WeakMap` sobre los objetos `Listing`:
opaco, no serializable, no inspeccionable desde el CLI.

**Motivo.** `thumbnailUrl` ya existe (ROADMAP 1.11) y ya se ignora por las dos estrategias
estructuradas, así que reutilizarlo como clave de búsqueda no añade ninguna superficie nueva al
dominio. El esquema `fixture-image:` dice, por construcción, que esa referencia nunca es
alcanzable por red — necesario porque D7 prohíbe cualquier ruta de producción o descarga real en
este cambio.

---

## 094 — Decorador `withImageSignal`, combinación por estrategia y exclusión del piso de evidencia de rule-based

**Estado:** aceptada

**Decisión.** `withImageSignal(base, { lookup, threshold, combiner })` envuelve una
`DedupStrategy` existente sin tocarla. Un comparador **solo-positivo** (adaptación propia del
proyecto, no de la literatura — ver decisión 095/investigación, claim C19): coincidencia fuerte
(`level: 'strong'`) suma evidencia; cualquier otro caso (distancia por encima del umbral, hash
ausente, imagen ilegible, entropía baja) es neutro, nunca resta. En rule-based, la imagen fuerte
añade `{ value: 1, weight: 15 }` y el score se recalcula como media ponderada sobre todas las
señales, orden de inserción (decisión 049). En Fellegi-Sunter añade `{ value: log2(0.30/0.05) ≈
2.585, weight: 1 }` a `M`. La imagen **nunca cuenta para el piso de evidencia** de rule-based
(`MIN_EVALUATED_SIGNALS`/`MIN_EFFECTIVE_WEIGHT`): el evaluador RB+imagen inyecta su propio
`classify` (`classifyRuleBasedWithImage`), que ve el score con la contribución de imagen pero
evalúa el piso solo sobre las señales estructuradas. `classify.ts` de producción no cambia.

**Alternativa descartada.** Contar la imagen en el piso de rule-based: un par con solo 2 señales
estructuradas (peso 40) más una imagen fuerte alcanzaría exactamente peso 55 y cruzaría el piso
por sí sola — una vía real de falso positivo entre viviendas del mismo edificio (decisión 006),
porque la imagen es simulada, 1-contra-1 y compartible entre unidades de la misma fachada. Editar
`classify.ts` de producción para que ignore `image`: aumenta el radio de impacto sin necesidad.
Comparador simétrico (penaliza el desacuerdo): cada portal elige su propia foto de portada
(decisión 063), así que el desacuerdo no es evidencia fiable de nada.

**Motivo.** El objetivo declarado del paso (medir la aportación real de la imagen) exige que un
falso positivo nuevo introducido por la imagen sea visible, nunca oculto detrás de un piso que la
propia imagen ayudó a cruzar. El caso real del corpus, `md-4` (2 señales, peso 40): se confirmó
en la ejecución real que ni siquiera hace falta la exclusión del piso para que se quede
`undecided` bajo RB+imagen — su distancia real es 18, por encima de `T=10`, así que la imagen es
neutra por umbral antes de llegar a evaluarse el piso. La exclusión del piso queda probada de
todos modos, de forma independiente, con un caso sintético (`rule-based-classify-floor.test.ts`,
`evaluate-image.test.ts`) que sí fuerza una coincidencia fuerte simulada sobre `md-4`.

---

## 095 — Pipeline de hash: sharp + DCT pHash 64-bit propio, `sharp` fijado en `0.34.2` con `allowBuilds: true`

**Estado:** aceptada

**Decisión.** `apps/ingestion` decodifica con `sharp`, recorta un margen fijo del 5% por lado
(`CROP_MARGIN_RATIO`), convierte a escala de grises, redimensiona a 32×32 (`fit: 'fill'`,
lanczos3), calcula la DCT-II 2D pura (tabla de cosenos precalculada, sin dependencias), toma el
bloque 8×8 superior izquierdo (con el DC), umbraliza por la mediana y codifica 64 bits en
hexadecimal. Una imagen con desviación típica por debajo de `LOW_ENTROPY_STDDEV=10` se marca
`lowEntropy` pero SIGUE calculando su hash — el nivel `neutral/low-entropy` se decide en el
comparador de `packages/core`, no aquí. `sharp` es la única dependencia de producción nueva,
fijada en `0.34.2` (sin `^`) en `apps/ingestion` exclusivamente; `packages/core` sigue sin
ninguna dependencia nativa ni de I/O (verificado por escaneo estático del propio código fuente,
`image-module-imports.test.ts`).

**Hallazgos empíricos de aplicación (no anticipables desde el diseño).** (a) El pin `0.34.2` no
necesitó entrada en `minimumReleaseAgeExclude` de `pnpm-workspace.yaml`: ya es lo bastante
antiguo para la política de `minimumReleaseAge` de pnpm 11 sin excepción. (b) `sharp` SÍ necesita
`allowBuilds: { sharp: true }` en `pnpm-workspace.yaml` — contra lo que el diseño anticipaba
(prebuilt binaries "no deberían necesitar script"): el propio script `install` de `sharp` no
compila nada, solo VERIFICA que el binario prebuilt correcto llegó vía sus
`optionalDependencies` (`@img/sharp-*`); sin `allowBuilds`, pnpm bloquea ese script de
verificación por política y la instalación falla. (c) El comparador solo-positivo en sí (decisión
094) es una adaptación del propio proyecto, no algo tomado de la literatura consultada en la
investigación (obs #293, claim C19) — se documenta así explícitamente para no citarlo como si
tuviera respaldo bibliográfico que no tiene.

**Alternativa descartada.** `sharp-phash` (envoltorio MIT, ~2 años sin mantener): vendorizable
pero añade una segunda superficie de confianza sobre una librería inactiva. `blockhash`/
`blockhash-core`: más falsos positivos documentados en la investigación (claims C2/C5) y sin
mantenimiento. `trim()` de sharp para el recorte: depende del contenido, no de un margen fijo, e
introduce no-determinismo entre imágenes distintas.

**Motivo.** Decodificar y redimensionar con una librería nativa madura (`sharp`, binarios
prebuilt para Windows/Linux/macOS) y mantener el propio paso de DCT en TypeScript puro evita
arrastrar una segunda dependencia nativa o no mantenida solo para el hash en sí, y mantiene
`packages/core` con cero dependencias nativas, tal y como exige el propio dominio de este cambio.

---

## 096 — Fixtures: 18 fotos CC0/dominio público de Wikimedia Commons, con procedencia y variantes derivadas en memoria

**Estado:** aceptada

**Decisión.** 18 fotografías CC0-1.0/PDM-1.0 de Wikimedia Commons (ninguna de portales
inmobiliarios reales), redimensionadas a 480px de lado largo, JPEG calidad 80: 12 bases de
evaluación (8 interiores, 4 fachadas) y 6 bases de calibración (2 fachadas, 2 cocinas, 2 salones),
conjuntos disjuntos. Cada fichero lleva una entrada en `provenance.json`
(`file`, `set`, `kind`, `title`, `author`, `sourceUrl`, `license`, `retrievedAt`, `sha256`,
`modifications`), validada por Zod en test. Las variantes (reescalado, recompresión JPEG/WebP,
recorte, superposición de logo generado, y dos variantes de "chrome" de portal, `portalA`/
`portalB`) se derivan EN MEMORIA por `transforms.ts`, nunca se comitean como binarios. El
placeholder de baja entropía se genera con `sharp({ create })`, tampoco comiteado.

**Método de obtención (tarea 3.1, apply-time).** Las 18 fotos las aportó el responsable del
proyecto, descargadas manualmente de Wikimedia Commons bajo licencia CC0-1.0/PDM-1.0 confirmada
en la propia página de cada fichero — no una búsqueda ni una descarga automatizada por el agente.

**Alternativa descartada.** Comitear las variantes ya generadas como binarios: multiplicaría por
~3 el tamaño del fixture sin necesidad, porque son deterministas y reproducibles desde las 18
bases. Usar miniaturas reales de Idealista: prohibido explícitamente (D5) — ninguna credencial ni
byte de fuente real llega a este cambio, que es evaluación-only por diseño (D7, preproposal).

**Motivo.** CC0/dominio público es la única licencia que permite comitear las imágenes al
repositorio del TFM sin negociar derechos de uso. Derivar las variantes en memoria mantiene el
repositorio pequeño y hace explícito, en código, exactamente qué transformación sufre cada
variante — evidencia auditable en vez de un binario opaco.

---

## 097 — Calibración del umbral `T`: `T = min(10, dNegMin − 2)` sobre un conjunto separado de las 24 parejas; aborto si `T < 1`

**Estado:** aceptada

**Decisión.** El umbral de Hamming `T` se fija ANTES de tocar el corpus de evaluación de 24
pares, usando solo las 6 bases de calibración: 48 pares positivos (original vs. cada una de 7
variantes, más `portalA` vs `portalB`) y 15 pares negativos (todas las combinaciones cruzadas de
`portalA` entre bases distintas). Regla fija de antemano: `T = min(10, dNegMin − 2)`, donde
`dNegMin` es la distancia mínima observada entre negativos. Si `T < 1`, la calibración **aborta**
con error, sin escribir `calibration-report.json` ni ningún umbral — nunca clampa a 1 en
silencio. `T` se copia a `packages/core/src/strategies/image/parameters.ts`
(`IMAGE_HAMMING_THRESHOLD`) con un comentario de procedencia, y un test fija que esa constante ==
`report.T` y que `parameters.ts` no importa el corpus de evaluación.

**Resultado real (calibración ejecutada, apply-time, ROADMAP 2.3).** `dNegMin = 20` (el par
negativo más cercano, `calib-facade-2:portalA` vs `calib-living-room-1:portalA`, distancia 20).
`T = min(10, 20 − 2) = 10` (la rama de 10 gana, no `dNegMin − 2`). Recall positivo a `T=10`:
**41/48 = 85,4%** — 7 de los 48 pares positivos de calibración (todos del tipo `original-vs-crop`
o casos de recorte fuerte) quedan por encima del umbral y no se cuentan como coincidencia fuerte
en calibración, coherente con que el recorte es la transformación más agresiva del conjunto.

**Alternativa descartada.** Ajustar `T` observando los 24 pares de evaluación: exactamente lo que
D8 prohíbe — mediría contaminación del umbral con los propios datos de prueba. Los valores T=6-8
de la literatura (investigación, claims C7/C8): no verificados contra este pipeline concreto de
recorte/entropía, y el propio corpus de referencia (littlesvr, claim C2) usa hashes/datasets
distintos. Clampar `T<1` a 1: ocultaría en silencio un pipeline cuyo margen de separación entre
positivos y negativos es demasiado estrecho para ser útil.

**Motivo.** D8 (preproposal) exige calibrar en un conjunto separado y NO tocar el corpus de
evaluación en el proceso — la única forma de que la medición posterior sobre los 24 pares sea una
medición honesta, no una cifra ya optimizada para dar bien.

---

## 098 — Asignación pareja↔imagen congelada antes de generar ningún hash de evaluación

**Estado:** aceptada

**Decisión.** La asignación de qué base/variante de imagen recibe cada lado de cada una de las 24
parejas etiquetadas se fija en `manifest.ts` ANTES de ejecutar `generate-image-hashes --set
evaluation`. Duplicados reales (`tp-1..6`, `md-1`, `md-2`, `md-4`): misma base, dos transformos
distintos, cubriendo entre todos cada transformación disponible. `md-3`: lado b sin
`thumbnailUrl`, deliberadamente `missing`. Negativos "easy" (`en-*`): bases distintas de la misma
categoría o de categorías distintas. Negativos difíciles (`hn-*`): bases de interior distintas EN
GENERAL, con la EXCEPCIÓN deliberada de `hn-1`/`hn-7`, que comparten la MISMA base de fachada
(`portalA` vs `portalB`) — el caso difícil a propósito, misma fachada, distinto anuncio. `hn-5`:
placeholder de baja entropía en ambos lados.

**Alternativa descartada.** Asignar las imágenes después de ver las distancias reales: es
tunear sobre el corpus de evaluación en la práctica, aunque no se toque `T` directamente —
exactamente el mismo riesgo que D8 prohíbe para el umbral.

**Motivo.** Congelar la asignación antes de que exista ningún hash real hace que el resultado
posterior (qué parejas obtienen coincidencia fuerte, cuáles no) sea una medición, no una elección
retrospectiva que favorezca al sistema. El caso `hn-1`/`hn-7` se diseñó a propósito para poner a
prueba si el margen de recorte del 5% del pipeline (`CROP_MARGIN_RATIO`, decisión 095) basta para
neutralizar una franja de chrome de portal del 8% de alto (`CHROME_BAR_RATIO` de los propios
transforms) — y el resultado real (decisión 099) confirma que no basta del todo.

---

## 099 — Reporte de 4 filas: CLI de ablación estructurado vs. estructurado+imagen, con caveat de evidencia simulada

**Estado:** aceptada

**Decisión.** El CLI de comparación (ROADMAP 2.2) pasa a evaluar 4 filas en orden fijo:
rule-based estructurado, rule-based+imagen, Fellegi-Sunter estructurado, Fellegi-Sunter+imagen.
Las dos filas estructuradas SIEMPRE puntúan el corpus `dedupCorpus` plano, nunca
`withCorpusImages`, de modo que su resultado es byte-a-byte idéntico al del paso 2.2 con
independencia de si la señal de imagen resulta neutra o no. `evaluate.ts` gana campos
OPCIONALES (`StrategyEvaluator.imageEvidence?`, `PairEvaluation.image?`,
`StrategyEvaluation.image?`), sin tocar la forma de salida de las estrategias sin imagen. CSV
añade exactamente `evidence` e `image_caveat` inmediatamente después de `caveat`, sin mover
ninguna columna existente; JSON añade `imageCaveat` en la raíz y por fila de imagen;
`bandChanges[]` lista cualquier pareja cuya banda cambie entre una fila y su equivalente +imagen.

**Resultado real de la ablación (ejecución real del CLI, apply-time, ROADMAP 2.3, corpus de 24
pares).** A los umbrales por defecto de cada estrategia, la señal de imagen **no cambia ninguna
banda**: `bandChanges` sale vacío para ambas estrategias, y las matrices de confusión con y sin
imagen son idénticas —

| Estrategia | TP | FP | FN (incl. indecisos) | TN (incl. indecisos) |
|---|---|---|---|---|
| rule-based (con y sin imagen) | 8 | 1 | 2 | 13 |
| Fellegi-Sunter (con y sin imagen) | 4 | 1 | 6 | 13 |

Seis duplicados reales SÍ obtuvieron una coincidencia fuerte de imagen y elevaron su puntuación
(`tp-1` d=0, `tp-3` d=6, `tp-4` d=4, `tp-5` d=0, `md-1` d=6, `md-2` d=0), visible en la rejilla de
sweep en umbrales MÁS BAJOS que el umbral por defecto — por ejemplo con `high=0.75`: rule-based
pasa de P/R/F1 0,8889/0,8000/0,8421 a 0,9000/0,9000/0,9000; Fellegi-Sunter pasa de
0,7778/0,7000/0,7368 a 0,8333/1,0000/0,9091 — pero ninguna de las seis cruzó el umbral POR
DEFECTO de ninguna estrategia, así que `atDefault` no cambia. `tp-2` (d=16) y `tp-6` (d=24), pese
a ser duplicados reales, no obtuvieron coincidencia fuerte: distintas combinaciones de
transformación (WebP+recorte, recorte+superposición) dieron distancia perceptual mayor que otras
combinaciones sobre el mismo corpus — variación empírica real, sin ajustar. `md-4` sigue
`undecided` bajo RB+imagen (distancia real 18, por encima de `T=10`: ni siquiera llega a
`strong`). Ningún `hn-*` se convirtió en falso positivo nuevo: el caso difícil a propósito
`hn-1`/`hn-7` (decisión 098) midió distancia real **14**, justo por ENCIMA de `T=10` — el margen
de recorte del 5% del pipeline (`CROP_MARGIN_RATIO`) no cancela del todo la franja de chrome del
8% (`CHROME_BAR_RATIO`) para estas fotos concretas: un caso límite real, no un fallo de diseño a
corregir en este cambio. No se ajustó ningún peso, umbral ni la asignación del manifiesto para
cambiar este resultado — se reporta tal cual salió.

**Alternativa descartada.** Que las filas estructuradas puntuaran también `withCorpusImages`: la
igualdad byte-a-byte con 2.2 dejaría de ser una propiedad garantizada por construcción y pasaría
a depender de que la imagen fuera neutra en la práctica. Filtrar o resaltar solo las parejas que
cambian de banda sin mostrar la ablación completa: oculta precisamente el dato más interesante
para la memoria del TFM (que la mejora existe pero no cruza el umbral por defecto).

**Motivo.** El objetivo del paso es medir la aportación REAL de la imagen frente a la
deduplicación estructurada, incluyendo el caso — igual de informativo — de que esa aportación no
mueva ninguna decisión al umbral vigente. Reportar `bandChanges: []` como hallazgo genuino, en
vez de ajustar parámetros hasta obtener un cambio de banda, es la misma disciplina ya aplicada en
el paso 1.9 (decisión 087) y 2.2 (decisión 087 también): nunca tunear hacia una cifra deseada.

---

## 100 — Cinco índices de orden sobre `properties`, elegidos por planes medidos sobre 1M de filas; cierra la 060

**Estado:** aceptada

**Decisión.** La migración `0012` añade cinco btree sobre `properties`, todos con la forma exacta
del `ORDER BY` de `buildPropertySearchQuery` (`col dir NULLS LAST, id ASC`):
`(updated_at DESC NULLS LAST, id)`, `(operation, property_type, updated_at DESC NULLS LAST, id)`,
`(operation, property_type, min_price_cents, id)`, `(min_price_cents DESC NULLS LAST, id)` y
`(surface_m2, id)`. Se descartan `(rooms)` y `(bathrooms)`. `search.ts` no cambia. La medición se
hace con un banco propio en `apps/ingestion` (`gen-corpus`, `bench-search`, `bench-report`) contra
bases de datos separadas cuyo nombre debe terminar en `_bench`: 1M de viviendas sintéticas
generadas con SQL masivo, 20 ejecuciones en caliente por combinación (p50/p95 por rango más
cercano), una en frío con `pg_buffercache_evict` y el plan en JSON. Resultado y evidencia en
`docs/SEARCH-PERFORMANCE.md`.

**Alternativa descartada.** Un índice simple por columna de filtro (lo que la 060 rechazó sin
datos). Medido: `(rooms)` y `(bathrooms)` empeoran `rooms-baths` (232 → 325 y 290 ms), porque el
planificador cambia un recorrido ya ordenado por un `Bitmap Heap Scan` más un `Sort`. Un btree
ascendente sobre `updated_at` tampoco sirve: recorrido hacia atrás da `NULLS FIRST`, no el
`DESC NULLS LAST` que emite la consulta, aunque la columna sea `NOT NULL`. Medir sobre la base de
desarrollo: mezclaría datos sintéticos con el corpus real y la suite de `packages/db` la trunca
(decisión 046).

**Motivo.** Las combinaciones lentas lo eran por ordenar 1M de filas para devolver 25
(`Seq Scan` + `Sort`), no por filtrar. Un índice que ya da el orden deja que el `Limit` pare en la
fila 25: p95 de 357 → 3 ms en el orden por defecto y de 510 → 28 ms en la página 100 con filtros.
Cada índice entregado aparece por `Index Name` en el plan de al menos una combinación, comprobado
por test (`apps/ingestion/test/db/search-bench.db.test.ts`).

**Consecuencia.** ~230 MB de índices por millón de viviendas y cinco índices más que mantener al
consolidar. `properties_operation_property_type_idx` (decisión 051) queda redundante, porque C2 y C3
empiezan por las mismas columnas; se mantiene y queda como seguimiento. La 060 queda cerrada.

---

## 101 — JIT desactivado para el rol de la búsqueda

**Estado:** aceptada

**Decisión.** `packages/db/sql/bootstrap-roles-grants.sql` añade
`ALTER ROLE web_readonly IN DATABASE buscahogar SET jit = off`. Solo afecta a las sesiones de
`apps/web` contra `buscahogar`; la ingesta y la deduplicación, que conectan como propietario,
conservan el JIT.

**Alternativa descartada.** Documentar la combinación `geo-25km-price` como fallo pendiente: con
los índices de la 100 su p95 era de 651 ms, por encima del objetivo, y ningún índice lo arregla.
Subir `jit_above_cost` en todo el servidor: arregla el caso, pero también quita el JIT a las
consultas largas de la ingesta, que sí pueden aprovecharlo.

**Motivo.** El planificador estima 100 filas dentro de un radio de 25 km donde caen ~600.000, el
coste estimado sube a 1,37M y activa el JIT con inlining y optimización. `EXPLAIN` mide 557 ms de
compilación para ~50 ms de trabajo real. Con el JIT desactivado, `geo-25km-price` baja de 435 a
52 ms (p50) y el p95 final queda en 29 ms. Una búsqueda paginada de 25 filas nunca compensa
compilar código nativo.

**Consecuencia.** Es configuración del entorno, no esquema: vive en el script de bootstrap de
roles, que se vuelve a ejecutar tras recrear la base de datos (decisión 069). Test en
`apps/web/test/db/readonly-role-privileges.test.ts`. La mala estimación geográfica sigue ahí y
puede afectar a otras decisiones del planificador; queda como seguimiento.

---

## 102 — Señal de demanda por zona: tabla `zone_query_signals` y un único `GRANT INSERT` a `web_coverage`

**Estado:** aceptada. Enmienda las decisiones 064 y 076 (lista de privilegios de `web_coverage`).

**Decisión.** `zone_query_signals(zone_id, day)` con clave primaria `(zone_id, day)`, `zone_id`
referenciando `zones` con `ON DELETE CASCADE` y `day` con el `DEFAULT` de la fecha UTC en el reloj
de Postgres. `apps/web` inserta solo `zone_id` con `ON CONFLICT DO NOTHING`, sin `WHERE`, sin
`RETURNING` y sin `DO UPDATE`: PostgreSQL no exige entonces `SELECT` ni `UPDATE`, y un test de
privilegios lo demuestra. El rol `web_coverage` gana `INSERT` sobre esa tabla y nada más;
`web_readonly` la lee por los privilegios por defecto (inocuo). La migración `0013` rellena
`(zone_id, requested_at::date)` desde `coverage_jobs`. La escritura va en `page.tsx` antes de
resolver la cobertura, con `await` de una función que nunca lanza (`recordZoneQuerySignalSafely`);
`after()` no se usó durante la implementación porque Context7 no estaba disponible en ese momento;
después se verificó con la documentación de Next 16.2.9, la más cercana a la 16.3.4 fijada, que es
válido en una página Server Component si `cookies`/`headers` se leen antes del callback. Pasarse a
`after()` queda como mejora opcional: ahorra una ida y vuelta por búsqueda, y sus tests necesitarían
simular `next/server`.

**Alternativa descartada.** `zones.last_queried_at` más un `GRANT UPDATE`: ensancha el rol sobre la
tabla del catálogo sembrado. Derivar la demanda de `coverage_jobs`: una zona ya cubierta no genera
ninguna fila nueva, así que nunca se sabría que se sigue consultando.

**Consecuencia.** El propietario vuelve a ejecutar `bootstrap-roles-grants.sql`. Hay como mucho una
señal por zona y día, acotada por la purga de la 103.

---

## 103 — Cadencia de refresco y números de retención (30 / 90 / 180 días)

**Estado:** aceptada.

**Decisión.** Con `d` = días completos desde la última demanda de la zona: `d ≤ 30` semanal (vence
a los 7 días del último barrido), `31 ≤ d ≤ 90` mensual (30 días), `91 ≤ d ≤ 179` en espera (nunca
vence), `d ≥ 180` purga. La demanda de referencia es `coalesce(max(señal.day),
coverage_jobs.requested_at::date)`, calculada con el reloj de Postgres (DD-11); `packages/core`
recibe enteros. Las señales caducan a los 180 días, con un máximo de 5.000 filas por tick. Todos los
números son constantes con nombre en `packages/core/src/retention/policy.ts`.

**Alternativa descartada.** `zones.created_at` como referencia: es uniforme por el seed de ~8.100
zonas y no dice nada de la demanda. `last_swept_at`: mide la oferta refrescada, no el interés.

**Consecuencia.** Una consulta nueva devuelve la zona a semanal. Los valores operativos (fracción de
refresco, `maintenanceEveryTicks`, peticiones de verificación por tick, margen de radio) los fija
el responsable por entorno; quedan en "Pendientes de decidir".

---

## 104 — Carril de refresco con techo de gasto, intentos por ciclo y reinicio del cursor

**Estado:** aceptada.

**Decisión.** `coverage_jobs.refresh_requested_at` no nulo marca el carril de refresco; la
selección ordena primero los jobs a demanda. El planificador pasa a `pending` los jobs `done` (o
`failed` con los intentos agotados) de zonas `covered` vencidas por cadencia, con `attempts = 0`
(los intentos pasan a ser por ciclo), `error = NULL` y `cursor = NULL`, sin tocar `requested_at`
(ancla de demanda) ni `zones.state`. `finishJob(completed)` limpia la marca. La reserva se hace por
carril y antes de reclamar; el carril de refresco compara contra `least(tope, floor(tope ×
fracción))` sobre el gasto TOTAL del día, en la rama de inserción y en la de conflicto del ledger.
Con fracción 0 o ausente no se re-encola nada ni se verifica nada.

**Corrección tras validación (cursor).** La primera versión de `scheduleRefresh` dejaba el cursor:
un job `failed` agotado reanudaba desde una paginación a medias, `finishJob(completed)` sellaba
`last_swept_at` como barrido completo y `cycle_started_at` (decisión 105, solo se fija con cursor
NULL) nunca abría un ciclo nuevo. Un refresco es un ciclo nuevo: el cursor se reinicia.

**Alternativa descartada.** Poner `requested_at = now()` al refrescar: adelanta al refresco frente a
la demanda por antigüedad y destruye el ancla de la 103. Pasar un tope reducido en vez de un techo:
la rama de conflicto compara contra la columna `search_cap` ya guardada y lo ignora. Un contador
aparte para el refresco: el techo sobre el total conserva siempre `tope × (1 − fracción)` para la
demanda sin segunda contabilidad.

---

## 105 — Desaparición de anuncios: la ausencia nomina, `adIds` confirma, y la confirmación está bloqueada por evidencia

**Estado:** aceptada. Enmienda la decisión 039 (la ausencia en un barrido no cambia el estado).

**Decisión.** Tras un ciclo COMPLETADO (`finishJob(completed)`, con `cycle_started_at` estable entre
reanudaciones), cada anuncio activo de la zona, la fuente y la operación del worker con
`last_seen_at < cycle_started_at` entra en `listing_presence_checks`; nunca cambia de estado por
eso. Un verificador aparte (`ListingPresenceVerifier`, no en `PropertySource`) envía una petición
por lote de hasta 50 ids con `adIds`. Un id devuelto es `present` (sube `last_seen_at`); uno
omitido es `absent` (→ `inactive` / `delisted`) SOLO si `DELISTED_OMISSION_CONFIRMED` es `true`; la
constante es `false` hasta que un fixture de la sonda demuestre la omisión, y un test la ata a la
meta del fixture. Un error de transporte, un sobre inválido, `totalPages > 1` o un id ajeno
devuelto (`adIds` ignorado) hacen ambiguo TODO el lote: +1 intento, espera de 7 días y descarte a
los 3 intentos sin cambiar estado. Mientras la constante sea `false`, ningún anuncio se retira.

**Correcciones tras validación (ambas de la clase "retirada falsa").** (1) Carrera: si un barrido
veía el anuncio entre la verificación y su aplicación, se retiraba igualmente; el `UPDATE` de
`absent` exige ahora que la fila de la cola siga existiendo (el escritor la borra al ver el
anuncio). (2) Desviación de la especificación (LR-4, S-LR-5): una respuesta vacía a un lote de 2 o
más ids es AMBIGUA, no `absent` para todos; es indistinguible de un `adIds` ignorado o de un filtro
que no casa en una zona sin stock. Un lote de un solo id con respuesta vacía sigue siendo omisión.

**Alternativa descartada.** Inferir la desaparición tras N barridos sin verlo: es justo lo que la
039 prohíbe. Una llamada de detalle por anuncio: 50 veces el coste en cuota. Una variable de
entorno para activar la retirada: permitiría activarla sin evidencia.

**Consecuencia.** El paso 2.5 se implementó con la retirada inactiva. El 2026-09-30 la sonda
(`pnpm probe:adids`, 3 búsquedas reales) confirmó `delistedIdBehaviour: omitted` con la fixture
`adids-2026-09-30`. Para elegir el anuncio dado de baja se usó un barrido completo de un círculo de
170 m, un mecanismo independiente del filtro `adIds` que se estaba probando. `DELISTED_OMISSION_CONFIRMED`
pasó a `true` en el mismo commit. La sonda confirmó además que `propertyType` restringe `adIds`, lo
que respalda la correspondencia de filtros por tipo, y que la lista va separada por comas.

---

## 106 — Ciclo de vida del anuncio: `inactive_since`, `inactive_reason` y reactivación al verlo de nuevo

**Estado:** aceptada. Enmienda PERSIST-3 / P6 (el escritor no tocaba `status`).

**Decisión.** `listings` gana `inactive_since` e `inactive_reason` (`CHECK` `delisted` /
`zone_purged`). Son metadatos de observación, como `last_seen_at`, no contenido: no versionan. Solo
la verificación y la purga de zona marcan un anuncio como inactivo. Una re-visión en un barrido lo
reactiva: `status = 'active'`, columnas de ciclo de vida a `NULL`, fila de la cola borrada y
visibilidad de su vivienda refrescada, todo en la transacción de la página.

**Alternativa descartada.** Una tabla de eventos de ciclo de vida sin consumidor en este paso; una
tabla 1:1 de ciclo de vida (un `join` más en cada lectura).

---

## 107 — Tombstone a los 180 días: redacción por `UPDATE`, excepción explícita a «`listings` no se sobrescribe»

**Estado:** aceptada. Excepción autorizada a la regla de `CLAUDE.md`.

**Decisión.** Un anuncio `inactive` con `inactive_since ≤ now() − 180 días` (lotes de 500, `FOR
UPDATE SKIP LOCKED`, índice parcial) pasa a `status = 'removed'` con `tombstoned_at`, y se ponen a
`NULL` `listing_versions.description` y `raw` de TODAS sus versiones y `listings.thumbnail_url`: ahí
vive el contenido libre y el payload de la fuente. Se conservan la fila del anuncio, el precio y
los campos estructurados de cada versión (historial), `listing_features`, `dedup_pair_evidence` y
`dedup_runs`. Nada se borra y ninguna FK en cascada se dispara. El tombstone no toca
`property_listings`, pero esa tabla no es evidencia inmutable: cada reproceso de dedup reconstruye
`properties` y `property_listings` desde los anuncios, con puntuación y desglose recalculados. La
evidencia que perdura es `dedup_pair_evidence`. Si algo se redacta, el tick queda sucio y el
reproceso de dedup reconstruye las cachés de las viviendas. Hasta ese reproceso,
`properties.description` y `thumbnail_url`, copiadas del anuncio ganador, pueden conservar el
contenido redactado. Si ese reproceso falla, el siguiente tick ya no queda sucio por el tombstone y
la copia persiste hasta el próximo barrido completado. Como la selección del ganador lee la
descripción, el ganador puede cambiar tras el tombstone. **Reaparición:** el `upsert` del escritor pone `status = 'active'`, limpia
`tombstoned_at` y rellena `thumbnail_url` SOLO si el anuncio tenía tombstone (`CASE` sobre la fila
anterior; la congelación de la decisión 059 sigue valiendo para los demás); si la última versión
está redactada (`raw IS NULL`) se inserta una versión nueva aunque nada haya cambiado.

**Desviación del diseño.** El diseño no cambiaba `status`; se adoptó `removed` (valor ya admitido
por el `CHECK` y ya tratado por el detalle como "retirado") para que el estado sea autosuficiente.

**Alternativa descartada.** Borrado duro: las FK en cascada destruirían `property_listings` y la
evidencia de dedup, que son el material de evaluación del TFM. Cambiar las FK a `RESTRICT`: no hace
falta si no se borra.

**Consecuencia.** La redacción es irreversible: el contenido solo se recupera si la fuente vuelve a
publicar el anuncio. `CLAUDE.md` debe recoger la excepción.

---

## 108 — Purga de zona como reinicio de cobertura, no como borrado

**Estado:** aceptada.

**Decisión.** Una zona con `d ≥ 180` se reinicia, por job (zona Z, fuente S), en una transacción
que vuelve a comprobar la condición (job sin reclamar y demanda aún ≥ 180 días): (a) los anuncios
activos de S dentro del círculo de Z (`locations.centroid` + `sweep_radius_m`) y fuera del círculo
de cualquier otra zona con job de S pasan a `inactive` / `zone_purged` y siguen el plano de 180 días
del tombstone; (b) se refresca la visibilidad; (c) se borra el job y su cola de presencia; (d) si la
zona no conserva ningún otro job, se borran sus señales y (e) vuelve a `uncovered` con
`last_swept_at` NULL. Las zonas se procesan en secuencia, máximo 20 por pasada; la avería de una
zona se revierte sola y no impide las siguientes. No gasta cuota. Los anuncios sin coordenadas
nunca se retiran (límite conocido).

**Alternativa descartada.** Borrar la fila de `zones` (prevista en la propuesta): es el catálogo INE
sembrado que consultan la interfaz y `locations-query`, y borrarla rompe el autocompletado. Un
`zone_id` por anuncio: los círculos se solapan y un anuncio pertenece a varias zonas.

---

## 109 — Visibilidad en la búsqueda solo con anuncios activos

**Estado:** aceptada. Afina las decisiones 006 y 068.

**Decisión.** `properties.active_listing_count` (caché, rellenada desde `listing_count` en la
migración `0014`) y `min_price_cents` como mínimo entre los anuncios activos, o entre todos cuando
ninguno lo está. Una sola función, `refreshPropertyVisibility(executor, scope)`, la usan la
consolidación, la reactivación, la verificación, la purga de zona y el tombstone. La búsqueda añade
`active_listing_count > 0`; bloqueo, hidratación y agrupación siguen sin mirar el estado (068) y el
detalle lista también los inactivos. El precio que se muestra pasa de «el más económico del grupo»
a «el más económico de los anuncios activos».

**Alternativa descartada.** Calcularlo en la consulta de búsqueda con un `join`: rompe los planes
medidos en la decisión 100. Excluir los inactivos del agrupamiento: reagruparía y perdería la
evidencia que alimenta la evaluación.

**Consecuencia.** El filtro es un filtro de montón sobre los recorridos de índice ordenados; ver
`docs/SEARCH-PERFORMANCE.md`.

---

## 110 — Aislamiento de fallos por paso en el tick del worker

**Estado:** aceptada.

**Decisión.** `runIsolatedStep(ports, nombre, fn)` captura el error de cada paso de mantenimiento o
verificación, registra `paso "<nombre>" falló: <mensaje>` (solo el mensaje, sin credenciales) y
sigue. Orden del tick: `purgeClientQuota` (sin envolver, comportamiento 1.15) → señales → ciclo de
vida de zonas (si falla, se omiten purga y re-encolado, pero no el tombstone) → purga de zonas →
re-encolado → tombstone → barrido → nominación tras un ciclo completado → verificación → `runDedup`
si el tick está sucio. El barrido conserva su semántica: solo `JobAlreadyClaimedError` no es fatal.

**Alternativa descartada.** Dejar propagar todo: una avería de mantenimiento pararía los barridos,
que son lo que gasta la cuota. Un único `catch` alrededor del tick: no dice qué paso falló.

---

## 111 — Supuesto documentado: ninguna fuente fija un plazo de retención

**Estado:** aceptada como supuesto, con riesgo abierto para el TFM.

**Decisión.** Los 180 días del tombstone y de la purga son una elección del proyecto, no una
obligación de ninguna fuente. La documentación de la API de Idealista en `docs/api_idealista` no
contiene ninguna cláusula de retención; las condiciones de Kyero no se han obtenido. La regla de
`docs/ARCHITECTURE.md` se mantiene: si las condiciones de una fuente fijan un plazo máximo, ese
plazo prevalece.

**Alternativa descartada.** Fijar un plazo como si viniera de la fuente.

**Consecuencia.** Riesgo a declarar en la memoria: si un contrato real exige menos de 180 días, basta
con cambiar las constantes de `policy.ts`; las purgas reciben los números por parámetro.

---

## 112 — CSP: `img-src` admite el host de teselas de OpenStreetMap; atribución «© OpenStreetMap» enlazada

**Estado:** aceptada. Enmienda la decisión 080 (`img-src`).

**Decisión.** `img-src` pasa a `'self' blob: data: https://tile.openstreetmap.org`; ninguna otra
directiva cambia y no se añade `connect-src`. La plantilla de teselas es
`https://tile.openstreetmap.org/{z}/{x}/{y}.png` y el literal aparece en `src/` solo en
`search-map-canvas.tsx` (un test lo fija). La atribución es el literal exacto `© OpenStreetMap`,
enlazado a `https://www.openstreetmap.org/copyright`, en el control de atribución de Leaflet y en el
marcado que renderiza el servidor en la sección del mapa; un test comprueba el literal y el enlace.

**Alternativas descartadas.** (1) Proxy de teselas del mismo origen: es una llamada externa desde
`apps/web`, contra la regla de `CLAUDE.md`. (2) Subdominios `a/b/c`: amplían la política sin
necesidad. (3) Atribución en el pie de `layout.tsx`: afirmaría OSM en páginas sin teselas; el pie
del CNIG queda sin cambios.

**Motivo.** El navegador del usuario carga las teselas; el servidor no hace ninguna petición
externa, así que la regla de no consultar fuentes externas en la búsqueda se mantiene.

**Enmienda de la 080.** La 080 fijaba `img-src 'self' blob: data:`; esta decisión añade solo el
host de teselas.

---

## 113 — El allowlist de `'use client'` crece a DOS ficheros; dependencias del mapa con versión exacta

**Estado:** aceptada. Enmienda la decisión 065.

**Decisión.** Versiones exactas, sin `^`: `leaflet` 1.9.4, `react-leaflet` 5.0.0,
`leaflet.markercluster` 1.5.3, `@types/leaflet` 1.9.22 y `@types/leaflet.markercluster` 1.5.6. El
allowlist pasa a `coverage-status.tsx` y `components/search-map.tsx`, que carga el lienzo con
`next/dynamic(() => import('./search-map-canvas'), { ssr: false })`. Los módulos de Leaflet (lienzo,
capa de clústeres, control de dibujo) no llevan directiva: son código de cliente por el grafo de
imports, y un test lo fija. Los marcadores son `L.divIcon` construidos con `textContent` del DOM.

**Alternativas descartadas.** Leaflet sin `react-leaflet`; `dynamic` en `page.tsx` (Next 16 lo
rechaza en Server Components); marcadores de imagen por defecto; un envoltorio de clústeres para
`react-leaflet`.

**Motivo.** El mapa necesita `window`, así que ha de ser cliente. Un único envoltorio en el
allowlist mantiene el hueco del ancho mínimo, como pedía la 065.

**Enmienda de la 065.** El allowlist deja de ser de UN fichero; el test sigue con sus tres
aserciones sobre la lista de dos.

---

## 114 — Control de dibujo propio en lugar de un plugin de dibujo

**Estado:** aceptada (el responsable sustituyó el «plugin de dibujo» de la propuesta P2).

**Decisión.** Un clic en el mapa añade un vértice. Botones: Dibujar zona, Deshacer, Cerrar,
Cancelar y Quitar zona. El reductor puro `draw-polygon-state.ts` redondea a 5 decimales y bloquea el
vértice 51. Al cerrar llama a `validatePolygonRing` de `core`: si la forma no es válida muestra el
mensaje y no navega. Los vértices no se editan; se vuelve a dibujar. Son unas 150 líneas, probables
sin DOM.

**Alternativas descartadas.** `leaflet-draw` 1.0.4: sin mantenimiento desde 2018, CSS con sprite y
un `ReferenceError` conocido en `showArea`. `@geoman-io/leaflet-geoman-free`: pesado, con casi todas
sus funciones sin uso.

**Motivo.** Se necesita un polígono simple y validado por la misma función que el servidor.

---

## 115 — Formato y validación del parámetro `polygon`

**Estado:** aceptada

**Decisión.** `polygon=lat,lng;lat,lng;...`, anillo abierto; en el WKT el orden se invierte a
`lon lat`. Las comprobaciones van en este orden y cada una da un error con nombre que identifica
`polygon`: (1) valor no único (clave repetida) → error de tipo; (2) longitud decodificada > 1.100 →
`too-long`, antes de partir; (3) vacío, separadores mal o cuenta impar → `malformed` (vacío nunca
significa ausente); (4) vértice `^-?\d{1,3}(\.\d{1,5})?$`: más decimales → `malformed`, y el servidor
nunca redondea; (5) fuera de rango → `out-of-range`; (6) menos de 3 o más de 50 vértices →
`too-few`/`too-many`; (7) vértice repetido, incluido un cierre duplicado → `duplicate-vertex`; (8)
TODOS los vértices colineales → `degenerate`; (9) cualquier contacto entre aristas, incluidas las
formas de área cero que no son colineales (lazo) → `self-intersecting`; (10) área > 2.500 km² →
`too-large`. Exclusividad: `polygon` con `zone` o con cualquiera de `lat`/`lng`/`radius` se rechaza
con un mensaje que nombra los parámetros presentes.

**Alternativas descartadas.** Codificación polyline de Google; GeoJSON en la URL; tolerar o
normalizar el vértice de cierre (la especificación lo normalizaba; el responsable decidió rechazar).

**Motivo.** Un anillo abierto tiene una única forma canónica. El máximo legal son 1.049 caracteres.
El tope de 2.500 km² mantiene las consultas en el régimen medido para el radio de 25 km (1.963 km²).
La aritmética es entera (coordenadas × 1e5), exacta y bajo 2^53.

---

## 116 — El polígono se aplica con `ST_Covers` sobre `geography`, con el WKT como parámetro

**Estado:** aceptada

**Decisión.** `ST_Covers(ST_GeogFromText($wkt), properties.location_geography)`. El WKT de anillo
cerrado se construye en `spatial.ts` (`polygonWkt`, `polygonCovers`, decisión 019) y va siempre como
parámetro enlazado, nunca concatenado. Usa el índice GiST existente; sin migración.

**Alternativas descartadas.** `ST_Covers` sobre la columna `geometry` (no tiene GiST y exigiría una
migración); `ST_Contains` (excluye el borde); un parámetro por vértice.

**Consecuencia.** Las aristas son geodésicas: una de 50 km a 40° N se desvía unos 40 m de la línea
plana, y se acepta. Los tests de frontera usan puntos en VÉRTICES.

---

## 117 — Consulta de puntos del mapa con `LIMIT 501`, recuento exacto solo al truncar y M acotado

**Estado:** aceptada. Refina la decisión 058.

**Decisión.** `buildFilters` pasa a `packages/db/src/search-filters.ts`, compartido por lista y mapa.
`buildMapPointsQuery` = filtros + `"properties"."location" IS NOT NULL`, el MISMO `ORDER BY` que la
lista (índices de la 100) y `LIMIT 501`. `searchMapPoints` conserva 500 filas; la 501 solo señala
truncamiento y se descarta. Con 500 filas o menos, M = N sin segunda consulta; con 501 se ejecuta
`count(*)` con el mismo `WHERE`. M cuenta solo viviendas con ubicación. `page` se ignora. Como no hay
instantánea compartida entre las dos consultas, el total se acota a CAP+1 (`truncatedMapTotal`) para
no mostrar «500 de 498».

**Alternativas descartadas.** `COUNT(*) OVER()` (la 058 lo había descartado); la estimación del
planificador (la 101 muestra que se equivoca en geografía); agrupar en el servidor.

**Motivo.** Un mapa necesita puntos, no páginas, y el recuento caro solo se paga cuando hay más de 500.

---

## 118 — Esquema de `view`, el mapa sustituye a la lista, avisos y ausencia de efectos de cobertura

**Estado:** aceptada

**Decisión.** `view` tiene su propio `searchViewSchema` (`list` | `map`; ausente → lista; otro valor →
rechazo con nombre) y no forma parte de los criterios. La vista de mapa SUSTITUYE a la lista y el
paquete de la lista nunca importa el mapa. El servidor siempre renderiza: «M viviendas con ubicación
coinciden» (sin polígono añade que puede diferir del total de la lista), «Mostrando 500 de M» solo
si M > 500, un aviso de ubicación aproximada, la atribución de OSM y un `noscript` con enlace a la
lista. Con M = 0, mensaje de vacío; con polígono, además el aviso «puede que la zona no esté
cubierta», que aclara que una zona dibujada no solicita barridos. En la lista aparece solo con
polígono, página 1 y 0 resultados. Un polígono nunca consulta cobertura, nunca escribe
`coverage_jobs` ni `zone_query_signals` y nunca consume cuota.

**Alternativas descartadas.** Mapa y lista a la vez; detección exacta de «zona no cubierta».

**Motivo.** Sin un municipio no hay `coverage_job` posible, y crear señales de demanda con un dibujo
libre ensuciaría la política de refresco de la 103.

---

## 119 — Etiqueta de precio y enlace construidos en el servidor; popups con DOM; `formatPriceCents` compartida

**Estado:** aceptada

**Decisión.** El servidor convierte cada punto en `{ id, lat, lon, priceLabel, href }`, con
`priceLabel = formatPriceCents(minPriceCents)` y `href = buildPropertyDetailHref(anchorListingId)` o
`null`. Un clic abre un popup construido con `textContent` y un `<a href>` plano «Ver vivienda» en la
misma pestaña; sin `href` no hay enlace. `formatPriceCents` (duplicada en `result-card.tsx`,
`property-header.tsx` y `source-list.tsx`) pasa a `apps/web/src/lib/format-price.ts` (nulo → «Precio
no disponible») y la usan los tres y las etiquetas del mapa.

**Alternativas descartadas.** Formatear en el cliente (duplica la lógica y arrastra `Intl` al
bundle); `router.push` al hacer clic en el marcador.

**Motivo.** Una sola fuente del formato de precio y ningún HTML interpolado desde datos de anuncios.

---

## 120 — La interpretación de lenguaje natural es un intérprete determinista en `core`, sin LLM

**Estado:** aceptada

**Decisión.** `interpretSearchText(texto)` en `packages/core/src/nl-search/` es una función pura y
determinista (tokenizador, importes, vocabulario y reglas) que devuelve una `NlSearchInterpretation`:
parámetros reconocidos, fragmentos no entendidos y texto del lugar. Esa interpretación es el punto de
sustitución: otra implementación (por ejemplo un modelo de lenguaje) tendría que producir el mismo
tipo. Nunca emite `page`, `view`, `lat`, `lng`, `radius`, `polygon` ni `zone`; los parámetros pasan
por el mismo `searchQuerySchema` que los filtros.

**Alternativas descartadas.** Un LLM llamado desde el servidor de `apps/web`, desde el navegador o
desde un canal lateral de `apps/ingestion`.

**Motivo.** El servidor de `apps/web` no puede llamar a servicios externos en tiempo de búsqueda ni
guardar sus credenciales (reglas de `CLAUDE.md`), el navegador tampoco puede hacerlo sin ampliar la
CSP, y un canal por `apps/ingestion` añade latencia y estado a una función que debe responder al
momento. Un intérprete determinista se puede medir sobre un corpus etiquetado (decisión 124) y se
prueba sin red.

---

## 121 — Los precios en la URL son euros con hasta dos decimales y se convierten a céntimos

**Estado:** aceptada

**Decisión.** `minPrice` y `maxPrice` se leen como euros con la forma `^\d+(\.\d{1,2})?$` y se
convierten con `Math.round(valor * 100)`; el resultado debe cumplir `Number.isSafeInteger`. Un precio
con más de dos decimales, negativo, vacío o fuera de rango seguro se rechaza. Cambia el comportamiento
de las URL existentes: antes el valor pasaba sin convertir y se trataba como céntimos (error latente
corregido dentro del 3.1).

**Alternativas descartadas.** Mantener céntimos en la URL y convertir solo en el intérprete;
redondear en silencio los decimales sobrantes.

**Motivo.** Una frase como «hasta 900 euros» y un formulario editable tienen que hablar la misma
unidad que ve el usuario; convertir solo en un lado dejaba dos significados para el mismo parámetro.
Rechazar en lugar de redondear evita aceptar un precio distinto del escrito.

---

## 122 — `?q=` es una rama aparte que interpreta y pide confirmación; solo una coincidencia exacta selecciona zona

**Estado:** aceptada

**Decisión.** Si `q` está presente en la URL (incluso vacío o con criterios), la página renderiza solo la
interpretación: no llama a `searchProperties`, `searchMapPoints`, `resolveZoneGeometry`, cobertura,
señal de demanda ni cuota. `q` se valida con `nlQuerySchema` (texto, 1-200 caracteres); si no es
válido se muestra un mensaje con `role="alert"` y no se interpreta. El lugar se resuelve contra
nuestra base con `suggestZones` en modo solo lectura, con `PLACE_SUGGESTION_LIMIT = 25` (el
autocompletado usa 10): exactamente una coincidencia exacta del nombre normalizado selecciona esa
zona; cualquier otro caso con una o más sugerencias ofrece un grupo de radios con «Sin zona» marcado;
sin sugerencias, «en <lugar>» se añade a «No he entendido:». Estrecha a propósito el escenario de la
especificación «una coincidencia, zona fijada»: una única coincidencia por prefijo se ofrece, no se
selecciona (por ejemplo «madrid» frente a «madridejos»). `suggestZones` ordena por `search_name`, así
que un nombre exacto precede siempre a sus extensiones y el límite no lo oculta. Varias coincidencias
exactas (mismo nombre en provincias distintas) también se ofrecen.

**Alternativas descartadas.** Redirigir de `?q=` a la búsqueda con los criterios ya interpretados;
seleccionar zona con una única coincidencia por prefijo.

**Motivo.** El usuario debe poder corregir la interpretación antes de buscar (enunciado del paso), y
elegir sola una zona por prefijo falla en el caso común de un municipio cuyo nombre es prefijo de otro.
Mantener la rama sin efectos conserva la regla de no consultar fuentes externas y evita gastar cuota o
registrar señales por una frase que aún no se ha confirmado.

---

## 123 — El formulario de criterios marca `form=criteria` y la página limpia los campos vacíos

**Estado:** aceptada

**Decisión.** El formulario de criterios envía un campo oculto `form=criteria`. En el límite de la
página, `canonicalizeFormSubmission` (`apps/web/src/lib/search-href.ts`) descarta el marcador y los
valores vacíos tras recortar, incluidas las entradas vacías de los arrays, y solo cuando
`form === 'criteria'`. Un `?minPrice=` sin marcador se sigue rechazando por su nombre. Los
constructores de enlaces reciben los parámetros ya limpios, de modo que la paginación no arrastra
`form=criteria`. Es un formulario de servidor: sin `redirect()` y sin JavaScript de cliente (el
allowlist de `'use client'` sigue en dos ficheros, decisión 113).

**Alternativas descartadas.** Redirigir tras el envío para limpiar la URL (choca con la guarda
estática de `redirect()`); aceptar `''` como ausente en el esquema (debilitaría la validación para
cualquier URL escrita a mano); un script de cliente que retire los campos vacíos.

**Motivo.** Un formulario HTML envía los campos vacíos, y el esquema no debe tratarlos como valor. La
limpieza en el límite de la página, acotada al marcador, mantiene estricta la validación del resto de
entradas.

---

## 124 — Formato del corpus de lenguaje natural, partición desarrollo/reserva, recuentos fijados e intervalo de Wilson

**Estado:** aceptada

**Decisión.** `packages/core/src/evaluation/nl-search-corpus.ts` contiene 42 frases etiquetadas: 28
de desarrollo y 14 de reserva (`holdout`), con negativos difíciles (lugar inexistente, varios
municipios, «900 €» sin contexto, «más de N habitaciones»). Cada frase declara sus `params` esperados,
que han de pasar `searchQuerySchema`. `nl-search-evaluate.ts` puntúa por campo (acierto, omisión,
error, espurio) y reutiliza `wilsonInterval` con confianza del 95 %. El test fija los aciertos y exige
cero errores y espurios en los negativos. Medición al cerrar la U2b: reserva 13/14 = 92,9 % [68,5;
98,7]; desarrollo 26/28 = 92,9 % [77,4; 98,0] (24/28 antes de ajustar); total 39/42 = 92,9 % [81,0;
97,5]. La cifra sin sesgo es la de reserva; la de desarrollo es optimista porque el intérprete se
ajustó sobre ella.

**Alternativas descartadas.** Un único conjunto sin partición; informar solo del porcentaje sin
intervalo.

**Motivo.** Con 14 frases de reserva el intervalo es ancho: el porcentaje sin él sugeriría una
precisión que la muestra no da. Fijar los recuentos en el test convierte cualquier regresión del
intérprete en un fallo visible.

---

## 125 — Los scripts raíz `test`, `typecheck` y `lint` compilan antes los paquetes

**Estado:** aceptada (enmienda la consecuencia de la 031)

**Decisión.** Los tres scripts de la raíz empiezan por `pnpm --filter "./packages/*" build`, igual
que `dev`, `dev:web` y `dev:ingestion`. Los consumidores (`packages/db`, `apps/web`,
`apps/ingestion`) siguen resolviendo los paquetes internos por su `dist/` compilado.

**Alternativas descartadas.** Scripts `pretest`/`pretypecheck`: pnpm no ejecuta los scripts `pre*`
por defecto. Resolver los paquetes por sus fuentes (alias de Vitest o `paths` de TypeScript):
cambia el modelo de consumo de la 031 y haría que tests y build vieran código distinto. Dejarlo a
un paso de CI: el repositorio no tiene CI.

**Motivo.** Con `dist/` desactualizado, los tests y el typecheck de los consumidores validan la
versión anterior del paquete sin avisar. Pasó en la 031, en el paso 1.12 (`AI-NOTES.md`, 2026-09-18) y en el
3.1. El coste es una compilación de `tsc` por ejecución.

---

## 126 — El plan de diseño de la web es un fichero aparte, `docs/DESIGN-ROADMAP.md`, con pasos `D.n`

**Estado:** aceptada

**Decisión.** El diseño de `apps/web` se planifica en `docs/DESIGN-ROADMAP.md`, con el mismo formato
que `docs/ROADMAP.md` (prompt, Objetivo, Revisar, Notas), pasos numerados `D.0`-`D.17` y su propio
registro de desviaciones. `docs/ROADMAP.md` lo enlaza desde la cabecera, y el registro obligatorio
de `CLAUDE.md` dirige los pasos `D.n` a ese fichero. Cada paso se ejecuta como un cambio SDD propio.

**Alternativas descartadas.** Una «Fase 4» dentro de `docs/ROADMAP.md`: el fichero ya ronda las 2000
líneas y mezclaría la hoja de ruta funcional, ya completa, con la de diseño, que tiene otros
artefactos (`PRODUCT.md`, `DESIGN.md`, capturas de referencia).

**Motivo.** Separar las dos hojas de ruta también separa el material del capítulo de proceso. El
riesgo de que diverjan se cubre con el enlace y con la regla de `CLAUDE.md`.

---

## 127 — Estilos con Tailwind v4, tokens en `@theme` y componentes propios

**Estado:** aceptada (confirma la 010)

**Decisión.** El diseño usa Tailwind v4 con tokens en `@theme` dentro de `globals.css` y componentes
escritos en el proyecto.

**Alternativas descartadas.** Una biblioteca *headless* (Radix, Base UI) y shadcn.

**Motivo.** Ambas traen componentes de cliente y dependencias que chocan con el allowlist de dos
ficheros de `'use client'` (decisión 113) y con el funcionamiento sin JavaScript. La 010 ya retuvo
Tailwind v4.

---

## 128 — Tema oscuro según el sistema, con selector

**Estado:** aceptada

**Decisión.** La web sigue `prefers-color-scheme` por defecto y ofrece un selector (claro, oscuro,
sistema). La lectura de la preferencia y su efecto sin JavaScript se deciden en el paso D.4.

**Alternativas descartadas.** Solo tema claro; solo el tema del sistema, sin selector.

**Motivo.** El usuario quiere poder fijar el tema. El coste es un script en línea, que la CSP ya
admite, y un Route Handler para el caso sin JavaScript.

---

## 129 — Móvil y escritorio pesan lo mismo

**Estado:** aceptada

**Decisión.** Cada pantalla se diseña y se verifica a 320, 768 y 1280 px. Ningún ancho es secundario.

**Alternativas descartadas.** Primero móvil (fue la primera respuesta del responsable, que la cambió
después) y primero escritorio.

**Motivo.** La búsqueda inmobiliaria se usa en los dos contextos, y la investigación recomienda
disposiciones distintas para cada uno (vista dividida en escritorio, lista primero en móvil).

---

## 130 — Verificación visual con Playwright y axe, con capturas de referencia generadas en Linux

**Estado:** aceptada

**Decisión.** El paso D.1 añade Playwright y `@axe-core/playwright` como dependencias de desarrollo
de `apps/web`, con una base de datos sembrada, teselas falsas y capturas de referencia generadas en
Docker (Linux).

**Alternativas descartadas.** Solo el MCP de Playwright: sirve para explorar, pero no deja una prueba
reproducible ni versionada. Solo revisión manual: no deja evidencia comparable entre pasos.

**Motivo.** Las capturas de referencia dependen de la plataforma; generarlas siempre en Linux evita
diferencias falsas entre Windows y el contenedor.

---

## 131 — Las funciones nuevas de la ficha son pasos propios del plan de diseño

**Estado:** aceptada

**Decisión.** El histórico de precios (D.10), el mapa de ubicación (D.11) y la comparación de fuentes
(D.12) entran en el plan como pasos separados de la presentación de la ficha (D.9).

**Alternativas descartadas.** Limitar el plan a diseño puro, sin funciones nuevas.

**Motivo.** Los datos ya existen (`listing_versions`, coordenadas, anuncios por vivienda) y dan
sentido a la ficha. Separarlos mantiene cada paso dentro del presupuesto de revisión y deja claro qué
pasos añaden consultas.

---

## 132 — Contrato de dirección visual: Buscahogar, herramienta factual, mundo «Hoja del Mapa Topográfico»

**Estado:** aceptada. Cierra el paso D.0 junto con la 133 (ficha) y la 134 (registro del texto). No
cambia la 128 (tema oscuro según el sistema, con selector).

**Decisión.**

- **Nombre:** Buscahogar. Sustituye a «Agregador inmobiliario» en la interfaz; el cambio en el título
  y la cabecera es de D.5.
- **Tono:** herramienta factual. Voz de servicio, datos claros y sin lenguaje comercial. Referencias
  del responsable: comparadores como Google Flights o Kayak (precio protagonista, densidad y filtros
  visibles).
- **Tipografía:** pila tipográfica del sistema, sin fuentes propias; la CSP no cambia. Cifras
  tabulares en precios y datos comparables.
- **Paleta (intención; los tokens y el contraste los fija D.3).** Estrategia contenida: neutros y un
  solo acento.
  - `#ffffff`: fondo.
  - `#1c1f22`: tinta, para texto y cifras.
  - `#e4e2dc`: filetes y superficie neutra. Sobre blanco no llega a 3:1, así que no sirve como
    borde de un control; D.3 define ese borde aparte.
  - `#1f5fa8`: acento único, azul de hidrografía, para enlaces, selección y foco.
  - `#b0662b`: siena, solo para la trama de lo aproximado. Nunca texto, fondo ni acento.
- **Densidad:** alta y constante, como en un comparador: filas de altura fija y mucho dato por
  pantalla, con objetivos de al menos 24 px (C12) y sin desplazamiento horizontal a 320 px (R10).
- **Tema:** el claro es la referencia de este contrato. La paleta oscura no se decide aquí: depende
  de los experimentos de D.2 (huecos b y c) y la deriva D.3.
- **Disposición de la búsqueda:** en escritorio, vista dividida, con la barra horizontal de filtros y
  orden arriba, la lista a la izquierda y el mapa a la derecha, sin superposiciones sobre el mapa
  (C1, C2, C4). En móvil, la lista primero y el conmutador «Ver mapa», que sigue siendo un enlace
  con `view` (C3, C4, R3). La disposición a 768 px la decide D.8a.
- **Mundo visual: «Hoja del Mapa Topográfico»**, con la hoja del Mapa Topográfico Nacional 1:25.000
  del IGN como linaje. El contrato, en los seis bloques de impeccable:
  - **THESIS.** Cada búsqueda es una hoja de mapa: margen sobrio, leyenda que filtra y dato al
    milímetro. Rechaza la disposición por defecto del sector: tarjetas de resultado con foto grande
    como unidad de lectura.
  - **OWN-WORLD.** Fondo blanco, tinta casi negra, filetes finos como el marco de la hoja, un único
    azul para lo que se pulsa y una sola trama rayada en siena para lo aproximado. Cifras tabulares.
    Un solo marco y una sola trama: ninguna otra marginalia cartográfica.
  - **STORY.** El usuario ve cada vivienda una vez, con su precio más económico y el número de
    fuentes en que aparece. Compara filas de un vistazo, abre la ficha y llega al anuncio de origen.
    Confía en que dos filas son dos viviendas y en que lo aproximado está marcado.
  - **FIRST VIEWPORT.** En escritorio, arriba va la barra de filtros, leída como la leyenda de la
    hoja y con la acción principal. Debajo, la lista densa a la izquierda, con los precios en una
    columna fija a la derecha, y el mapa a la derecha, enmarcado como una hoja. En móvil, la barra
    de filtros y la lista; el mapa, tras «Ver mapa». Interacción propia: la leyenda filtra, y cada
    filtro aplicado se lee y se quita desde ella. El movimiento es de D.16.
  - **FORM.** «Hoja del Mapa Topográfico». Ocupa la posición 3 de la lista propia, ordenada por
    resonancia, y la asignó el sorteo con la semilla `95c485be` (modo *operate*). Ruta *code-led*:
    sin imagen de referencia, así que la ambición vive en este contrato.
  - **FINISH.** Texto literal de impeccable, que se conserva en inglés. En este plan, la revisión
    final y `DESIGN.md` corresponden a D.17.

    «unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance»
- **Mejoras tomadas de los aspirantes descartados.** Cada una viene de su donante, y se toma la
  disciplina, no el aspecto:
  - Retícula de Crouwel: «Una retícula estricta y declarada, común a lista, mapa y ficha, como la cuadrícula de la hoja.»
  - Folio botánico: «Misma escala y mismo fondo en toda comparación: fotos a proporción fija e histórico con eje constante.»
  - Carátula de casete (*j-card*): «Los precios ocupan una columna derecha fija con cifras tabulares, pegada al margen.»
  - Muestrario de Emigre: «Escala tipográfica cerrada en pocos pasos, sin tamaños intermedios.»
  - Muestrario de fuente variable: «Cero ornamento: la jerarquía la llevan solo el tamaño y el peso.»
- El contrato es de desarrollo. No se copia al código ni a nada que llegue al navegador
  (comentarios, atributos, metadatos). Los pasos que usen impeccable lo toman de aquí.

**Alternativas descartadas.**

- «Horario de bolsillo» (horarios de aerolínea de 1971: un único cuerpo de letra, con el rango
  marcado por el peso), alternativa competitiva. Gana en claridad para comparar en densidad, pero
  quien busca piso no se reconoce en un horario aéreo, y su fondo dorado choca con lo sobrio.
- «Anuncios por palabras» (Segundamano y las páginas de pisos de los diarios), la propuesta preferida
  de la skill. Es la más cercana a lo que ya hacen los comparadores y, en móvil, se vuelve críptica
  si abrevia como el papel.
- El estándar del sector (un comparador limpio al estilo de Google Flights, con tarjetas con foto):
  indistinguible de la competencia.
- Fuente propia autoalojada con `next/font/local`: daría una identidad uniforme y cifras
  controladas, a cambio de 30-80 KB y de elegir la fuente. La pila del sistema no pesa nada, no hace
  peticiones y cumple la CSP sin tocarla.
- Tono de portal del sector (convenciones de Idealista o Fotocasa): se reconoce al instante, pero la
  identidad se diluye.
- Conmutador lista/mapa en todos los anchos, como hoy: en escritorio se pierde la relación entre la
  lista y el mapa. Mapa primero: favorece explorar zonas, pero C1-C4 respaldan la vista dividida.

**Motivo.** Buscahogar es una herramienta de uso frecuente con una ficha de lectura (`PRODUCT.md`):
la paleta contenida, la densidad y las cifras tabulares sirven para comparar. El mundo cartográfico
sale del propio producto (zonas, mapa, ubicación aproximada, nomenclátor del IGN en el pie) y le da
un lugar visual a la incertidumbre. Lo decidió el responsable el 2026-10-01. El contrato evita que
D.1-D.17 apliquen los valores por defecto de la skill (manda el brief).

---

## 133 — Presentación de la ficha de la vivienda

**Estado:** aceptada. Resuelve el hueco a de la investigación de diseño. La aplican D.9
(presentación), D.10 (histórico), D.11 (ubicación) y D.12 (comparación), según la 131.

**Decisión.** Punto por punto, con el paso que lo construye:

1. **Disposición (D.9).** En escritorio, dos columnas. A la izquierda van la galería y la
   descripción; a la derecha, un panel fijo (`position: sticky`, sin JS) con el precio, los datos
   clave y los anuncios de origen. En móvil se apila: precio → galería → resto. D.10 y D.11 sitúan
   sus secciones dentro de esta disposición. D.9 comprueba que el panel no tape el foco (C10) y que
   no quede cortado cuando no cabe en la altura de la ventana.
2. **Precio (D.9).** Es el más económico de los anuncios activos y, si no hay ninguno activo, el
   mínimo de todos (109). Es la cifra con más peso de la ficha, con cifras tabulares.
3. **Datos clave (D.9).** Lista de definiciones con etiquetas en español (134). «No consolidado —
   ver anuncios de origen» se explica una vez, no en cada campo, y no usa la trama, porque no es una
   ubicación aproximada (132).
4. **Anuncios de origen junto al precio (D.9 los sitúa; D.12 los compara).** Van en el panel,
   pegados al precio: la fuente con su nombre legible, el precio de cada anuncio y un enlace saliente
   reconocible, con «(no disponible)» como insignia. Con una sola fuente es una lista de una fila. El
   más económico de los activos va marcado (109). El cálculo en `packages/core`, los empates y el
   caso sin anuncios activos son de D.12.
5. **Galería (D.9).** Sigue el patrón de carrusel de la APG: estática, la mueve el usuario, sin
   avance automático, con «Foto N de M» y anclas sin JS (C15, C16). Todas las fotos tienen la misma
   proporción fija (132) y un ancho fluido en lugar de 480 px. Siempre con `next/image` (R2). El alt
   lo decide D.9.
6. **Histórico de precios (D.10).** Un gráfico escalonado pequeño en SVG, generado en el servidor,
   y una tabla accesible con fecha, fuente, precio y variación. Funciona sin JS. Todos los anuncios
   de la vivienda comparten los mismos ejes (eje constante, 132). D.10 diseña el caso de una sola
   versión.
7. **Ubicación aproximada (D.11).** Un mapa estático renderizado en el servidor, sin JS y sin zoom.
   Lo forman unas pocas teselas de `tile.openstreetmap.org` como `<img>` nativo, que pide el
   navegador, y encima el área aproximada con la trama siena, nunca un punto exacto. Lleva el texto
   «Ubicación aproximada» y la atribución «© OpenStreetMap» enlazada (R7, 112). El servidor solo
   calcula qué teselas pedir y no descarga ninguna (R8). No hay ningún componente de cliente nuevo
   (R4). El radio del área se fija con datos reales (coordenadas ofuscadas, `CLAUDE.md`).

**Excepción a R2: la registra D.11.** R2 prohíbe el `<img>` nativo, y `csp-image-policy.test.ts` lo
vigila. Servir las teselas con `next/image` haría que el optimizador las descargase desde el
servidor, contra R8. El responsable lo resolvió el 2026-10-01: D.11 registra su propia decisión, que
enmienda R2 con una excepción acotada (`<img>` nativo solo para teselas de `tile.openstreetmap.org`,
el host que la 112 ya admite en `img-src`), y ajusta `csp-image-policy.test.ts` para que admita
exactamente esa excepción y nada más. Esta decisión no enmienda R2. Queda además un punto abierto
para D.11, que el responsable no ha decidido: la 112 y `map-guards.test.ts` (SMV-9) solo admiten hoy
el host de teselas en `search-map-canvas.tsx`, y D.11 tiene que resolver ese límite en su propia
decisión.

**Alternativas descartadas.**

- Disposición: «Precio primero» (una sola columna, con la galería debajo) y «Galería primero» (la
  convención del sector, que aleja el precio).
- Anuncios de origen en una sección al final, como hoy: esconde el mecanismo de agregación.
- Histórico solo en tabla, menos legible de un vistazo, o como una línea de resumen con la tabla
  plegada en `<details>`.
- Ubicación:
  - Mapa interactivo con área difusa: exige JS y ampliar R4 con su propia decisión, como la 113.
  - Teselas como fondos CSS: cumplen la letra de R2, pero esquivan su intención sin dejarlo
    decidido.
  - Solo texto: no orienta visualmente.
  - Teselas con `next/image`: el optimizador las descargaría desde el servidor (R8).

**Motivo.** La investigación no encontró evidencia primaria sobre la ficha (hueco a), así que es una
decisión de producto, tomada por el responsable el 2026-10-01. Poner las fuentes junto al precio
enseña lo único que un portal individual no puede mostrar (`PRODUCT.md`). El mapa estático y la
trama dicen que la ubicación es aproximada sin exigir JavaScript.

---

## 134 — Registro del texto: tuteo uniforme y etiquetas en español

**Estado:** aceptada. Corrige la premisa del prompt de D.0 («hoy tuteo»): el texto actual mezcla
tuteo, primera persona e impersonal.

**Decisión.**

- Todo el texto de la interfaz trata de tú, con la voz factual de la 132 y sin lenguaje comercial.
  Las frases en primera persona («Esto es lo que he entendido», «No he entendido:») y las
  impersonales («No se pudo interpretar la búsqueda», «No se encontraron viviendas con esos
  filtros») se reescriben al tuteo en el paso que toca su pantalla.
- Ningún valor interno llega a la interfaz: ni enumerados en crudo («flat», «rent»), ni la clave de
  la fuente, ni fechas ISO.
- El tipo y la operación usan los rótulos de `apps/web/src/lib/search-labels.ts`
  (`PROPERTY_TYPE_LABELS`, `OPERATION_LABELS`), tipados sobre las uniones del núcleo. No se duplican.
  La fuente se muestra con su nombre legible («Idealista»), nunca con `sourceKey`. Los rótulos que
  faltan (nombre de la fuente, estado del anuncio) siguen el mismo patrón de `Record` tipado.
- Cada texto lo reescribe el paso que ya toca su componente:

| Texto | Hoy | Paso |
|---|---|---|
| Tipo y operación en crudo | `result-card.tsx` | D.6b |
| Tipo y operación en crudo; «No consolidado…» explicado una vez | `property-header.tsx` | D.9 |
| Nombre de la fuente (`sourceKey`) e insignia «(no disponible)» | `source-list.tsx` | D.9 |
| «Esto es lo que he entendido», «No he entendido:», «No se pudo interpretar la búsqueda» en la rama `?q=` | `criteria-form.tsx`, `page.tsx` | D.7 |
| Avisos de cobertura y estado del barrido (fecha ISO, «00:00 UTC») | `page.tsx`, `coverage-status.tsx` | D.13 |
| Estados vacíos y parámetros inválidos («Ninguna vivienda…», «No se encontraron viviendas…», «No se pudo interpretar la búsqueda» de la búsqueda con filtros) | `page.tsx` | D.14 |

**Alternativas descartadas.** Usted: es más formal, pero obliga a reescribir casi todo el texto.
Impersonal («Se han encontrado 12 viviendas»): es más neutro, pero también más largo y más frío.

**Motivo.** El tuteo es lo habitual en los portales españoles y ya domina el texto actual («Describe
lo que buscas»). Las etiquetas existen desde el paso 3.1 y solo las usa `criteria-form.tsx`.

---

## 135 — Base de datos e2e `_e2e`, guard, siembra determinista y subpath puro `@buscahogar/db/e2e`

**Estado:** aceptada

**Decisión.** El paso D.1a (cambio `visual-a11y-verification`) añade una base de datos desechable,
`buscahogar_e2e`, y la siembra en `packages/db/src/e2e/`:

- **Guard** (`guard.ts`, puro): `assertE2eOwnerDatabaseUrl` exige que el nombre cumpla
  `^[a-z0-9_]+_e2e$` (también es un identificador seguro para el `DROP`/`CREATE DATABASE`, que no admiten
  parámetros), que no sea el de la base de desarrollo y que la URL no sea idéntica a `DATABASE_URL` ni a
  `WEB_DATABASE_URL`. `assertE2eWebDatabaseUrl` exige el usuario `web_readonly` y, respecto a la del
  propietario, mismo host, puerto y base. El seed lo ejecuta ANTES de crear un `Pool` o un `Client`.
- **Siembra** (`seed.ts`): `DROP DATABASE ... WITH (FORCE)` y `CREATE DATABASE` desde la base `postgres`,
  migraciones programáticas (`drizzle-orm/node-postgres/migrator`), preflight del rol `web_readonly`
  (existe y no es superusuario; nunca se crea), `GRANT CONNECT/USAGE/SELECT`, `jit = off` por base y
  comprobación posterior de que no puede escribir, y una transacción con el dataset. Tercera excepción
  documentada a «`packages/db` no lee `process.env`», tras `seed.ts` y `drizzle.config.ts`.
- **Dataset** (`fixture-data.ts`, datos puros) con identificadores y marcas de tiempo fijos (`e2eUuid`,
  `2026-09-15T10:00:00Z`): dos siembras seguidas dejan volcados idénticos (comprobado en Docker con
  `pg_dump` y `sha256`).
- **Subpath `./e2e`** en el `exports` de `packages/db` (junto con `.`): solo reexporta `fixture-ids` y
  `guard`, módulos puros. `seed.ts` no se exporta, así que `apps/web` no puede alcanzar nada que borre
  una base. Un test de vitest fija que `public.ts`, `guard.ts` y `fixture-ids.ts` no importan `pg` ni
  drizzle.
- **Variables** en el `.env` raíz: `E2E_DATABASE_URL` (propietario, host `db`) y
  `E2E_WEB_DATABASE_URL` (`web_readonly`). Compose las pasa con `${VAR:-}` junto con
  `E2E_DEV_DATABASE_NAME`; nunca `env_file`, nunca `NEXT_PUBLIC_*`.
- **La siembra va antes del servidor web, con el propietario ya eliminado del entorno.** El `webServer`
  de Playwright arranca con `{...process.env, ...webServer.env}` (verificado en 1.63.0 con Context7),
  de modo que no basta con no pasar la credencial en `env`: el entrypoint hace
  `exec env -u E2E_DATABASE_URL` y `playwright.config.ts` lanza un error si sigue definida. Además anula
  `WEB_DATABASE_URL` y `WEB_COVERAGE_DATABASE_URL`.

**Alternativas descartadas.** Reutilizar o parametrizar el guard `_bench` de `apps/ingestion`: obliga a
editar ingestion y a que `apps/web` importe de él, y la frontera entre ambos es una regla fija. Sembrar
desde `apps/web`: pondría la credencial de propietario en la aplicación web (regla de CLAUDE.md). Importar
`dist/` por ruta profunda o duplicar los UUID en las specs: dos fuentes de verdad. Derivar las URL e2e de
`WEB_DATABASE_URL`/`POSTGRES_*` por manipulación de cadenas: la codificación de las contraseñas lo hace
frágil; declararlas explícitas es más simple. Separar el dataset del seed no estaba en el diseño: se hizo
para poder probar su forma (S4.x) y su determinismo sin base de datos.

**Motivo.** El `DROP DATABASE` es la única operación destructiva del plan de diseño; la barrera tiene que
ser verificable sin conexión y no alcanzable desde la web. El rol `web_readonly` ya existe en el servidor
(decisión 056), así que el e2e prueba la misma credencial que la producción.

---

## 136 — Capturas solo en Docker (Linux), `next build` + `next start`, ruta sin plataforma y CSP verificada

**Estado:** aceptada

**Decisión.** El e2e se ejecuta únicamente en el servicio `e2e` de Compose (perfil `e2e`), basado en
`mcr.microsoft.com/playwright:v1.63.0-noble` (misma versión que `@playwright/test`, que está fijado
exacto, igual que `@axe-core/playwright@4.13.0`):

- El código se COPIA a la imagen (`pnpm fetch` y después instalación `--offline --frozen-lockfile`); los
  `node_modules` del host son binarios de win32. Solo se montan `apps/web/e2e/baselines` y
  `apps/web/test-results`. `init: true` e `ipc: host` por Chromium. `pnpm e2e` y `pnpm e2e:update` lanzan
  `docker compose --profile e2e run --rm --build e2e [update]`.
- `webServer`: `next build && next start --hostname 127.0.0.1 --port 3100`, `reuseExistingServer: false`,
  sin `next dev` (overlay y CSP de desarrollo distintos).
- 6 proyectos (`w320|w768|w1280` por `light|dark`), `reducedMotion: 'reduce'`, `updateSnapshots: 'none'`
  en la configuración (un baseline ausente falla sin escribirse; solo `test:e2e:update`, que pasa
  `--update-snapshots=changed`, escribe) y `snapshotPathTemplate` sin plataforma: solo hay baselines de
  Linux, en git plano.
- **CSP.** La CSP de producción lleva `upgrade-insecure-requests` (decisión 080). Se verificó en el
  navegador del contenedor: sobre `http://127.0.0.1:3100` Chromium NO mejora a https el documento ni los
  recursos (la prueba de humo `S7.1` registra los orígenes de todas las peticiones y solo aparece el de la
  aplicación). No hace falta ningún apaño, y el previsto como último recurso (reescribir la cabecera en la
  fixture o `bypassCSP`) no se aplica; nunca se toca `next.config.ts`. HSTS sobre http lo ignoran los
  navegadores.
- `.gitattributes` fija `*.sh` a LF (el entrypoint corre en Linux aunque se edite en Windows).

**Alternativas descartadas.** Montar el código fuente en el contenedor: arrastra binarios de otra
plataforma. `next dev`: añade el overlay de desarrollo y una CSP distinta. Git LFS para las capturas:
añade infraestructura para ~36 PNG pequeños. Baselines por plataforma (`-win32`, `-linux`): doble
mantenimiento y las de Windows nunca serían autoritativas. Cambiar la CSP en `next.config.ts` para el e2e:
es código de la aplicación, fuera del alcance de D.1.

**Motivo.** Las capturas dependen del sistema operativo y de las fuentes (decisión 130); un único
entorno las hace reproducibles y deja la prueba de «dos ejecuciones idénticas» como criterio objetivo.

---

## 137 — Guard de red a nivel de contexto, clasificación por origen y tesela local

**Estado:** aceptada

**Decisión.** Una única fixture automática (`auto: true`, no opt-in) de Playwright instala UNA ruta
`context.route('**/*')` y clasifica cada petición con `classifyRequest(url, appOrigin)`, función pura en
`apps/web/e2e/network-policy.ts`, probada con vitest en `apps/web/test`:

- `tile`: `https://tile.openstreetmap.org` exacto (el host de la decisión 112) se sirve desde
  `e2e/assets/tile.png` (256×256, color sólido), nunca de la red.
- `app`: el origen de la aplicación (esquema + host + puerto) continúa. Un origen mejorado a https es OTRO
  origen y se clasifica como externo, así que el propio guard delata un fallo de la CSP.
- `inline` (`data:`, `blob:`) continúa; todo lo demás, incluida una URL ilegible, es `external`: se
  aborta, se registra y el test FALLA al terminar con `expect(blocked).toEqual([])` en el cierre de la
  fixture, nombrando la URL.
- Autoprueba (`S8.3`): `test.fail()` sobre un test que pide `https://example.com/x`. Se comprobó que
  `test.fail()` cubre el fallo lanzado en el cierre de una fixture automática (sin `test.fail()` el test
  falla exactamente con ese mensaje). La petición sale desde `about:blank`: desde la aplicación la bloquea
  antes la propia CSP (sin `connect-src`, `default-src 'self'`) y el guard no llegaría a verla.

**Alternativas descartadas.** `page.route` en cada test: no cubre popups y es opt-in. Solo abortar sin
registrar: un abort no falla ningún test por sí solo, y una carga externa silenciosa daría un falso verde.
Confiar solo en la CSP: no ve las navegaciones ni las peticiones de recursos que la CSP permite
(`img-src` incluye el host de las teselas).

**Motivo.** La regla de CLAUDE.md es que nada consulte fuentes externas salvo las teselas del navegador
(decisión 112); en el e2e las teselas tampoco salen a la red, y cualquier otra petición debe romper la
suite en lugar de pasar desapercibida.

---

## 138 — Línea base de accesibilidad por huellas axe: las entradas nuevas y las obsoletas fallan

**Estado:** aceptada

**Decisión.** `apps/web/e2e/baselines/axe-baseline.json` guarda, por ruta y proyecto, el conjunto de
huellas `regla|objetivo` de las violaciones que axe (`@axe-core/playwright` 4.13.0, etiquetas `wcag2a`,
`wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) detecta HOY. Se registran, no se corrigen: corregirlas es D.15.
La lógica (huella, comparación, fusión, serialización) es pura, vive en `apps/web/e2e/axe-baseline.ts` y se
prueba con vitest en `apps/web/test/e2e-axe-baseline.test.ts`.

- Comparación por conjuntos (el orden no importa). Una huella NUEVA falla; una huella OBSOLETA (en la línea
  base y ya no reproducida) también falla, con el mensaje «ejecuta `pnpm e2e:update`». Una clave (ruta,
  proyecto) ausente falla, y también unas etiquetas distintas de las de la ejecución.
- Solo `test:e2e:update` (`--update-snapshots=changed`) reescribe la línea base: cada test prepara sus
  huellas en `test-results/axe-staging/` y pasa; `globalTeardown` las fusiona, reemplazando cada clave
  entera (así las huellas obsoletas desaparecen) y ordenando rutas, proyectos y huellas (JSON con 2 espacios y
  LF). Una ejecución parcial conserva las claves que no se ejecutaron.
- El objetivo se normaliza: se aplanan marcos y shadow DOM con « >>> », se colapsan los espacios y se
  deduplica.

**Alternativas descartadas.** Solo anotar lo obsoleto sin fallar: una entrada obsoleta enmascararía que la
violación vuelva a aparecer después. Corregir las violaciones ahora: fuera del alcance de D.1 (no se tocan
estilos ni componentes) y es D.15. Anotaciones sin comparación, o `toMatchSnapshot` sobre el resultado entero
de axe: las primeras no se contrastan en cada ejecución y la segunda es opaca y frágil ante campos que no
importan (HTML, ayuda, URLs).

**Motivo.** La línea base debe poder solo encogerse y de forma deliberada: cualquier cambio en el conjunto de
violaciones, a mejor o a peor, exige una actualización explícita y revisable en el diff.

---

## 139 — Tokens semánticos que cambian con el tema: variables en `:root`/`.dark` con `@theme inline`

**Estado:** aceptada (experimento del paso D.2, hueco c; el código del experimento se revirtió)

**Decisión.** El patrón de D.3 es el validado: variables CSS en `:root` y en `.dark`, expuestas con
`@theme inline` (`--color-surface: var(--surface)`), más `@custom-variant dark (&:where(.dark, .dark *))`.
Los valores se redefinen además bajo `@media (prefers-color-scheme: dark)` sobre `:root:not(.light)`, de modo
que sin clase manda el sistema y con `.dark`/`.light` manda la clase. `:root` declara `color-scheme: light dark`
y `.dark`/`.light` lo fijan.

Prueba (Chromium del runner Docker de D.1, una sola página sin recargar, 6 estados = `prefers-color-scheme`
{claro, oscuro} x clase de `<html>` {ninguna, `dark`, `light`}):

| Estado | `bg-spike-surface` (variables) | `light-dark()` | `dark:bg-black` | `color-scheme` calculado |
| --- | --- | --- | --- | --- |
| claro, sin clase | claro | claro | claro | `light dark` |
| claro, `.dark` | OSCURO | OSCURO | OSCURO | `dark` |
| claro, `.light` | claro | claro | claro | `light` |
| oscuro, sin clase | OSCURO | OSCURO | **claro** | `light dark` |
| oscuro, `.dark` | OSCURO | OSCURO | OSCURO | `dark` |
| oscuro, `.light` | claro | claro | claro | `light` |

- El color calculado cambia en tiempo de ejecución, sin recompilar, tanto al alternar la clase (S1.1) como al
  emular `prefers-color-scheme` (S1.2). Los 6 estados coinciden con lo esperado (`rgb(250, 250, 247)` claro,
  `rgb(28, 28, 26)` oscuro) y la marca `window.__marker` sobrevivió: no hubo recarga.
- Tensión que documenta la fila 4: la variante `dark:` de Tailwind sigue SOLO a la clase. Con el sistema en
  oscuro y sin clase, una utilidad `dark:` no se activa, mientras que los tokens sí cambian. **Consecuencia para
  D.4:** la clase `dark` debe fijarse desde el sistema con un script anti-parpadeo antes del primer pintado, y D.3
  debe preferir tokens semánticos a utilidades `dark:` sueltas; si no, los proyectos oscuros de D.1 (que emulan el
  sistema, sin clase) verían una página a medias.
- `light-dark()` (S1.3) funciona en el Chromium probado y se comporta igual que las variables en los 6 estados.
  Se descarta como patrón principal: duplica los dos valores en cada token, solo admite colores y dos temas, se
  acopla a `color-scheme` (no a la clase, así que exige además fijar `color-scheme` en `.dark`/`.light`) y solo se
  ha comprobado en Chromium. Con variables, cada tema es un bloque único y legible. Sigue siendo válido para un
  valor suelto.
- Sintaxis de Tailwind 4.3.3 contrastada con tailwindcss.com/docs/dark-mode (el `@custom-variant dark` con
  `:where(.dark, .dark *)` aparece tal cual) porque la herramienta Context7 no estaba disponible en la sesión;
  `@theme inline` con `light-dark()` y con `var()` compiló y generó las utilidades.
- Observación para D.3/D.8b: con `color-scheme: light dark` el botón «Dibujar zona» del mapa se ve como una caja
  blanca sin texto en oscuro (captura `d2-tiles-w1280-dark.png`); lo más probable es que el color de texto del
  agente de usuario pase a claro sobre el fondo blanco fijo del control. Los controles de Leaflet necesitan color
  explícito.

**Alternativas descartadas.** Variables solo bajo `@media (prefers-color-scheme: dark)` (sin clase): impide el
selector de tema de D.4. Variantes `dark:` por utilidad: no seguirían al sistema sin clase (fila 4) y repiten el
color en cada uso. `@custom-variant` doble con `@slot`: complejidad sin necesidad, el patrón único basta. El plan
de reserva previsto (variables bajo `@media`, o `dark:`) no hace falta: S1.1 y S1.2 pasan.

**Motivo.** Es lo único probado que cumple a la vez «sin recompilar», «sigue al sistema sin JavaScript» y
«la clase manda cuando existe». Evidencia: `docs/design/spikes/d2-tokens-{w320,w1280}-{light,dark}.png`.

---

## 140 — Teselas oscuras de OSM con filtro CSS: rechazadas por coste; se adoptan teselas claras en marco oscuro

**Estado:** rechazada (experimento del paso D.2, hueco b; el código del experimento se revirtió)

**Decisión.** NO se aplica el filtro CSS a las teselas en D.8b. Se adopta el plan de reserva: teselas claras
dentro de un marco oscuro (contenedor, controles y fondo del mapa con los tokens del tema oscuro; las teselas
sin filtrar).

Experimento: `html[data-spike-tiles] .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(.95)
contrast(.9) }`, solo sobre el panel de teselas, en `globals.css` (la UI de `search-map-canvas.tsx` no se
tocó). 24 teselas reales de OSM (zoom 13 y 15, la vista de las capturas) descargadas una sola vez, en serie,
con 1 s entre peticiones y un `User-Agent` identificativo, y servidas solo por la ruta del guard de red del
e2e; 18 se sirvieron del disco en la vista de 1280 px. Se borraron al terminar.

| Criterio | Resultado |
| --- | --- |
| S2.1 alcance del filtro | **Cumple.** `.leaflet-marker-icon` (4), `.leaflet-marker-pane`, `.leaflet-overlay-pane`, `.leaflet-control-zoom` y `.leaflet-control-attribution`, y TODOS sus ancestros hasta `<html>`, tienen `filter: none`; el panel de teselas, `invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)`. |
| S2.2 legibilidad | **Cumple, a ojo.** En `d2-tiles-w1280-dark.png` se leen los nombres de calles, barrios y números de vía; los rótulos de los marcadores y el control de zoom quedan intactos. El resultado es un mapa oscuro y de contraste bajo, con las vías principales rosadas y las zonas verdes casi negras; a 320 px (zoom 13) los rótulos pequeños se leen con esfuerzo. La atribución «© OpenStreetMap» es visible en las cuatro capturas. |
| S2.3 coste, CPU 4x | **No cumple.** Mediana del tiempo medio de fotograma sin filtro 20,83 ms, con filtro 32,72 ms: razón 1,571 (umbral 1,20). p95: 33,4 ms frente a 50,1 ms. Tareas largas: 0 en ambos. 5 ejecuciones por condición tras 1 pareja de calentamiento descartada, arrastre de 200 px y zoom +1/−1 con `Emulation.setCPUThrottlingRate {rate: 4}`. Una primera tanda con la tesela de relleno (sin teselas reales) dio 21,64 ms frente a 36,88 ms, razón 1,704. |

- Precaución sobre la medida: Chromium sin cabeza en Docker, compositor por software, rAF como métrica. Solo
  valen las cifras relativas, y son pesimistas respecto a una GPU. Aun así el criterio del paso, tal como
  está escrito, no se cumple, y la diferencia (≈ +57 %) no es marginal. No se probó otra receta de filtro
  ni un dispositivo real; ambas cosas pueden reabrir la decisión si la estética lo pide.
- Los pasos con un mapa oscuro de calidad (otro proveedor de teselas) exigen otro host: queda fuera por la
  decisión 112 (un solo host de teselas, el de OSM).

**Alternativas descartadas.** Filtro CSS sobre el panel: legible pero 57 % más lento en la medida pesimista.
Proveedor de teselas oscuras (otro host): amplía la superficie de red que fija la decisión 112 y la CSP, sin
justificación para un TFM. Filtro condicionado a que el dispositivo sea potente: complejidad sin medida que lo
respalde.

**Motivo.** El criterio de coste decidido de antemano falla con margen y el plan de reserva no cuesta nada:
no cambia ni la CSP ni el origen de las teselas. Evidencia: `docs/design/spikes/d2-tiles-{w320,w1280}-{light,dark}.png`
y `docs/design/spikes/d2-tiles-perf.json`.

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
  El paso 2.4 volvió a toparse con ello (ver `docs/AI-NOTES.md`); su banco ya usa bases
  separadas con el guardián de nombre `_bench`, que podría reutilizarse aquí.
- **Estimación de cardinalidad geográfica** (decisión 101): el planificador estima 100 filas
  dentro de un radio de 25 km donde caen ~600.000. Revisar las estadísticas de
  `location_geography` antes de confiar en otras decisiones del planificador sobre filtros
  geográficos.
- **Índice redundante** `properties_operation_property_type_idx` (decisiones 051 y 100): los dos
  índices compuestos nuevos empiezan por las mismas columnas. Eliminarlo tras comprobar que
  ningún plan lo prefiere.
- **Valores operativos del refresco** (decisiones 103-105): `REFRESH_BUDGET_FRACTION`,
  `MAINTENANCE_EVERY_TICKS` (20 por defecto en el script), `MAX_VERIFICATION_REQUESTS_PER_TICK` (2) y
  `VERIFICATION_RADIUS_MARGIN_M` (500). Los fija el responsable por entorno.
- ~~**Resultado de la sonda `adIds`** (decisión 105)~~: resuelto el 2026-09-30, `omitted`, y la
  constante está en `true`.
