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

**Enmendada por la 193** (D.15): `eslint-plugin-jsx-a11y` se incorpora como dependencia directa y corre en `src/**/*.tsx`.
`eslint-plugin-react` sigue fuera.

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

**Estado:** resuelta por la decisión 245 (paso 3.2); el texto siguiente es el registro original.

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

**Estado:** aceptada. **Enmendada por la 257** (paso 3.4): el despliegue crea el rol `web_coverage` (y `web_readonly`) con un verificador SCRAM y comprueba su matriz de privilegios; la frontera sobre las credenciales no cambia.

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

**Estado:** aceptada. **Enmendada por la 257** (paso 3.4): «el rol y la credencial son tarea manual» pasa a «los crea el despliegue con secretos de entorno»; el fichero de bootstrap sigue sin crear roles.

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

**Estado:** aceptada. La parte «en memoria» la enmienda la decisión 255 (paso 3.4): el limitador del proxy cuenta ahora en PostgreSQL, compartido por todas las instancias.

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

**Estado:** aceptada. **Enmendada por la 264** (paso 3.4): el ajuste de rol es preferente; si el proveedor no lo permite, el despliegue aplica y verifica `jit = off` a nivel de base de datos.

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

**Estado:** aceptada. Enmienda la decisión 080 (`img-src`). La 179 mueve el literal del host a `lib/osm-tiles.ts`. **Enmendada por la 261**
(paso 3.4): el host de teselas es el del proveedor configurado, OpenStreetMap por defecto; el literal del host por defecto vive ahora en
`lib/tile-config.ts`.

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
sistema). La lectura de la preferencia y su efecto sin JavaScript se deciden en el paso D.4 (decisiones 144-146).

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

**Estado:** aceptada. Enmendada por la decisión 265: el e2e escribe solo los contadores del limitador (`proxy_rate_limit`).

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

## 141 — Arquitectura de tokens de D.3: una capa semántica, `ink`/`rule`, color en `@theme inline` y el resto en `@theme static`

**Estado:** aceptada (paso D.3)

**Decisión.** `apps/web/src/app/globals.css` lleva todo el sistema, con el patrón de la decisión 139:

- **Una sola capa de variables semánticas** que cambian con el tema (`:root`, `.dark` y
  `@media (prefers-color-scheme: dark)` sobre `:root:not(.light)`), sin capa de primitivas.
- **`@theme inline` solo para colores:** `--color-*: initial` más una entrada `--color-<rol>: var(--<rol>)` por cada
  rol que sirve de texto, fondo o borde. `--hatch`, `--selection` y `--shadow-color` son variables sin utilidad:
  la siena de la trama nunca es texto ni fondo (decisión 132).
- **`@theme static` para todo lo demás:** pila tipográfica, roles de texto, radios, escala z, margen de scroll y
  sombras. `static` emite siempre las variables aunque ninguna utilidad las use (los estilos en línea de TSX de
  D.8b las necesitarán) y no se mezcla con `inline`, que solo tiene sentido para referencias `var()`.
- **Espacio sin declarar:** se conserva la base de 0,25 rem de Tailwind y el test prohíbe sobrescribir
  `--spacing`.
- **Espacios de nombres cerrados:** `--color-*: initial` y `--text-*: initial` retiran la paleta y la escala por
  defecto de Tailwind (D.0 fija una paleta y una escala cerradas). Ningún componente usaba esas utilidades
  (comprobado con una búsqueda de clases en `apps/web/src`).
- **Anclas en hex, derivados en OKLCH:** los valores de D.0 (`#ffffff`, `#1c1f22`, `#e4e2dc`, `#1f5fa8`, `#b0662b`)
  se conservan byte a byte; los demás se escriben como `oklch(L% C H)`, que permite ajustar solo la luminosidad.
- **Capas:** `base` 0, `map-controls` 10, `sticky-header` 20, `overlay` 30, `toast` 40, estrictamente crecientes y
  usadas con `z-(--z-overlay)`. `.leaflet-container` fija `isolation: isolate` para que las capas internas de
  Leaflet no compitan con las nuestras.
- **Fuente:** pila del sistema declarada en `@theme static` (`--font-sans`), sin `next/font` ni host remoto, de
  modo que `layout.tsx` y la CSP no cambian (R1 enmendada a la decisión 132). El paso D.3 decía `@theme inline`;
  se usa `static` por lo anterior (ver la fila del registro de desviaciones).

Nombres de la especificación frente a los de CSS (lo que la especificación llamaba `text` y `border` no se
usó literalmente):

| Rol de la especificación | Variable | Utilidad |
| --- | --- | --- |
| surface | `--surface` | `--color-surface` |
| text | `--ink` | `--color-ink` |
| text-muted | `--ink-muted` | `--color-ink-muted` |
| border | `--rule` | `--color-rule` |
| border-control | `--rule-control` | `--color-rule-control` |
| accent, danger, success, focus | mismo nombre | `--color-<nombre>` |
| hatch | `--hatch` | ninguna |
| añadidos: surface-raised, surface-sunken, ink-on-accent | mismo nombre | `--color-<nombre>` |
| añadidos: selection, shadow-color | mismo nombre | ninguna |

**Alternativas descartadas.** Los nombres `text`/`border` tal cual: darían `text-text`, `border-border` y
`text-text-muted`, ambiguos junto a los prefijos `text-*`/`border-*` de Tailwind. `fg`/`line`: menos precisos.
`ink`/`rule` son términos de imprenta y casan con la dirección editorial de D.0. Primitivas más semánticas en dos
capas: unos 16 tokens por dos temas sin reutilización real; D.17 puede extraerlas si hacen falta.
`--spacing: 0.25rem` explícito: redundante y la especificación lo prohíbe. Exponer `--hatch` como utilidad:
contradice D.0. `light-dark()`: ya descartado en la 139.

**Motivo.** Un solo fichero y una sola capa son lo más fácil de revisar y de verificar con un test que lee el CSS
como texto; los nombres evitan colisiones con Tailwind y las utilidades semánticas sustituyen a las variantes `dark:`,
que no siguen al sistema sin clase (decisión 139).

---

## 142 — Paleta oscura derivada en OKLCH y verificación de contraste con tolerancia de gamut de 1e-3

**Estado:** aceptada (paso D.3)

**Decisión.** El tema oscuro se deriva en OKLCH a partir de la paleta clara de D.0 (superficies y texto con un
matiz frío de ~235° y un acento más claro que el claro), no se invierte la clara. `apps/web/test/design-tokens.test.ts`
convierte cada token con las matrices estándar de OKLab, comprueba que cada canal lineal cae dentro de
[-1e-3, 1 + 1e-3], lo recorta a [0, 1], codifica sRGB, **redondea a 8 bits** y solo entonces calcula la luminancia
WCAG. Pares y umbrales, por tema: texto (`ink`, `ink-muted`, `accent`, `danger`, `success`) sobre las tres
superficies >= 4,5:1; `ink` sobre `selection` y `ink-on-accent` sobre `accent` >= 4,5:1; `rule-control` y `focus`
sobre las tres superficies y `hatch` sobre `surface` y `surface-sunken` >= 3:1. `rule` es decorativo y queda exento.
El alfa solo se admite en `--shadow-color`. La tabla resultante se fija con un snapshot de vitest y se copia a
`docs/DESIGN-ROADMAP.md`; ninguna cifra de la documentación sale de un cálculo a mano.

Si un par falla se ajusta solo la luminosidad L del token, nunca el matiz ni la cromaticidad. En esta aplicación
ningún par falló con los valores de partida del diseño. `#e4e2dc` (`--rule`) no llega a 3:1 como borde de control
(lo anticipaba D.0), así que los controles usan `--rule-control`.

**Por qué 1e-3 y no 1e-4.** Los literales OKLCH llevan 3-4 cifras significativas, de modo que un color que está
dentro del gamut cae ligeramente fuera: el vector de sanidad `oklch(62.8% 0.2577 29.23)` (rojo puro) da un canal
lineal R de ~1,000211. 1e-4 lo rechazaba; 1e-3 queda por debajo de medio escalón de 8 bits en el extremo alto
(~0,0016 lineal) y aun así rechaza un color realmente fuera de gamut (`oklch(70% 0.3 145)`).

**Alternativas descartadas.** Tolerancia de 1e-4: rechaza vectores válidos (ver `docs/AI-NOTES.md`). Recorte
silencioso sin tolerancia: dejaría pasar colores fuera de gamut que el navegador mapearía de otra forma que el test.
Mapeo de gamut en el test: duplica el comportamiento del navegador sin necesidad, porque todos los tokens caben en
sRGB. Luminancia en coma flotante sin cuantizar: no coincide con lo que miden las capturas y axe, que trabajan con
8 bits, y no da el hex que se documenta. `postcss` como analizador: solo es dependencia transitiva y pnpm es estricto;
un analizador de llaves de ~50 líneas basta. Leer `docs/DESIGN-ROADMAP.md` desde el test para comprobar la tabla:
frágil; el snapshot es determinista y regenerable.

**Motivo.** La verificación cubre exactamente lo que ve el usuario (colores de 8 bits) y la tabla de la
documentación es reproducible.

---

## 143 — Estilos base de D.3: anillo de foco, desplazamiento de ancla, controles acotados y todo en `@layer base`

**Estado:** aceptada (paso D.3)

**Decisión.** Las reglas globales viven en `@layer base`, para que cualquier utilidad las supere, y usan solo
variables (el test rechaza colores literales en esa capa):

- `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`, con
  `html { scroll-padding-top: var(--scroll-offset) }` para que el contenido fijo no tape el elemento enfocado ni los
  saltos a anclas. El foco usa el mismo azul que el acento y supera 3:1 sobre las tres superficies en ambos temas.
- `body` con superficie, tinta, `--font-sans` y el rol de cuerpo (1 rem / 1,5); `h1`-`h3` con los roles de título;
  `*, ::before, ::after { border-color: var(--rule) }` como borde por defecto.
- Enlaces con `--accent` y subrayado (desplazamiento 0,2 em): el acento solo contrasta 2,57:1 con la tinta, así que
  el color no basta para distinguirlos.
- `::selection` con `--selection` y `--ink`; `::placeholder` con `--ink-muted` y opacidad 1.
- Controles: `input:not([type=radio], [type=checkbox], [type=range], [type=color]), select, textarea` y `button`
  llevan fondo, color y borde `--rule-control` explícitos. Con `color-scheme: light dark` los controles nativos
  heredan los colores del sistema y pueden quedar blanco sobre blanco (hallazgo de D.2); al fijar los dos colores el
  par es siempre legible. Radios, casillas, rangos y selectores de color conservan su aspecto nativo (los radios de
  `criteria-form.tsx` no se tocan).
- `.leaflet-container { isolation: isolate }` (ver 141). Los controles de Leaflet siguen con los colores de su
  propia hoja (no está en ninguna capa, así que gana a `@layer base`); `map-draw-control.tsx` y
  `map-cluster-layer.tsx` no se tocan y sus colores fijos son de D.8b.

**Alternativas descartadas.** Reglas sin capa: pisarían las utilidades de los componentes. Dar color solo a
`input`: dejaría `select`, `textarea` y `button` heredando el sistema. Restilar radios y casillas con
`appearance: none`: es rediseño de componentes, fuera de D.3. Un selector `:where(...)` universal para controles: más
ancho de lo necesario. Cifras tabulares en `globals.css`: Tailwind ya trae `tabular-nums` y se aplicarán en D.6b/D.9.

**Motivo.** Es el mínimo que hace legibles ambos temas y accesible el teclado sin rediseñar ningún componente.

---

## 144 — La cookie de tema se lee solo en el script en línea del `<head>`

**Estado:** aceptada (paso D.4)

**Decisión.** La cookie `theme` la lee únicamente un script en línea en el `<head>` del layout raíz, antes del primer
pintado. El layout no llama a `cookies()` y sigue siendo síncrono. Comparativa:

| Opción | Estático o dinámico | Efecto en el *fallback* de `loading.tsx` (D.14) | Parpadeo | Sin JavaScript |
| ------ | ------------------- | ------------------------------------------------ | -------- | -------------- |
| **a.** Solo en el script | Árbol estático | Intacto | Ninguno: el script pone la clase antes de pintar | El formulario envía, se guarda la cookie y hay 303, pero no hay clase: se sigue el tema del sistema |
| b. `cookies()` en el layout raíz y límites de carga por segmento | Todo el árbol dinámico, también el 404 | El *fallback* raíz se pierde y hay que repartir `loading.tsx` por segmento | Ninguno | Funciona del todo (la clase la pone el servidor) |
| c. `cookies()` en cada página | Páginas dinámicas | Cada página decide la suya | Ninguno | La clase no puede ir en `<html>` desde una página |

**Elegida: (a).** Mantiene el árbol estático y el plan de D.14 (riesgo C20). La opción (b) además obligaría a reescribir
`layout-attribution.test.ts`, que llama a `RootLayout` de forma síncrona. El coste de (a) queda documentado: sin
JavaScript la preferencia se guarda pero no se aplica. La guía `preventing-flash-before-hydration.md` de la
documentación de Next 16.3.4 describe este mismo patrón.

- El estado actual del selector es solo visual, por CSS sobre la clase de `<html>` (`font-weight: 600`, borde `--ink`
  y sombra interior; el estado «sistema» con `:root:not(.light, .dark)`). No hay `aria-pressed`: lo pondría el
  servidor y este no lee la cookie.
- Aviso solo de desarrollo: el remontaje de React Strict Mode en `next dev` puede quitar la clase de `<html>`.
  Producción y e2e no se ven afectados.

**Alternativas descartadas.** `next/script` con estrategia `beforeInteractive`: añade la maquinaria de scripts de Next
y no mejora el patrón documentado, que es un `<script>` en línea. Las opciones (b) y (c), por lo anterior.

**Motivo.** Es la única opción que no vuelve dinámica la aplicación; a cambio, el caso sin JavaScript degrada al tema
del sistema.

---

## 145 — `POST /theme`: validación, cookie y ruta de vuelta

**Estado:** aceptada (paso D.4)

**Decisión.** `apps/web/src/app/theme/route.ts` exporta solo `POST` (un `GET` da 405). La lógica pura vive en
`apps/web/src/server/theme-preference.ts`.

- Zod valida el valor (`light`, `dark`, `system`). Valor ausente, desconocido o cuerpo ilegible: 400.
- Respuesta 303 construida a mano, con `Location` relativa y `Cache-Control: no-store`. `no-redirect.test.ts` prohíbe
  el texto de la llamada de redirección, incluso en comentarios.
- Cookie `theme=light|dark; Path=/; Max-Age=31536000; SameSite=Lax[; Secure]`. «Sistema» la caduca con
  `Path=/; Max-Age=0`. No es `HttpOnly` porque la lee el script. `Secure` solo si la URL es https o el primer valor de
  `x-forwarded-proto` es https (el e2e corre en http sobre 127.0.0.1).
- Ruta de vuelta: `returnTo` → `Referer` del mismo origen → `/`. Se valida sobre la cadena cruda y otra vez tras
  normalizar con `new URL()`; un `pathname` que empiece por `//` se rechaza y `/theme` se convierte en `/`. La
  `Location` es siempre una ruta relativa, así que no puede haber redirección externa.
- El origen público para comparar el `Referer` se toma de la cabecera `Host`, porque Next construye `request.url` con
  `localhost` mientras el cliente usó `127.0.0.1`. Un `Host` falsificado solo cambia qué `Referer` se acepta. Un `Host`
  inválido recurre al origen de `request.url`. Detrás de un proxy que reescriba `Host`, degrada a `/`.
- CSRF: no se comprueba `Origin`. El efecto es solo de presentación, sin datos personales, con retorno al mismo origen
  y `form-action 'self'`.

**Alternativas descartadas.** El auxiliar de redirección de `NextResponse` (lo prohíbe el test); `cookies().set`
(arrastra la API dinámica y no controla la cabecera a mano); comprobación de `Origin` (coste sin riesgo que mitigar);
guardar `system` en la cookie (caducarla es más simple y el script ya trata la ausencia como sistema).

**Motivo.** Una validación en dos pasos cierra la redirección abierta que la normalización de `new URL()` abría.

---

## 146 — La cookie de preferencia enmienda D5: no es una sesión

**Estado:** aceptada (paso D.4)

**Decisión.** La decisión de producto D5 («sin sesión/cookie») se enmienda: una cookie de preferencia de presentación,
leída solo en el cliente y sin datos personales, no es una sesión. `no-session-dependency.test.ts` fija ahora que solo
`server/theme-preference.ts` contiene `Set-Cookie`, de modo que cualquier otra cookie sigue rompiendo el test.

**Alternativas descartadas.** Mantener D5 literal y guardar el tema en `localStorage`: el formulario sin JavaScript no
podría fijarlo y la clase no estaría antes del primer pintado.

**Motivo.** Respeta la intención de D5 (la búsqueda no depende de ningún estado de usuario) con el menor alcance.

---

## 147 — Estructura común: el layout es dueño de `<main>`, del enlace de salto y de una cabecera estática

**Estado:** aceptada (paso D.5)

**Decisión.** `layout.tsx` renderiza, en este orden: el enlace «Saltar al contenido», `SiteHeader` (landmark `banner`),
`<main id="contenido" tabIndex={-1}>{children}</main>` y el pie con la atribución IGN/CNIG (`contentinfo`). Las
páginas devuelven fragmentos, de modo que cada ruta tiene exactamente un `<main>`, también la 404 por defecto de Next.
La cabecera (`components/site-header.tsx`, Server Component) lleva la marca, `nav aria-label="Principal"` con «Buscar»
y el selector de tema de D.4, movido tal cual desde el pie. El layout sigue siendo síncrono y estático (decisión 144).
El pie se queda en `layout.tsx`, de modo que `docs/ARCHITECTURE.md` sigue siendo cierto.

- El enlace de la marca es un `<a href="/">` plano con `eslint-disable @next/next/no-html-link-for-pages` a nivel de
  fichero. La regla obliga a `next/link` para `href="/"`, pero la convención de la aplicación es `<a>` plano para la
  navegación: `Link` añadiría JavaScript de cliente y precarga, y la cabecera debe seguir siendo estática. El
  `eslint-disable` está justificado con un comentario en el propio fichero.
- La cabecera no es *sticky*: el enlace de salto y el foco no compiten con ella (criterio 2.4.11) y `--scroll-offset`
  no cambia.

**Alternativas descartadas.** Un `<main>` por página: deja el destino del enlace de salto muerto en las 404 por defecto
hasta D.14 y se repite en cinco ramas de `page.tsx`. Un `not-found.tsx` propio: pertenece a D.14. Cabecera *sticky*:
exige trabajo de 2.4.11 y un `--scroll-offset` mayor. Un formulario de búsqueda en la cabecera: añadiría un segundo
`role=search` sin etiqueta junto a `SearchTextForm`. `sr-only focus:not-sr-only` junto a `focus:fixed`: las dos
utilidades fijan `position` y entran en conflicto; se usa la clase `.skip-link` con `transform`. `aria-current` en
«Buscar»: exigiría `headers()` o JavaScript y volvería dinámico el layout.

**Motivo.** Un solo `<main>` y un destino de salto operativo en todas las rutas, incluidas las futuras fronteras de D.14.

---

## 148 — Metadatos: plantilla de título y consulta única de la ficha con `cache()` de React

**Estado:** aceptada (paso D.5)

**Decisión.** `metadata.title = { default: 'Buscahogar', template: '%s · Buscahogar' }` y una descripción de 133
caracteres. La ficha exporta `generateMetadata`, que comparte con la página un cargador privado del módulo
`loadPropertyHeader = cache((listingId) => getPropertyDetailHeader(getDb(), listingId))`: una sola consulta por
petición. `generateMetadata` llama a `notFound()` con un id mal formado o sin cabecera. El título es `header.title`
recortado; si está vacío o es `null`, `'Ficha de la vivienda'`; nunca «No consolidado».

**Alternativas descartadas.** Una segunda consulta sin caché: duplica el acceso a la base de datos. Confiar en la
memoización de `fetch`: Drizzle no usa `fetch`. `unstable_cache` o `'use cache'`: cachean entre peticiones (datos
obsoletos) y exigen `cacheComponents`. `title.absolute`: ignoraría la plantilla.

**Motivo.** La plantilla solo se aplica a los segmentos hijos, así que la home usa `default`; `cache()` dura una
petición y no introduce obsolescencia.

---

## 149 — Iconos estáticos y exclusión exacta de los iconos en el límite de peticiones

**Estado:** aceptada (paso D.5)

**Decisión.** Convenciones de `app/`: `icon.svg` (marco con tejado sobre una baldosa blanca; los colores son los de
`--surface`, `--ink` y `--accent` del tema claro, fijados por `app-icons.test.ts`) y `apple-icon.png` (180×180, opaco).
El PNG se rasterizó una sola vez, desde la raíz del repositorio, con:

```text
pnpm --filter @buscahogar/web exec node -e "const { chromium } = require('@playwright/test'); const fs = require('node:fs'); (async () => { const svg = encodeURIComponent(fs.readFileSync('src/app/icon.svg', 'utf8')); const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 }); await page.setContent('<body style=margin:0;background:#ffffff><img src=data:image/svg+xml,' + svg + ' width=180 height=180 style=display:block></body>'); await page.screenshot({ path: 'src/app/apple-icon.png' }); await browser.close(); })();"
```

Como en el equipo de desarrollo no hay Chromium instalado, el comando se ejecutó **dentro de la imagen Docker del e2e**
(imagen temporal construida con `Dockerfile.e2e`, PNG extraído con `docker cp` y imagen eliminada). El resultado se
revisó a simple vista. El matcher de `proxy.ts` excluye solo los nombres exactos, con o sin extensión:
`icon(?:\.svg)?$` y `apple-icon(?:\.png)?$`, anclados con `$`.

**Forma de URL observada** (Next 16.3.4, Turbopack, `next build && next start`): `/icon.svg?icon.2o5lt4oye1or3.svg` y
`/apple-icon.png?apple-icon.21qd9xq5fdaj2.png`, es decir, con extensión y con un sufijo de hash en la consulta. El
e2e (`landmarks.spec.ts`) comprueba que ambas responden 200 con su tipo y que el *apple icon* es opaco. La consulta
nunca llega al matcher, que compara solo el *pathname*.

**Alternativas descartadas.** `apple-icon.tsx` con `ImageResponse`: lleva `next/og` al bundle del servidor y sirve el
icono sin extensión. Un script de rasterización versionado: queda fuera del `include` de tsconfig y falla el lint
estricto. `icon` sin anclar: eximiría también `/iconography` y `/icons/…` (los controles negativos de
`proxy-config.test.ts` lo fijan). Dejar los iconos bajo el límite de peticiones: cada carga de página gastaría cuota
en peticiones que no son de búsqueda.

**Motivo.** Los ficheros estáticos conservan `[name].[ext]`. `PRODUCT.md` («no hay logotipo») se enmienda: el icono es
un glifo funcional, no un logotipo.

---

## 150 — Anchura del contenedor: `--container-page` de 80rem y márgenes `px-4 sm:px-6 lg:px-8`

**Estado:** aceptada (paso D.5)

**Decisión.** `--container-page: 80rem` en `@theme static` (utilidad `max-w-page`) y los márgenes laterales en
`SHELL_CONTAINER` (`components/shell-container.ts`), aplicado al interior de la cabecera, a `<main>` y al interior del
pie. El contenido mide 288, 720 y 1216 px a 320, 768 y 1280 px.

**Alternativas descartadas.** `max-w-7xl`: no es un rol con nombre en los tokens de D.3. Redefinir `--spacing`: lo
prohíbe D.3. Una rejilla con salida a sangre en `<main>`: cada hijo de página pasaría a ser un elemento de la rejilla.

**Motivo.** Si D.8a necesita ancho completo, mueve el `max-width` de `<main>` a los contenedores de cada página.

---

## 151 — Barra de filtros y filtros aplicados: quitar un filtro descarta `page`; la zona por radio es un solo filtro

**Estado:** aceptada (paso D.6a). Desvía el prompt de D.6a («conserva view, polygon, page…»).

**Decisión.** Cada enlace de filtro aplicado quita su parámetro y `page`, y conserva el resto (`view`, `sort`, `dir`,
`zoneQuery` y claves desconocidas). `lat`, `lng` y `radius` forman un único filtro («A N km de un punto»), porque el
esquema los exige juntos. «Quitar todos» aparece solo con dos o más filtros y conserva únicamente `view`, `sort` y `dir`.
La barra reenvía la vista, el polígono, la zona y el radio en campos ocultos, nunca `page`; ante parámetros inválidos se
pinta con los valores recibidos y omite los ocultos que nombra un error del esquema. El recuento es completo («N
resultados») solo en la página 1 sin página siguiente; en otro caso dice «en esta página» y lleva el indicador de
página. La alerta antepone el nombre del parámetro al mensaje de Zod cuando este no lo nombra (los `enum` no lo hacen).
Los chips describen `criteria`, nunca `effectiveCriteria`, que añade un radio derivado de una zona cubierta.

**Alternativas descartadas.** Conservar `page`: con menos filtros la página N cambia de contenido o queda vacía. Tres
filtros geográficos: quitar uno deja una URL inválida (todo o nada). Reenviar todos los ocultos en la rama inválida: un
oculto rechazado dejaría la barra sin salida.

**Motivo.** Cada enlace debe llevar a una búsqueda válida y coherente, sin cambiar el contrato de la URL ni
`searchQuerySchema`.

---

## 152 — Política de `alt` de la miniatura: vacío solo si el texto de la fila ya identifica la vivienda

**Estado:** aceptada (paso D.6b)

**Decisión.** `resolveThumbnailAlt` (en `thumbnail-source.ts`) devuelve `""` cuando el rótulo de tipo, el de operación y
una dirección no en blanco están presentes en la fila; en cualquier otro caso devuelve «Foto de la vivienda». Un tipo o una
operación desconocidos cuentan como ausentes (`propertyTypeLabel` y `operationLabel` devuelven `null`, nunca el valor
crudo ni un texto de reserva: ese es asunto del componente). El único enlace de la fila nunca queda sin nombre accesible:
el precio y el texto lo dan aunque la foto sea decorativa.

**Alternativas descartadas.** `alt=""` siempre: si faltan datos, la foto sería lo único que identifica la fila. Un `alt`
derivado del título del anuncio: es texto del anunciante, a menudo largo y repetido en la fila, y no describe la foto, cuyo
contenido no se conoce.

**Motivo.** El prompt de D.6b pedía decidir la política: la imagen es decorativa solo cuando el texto de la tarjeta ya lo
dice todo, y en ese caso un `alt` descriptivo haría que el lector de pantalla repitiera lo que acaba de leer.

---

## 153 — Bandeja de filtros: `<details>` cerrado en móvil, abierto con parámetros inválidos y siempre visible desde 64rem solo con `::details-content`

**Estado:** aceptada (paso D.6b)

**Decisión.** `FilterBar` envuelve su formulario en `<details class="filter-tray">` con `<summary>` «Filtros». Va cerrado por
defecto y abierto (`open`) en la rama de parámetros inválidos, para que se vean los campos que la alerta nombra. Por debajo
de 64rem, o donde `::details-content` no existe, es un desplegable que funciona con teclado y sin JavaScript. Desde 64rem,
y solo dentro de `@supports selector(::details-content)`, el formulario queda siempre visible y el resumen se oculta; un
test de CSS (`filter-tray-css.test.ts`) exige que la regla `display: none` del resumen no aparezca fuera de ese bloque.
Sigue siendo un Server Component (R4: ningún `'use client'` nuevo) y el contrato GET de la decisión 123 no cambia.

**Alternativas descartadas.** Un componente de cliente que abra y cierre la bandeja: rompe R4 y el uso sin JavaScript. Dos
formularios, uno para móvil y otro para escritorio: duplica los campos y los ids. El umbral de 48rem: a 768 px la
maquetación pertenece a D.8a. La regla que oculta el resumen sin `@supports`: en un navegador sin `::details-content` se
perdería el control y la bandeja cerrada quedaría inalcanzable.

**Motivo.** Una sola fuente de campos, accesible sin JS y con degradación segura: lo peor que ocurre en un navegador
antiguo es que en escritorio también haya que desplegar la bandeja.

---

## 154 — El número de la bandeja cuenta solo los filtros de criterio, derivado de `describeAppliedFilters`

**Estado:** aceptada (paso D.6b)

**Decisión.** `countTrayFilters(criteria)` filtra el resultado de `describeAppliedFilters(criteria, null)` por
`TRAY_FILTER_KEYS` (operación, tipo, precio mínimo y máximo, superficie mínima y máxima, habitaciones, baños). Quedan fuera
`sort`/`dir`, la zona, el polígono y el punto con radio, y la vista. El resumen muestra la cifra en una píldora con el sufijo
oculto « activo» o « activos»; con 0, o sin recuento, solo dice «Filtros». La rama de parámetros inválidos no muestra
número: lo recibido puede no ser representable.

**Alternativas descartadas.** Contar todos los parámetros de la URL: el orden no es un filtro. Un contador propio por
campo: dos fuentes que pueden divergir de los chips.

**Motivo.** La zona y el radio ya se ven en sus chips, y derivar el número de la misma función que pinta los chips hace que
coincida por construcción con los filtros de criterio visibles.

**Reemplazada por la 226** (D.18): el número es `countAppliedFilters`, igual que los chips; `TRAY_FILTER_KEYS` y `countTrayFilters` ya no existen.

---

## 155 — Fila de resultado densa: miniatura 4:3 con `fill` y `sizes`, medida de 48rem y un solo enlace

**Estado:** aceptada (paso D.6b). Concreta la desviación de D.0 (decisiones 132 y 134).

**Decisión.** Cada resultado es una fila separada por un filete de 1px, sin tarjeta, sombra ni radio. A 320 px: miniatura
de 6rem y texto a su derecha, con el precio en la primera línea; desde 48rem: miniatura de 10rem, datos y precio en una
columna fija a la derecha con cifras tabulares. La lista y el paginador miden como máximo 48rem y van alineados a la
izquierda, de modo que a 1280 px el precio queda cerca de los datos y el lado derecho queda libre para el mapa de D.8a. La
imagen es `next/image` con `fill` y `sizes="(min-width: 48rem) 10rem, 6rem"` dentro de una caja de proporción 4:3 que fija
el CSS, así que no hay salto de maquetación; sin miniatura la misma caja muestra «Sin foto» oculto a lectores. Ni `<img>`
nativo, ni `unoptimized`, ni `priority`, ni cambios en `remotePatterns` o en la CSP. Tipo y operación salen de los rótulos
de la decisión 134 («Piso · Venta»); «1 baño» en singular. El hover solo con `(hover: hover) and (pointer: fine)`, el
`:active` da respuesta al toque y no hay transiciones (el movimiento llega en D.16).

**Alternativas descartadas.** Rejilla de una a tres columnas, como pedía el prompt: lo sustituyó la decisión 132. `width` y
`height` fijos en la imagen: no encajan con una caja fluida y deforman el `srcset`. Filas a todo el ancho: a 1280 px el
ojo recorre unos 1100 px entre la miniatura y el precio.

**Motivo.** Comparar viviendas de un vistazo con el precio como ancla, sin que el diseño se mueva al cargar las imágenes.

---

## 156 — Paginador: oculto con una sola página, «Página N» sin total y extremo no disponible como texto

**Estado:** aceptada (paso D.6b)

**Decisión.** `Pagination` no pinta nada en la página 1 sin página siguiente. En el resto de casos es un `<nav>` con el
nombre accesible de siempre, «anterior», «Página N» y «siguiente»; los enlaces conservan los filtros con `buildPageHref`. El
extremo que no existe es un `<span aria-hidden="true">` con el mismo texto, en gris y sin enlace, para que la maquetación no
se mueva entre páginas. Los destinos miden al menos 2.5rem de alto. No hay consulta de total ni «de M». Como el paginador es
ahora el único indicador de página, `formatListCount` deja de añadir « · página N» («N resultados en esta página»).

**Alternativas descartadas.** Un `<nav>` siempre presente y vacío: ruido para un lector de pantalla. Un enlace
deshabilitado (`aria-disabled`) en el extremo ausente: un falso destino que se anuncia como enlace. Mantener «página N» en
el recuento: dos indicadores que decir y mantener coherentes.

**Motivo.** No se añade una consulta de total en un paso de diseño y un extremo inexistente no debe parecer un enlace.

---

## 157 — Indicador de pasos: solo en el inicio sin parámetros y en `?q=`, decidido con los parámetros enviados

**Estado:** aceptada (paso D.7)

**Decisión.** `StepIndicator` es una `<ol aria-label="Pasos de la búsqueda">` de tres pasos (Describe, Revisa, Busca) con
`aria-current="step"` en uno. Se pinta en el inicio sin parámetros (paso 1), en `?q=` válido (paso 2) y con `q` inválido (paso
1). No en resultados, mapa ni parámetros inválidos. «Inicio» se decide con los parámetros ENVIADOS, antes de
`canonicalizeFormSubmission`.

**Alternativas descartadas.** Paso 1 en todas partes: afirmaría «describe» sobre unos resultados. Paso 3 en resultados: la
URL no distingue si vienen del texto o de la barra. Mirar los parámetros canonicalizados: un envío del formulario de criterios
en blanco parecería el inicio. Ponerlo dentro del formulario `role="search"`: una lista dentro del landmark. Contadores CSS:
inconsistentes con las tecnologías de apoyo.

**Motivo.** Los pasos solo se muestran donde el flujo está ocurriendo.

---

## 158 — Botón «Convertir en filtros» y ejemplo como texto de ayuda persistente

**Estado:** aceptada (paso D.7)

**Decisión.** El botón de la caja de texto dice «Convertir en filtros» y el ejemplo («Piso en alquiler en Getafe hasta 900 €
con 2 habitaciones») es un `<p id="search-text-help">` enlazado con `aria-describedby`, igual en las cuatro ramas de la home.

**Alternativas descartadas.** Un placeholder: desaparece al escribir y no es un nombre accesible. Mantener «Interpretar»:
jerga.

**Motivo.** Decisiones del responsable sobre el nombre del botón y la ayuda.

**Enmendada por la 228** (D.18): la etiqueta visible pasa a ser el resumen «Describe lo que buscas» del `<details>`; la del campo queda `sr-only`.

---

## 159 — Resumen de solo lectura como `AppliedFiltersSummary`, con la forma del chip compartida

**Estado:** aceptada (paso D.7)

**Decisión.** Un export aparte en `applied-filters.tsx`: `<section aria-label="Filtros interpretados">` con chips `<span>` sin
enlaces, sin recuento y sin «Quitar todos», solo si el esquema valida. Comparte con el chip interactivo la constante
`CHIP_SHAPE`; el interactivo conserva su clase byte a byte (un test la fija). El de solo lectura va sin borde: se lee como
etiqueta, no como control.

**Alternativas descartadas.** Una prop `mode`: mezcla dos componentes con comportamientos distintos. Reutilizar los chips
interactivos: navegarían y romperían los tests de la decisión 151.

**Motivo.** Misma fuente (`describeAppliedFilters`) sin tocar la barra de D.6a.

---

## 160 — Un único `role="status"` y `role="alert"` solo para bloqueos

**Estado:** aceptada (paso D.7)

**Decisión.** `describeInterpretationStatus` produce una línea de estado (también menciona la zona pendiente). `role="alert"`
solo para el rechazo del esquema (frase previa en tuteo, «Detalle:» y el literal de Zod) y para `q` inválido; el bloque de
problemas es estático. Se reescriben «Esto es lo que he entendido» y «No se pudo interpretar la búsqueda» de la rama `?q=`.

**Alternativas descartadas.** Un rol por bloque. Alerta para lo no entendido. Un estado que calle la zona pendiente.

**Motivo.** Una persona con lector de pantalla oye una sola síntesis y solo se interrumpe por lo que bloquea.

---

## 161 — Campos agrupados por pregunta con `grouped` opcional en `CriteriaFields`

**Estado:** aceptada (paso D.7)

**Decisión.** Con `grouped={{ zone }}` aparecen cinco bloques («¿Qué buscas?», «¿Cuánto quieres pagar?», «¿De qué
tamaño?», «¿Dónde?», «Orden de los resultados», este último más ligero). Sin la prop el marcado es el de siempre.

**Alternativas descartadas.** `fieldset` anidados. Exportar subconjuntos de campos. Títulos con sustantivos (leyendas
duplicadas con «Precio (€)»). Agrupar también la barra de filtros.

**Motivo.** La prueba de identidad de D.6a se mantiene y solo el panel cambia.

---

## 162 — La zona según cuatro estados y sin autoselección por prefijo

**Estado:** aceptada (paso D.7)

**Decisión.** Exacto: marcado y con nota. Elegir (varios, o uno solo por prefijo): ninguno marcado, leyenda con el lugar
escrito y nota distinta para uno y para varios. No encontrado y sin lugar: avisos distintos. «Sin zona (cualquier municipio)»
siempre existe y está marcada salvo en el estado exacto.

**Alternativas descartadas.** Preseleccionar el primer candidato por prefijo (decisión 122). Un `<select>`, que esconde las
opciones. Un solo aviso para «sin lugar» y «no encontrado»: el segundo necesita una pista de ortografía.

**Motivo.** Sin autoselección y sin afirmar que «varios» encajan cuando solo hay uno.

---

## 163 — Lista y mapa conviven; `view` solo elige el panel visible bajo 64rem (enmienda la 118)

**Estado:** aceptada (paso D.8a)

**Decisión.** Toda petición válida de `/` corre las DOS consultas (`searchProperties` y `searchMapPoints`), en
paralelo y una sola vez, y renderiza las dos secciones en el servidor: la lista primero en el orden del documento y
después el mapa, hermanas dentro de `.search-results[data-view]`. `view` deja de ser un interruptor de consulta: es
solo una pista de visibilidad (bajo 64rem se ve un panel; desde 64rem, ambos). Un `view` inválido, las ramas `?q=` y de
parámetros inválidos siguen sin consultar nada. El mapa recibe siempre el conjunto entero (hasta 500 puntos),
independiente de `page`. Cada aviso se renderiza una sola vez: el recuento de la lista queda en el resumen compartido
de `AppliedFilters`; M, «puede diferir…», «Mostrando N de M», el vacío del mapa, la nota de ubicación aproximada, el
marco con su `noscript` y la atribución de OSM viven solo en la sección del mapa. El aviso DAS-11 («puede que la zona
no esté cubierta») pasa a una región compartida y su condición es polígono válido y M = 0 (con polígono ambos totales
coinciden), de modo que también sale en páginas posteriores de la lista. Se mantiene lo que la 118 ya fijaba: el paquete
de la lista nunca importa el mapa, y Leaflet (JS y CSS) vive solo en el chunk dinámico de `search-map-canvas`
(`map-guards`).

**Alternativas descartadas.** Cargar el mapa con Suspense (rompe los tests con `renderToStaticMarkup`); pedir los
puntos desde el cliente (viola la prohibición de `fetch` de `map-guards`); decidir el panel visible según el ancho en
JS o en el servidor (el servidor no conoce el ancho); no montar Leaflet mientras el panel está oculto (decisión de
producto: el montaje no se condiciona).

**Motivo.** Con lista y mapa a la vez en pantallas anchas, los dos conjuntos tienen que existir en cada respuesta. El
coste se acota con el análisis de `docs/SEARCH-PERFORMANCE.md`: el tiempo de pared es el máximo de las dos consultas.

---

## 164 — CSS de la vista dividida: media query de 64rem, 768px como estrecho, marco con altura adaptable y `scripting: none`

**Estado:** aceptada (paso D.8a)

**Decisión.** En `globals.css`, capa `components`, las reglas que ocultan un panel
(`.search-results[data-view='map'] > .search-results__list` y su simétrica) van FUERA de la media query y la regla que
los vuelve a mostrar va dentro de `@media (width >= 64rem)`, con la misma especificidad (0,3,0), así que gana por orden.
Desde 64rem: rejilla `minmax(0, 48rem) minmax(20rem, 1fr)`, mapa `sticky` bajo `--scroll-offset` con altura
`100dvh - 2 * --scroll-offset` (tope de 60rem) y el enlace «Ver mapa/lista» oculto. A 768px se aplica el patrón
estrecho. El marco (`.search-map__frame`) lleva el hairline `var(--rule)` y `var(--surface)`, sin sombra; bajo 64rem
su altura es `clamp(20rem, 70dvh, 40rem)`, que nunca supera el viewport. El marco es del servidor (`page.tsx`) y aloja
el aviso de carga, el lienzo y el `noscript`, así que montar el mapa no desplaza el contenido. Con
`@media (scripting: none)` se oculta el aviso de carga y el marco pasa a cuadrícula centrada para mostrar el
`noscript`, cuyo marcado no cambia.

**Alternativas descartadas.** Dividir desde 48rem (a 768px la columna del mapa quedaría por debajo de 20rem); una
altura fija de 520px en línea; `MAP_STYLE` en el lienzo; poner el marco dentro del wrapper de cliente (el `noscript`
quedaría fuera de él).

**Motivo.** Visibilidad decidida solo por CSS, sin detección de ancho, sin salto de maquetación y con la guarda
`search-split-css.test.ts` leyendo la hoja como texto.

---

## 165 — Hoja propia del mapa sin capa, clúster propio y barra de dibujo fuera del contenedor de Leaflet

**Estado:** aceptada (paso D.8a)

**Decisión.** Marcadores, clústeres, popup, zoom, atribución, zona y barra de dibujo se estilan con clases en
`components/search-map-canvas.css`, una hoja SIN `@layer` importada en el lienzo DESPUÉS de las tres de terceros
(`leaflet.css`, `MarkerCluster.css` y `MarkerCluster.Default.css`, que se conservan). Cada selector cuelga de
`.leaflet-container` más una clase propia, con especificidad mínima (0,2,0) frente a los (0,1,0) a (0,2,1) de los
vendors, y el orden de importación es la segunda salvaguarda. Sin `!important` y sin literales de color: todo sale de
`var(--*)`, así que claro y oscuro (los tres bloques) funcionan por los tokens. Los clústeres usan su propio
`iconCreateFunction` con la clase `map-cluster` (no `marker-cluster`), de modo que `MarkerCluster.Default.css` ya no los
pinta. La zona y el trazo se enganchan por `pathOptions.className` (`map-area`, `map-draw-path`, `map-draw-vertex`) y
las reglas CSS ganan a los atributos SVG. El cursor de cruz pasa a la clase `map-canvas--drawing`. La barra de dibujo
se monta con `createPortal` en el marco (`map.getContainer().parentElement`), como hermana de `.leaflet-container`
(que ya tiene `isolation: isolate`), y usa `z-index: var(--z-map-controls)`. `map-guards.test.ts` lee las fuentes
como texto: sin colores literales, sin `cssText`, sin `style={` ni `elemento.style.propiedad =`, sin `!important` en la
hoja, `z-index` por token, orden de importación y `import L` antes de `leaflet.markercluster`.

**Alternativas descartadas.** `@layer` para los overrides (pierden contra las hojas de terceros, que no tienen capa);
`!important`; las reglas en `globals.css` (el mapa dejaría de viajar solo con su chunk dinámico); un `z-index: 1000`
literal; montar la barra dentro de `.leaflet-top` (dentro del contenedor, un z-index de 10 quedaría bajo los paneles de
Leaflet, de 400 a 700); eliminar `MarkerCluster.Default.css` (SMV-19 exige conservar las tres hojas de terceros; con el
`iconCreateFunction` propio ninguna regla suya casa ya con nuestros iconos).

**Motivo.** Correctitud sin una carrera de especificidad, tokens como única fuente de color y una barra que de verdad
queda por encima del mapa.

---

## 166 — Nombre accesible de marcadores, clústeres, popup y zoom

**Estado:** aceptada (paso D.8a)

**Decisión.** Cada marcador lleva `title` = `formatMarkerTitle(priceLabel)` (`lib/search-labels.ts`): «Vivienda,
250.000 €. Ver detalle» o «Vivienda, precio no disponible. Ver detalle» (la etiqueta sin precio pasa su inicial a
minúscula; nunca «null», «NaN» ni «undefined»). Los marcadores son `divIcon`, y Leaflet aplica `alt` solo a iconos de
imagen, así que el nombre accesible sale del texto visible más este `title`; ningún test exige `alt`. Los clústeres
muestran el número y, solo para lectores de pantalla, la unidad (`sr-only`, `formatClusterUnit`: «vivienda» o
«viviendas»); siguen siendo `role="button"` con `tabindex` 0 (Leaflet `keyboard: true`) y Intro los expande. El popup
es un bloque con `p.map-popup__price` y `a.map-popup__link` («Ver vivienda», solo con href), con foco visible en
`var(--focus)` y alto mínimo de 2,5rem. Al abrirse, el botón de cierre recibe `aria-label="Cerrar"`, y el zoom se
reconstruye con `zoomControl={false}` más `<ZoomControl zoomInTitle="Acercar" zoomOutTitle="Alejar" />`.

**Alternativas descartadas.** Exigir `alt` en el icono (no se aplica a un `divIcon`); un `title` calculado en el
servidor para cada punto (engorda la carga y cambia las claves de `MapPointView`); dejar las etiquetas inglesas de
Leaflet («Close», «Zoom in»), que incumplen WCAG 3.1.2 en una página en español.

**Motivo.** El mapa es una vía alternativa al listado, no la única, pero quien navega con teclado o lector debe poder
abrir una vivienda desde él con un nombre que diga qué es y cuánto cuesta.

---

## 167 — Reajuste del mapa montado oculto

**Estado:** aceptada (paso D.8a)

**Decisión.** Un `MapContainer` dentro de un panel `display: none` mide 0 × 0, y `getBoundsZoom` cae entonces al zoom
máximo (16) sobre el centro de los límites. El lienzo incluye un componente local `InitialFrame` que observa el tamaño
del contenedor con un `ResizeObserver`: en cada cambio llama a `map.invalidateSize({ animate: false })` y, la primera
vez que el tamaño deja de ser cero (al cruzar 64rem o al pasar a «Ver mapa»), vuelve a encuadrar a los límites del
resultado. Enmienda del diseño original, que registraba `map.once('resize', refit)` esperando que el seguimiento de
tamaño de Leaflet lo disparara: Leaflet solo escucha el `resize` de la ventana, y pasar de `view=list` a `view=map` es
una navegación del cliente que muestra el panel sin ningún evento de ventana, así que el mapa habría quedado sin
teselas.

**Alternativas descartadas.** Condicionar el montaje a `matchMedia` (la decisión de producto es no condicionarlo);
`invalidateSize` manual desde fuera del lienzo.

**Motivo.** El mapa montado oculto debe verse bien al aparecer, sin recarga y sin código de ancho en JS.

---

## 168 — Anfitrión de la barra antepuesto al marco y fila con salto de línea

**Estado:** aceptada (paso D.8b; filas B7 y B10 del diseño)

**Decisión.** La barra de dibujo se monta con `createPortal` en un `div.map-draw-host` que `MapDrawControl` crea y
**antepone** (`parent.prepend`) al marco `div.search-map__frame` pintado por el servidor, y retira al desmontar. El
anfitrión usa `display: contents`, no genera caja y la barra y la mira se posicionan respecto al marco; también aloja la
mira (decisión 170). Así la barra precede al mapa en el orden de foco: con Mayús+Tab desde el contenedor del mapa se llega
a «Cancelar» y «Cerrar» sin cruzar marcadores (WCAG 2.4.3), y sigue fuera de los paneles de Leaflet (decisión 165). La
fila (B10) pasa de columna a `flex-flow: row wrap; justify-content: flex-end` con `max-inline-size: min(22rem, calc(100% - 4rem))`,
el estado ocupa la fila entera (`flex-basis: 100%`, `overflow-wrap: anywhere`) y cada botón tiene `min-block-size` y
`min-inline-size` de `1.5rem` (WCAG 2.5.8, 24 px). Preocupación abierta del diseño, resuelta en el e2e: la inserción en un
marco gestionado por React no provoca avisos de hidratación ni de reconciliación (el e2e falla ante cualquier
`console.warning` o `console.error` al cargar `/?view=map`, dibujar, cancelar y cerrar).

**Alternativas descartadas.** Añadir el anfitrión DESPUÉS del contenedor, como en D.8a (la barra quedaba tras todos los
marcadores en el orden de tabulación); una barra en columna (a 320 px llegaba al centro del marco y chocaba con la mira,
SMV-26); montar la barra dentro de `.leaflet-container` (los paneles de 400 a 700 la taparían, decisión 165).

**Motivo.** Un orden de foco lógico y una barra que no solapa la mira en ningún ancho, sin salir de la frontera de
Leaflet ya decidida.

---

## 169 — Reductor de dibujo: textos, guarda de duplicados, tope e inercia de «cancelar»

**Estado:** aceptada (paso D.8b; filas B1 a B4 del diseño)

**Decisión.** Toda la lógica nueva vive en `draw-polygon-state.ts`, testeada en node, sin tocar `packages/core`. (B1) El
centro del mapa entra por la misma acción `add` que un clic: el reductor no distingue el origen, de modo que el tope y la
guarda de duplicados son comunes. (B2) Un único campo `message: string | null` guarda cada aviso y cada error; no hay
campo de tono ni un segundo campo de anuncio. Tras `start`, `add`, `undo`, `cancel` y `close` el mensaje describe lo
ocurrido, con singular y plural de `formatVertexCount` («1 vértice», «3 vértices»), también cuando quedan 0. (B3)
`DRAW_ISSUE_COPY: Record<PolygonIssueCode, string>` traduce cada código del core al español y ninguno contiene el prefijo
`polygon:`; al ser un `Record` exhaustivo, un código nuevo en el core rompe `typecheck`. `close` usa `problem.code`. (B4) Tras
redondear a cinco decimales (`round5`), un `add` igual al último vértice se rechaza con un mensaje; un punto repetido pero no
consecutivo sí se añade y lo detecta `close` como `duplicate-vertex`. El tope es el `POLYGON_MAX_VERTICES` del core (50) y
rige para clic y centro. `cancel` es inerte cuando no se dibuja: devuelve el mismo estado, sin mensaje. Un mensaje de
estado ya inactivo (por ejemplo «Dibujo cancelado.») persiste hasta el siguiente `start`.

**Alternativas descartadas.** Una acción `addCenter` aparte (duplicaría el tope y el guarda); un campo `announcement`
además de `message` (dos fuentes de verdad para una sola región `role="status"`); los textos en `packages/core` (el core
no lleva interfaz); devolver el estado inicial al cancelar sin mensaje (un lector de pantalla no oiría nada).

**Motivo.** Priorizar la accesibilidad sin duplicar lógica: el reductor es la única fuente de qué ocurre y qué se dice.

---

## 170 — Teclado acotado al contenedor, mira central, foco y región de estado única

**Estado:** aceptada (paso D.8b; filas B5, B6, B8 y B9 del diseño)

**Decisión.** (B5) Un único `keydown` en el contenedor del mapa, registrado en un efecto SOLO mientras se dibuja: Enter añade
`map.getCenter()`, Retroceso deshace y Escape cancela. Actúa únicamente si `event.target` es el contenedor y no hay
Ctrl, Alt ni Meta; `preventDefault` solo cuando se actúa, y una tecla mantenida (`event.repeat`) se consume sin enviar
nada. Un marcador, un enlace de la ventana emergente o un botón de la barra no son el contenedor, así que Intro y Retroceso
conservan su efecto nativo. Con una ventana emergente abierta, Escape se cede a Leaflet 1.9.4, que escucha `keydown` en
`document` (`Map.Keyboard.js`, líneas 133 y 168) y corre después del listener del contenedor: la ventana se cierra y el
dibujo sigue. Leaflet no expone `isPopupOpen` en `Map` (solo en `Layer`): el estado se sigue con los eventos `popupopen` y
`popupclose` del mapa y se guarda en una referencia. (B6) La mira es un `div.map-draw-crosshair` con `aria-hidden="true"`,
`pointer-events: none` y `z-index: var(--z-map-controls)`, solo mientras se dibuja, centrado en el marco (cuya caja coincide con
la del contenedor, así que su centro es `getCenter()`): anillo `var(--accent)` con contorno `var(--ink-on-accent)`
y punto central, de dos tonos para leerse sobre teselas claras en ambos temas (`design-tokens.test.ts` lo protege con
un contraste mínimo de 3:1). (B8) Al empezar se cierra cualquier ventana y se enfoca el contenedor con `preventScroll`; al
dejar de dibujar (cancelar o cerrar) el foco vuelve a «Dibujar zona»; el subárbol sobrevive a la navegación de cierre
(decisión 167). (B9) Un único `<p role="status">` es siempre el último hijo de la barra y no se renderiza condicionalmente:
vacío se recorta visualmente (`:empty` con `clip-path`) pero no usa `display: none`, que lo sacaría del árbol de
accesibilidad y no anunciaría el siguiente cambio. Perder el foco no descarta los vértices. Teselas sin cambios: se
mantiene la decisión 140 (teselas claras en un marco oscuro, sin filtro ni velo), y `globals.css` y el lienzo no se tocan
salvo lo indicado en la desviación de D.8b.

**Alternativas descartadas.** Un listener en `document` o `window` (marcadores y ventana emergente propagan `keydown`); un
`onKeyDown` de JSX en el contenedor de React (Leaflet crea ese nodo); la mira dentro de `.leaflet-container` (su `z-index`
literal de los paneles superaría el token); un anuncio por cada tecla sin región persistente (no se anunciaría el
primer mensaje); un filtro sobre las teselas oscuras (decisión 140).

**Motivo.** Que dibujar una zona no exija ratón ni arrastre (WCAG 2.1.1, 2.4.3, 2.5.7, 2.5.8, 4.1.3) sin interferir con los
atajos del navegador ni con la navegación nativa de marcadores y ventanas.

**Enmienda a la decisión 165.** Las clases `map-area`, `map-draw-path` y `map-draw-vertex` no se pueden pasar por
`pathOptions.className`: react-leaflet aplica `pathOptions` con `setStyle` DESPUÉS de crear la capa y el renderizador SVG de
Leaflet 1.9.4 solo lee `className` al crearla, así que la clase nunca llegaba al `<path>` y las reglas de la hoja no se
aplicaban (el e2e de D.8b lo mostró: vértices con el azul por defecto). Se pasan como prop `className` del componente, que
sí entra en las opciones del constructor; `map-guards.test.ts` lo vigila.

---

## 171 — Vuelta a los resultados: parámetros planos en lista blanca, revalidados con Zod en la ficha

**Estado:** aceptada (paso D.9). Matiza la 119 en un punto: el sufijo del enlace de los popups del mapa se compone en el cliente.

**Decisión.** El enlace a la ficha lleva los parámetros de la búsqueda de una lista blanca: las claves de `FILTER_PARAM_KEYS` (derivadas, no copiadas), `sort`, `dir`, `view` y, solo desde las filas de la lista, `page` (el mapa no pagina). Nunca `q`, `form` ni `zoneQuery`. La selección (`pickSearchReturnParams`, en `lib/search-return-params.ts`) no importa ningún esquema. Las filas llevan el enlace completo, construido en el servidor con `buildPropertyDetailHref`. Los puntos del mapa siguen recibiendo del servidor `/properties/{id}`. `MapClusterLayer` calcula el sufijo una sola vez a partir de `baseParams`, que el mapa ya recibe, y lo añade en el popup. El mapa solo existe con JavaScript, así que esto no afecta al funcionamiento sin JS. La ficha vuelve a validar esas claves con `searchQuerySchema` y `searchViewSchema` (`resolveSearchReturnLink`, en `lib/search-return.ts`). Si todas validan, reconstruye `/?…` solo con ellas y en orden fijo, con el texto «Volver a los resultados». Si no hay ninguna, o si cualquiera de ellas no valida, enlaza a `/` con «Volver a la búsqueda». No se rescata una parte: una búsqueda reconstruida a medias sería otra búsqueda. Es un `<a href>` normal: sin JS, sin redirección del servidor y sin estado en el cliente (R3). El destino es siempre `/` o `/?…` construido con `URLSearchParams`, así que no puede apuntar a otro sitio.

**Alternativas descartadas.** B) Un único `returnTo` con la URL codificada: obliga a validar una URL arbitraria (redirección abierta, doble codificación) y arrastra claves que la búsqueda no reconoce. C) La cabecera `Referer`: la `Referrer-Policy` configurada (`strict-origin-when-cross-origin`) y el navegador la reducen o la omiten, y falta al llegar por un enlace compartido. D) Una cookie o sesión con la última búsqueda: estado en el servidor, se pisa entre pestañas y saca los filtros de la URL. E) `history.back()` o `sessionStorage`: exigen un componente de cliente (R4) y no funcionan sin JS ni al llegar por enlace directo. Construir en el servidor el enlace completo de cada punto del mapa: repetiría hasta 500 veces el sufijo codificado (un polígono puede superar los 1100 caracteres).

**Motivo.** Los filtros ya viven en la URL; pasarlos tal cual y validarlos con el mismo esquema que la búsqueda conserva la búsqueda sin estado nuevo.

---

## 172 — Galería: tira con `scroll-snap`, anclas de fragmento y `alt` con la fuente

**Estado:** aceptada (paso D.9).

**Decisión.** La galería es una `<section>` con `aria-roledescription="carrusel"` y el nombre «Fotos de la vivienda» (patrón de carrusel de la APG, sin avance automático). Cada foto es un grupo (`role="group"`, `aria-roledescription="diapositiva"`) que toma su nombre del pie visible, «Foto N de M · {Fuente}», donde M es el número de fotos. «Foto anterior» y «Foto siguiente» son anclas `#source-slide-{id}` a la foto vecina. Si no hay vecina no hay ancla, y no existe una rama para una sola foto. Los controles van en un `div`, no en un `<nav>` por foto, que daría varios landmarks con el mismo nombre. Cada foto es `next/image` con `fill` y `sizes="(min-width: 64rem) 48rem, 100vw"`, dentro de una caja 4:3 con fondo `--surface-sunken` y sin `priority`. El desplazamiento al saltar a un ancla lo da `scroll-padding-top` (143). El `alt` es «Foto del anuncio de {Fuente}»: en la galería la foto es contenido, y la fuente es lo único que se sabe de ella. Las fotos siguen el orden de `getPropertySources`: primero los anuncios activos, por precio.

**Alternativas descartadas.** `?foto=N` en el servidor: recarga la página y vuelve a consultar en cada foto. Un carrusel de cliente: R4. El truco de radios y `:checked`: semántica pobre. Un control anterior/siguiente global: necesita saber qué foto está activa, y sin JS no se puede saber. `alt=""` (152): aquí no hay texto al lado que identifique la foto. «Foto N de M» como `alt`: repite el nombre del grupo.

**Motivo.** Funciona con teclado y sin JS, sin salto de maquetación y con un nombre accesible igual al texto visible. Cada ancla añade una entrada al historial; es propio del mecanismo.

---

## 173 — Disposición de la ficha: panel `sticky` desde 64rem y precio duplicado por punto de corte

**Estado:** aceptada (paso D.9; aplica la 133.1).

**Decisión.** El orden del DOM es el visual en cualquier ancho: enlace de vuelta, título, precio para móvil, galería, panel (precio para escritorio, datos clave, anuncios de origen) y descripción. El precio y «Disponible en N fuentes» se pintan dos veces, y la copia que no toca lleva `display: none` en cada punto de corte, así que en el árbol de accesibilidad solo hay una. Por debajo de 64rem se ve precio → galería → resto. Desde 64rem hay una rejilla `minmax(0, 48rem) minmax(20rem, 1fr)`: la galería y la descripción a la izquierda y, a la derecha, el panel, que empieza en la fila del título. El panel lleva `position: sticky`, `top: var(--scroll-offset)`, una altura máxima igual a la de la ventana menos dos desplazamientos y su propio desbordamiento vertical. Así nunca queda cortado y, al ir en su columna, no tapa el foco. El título usa el rol de título 2 y el precio el de título 1 con cifras tabulares: el precio es la cifra con más peso sin añadir tamaños.

**Alternativas descartadas.** Un único panel con `display: contents` en móvil y `order` para subir la galería: el foco y la lectura recorrerían los enlaces de las fuentes antes que los de la galería, que se ven encima, porque el orden del foco no coincidiría con el visual. Sacar el precio del panel: contradice la 133.1 y la 133.4. Dividir el panel en dos cajas: no habría una sola caja fija.

**Motivo.** Cumple a la vez la 133.1 y el orden móvil sin separar el orden del foco del visual. El coste es una línea de marcado duplicada que oculta el CSS.

---

## 174 — Datos clave, nombres de fuente y orden de los anuncios

**Estado:** aceptada (paso D.9; aplica la 133.3, 133.4 y 134).

**Decisión.** Los datos clave son un `<dl>` (Tipo, Operación, Superficie, Habitaciones, Baños, Planta, Dirección) con los rótulos de `search-labels.ts`. Un dato que falta muestra «—», y los lectores de pantalla oyen «Sin dato». Si falta alguno, una sola nota bajo la lista dice «No consolidado — ver anuncios de origen», el único sitio donde aparece ese texto. La planta se escribe «3.ª», «Bajo», «Entresuelo», «Semisótano» o «Sótano»; un código desconocido cuenta como dato que falta. Sin título se usa «Ficha de la vivienda». Sin descripción no hay sección, y la descripción se parte en párrafos por los saltos de línea. La fuente se nombra con `SOURCE_LABELS`, y con «Otra fuente» si no se conoce. El enlace saliente dice «Ver en {Fuente}», con una flecha decorativa y «(web externa)» para lectores de pantalla. Se abre en la misma pestaña y lleva `rel="external"`. Un anuncio no activo lleva la insignia «(no disponible)». `getPropertySources` ordena primero los activos, después por precio ascendente y por último por id.

**Alternativas descartadas.** Repetir «No consolidado» en cada dato para los lectores de pantalla: lo oirían una vez por campo. Abrir en otra pestaña: quita el control al usuario, y volver ya es barato porque la URL conserva el estado y la `Referrer-Policy` configurada solo envía nuestro origen. La columna `sources.name`: la 134 pide un `Record` tipado. Ordenar en `apps/web`: deja la consulta sin un orden determinista.

**Motivo.** Una ficha que se lee de un vistazo y que dice una sola vez lo que no está consolidado.

---

## 175 — Ficha con galería en el e2e: vivienda solo con inactivos y fotos locales

**Estado:** aceptada (paso D.9, seguimiento de la verificación; cambia el escenario S4.6 de la siembra de D.1a, decisión 135, que no tenía ninguna miniatura).

**Decisión.** La siembra e2e añade P7, una vivienda cuyos dos anuncios (Idealista y Kyero) están `inactive` desde hace dos semanas, sin tombstone: conservan descripción, `raw` y miniatura (decisión 107). Le faltan baños y planta, así que su ficha enseña la galería de dos fotos, el «—» y la nota única. Por la 109 no sale en la búsqueda ni en el mapa, y su ficha muestra el mínimo de todos sus anuncios. Las miniaturas son rutas de nuestro origen (`/e2e-fixtures/gallery-{1,2}.png`). Los PNG se versionan en `apps/web/e2e/assets/` y `Dockerfile.e2e` los copia a `apps/web/public/e2e-fixtures/` solo en la imagen del e2e, así que pasan por el optimizador local de `next/image` sin publicarse en producción. La ruta `detail-gallery` la incorpora a las capturas, a axe y a la estructura de página.

**Alternativas descartadas.** Una vivienda activa: cambiaría las capturas de `home`, `map` y `home-filtered` y los recuentos de la búsqueda. Dar miniaturas a P2: mismo efecto en la fila de resultados. Un `data:` URI: la CSP lo admite, pero `next/image` no optimiza esas imágenes y la prueba no cubriría `/_next/image` ni el `srcset`. Versionar las fotos en `apps/web/public/`: la build de producción las serviría. Un host externo, aunque fuese un dominio `.invalid`: lo prohíben R8 y `remotePatterns`.

**Motivo.** Cubrir con capturas lo que hasta ahora solo cubrían los tests unitarios sin mover ninguna otra línea base.

---

## 176 — Número de fuentes de la ficha: fuentes distintas con algún anuncio activo

**Estado:** aceptada (paso D.9, corrección; cambia el texto del resumen de la 173).

**Decisión.** El resumen de la ficha (sus dos copias) muestra el número de fuentes distintas (`sourceKey`) con al menos un anuncio `active`, no `properties.listing_count`. Lo calcula `countActiveSources` (`apps/web/src/lib/count-active-sources.ts`), una función pura, sobre las filas de `getPropertySources` que la página ya carga. Con N ≥ 1 dice «Disponible en N fuente/fuentes» con la regla singular/plural de `result-card`. Con 0, «No disponible en ninguna fuente»: es la vivienda sin anuncios activos que la 109 solo deja ver desde su ficha, con el mínimo de todos los precios. `listingCount` sigue en `PropertyDetailHeader`.

**Alternativas descartadas.** Seguir con `listingCount`: cuenta anuncios y no fuentes, e incluye los retirados e inactivos, así que P7 decía «2 fuentes» con las dos marcadas «(no disponible)». Leer `properties.active_listing_count` en la consulta de cabecera: tocaría `packages/db` y seguiría contando anuncios, no fuentes; dos anuncios activos de la misma fuente darían 2.

**Motivo.** El número tiene que coincidir con lo que la lista de anuncios de origen enseña justo debajo, y los datos para calcularlo ya están en la página.

**Consecuencia.** La búsqueda no cambia: `distinctSourceCount` (decisión 058) cuenta fuentes distintas de todos los anuncios, sin mirar `status`. Una vivienda con un anuncio activo y otro retirado de otra fuente (P2) sale en los resultados con «2 fuentes» y en su ficha con «1 fuente». Igualarlas exigiría filtrar por `status` en la subconsulta de `search.ts`, un cambio de la búsqueda que queda fuera de esta corrección.

---

## 177 — Número de fuentes de los resultados: solo fuentes con algún anuncio activo

**Estado:** aceptada (paso D.9, seguimiento; enmienda la consecuencia de la 176 y el recuento A-1 de la 058).

**Decisión.** La subconsulta `distinctSourceCount` de `packages/db/src/search.ts` añade `AND src_l."status" = 'active'`: cuenta fuentes distintas con al menos un anuncio activo, igual que `countActiveSources` en la ficha. Es el mismo literal con el que `visibility.ts` calcula `active_listing_count`. El campo conserva su nombre y `result-card` su copia singular/plural. Como la búsqueda solo devuelve viviendas con `active_listing_count > 0` (decisión 109), el valor es siempre ≥ 1. El mapa no lo usa: `buildMapPointsQuery` no proyecta ningún recuento, y la lista que acompaña al mapa es la misma `searchProperties`.

**Alternativas descartadas.** Dejar la diferencia documentada (la consecuencia de la 176): P2 seguiría diciendo «2 fuentes» en los resultados y «1 fuente» en su ficha. Calcular el número en `apps/web` como en la ficha: la búsqueda no carga los anuncios de cada vivienda y exigiría una consulta más por tarjeta.

**Motivo.** El mantenedor aprobó alinear las dos vistas: un anuncio retirado no es una fuente donde la vivienda esté disponible.

---

## 178 — Histórico de precios de la ficha: una serie escalonada por anuncio y la tabla como fuente de verdad

**Estado:** aceptada (paso D.10; aplica la 133.6 y la 132).

**Decisión.** `getPropertyPriceHistory` (`packages/db/src/detail.ts`) devuelve en una sola consulta todas las versiones de los anuncios de la vivienda, sin filtrar por `is_current` ni por `status`, ordenadas por `captured_at`, `version` e id del anuncio. Proyecta solo fuente, anuncio, estado, precio y fecha: ni `score`, ni `signals`, ni el texto que el tombstone redacta (107). `derivePriceHistory` (`packages/core`) agrupa por anuncio y une las versiones consecutivas con el mismo precio, porque una versión nueva puede deberse a otro campo (037) o al tombstone (107). Queda la primera observación y cada cambio real, con la variación en céntimos y en décimas de punto porcentual, calculada con enteros y redondeada una sola vez, la mitad lejos de cero. Los anuncios siguen el orden de la lista de anuncios de origen (174), y la tabla los recorre así: cada anuncio con sus filas en orden de fecha, para que cada variación quede junto a su anuncio. La sección «Histórico de precios» va fuera del panel fijo (173): bajo la galería desde 64rem y tras los anuncios de origen en móvil. Contiene un gráfico SVG escalonado generado en el servidor, con una serie por anuncio y ejes comunes. El eje de precio no empieza en cero: cubre del mínimo al máximo con un pequeño margen y rotula los dos extremos; el de tiempo, la primera y la última fecha. Las series se distinguen por el trazo, la forma del marcador y el tono (`--ink`, `--ink-muted`), nunca solo por el color, y no usan el azul (lo que se pulsa) ni el siena (lo aproximado). Un anuncio con un solo precio es un marcador sin línea, ninguna línea se prolonga más allá de su última observación y un anuncio retirado no lleva marca final: lo dice la insignia «(no disponible)». El gráfico es una imagen (`role="img"`) con un nombre breve que dice cuántos anuncios muestra y remite a la tabla. La tabla (fuente, fecha, precio y variación) es la fuente de verdad. Las fechas son las de nuestro barrido, en UTC y `dd/mm/aaaa`, y la tabla lo dice; no son fechas de publicación del portal. Si ningún precio de la vivienda ha cambiado no hay gráfico: la tabla y «Precio observado el dd/mm/aaaa; aún sin cambios». El dataset e2e da a P1 dos y tres versiones, con dos consecutivas de igual precio.

**Alternativas descartadas.** Una única serie con el mínimo de la vivienda: un anuncio retirado la haría saltar sin que cambie ningún precio. Filas de la tabla en orden de fecha mezclando anuncios: la variación de un anuncio quedaría junto a la fila de otro. Eje desde cero: aplasta variaciones del 1 al 5 %, que son las habituales. Ocultar el SVG con `aria-hidden`: el gráfico se quedaría sin nombre. Un `aria-label` con todos los puntos: duplica la tabla y se hace eterno. Una librería de gráficos o un componente de cliente: exige JS (R4) y estilos en línea que la CSP no admite. El porcentaje en coma flotante: ruido decimal y redondeos distintos según el sitio. Prolongar la línea de un anuncio activo hasta hoy: `listing_versions` solo registra cambios y esa fecha no sería una observación. El histórico dentro del panel fijo: obligaría al panel a desplazarse por dentro.

**Motivo.** Enseña cómo ha cambiado el precio en cada portal con ejes constantes, sin JS y sin afirmar más de lo que el barrido observó.

**Ajustes de la aplicación.** (1) La tabla va dentro de una región con nombre y `tabindex="0"` (`price-history__scroll`, `overflow-x: auto`): a 320 px la de P7, con «219.000 €», la insignia y «Variación» sin partir, era unos píxeles más ancha que la columna y, sin ella, se salía del margen de la página. El diseño la dejaba como recurso si la captura mostraba desbordamiento; la mostró. Descartado partir cifras y fechas a mitad (`overflow-wrap: anywhere`): «1180 / €» y «15/09/2 / 026» no se leen. (2) El gráfico no pasa de 24rem de ancho: el SVG escala los rótulos con el `viewBox`, y a 1280 salían de unos 30 px. (3) Ni `detail` (P2) ni `detail-gallery` (P7) llevan gráfico, así que se añade la ruta e2e `detail-history` sobre P1 (`E2E_HISTORY_LISTING_ID`), con sus seis capturas, su entrada axe (sin violaciones) y las comprobaciones de landmarks y desbordamiento que se aplican a toda ruta.

---

## 179 — Mapa estático de ubicación aproximada en la ficha: excepción acotada a R2 y módulo único de teselas

**Estado:** aceptada (paso D.11; aplica la 133.7 y la 132; enmienda R2 y el límite de la 112).

**Decisión.** La sección «Ubicación» de la ficha muestra un mosaico fijo de 2×2 teselas de OpenStreetMap a zoom 14 (512×512 px), servidas como `<img>` nativo con `loading="lazy"`, que pide el navegador. El servidor solo calcula las URL (`planStaticMap`, en `packages/core`, y `osmTileUrl`) y no descarga ninguna (R8). Encima va un SVG con un círculo de 500 m de radio relleno con la trama rayada en siena, sin ningún punto, cruz ni marca en el centro, y el pie «Ubicación aproximada» con «© OpenStreetMap» enlazado. Excepción a R2: el `<img>` nativo solo se admite en `components/property-location.tsx` y solo con `src` de `osmTileUrl`; `csp-image-policy.test.ts` lo fija y `img-src` no cambia. El host de teselas deja de vivir en `search-map-canvas.tsx` y pasa a `lib/osm-tiles.ts`, que importan el lienzo y el mapa estático; SMV-9 fija ese módulo, y el mapa estático queda fuera de los ficheros del mapa interactivo (SMV-22 sigue). Como las teselas son claras en los dos temas (140), cada raya y el borde del círculo llevan un filete del color de superficie, que da el contraste en el tema oscuro. Sin coordenadas, la sección conserva el título «Ubicación» y muestra solo el municipio, sin mapa, sin aviso y sin atribución. El radio de 500 m es provisional: la 133 pedía fijarlo con datos reales («se fija con datos reales»), pero no hay ninguna señal de ofuscación (026), así que se fija ahora y se revisará cuando la haya; es un conflicto con la 133 que queda registrado aquí, no resuelto.

**Alternativas descartadas.** `next/image`: el optimizador descargaría las teselas desde el servidor (R8). Fondos CSS o `<image>` de SVG: esquivan R2 sin decidirlo (133). Centrar el círculo con un desplazamiento por vivienda: exige atributos `style`. Desplazar el centro del círculo al azar: añade error a una coordenada que ya puede ser aproximada. Zoom 15 con 3×3 teselas: más peticiones y teselas reducidas en pantalla. `referrerPolicy="no-referrer"`: la política de uso de OSM exige un Referer válido.

**Motivo.** Sitúa la vivienda sin JS y sin afirmar más precisión de la que tienen los datos.

---

## 180 — Comparación de anuncios de la ficha: empates marcados, aviso sin activos y nota de agrupación fija

**Estado:** aceptada (paso D.12; aplica la 109; enmienda la 174).

**Decisión.** `compareSourceListings` (`packages/core`) decide qué anuncios fijan el precio: solo el estado exacto `'active'` cuenta como activo. Si hay activos, se marcan **todos** los empatados al precio mínimo («Más económico») y se elige un anuncio principal determinista (`lastSeenAt` más reciente y después `listingId`). Si no hay ninguno, se marcan los del mínimo global con «Precio más bajo» y un aviso sobre la lista. Sin anuncios devuelve `mode: 'empty'` y no lanza. La nota «Agrupamos estos anuncios porque creemos que describen la misma vivienda. Compruébalo en cada fuente.» se ve siempre. La función es una segunda implementación de la 109, que `detail.db.test.ts` ata a `min_price_cents` con la siembra e2e. La insignia «(no disponible)» por fila desaparece (enmienda la 174): lo dice la fila «Estado». `price-history.tsx` no cambia.

**Alternativas descartadas.** Marcar un único anuncio en un empate: sugiere que los demás son peores sin serlo. Mostrar «Más económico» sin activos: contradice la 109. Nota solo con varias fuentes: obliga a ramificar por número de fuentes (`no-single-source-branch`) y una sola fuente también es una agrupación estimada. Reutilizar el SQL de la cabecera en la ficha: acopla la interfaz a la consulta. Conservar la insignia por fila: duplica «Estado».

**Motivo.** Que se vea por qué se muestra un precio, sin presentar la agrupación como certeza (prioridad: minimizar falsos positivos).

**Enmendada por la 221** (D.18): sin anuncios activos la etiqueta es «Último precio más bajo».

---

## 181 — Avisos de cobertura: un componente de servidor, hora de Madrid, una sola región viva y fecha de siembra inyectada

**Estado:** aceptada (paso D.13; enmienda la 135; aplica la 134).

**Decisión.**

- **(a) Un componente.** `CoverageNotice` (servidor, sin `'use client'`) pinta las 10 variantes: zona desconocida, polígono fuera de
  cobertura, municipio no barrible, tope global, tope por cliente, solicitud registrada sin job y los cuatro estados del job.
  `noticeForOutcome` traduce el `CoverageOutcome` (`covered` no lleva aviso) y `page.tsx` ya no tiene avisos propios ni
  `formatJobStatus`. El enlace «Comprobar de nuevo» solo aparece donde recargar puede cambiar el estado: solicitud registrada y los
  cuatro estados de job. Es un `<a>` plano, así que funciona sin JavaScript.
- **(b) Hora de Madrid.** `apps/web/src/lib/madrid-time.ts` (`nextUtcMidnight`, `formatMadridDateTime`, `formatMadridTime`) con
  `Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' })`. Es presentación (cadenas de idioma y zona), como `format-date.ts`,
  que no cambia. El reinicio del tope es la siguiente medianoche UTC mostrada en Madrid («2:00» en horario de verano, «1:00» en
  invierno) y la frase no lleva palabra de día: «a partir de las 2:00 de la madrugada», nunca «mañana» ni «hoy».
- **(c) Una sola región viva.** El aviso del servidor es la única región viva de la sección: un nodo estable con `aria-atomic="true"`,
  sin `key` y sin `aria-live` añadido; el texto cambia dentro del mismo nodo tras `router.refresh()`. Solo `failed` usa
  `role="alert"`, en ese mismo nodo. `CoverageStatus` pierde su `aria-live` y solo explica el refresco (`describeRefresh`, puro:
  cada 5 segundos durante 2 minutos y después el enlace). Limitación aceptada: un `failed` que ya viene en el HTML inicial no se
  anuncia, porque anunciarlo exigiría un efecto de cliente.
- **(d) Fecha de siembra inyectada (enmienda la 135).** `buildE2eFixture(seedNow = SEEN_AT)`: solo el `requested_at` del job
  pendiente depende de ella (inicio del día UTC). La garantía pasa de «volcados idénticos entre ejecuciones» a «idénticos dentro del
  mismo día UTC». El tope global se prueba con `NEW_ZONES_DAILY_CAP=1` y ese job pendiente «de hoy».

**Alternativas descartadas.** Un aviso por variante en `page.tsx`: ya había seis redacciones distintas. «Mañana» o un «hoy/mañana»
calculado: entre las 00:00 y las 02:00 de Madrid el reinicio cae en el mismo día natural y el texto cambia de longitud entre
capturas. Dos regiones persistentes (estado y alerta) o un elemento distinto por variante: el cambio de elemento se anuncia poco o
nada. Un efecto de cliente que inyecte el texto: amplía el allowlist de `'use client'`. Poner el módulo de hora en `packages/core`
o duplicarlo en `packages/db`: `core` es solo dominio y el día del tope lo define SQL con el reloj de Postgres. Una fecha 2099 para
el job pendiente: depende de que `countZonesOpenedToday` use `>=` sin cota superior (queda como respaldo). Credencial de escritura
en el e2e: contradice la 135.

**Motivo.** Que se entienda qué pasa con una zona y cuándo volver, en hora local y sin jerga, con un solo anuncio para lectores de
pantalla y sin ampliar el código de cliente.

---

## 182 — Avisos de la ficha y de cobertura en el panel de 1px de D.7, sin franja lateral

**Estado:** aceptada (seguimiento de D.12 y D.13; enmienda la parte visual de la 180 y de la 181).

**Decisión.** El aviso de «sin anuncios activos» de la ficha (`.source-list__warning`, D.12) y el aviso de cobertura
(`.coverage-notice`, D.13) dejan la regla lateral de 3 px (`border-inline-start: 3px solid`) y pasan al panel de aviso de D.7
(`.nl-review__alert`, `.nl-issues`): borde completo de 1px en `--rule`, relleno `0.75rem 1rem` y `--radius-panel`. Las cuatro
clases comparten una regla en `globals.css`; solo las alertas (`.nl-review__alert` y `.coverage-notice[role='alert']`) cambian el
borde a `--danger`. El aviso de fuentes sigue pesando más que la nota por el texto en tinta y el panel; el aviso de cobertura
conserva el título en 600 y sus márgenes. Textos, roles ARIA y la hora de reinicio enmascarada no cambian.

**Alternativas descartadas.** Conservar la regla de 3 px y silenciar el hallazgo `side-tab` del detector con un `ignore`: el
responsable exige seguir siempre lo que indica impeccable, y su suelo de oficio (`craft-floor.md`) prohíbe un borde lateral de color
de más de 1px en avisos, elementos de lista y alertas. Copiar los valores del panel en cada aviso en lugar de compartir la regla:
tres copias que pueden divergir.

**Motivo.** Un solo patrón de aviso en toda la interfaz, el que ya aceptaba el suelo de oficio, en lugar de un adorno prohibido.

---

## 183 — Ficha: solo el resumen de precio es fijo (enmienda la 133.1)

**Estado:** aceptada (D.13b; el responsable confirmó el hallazgo 5 el 2026-10-08).

**Decisión.** Desde 64rem solo `.property-summary--panel` es `position: sticky` (superficie opaca y filete de 1px); el panel de la
ficha deja de ser una caja con `max-block-size` y scroll propio y los datos y las fuentes fluyen con la página. `.property-header`
pasa a `display: contents` y el panel se estira (`align-self: stretch`) para que el precio tenga recorrido. El foco por teclado no
queda tapado (WCAG 2.4.11, técnica C43): `html:has(.property-detail)` suma 5.5rem + 1px a `scroll-padding-top`, solo desde 64rem.
Por debajo nada es fijo y rige el desplazamiento base. El recuadro anidado del aviso de D.12 desaparece con la caja exterior.

**Alternativas descartadas.** Mantener el panel entero fijo con scroll interno: cortaba la comparación de anuncios a 1280×800 y era un
recuadro dentro de un recuadro. Medir el precio con un `ResizeObserver`: la altura es fija por construcción y exigiría un componente
de cliente. Mover el resumen en el TSX: se prefirió solo CSS para no tocar los tests de orden del DOM.

**Motivo.** Un precio siempre visible sin esconder lo que se compara, y un foco que el propio precio no tapa.

---

## 184 — Tope de reintentos compartido y aviso de job fallido según los intentos

**Estado:** aceptada (D.13b; el responsable confirmó el comportamiento el 2026-10-08; enmienda la parte de copy de la 181).

**Decisión.** `COVERAGE_JOB_MAX_ATTEMPTS = 3` y `hasRetriesLeft(attempts)` viven en `packages/core/src/coverage-jobs/job-retry.ts` y se
exportan por el barril; el worker de ingesta los usa y se elimina la variable `MAX_ATTEMPTS` (no estaba definida en ningún entorno).
`noticeForOutcome` recibe los intentos del job (`retriesLeft`). Un job `failed` con reintentos dice «Lo volveremos a intentar más
tarde» y conserva «Comprobar de nuevo»; sin reintentos dice que no se reintentará de forma automática, propone un municipio cercano y
no pinta el enlace ni `CoverageStatus` (`isReloadable` es falso). El resto del copy impersonal pasa a primera persona del plural o
tuteo, y los dos topes mantienen frases distintas. El directorio se llama `coverage-jobs` y no `coverage` porque `.gitignore` ignora
cualquier carpeta `coverage/`.

**Alternativas descartadas.** Conservar el enlace en un job agotado: es un callejón sin salida (decisión 181). Que la web importe el
valor de `apps/ingestion`: está prohibido por la regla de no importarse entre apps. Mantener el override por entorno: dos fuentes de
verdad que la web no puede leer.

**Motivo.** El aviso debe decir la verdad sobre lo que hará el worker, con una única fuente del tope.

---

## 185 — Capa base de controles, hover con puntero fino, superficies del navegador e iconos dibujados

**Estado:** aceptada (D.13b; auditoría del suelo de oficio de impeccable).

**Decisión.** (1) `input`, `select`, `textarea` y `button` comparten el relleno `0.5rem 0.75rem` en `@layer base`; se quitan los rellenos
sueltos (la barra de dibujo del mapa es la única excepción compacta documentada). (2) Todo `:hover` va bajo
`(hover: hover) and (pointer: fine)` y se acompaña de `:active`; no se usa la variante `hover:` de Tailwind v4, que solo comprueba
`(hover: hover)` (lo fija `hover-gating.test.ts`). El primario mezcla `color-mix(in oklab, var(--accent), var(--ink) 12%)` (20% al
pulsar), sin token nuevo. (3) `caret-color` y `accent-color` desde `--accent` (radios y casillas conservan su forma nativa; solo cambia su
acento) y `scrollbar-color` bajo `@supports`. (4) `components/icon.tsx` (cerrar, enlace externo, más, menos; rejilla de 24, trazo 2,
`currentColor`, decorativos) sustituye a ×, ↗ y los glifos de Leaflet: el zoom recibe cadenas de confianza iguales al render del
componente y el cierre del popup se sustituye con `createElementNS`. (5) Los chips envuelven en vez de desplazarse, y la tabla del
histórico se apila bajo 30rem porque no cabía a 320 px ni envolviendo.

**Alternativas descartadas.** `hover:` de Tailwind: se activa en táctiles con ratón emulado. Una máscara CSS con `url()` para el
cierre: `url(` está prohibido en `globals.css`. Una biblioteca de iconos: una dependencia para cuatro trazos.

**Motivo.** Un único comportamiento de controles en toda la interfaz y sin caracteres haciendo de iconos.

---

## 186 — Lista de componentes de cliente ampliada a cuatro y CSS autónomo para las páginas fuera del layout

**Estado:** aceptada (D.14; enmienda la 113).

**Decisión.** La lista cerrada de `no-client-directive.test.ts` pasa de dos a cuatro ficheros: `coverage-status.tsx`, `search-map.tsx`,
`error.tsx` y `global-error.tsx`. Next exige que los límites de error sean componentes de cliente y ambos necesitan un manejador de
reintento. `not-found.tsx` y `components/empty-results.tsx` siguen siendo de servidor. `global-error.tsx` sustituye al layout raíz cuando
este falla y la página 429 la construye el proxy como cadena: ninguna cuelga de `globals.css`, así que comparten
`src/lib/standalone-page.ts` (`STANDALONE_PAGE_CSS`), una copia mínima de los tokens de `:root` y `.dark` que sigue
`prefers-color-scheme`. `test/standalone-page.test.ts` fija la paridad con `globals.css` y el contraste AA en ambos esquemas.

**Alternativas descartadas.** Importar `globals.css` desde `global-error.tsx`: arrastra todo Tailwind y falla justo cuando falla su
propio fichero. Dejar `global-error` con estilos en línea sueltos: dos copias de los colores sin test de paridad.

**Motivo.** Una pantalla de error no puede depender de lo que ha fallado, y la copia de tokens, al ser pequeña y comprobada, no se
desincroniza en silencio.

---

## 187 — La existencia de la ficha se comprueba en su layout con un cargador compartido y en caché

**Estado:** aceptada (D.14; enmienda la 148).

**Decisión.** `app/properties/[listingId]/layout.tsx` valida el parámetro con Zod, espera `loadPropertyHeader` (en
`src/server/property-header.ts`, con `import 'server-only'` y `cache()` de React) y llama a `notFound()` antes de renderizar nada. La
página y `generateMetadata` usan el mismo cargador, de modo que la consulta se hace una vez por petición. Un identificador malformado
no llega a la base de datos. La ficha no tiene `not-found.tsx` propio: el `notFound()` de un layout se resuelve con el raíz, que
mantiene el estado HTTP 404 (comprobado en `e2e/global-states.spec.ts`).

**Alternativas descartadas.** `notFound()` solo en la página: con una frontera de suspense por encima, el 404 llegaría ya con el
estado 200 enviado. Un `not-found.tsx` de la ficha: duplicaba el raíz sin aportar nada distinto.

**Motivo.** El estado HTTP correcto exige decidir la existencia antes de transmitir, y una sola consulta compartida evita pagarla tres
veces.

---

## 188 — La home vive en el grupo de rutas `(search)`

**Estado:** aceptada (D.14).

**Decisión.** `app/page.tsx` pasa a `app/(search)/page.tsx`. El grupo no cambia ninguna URL. Se hizo para poder dar a la búsqueda su propio
límite de carga sin que un `loading.tsx` raíz envolviera también al layout de la ficha (un `loading.tsx` raíz es el fallback de todos los
segmentos anidados, layouts incluidos, y volvería a dar 200 a un 404). Tras descartar `loading.tsx` (decisión 191) el grupo se
conserva: la estructura queda fijada por `app-structure.test.ts`, que prohíbe cualquier `loading.tsx` bajo `app/`.

**Alternativas descartadas.** Dejar la home en `app/page.tsx` y poner el `loading.tsx` en la raíz: rompe el 404 de la ficha. Revertir el
movimiento al descartar `loading.tsx`: el grupo es inocuo y la estructura queda lista para D.16 si se decide un esqueleto.

**Motivo.** Aislar el segmento de la búsqueda cuesta un movimiento de fichero y evita un fallo que el e2e solo vería en producción.

---

## 189 — Página 429 en HTML en español, construida como cadena por un módulo sin `server-only`

**Estado:** aceptada (D.14).

**Decisión.** `src/server/rate-limit-page.ts` exporta `buildRateLimitResponse(retryAfterSeconds)`, que devuelve cuerpo y cabeceras
(`Content-Type: text/html; charset=utf-8`, `Retry-After`, `Cache-Control: no-store`) de una página en español con
`STANDALONE_PAGE_CSS`. `proxy.ts` la alcanza fuera del grafo de componentes de servidor, así que el módulo no importa `server-only` ni
`next/*` y usa imports relativos. `Retry-After` conserva el valor del limitador sin recortar; el texto visible lo redondea (mínimo
1 segundo, minutos desde 60). Sin cabeceras `RateLimit-*`. Las cabeceras de `next.config` (CSP, HSTS) llegan a las respuestas del proxy;
la CSP admite estilo en línea. El e2e usa un segundo `webServer` en el puerto 3101 con el limitador activo y tope 1.

**Alternativas descartadas.** Renderizar la página con React desde el proxy: el proxy no puede montar componentes. Una ruta
`/rate-limited` con redirección: perdería el estado 429 y su cabecera.

**Motivo.** El estado 429 y sus cabeceras son el contrato con clientes y cachés; la página solo cambia lo que ve la persona.

---

## 190 — Estado vacío en tres tipos, precedencia y alcance de los filtros

**Estado:** aceptada (D.14; decisiones D10 y D13 de la especificación).

**Decisión.** `EmptyResults` distingue `unfiltered` (la base no tiene viviendas con ubicación), `filtered` (los filtros no dejan
ninguna) y `past-last-page` (página fuera de rango). `selectEmptyResultsKind` aplica la precedencia en cuatro pasos y un polígono que se
queda vacío no pinta el aviso de la lista. `scopeEmptyResultsFilters` se calcula una vez y deja fuera el polígono y la zona sin cobertura
aplicada, de modo que ni el recuento de filtros ni los enlaces de quitar los mencionan. `buildClearFiltersHref(params, { keep })` admite
conservar `zone`/`zoneQuery` o `polygon`. El enlace de limpieza se llama «Quitar todos los filtros» solo cuando no conserva nada (mismo
destino que la barra de chips) y «Quitar los demás filtros» cuando conserva zona o polígono (WCAG 3.2.4, identificación coherente).

**Alternativas descartadas.** Un único mensaje «sin resultados»: no orienta sobre qué cambiar. Quitar siempre la zona y el polígono al
limpiar: borra una selección que la persona acaba de hacer. Mantener el mismo nombre para dos destinos distintos: incumple 3.2.4.

**Motivo.** Cada vacío tiene una causa y una salida distinta, y el enlace debe llamarse por lo que hace.

**Enmendada por la 224 y la 225** (D.18): la zona se aplica siempre y el vacío filtrado tiene una sola acción; el alcance solo excluye el polígono.

---

## 191 — Mitigación sin JavaScript para un esqueleto de carga: RECHAZADA

**Estado:** rechazada (D.14, fase 0, spike descartable).

**Decisión.** No se añade ningún `loading.tsx`, `LoadingState`, `NO_JS_STREAM_CSS` ni CSS de esqueleto. Sin JavaScript, Next deja el
contenido real de una ruta que suspende en un `<div hidden id="S:n">` hasta que un script lo mueve. El spike probó un `<noscript><style>`
que ocultaba el esqueleto y revelaba el contenido: el esqueleto se ocultó, pero el contenido siguió oculto. Evidencia: el esqueleto
apareció en 20/20 peticiones de la home y 19/20 de la ficha, el contenido quedó oculto en `S:n` y fallaron seis pruebas e2e funcionales
sin JS. La causa del contenido oculto no se diagnosticó.

**Alternativas descartadas.** Esqueleto con `noscript` y `!important`: no revela el contenido. Esqueleto solo con JavaScript: la
aplicación funciona sin JS (filtros, tema, enlaces) y no debe degradarse. Diagnosticar el streaming de Next hasta el fondo: fuera del
alcance de D.14.

**Motivo.** Un esqueleto que deja la página en blanco para quien no tiene JavaScript es peor que no mostrar carga; la búsqueda local es
rápida y la página sigue sin estado de carga hasta que D.16 lo reconsidere con evidencia.

---

## 192 — Parámetros inválidos con rótulos en español y mensajes del núcleo en español

**Estado:** aceptada (D.14; amplía la 160 y el Registro 134).

**Decisión.** Los mensajes de validación de `packages/core` pasan a español sin clave ni jerga (`schemas/param-messages.ts`:
`REPEATED_VALUE`, `CHOOSE_OPTION`, y un mensaje explícito para cada comprobación, también el desbordamiento a `Infinity` de los números
con tubería). `apps/web/src/lib/search-labels.ts` mapea cada parámetro a un rótulo (`SEARCH_PARAM_LABELS`) y `formatSearchIssue`
antepone «Precio mínimo (€): …»; una clave desconocida o un camino vacío nunca muestra la clave técnica. El aviso de la página usa tuteo
(«Algún filtro no es válido; corrígelo abajo y vuelve a buscar. Detalle: …») y sustituye a `describeIssue`. Los mensajes dicen «enlace» y
no «dirección», que se lee como dirección postal. Zod 4: el `error` de nivel de esquema lo heredan las comprobaciones sin mensaje
propio, y un `z.number()` encadenado devuelve inglés ante un desbordamiento si no lleva el suyo; por eso cada pieza lleva el suyo.

**Alternativas descartadas.** Traducir en la web los mensajes en inglés de Zod: acopla la web a textos que cambian con la versión.
Mostrar la clave del parámetro como rótulo: es jerga técnica.

**Motivo.** El mensaje de un filtro inválido es lo único que la persona lee del núcleo; debe estar en su idioma y en el sitio donde lo
corrige.

---

## 193 — `eslint-plugin-jsx-a11y` adoptado con la configuración `recommended` en `error`

**Estado:** aceptada (D.15; enmienda la 011).

**Decisión.** `eslint-plugin-jsx-a11y` 6.10.2 es dependencia directa de desarrollo de `apps/web` (fijada, sin rango) y
`eslint.config.mjs` añade, antes de los bloques compartidos, `{ files: ['src/**/*.tsx'], ...jsxA11y.flatConfigs.recommended }`. Un
`lint` real lo comprobó: el plugin carga y corre en ESLint 10.9.1 aunque su rango de pares llegue solo a ESLint 9, así que no hizo falta
el plan B de las seis reglas de Next. Las reglas no corren sobre `e2e/` (lo comprueba `test/eslint-a11y-config.test.ts`). El
`lockfile` cambia en 3 líneas y `package.json` en 1. Hay siete desactivaciones por línea, todas en `price-history.tsx` y con motivo:
`tabIndex` de la región con desplazamiento propio, `thead` y `tbody` con rol explícito, y cuatro `td role="cell"`. Esos roles hacen falta
en la alternativa apilada del histórico, que cambia el `display` de la tabla, y `td role="cell"` es un falso positivo de la regla. Cualquier otro hallazgo se corrigió en el código.

**Alternativas descartadas.** `eslint-config-next/core-web-vitals`: arrastra `eslint-plugin-react`, que rompe en ESLint 10 (decisión
011). La configuración `strict` del plugin: más estricta que lo que exige el paso, sin evidencia de que haga falta. Solo las seis reglas de Next
como `error`: era el plan B, innecesario porque el plugin completo funciona. Suprimir los siete avisos con una desactivación global del
fichero: oculta cualquier hallazgo futuro.

**Motivo.** Cierra el aplazamiento de la 011 con un coste de siete líneas justificadas y una puerta de lint que evita regresiones de
accesibilidad en el marcado.

---

## 194 — Región de mapa con nombre y ayuda de teclado visible

**Estado:** aceptada (D.15, F2).

**Decisión.** Un hijo `ContainerSemantics` de `SearchMapCanvas` (dentro de `search-map-canvas.tsx`, sin fichero de cliente nuevo; el
allowlist de `no-client-directive` sigue en cuatro) usa `useMap` y asigna `role="region"`, `aria-label="Mapa interactivo"` y
`aria-describedby` a `map.getContainer()`. El párrafo de ayuda (`<p id="map-keyboard-help">`) lo renderiza el servidor tras el marco en
`app/(search)/page.tsx` y su id llega por la prop nueva `SearchMapProps.keyboardHelpId`. El texto es visible para todos.

**Alternativas descartadas.** Pasar las propiedades a `MapContainer`: react-leaflet no reenvía `aria-*`. Un `div` envoltorio con la
semántica: el elemento que recibe el foco es el contenedor de Leaflet. Ayuda solo en un `title`: no se ve ni se lee de forma fiable.

**Motivo.** La descripción debe estar en el elemento que toma el foco; la ayuda visible sin JavaScript cumple el principio 4. Cambia las
capturas de las rutas con mapa.

---

## 195 — Tema activo anunciado con texto alternativo de CSS

**Estado:** aceptada (D.15, F3).

**Decisión.** Las reglas `.light .theme-selector [value='light']::after` (y las de `dark` y `system`) fijan `content: '' / ', activo'`.
El nombre accesible pasa a «Sistema, activo» y los botones inactivos no cambian. No hay cambio visual y la cabecera sigue siendo estática.

**Alternativas descartadas.** `aria-pressed` leído de la cookie: hace dinámica la cabecera y rompe la decisión 147. Un script de
cliente: añadiría un quinto fichero al allowlist. Texto visible «(activo)»: cambia el diseño del selector.

**Motivo.** La coma inicial sobrevive al recorte de espacios del cálculo de nombre; Playwright 1.63 interpreta el texto alternativo tras
`/`. Un lector de pantalla debe saber qué tema está activo sin mover la cabecera a modo dinámico.

**Enmendada por la 223** (D.18): el texto alternativo «, activo» va en el span del nombre del botón de icono, no en el botón.

---

## 196 — Campos rechazados con `aria-invalid` y descripción del error existente

**Estado:** aceptada (D.15, F4).

**Decisión.** Cada campo cuyo parámetro rechaza la validación lleva `aria-invalid="true"` y `aria-describedby` apuntando a la única
alerta que ya existe, ahora con id (`filters-alert`, `criteria-alert`, `search-text-alert`). El ayudante compartido
`rejectedParamKeys(issues)` de `lib/search-labels.ts` lo calculan las dos ramas de la página y llega a `FilterBar` y `CriteriaForm`
como `rejectedKeys` y a `CriteriaFields` como `invalid`; `SearchTextForm` acepta `errorId`. La validación con Zod no cambia.

**Alternativas descartadas.** Mensaje en línea por campo: duplica el texto de la alerta y agranda el cambio. Marcar todos los campos
cuando hay alerta: el lector no sabría cuál corregir.

**Motivo.** Una sola fuente de texto de error, y WCAG 3.3.1 y 1.3.1 piden que el campo en fallo se identifique de forma programática.

---

## 197 — Dirección del resultado que se parte en lugar de recortarse

**Estado:** aceptada (D.15, F5; la parte del mapa queda exenta).

**Decisión.** `.result-row__address` usa `overflow-wrap: anywhere` en lugar de `nowrap` con puntos suspensivos, de modo que el texto
completo se ve a 320 px y con espaciado de texto del usuario. La mitad del mapa (etiquetas `.map-price` de tamaño fijo 96×24) se
exime: la prueba de espaciado 1.4.12 pasó sin cambios, así que `map-cluster-layer.tsx` y `search-map-canvas.css` no se tocan. La
prueba se escribió antes y falló solo para la dirección.

**Alternativas descartadas.** Etiquetas del mapa con tamaño al contenido (`iconSize: undefined`, `translate`, `min-block-size`):
estaba en el diseño, pero sin fallo que lo justifique es cambio sin evidencia. Una caja fija más grande: sigue recortando con más
zoom o espaciado.

**Motivo.** WCAG 1.4.4 y 1.4.12: ningún contenido se pierde. La exención está registrada en la tabla de desviaciones.

---

## 198 — Encabezado del resultado con tipo y operación

**Estado:** aceptada (D.15, F6).

**Decisión.** El `h2` de `result-card.tsx` es el precio visible más `<span class="sr-only">, {tipo · operación}</span>`. La cadena del
tipo se construye una vez y alimenta también la línea visible.

**Alternativas descartadas.** Reordenar la jerarquía visual para que el tipo encabece: quita el protagonismo al precio (principio 1).
`aria-label` en el `h2`: sustituye al contenido visible y desalinea el nombre.

**Motivo.** Quien navega por encabezados oye qué es cada resultado. Coste aceptado: el tipo se repite en el nombre del enlace.

---

## 199 — Atribución de Leaflet solo en español

**Estado:** aceptada (D.15, F7).

**Decisión.** El ayudante puro `stripPrefixTitles` (`src/lib/map-attribution.ts`) quita los atributos `title` del prefijo de Leaflet y
un efecto `AttributionLanguage` lo aplica con `attributionControl.setPrefix(...)` al montar el mapa. No queda ningún `title` en
`.leaflet-control-attribution` ni texto de prefijo en inglés (WCAG 3.1.2).

**Alternativas descartadas.** Quitar el crédito de Leaflet o la bandera: es una atribución y debe seguir visible. Parchear el DOM tras renderizar:
Leaflet lo reescribe. Un `replace` en línea sin ayudante: no se podía probar en unitario.

**Motivo.** Sin cambio visual y con la regla comprobada por una prueba e2e (sin `[title]` en inglés).

---

## 200 — Diapositivas de la galería enfocables y enlaces de 40 px

**Estado:** aceptada (D.15, F1 y F8).

**Decisión.** Las diapositivas de `source-gallery.tsx` llevan `tabIndex={-1}` y `focus-visible:-outline-offset-2` (el contenedor con
desplazamiento recorta los contornos exteriores) para que el enlace de fragmento mueva el foco a la diapositiva destino. Los enlaces
de la galería son `inline-flex min-h-10 items-center`.

**Alternativas descartadas.** Dejar el foco en el enlace de origen, que acaba fuera de la vista tras desplazar. Cumplir solo el mínimo
de 24 px: el convenio de cabecera y ventana emergente es de 40 px.

**Motivo.** El foco sigue al contenido (2.4.3) y los objetivos no dependen de la excepción de espaciado de 2.5.8.

---

## 201 — Axe sobre estados dinámicos sin línea base ni capturas

**Estado:** aceptada (D.15).

**Decisión.** `e2e/a11y-states.spec.ts` ejecuta axe con `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa` y exige que la
lista de violaciones sea `[]`. No usa `toHaveScreenshot` ni escribe en `axe-baseline.json`. Cubre bandeja abierta (320 y 768),
parámetros inválidos, `?q=` vacío y con zona a elegir, `?zoneQuery=`, página 2, ventana emergente, `error.tsx`, la página 429 y
`global-error` (claro y oscuro). `error.tsx` se inyecta con `renderToStaticMarkup` en el `<main>` de `/no-existe` para conservar el
cascarón y el CSS reales; el 429 y `global-error` usan `setContent`. Playwright impone su runtime JSX al importar `.tsx`, así que
un puente de prueba (`toReactNode`) convierte sus nodos en elementos de React; el marcado escaneado es el real. También mide el
tamaño de «Ver mapa» y «Ver lista» (decisión 202).

**Alternativas descartadas.** Una ruta de error solo para tests: código de producción que existe por la prueba. Añadir estos estados a
la línea base: una línea base admite violaciones, y aquí el criterio es cero. Escanear una copia estática del HTML de las páginas de
error: no usaría el CSS ni el cascarón reales.

**Motivo.** La suite de D.1 solo recorre estados estáticos; los dinámicos eran el hueco real tras comprobar que la línea base estaba
vacía. Todos pasaron a la primera.

---

## 202 — Conmutador «Ver mapa/Ver lista» con altura mínima de 40 px

**Estado:** aceptada (D.15, 2.5.8; no estaba en el diseño).

**Decisión.** `.view-toggle a` pasa a `display: inline-flex; align-items: center; min-block-size: 2.5rem`. Solo CSS: el marcado que
verifican los tests no cambia. A 1280 px el conmutador sigue oculto (`display: none` desde 64rem) y la prueba lo comprueba.

**Alternativas descartadas.** Añadir una clase de utilidad de Tailwind al enlace: toca el marcado cubierto por los tests unitarios y
repite el valor. Confiar en axe: lo midió en verde con un enlace en línea de 20 px de alto, y la prueba de caja lo desmintió.

**Motivo.** La prueba de caja de 24×24 falló en rojo a 320 y 768 px. Cambia las capturas de esas rutas (16 px por página).

---

## 203 — Foco al título de la página de error al montarse y a `main` tras reintentar

**Estado:** aceptada (D.15, F12; hallazgo de la pasada manual con el Narrador, punto 11).

**Decisión.** `error.tsx` y `global-error.tsx` mueven el foco a su `<h1>` (`tabIndex={-1}` y `ref`, enfocado en un efecto al montarse):
el lector lee «No hemos podido cargar esta página» y el siguiente Tab llega a «Reintentar». En `error.tsx`, al desmontarse tras un
reintento con éxito, el foco vuelve a `main#contenido` (destino del enlace «Saltar al contenido») solo si se perdió
(`document.activeElement` es `body`, la raíz o `null`). En `global-error.tsx` solo se hace la parte del montaje: al reintentar,
esa frontera sustituye a todo el documento y `main#contenido` aún no existe cuando se desmonta. La lógica vive en
`src/lib/error-focus.ts` (funciones puras, sin DOM) para probarla en vitest; el título no pinta contorno propio, igual que `main`
(`focus-visible:outline-hidden`, y la misma regla en `STANDALONE_PAGE_CSS`). No se añade ningún fichero de cliente: el allowlist sigue en 4.

**Alternativas descartadas.** Foco en «Reintentar»: salta el título, así que el lector no dice qué ha pasado. `role="alert"` sin mover
el foco: se anuncia, pero el foco queda perdido en `body` y el Tab siguiente empieza desde la cabecera.

**Motivo.** El diseño clasificó F12 como «comprobar a mano» y la auditoría estática no vio que `error.tsx` no gestionaba el foco; el
Narrador no anunciaba nada y el foco no estaba en ningún sitio.

---

## 204 — Una pista visible «solo cifras» para los campos numéricos

**Estado:** aceptada (D.15, F4; hallazgo de la pasada manual con el Narrador, punto 13).

**Decisión.** `CriteriaFields` pinta una sola pista, «Precio, superficie, habitaciones y baños: solo cifras.», con id
`<prefijo>-numeric-hint` y `aria-describedby` en los seis campos `type="number"`. En la barra de filtros va en una línea propia encima
de los campos; en el panel de `?q=`, al principio del grupo «¿Cuánto quieres pagar?». Una sola pista y no seis: repetirla seis veces
saturaba el formulario y el lector la leería en cada campo con el mismo texto. Con un campo rechazado el orden es pista primero y
alerta después (`filter-numeric-hint filter-alert`), el mismo que ya usa el campo de texto libre (`search-text-help` y su alerta, 196):
una sola convención. Los desplegables solo se describen con la alerta. Sigue siendo Server Component puro.

**Alternativas descartadas.** `type="text"` con `pattern` y validación nativa: pierde el teclado numérico y el control de pasos, y
cambia el comportamiento del envío. Solo registrar el límite en la documentación: el usuario del lector seguiría sin saber por qué no
se escribe una letra.

**Motivo.** Chrome descarta en silencio las letras en `type="number"` y el Narrador solo deletreaba lo tecleado. Cambia las
capturas donde la bandeja está abierta (1280 px) y `nl-query` (24 PNG).

---

## 205 — Sin transiciones de vista (view transitions)

**Estado:** aceptada (D.16).

**Decisión.** No se usa `@view-transition`, `document.startViewTransition` ni `<ViewTransition>` de React. Los filtros de la búsqueda
viven en la URL y cada cambio es una navegación: animarlas todas añadiría movimiento a una acción que se repite muchas veces por sesión
y el brief pide que nada se anime por acciones repetidas. Una prueba estática (`design-tokens.test.ts`) prohíbe `@view-transition` y `@starting-style` en
el CSS del proyecto.

**Alternativas descartadas.** `@view-transition { navigation: auto }` (entre documentos): no funciona en Firefox y pondría a la
navegación habitual un fundido que el resto de navegadores no tendría. `<ViewTransition>` de React: en Next 16.3.4 no pide ninguna
opción de `next.config` (se comprobó en `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`), así que el descarte no es
técnico sino de producto: el beneficio sería un cruce de pantallas en una herramienta de uso frecuente y tocaría la estructura de
las páginas sin que ninguna pantalla lo pida.

**Motivo.** El brief de D.16 permitía evaluarlas «solo si no exigen» cliente ni flag; aunque no exigen flag, no aportan nada que
justifique el movimiento extra.

---

## 206 — Movimiento de Leaflet siempre apagado y parche privado del teclado

**Estado:** aceptada (D.16).

**Decisión.** El `MapContainer` fija `zoomAnimation={false}`, `fadeAnimation={false}` y `markerZoomAnimation={false}` y el grupo de
clústeres se crea con `animate: false`, siempre y sin depender de `prefers-reduced-motion`. Las flechas del teclado llaman a
`map.panBy(offset)` sin opciones y hacen un desplazamiento animado por JavaScript de 0,25 s que ninguna de esas opciones ni el CSS
detienen. `src/components/map-instant-keyboard.ts` (`makeKeyboardInstant`, módulo puro con importación solo de tipos) envuelve el
`_onKeyDown` privado del manejador de teclado de Leaflet: durante cada pulsación `panBy` y `setZoom` reciben `{ animate: false }` y se
restauran en un `finally`. Se desactiva y se vuelve a activar el manejador alrededor del cambio, y si el mapa ya tenía el foco se
vuelve a enlazar (`_addHooks`), porque `enable()` solo engancha el `keydown` del documento al siguiente foco. Si falta `keyboard` o
`_onKeyDown` no hace nada. Un componente `InstantKeyboard` del lienzo lo monta con un efecto y lo deshace al desmontar. `leaflet` queda
fijado en `1.9.4` exacto en `apps/web/package.json`, y un test de contrato comprueba el fichero que devuelve `require.resolve('leaflet')`
(`dist/leaflet-src.js`), no el campo `module`, que leaflet no declara.

**Alternativas descartadas.** Parchear `L.Map.prototype.panBy` de forma global: cambiaría también el `autoPan` del popup, `fitBounds` y la
inercia del arrastre, que quedan fuera del alcance (son movimientos de puntero o del sistema, no de teclado repetido). Apagar solo con
`prefers-reduced-motion`: la regla «nada se anima por teclado repetido» vale para todos. Una hoja que anule las transiciones del CSS de
Leaflet: el pan de teclado es JavaScript, no CSS, y no se tocan hojas de terceros (la hoja propia va la última, decisión 165).

**Motivo.** Es la única forma de cumplir el brief sin una biblioteca nueva, a costa de depender de una API privada: de ahí el pin exacto
y el test de contrato que falla en voz alta si una versión de Leaflet cambia la mecánica.

---

## 207 — Con movimiento reducido los tiempos valen 0s; salida con ease-in

**Estado:** aceptada (D.16).

**Decisión.** Los tres tiempos (`--duration-feedback` 100 ms, `--duration-panel-enter` 250 ms, `--duration-panel-exit` 200 ms) se ponen a
`0s` dentro de `@media (prefers-reduced-motion: reduce)`, en una regla sin capa entre `@theme static` y `@layer base` para ganar a la
capa del tema. Un solo interruptor: todo consumidor de los tokens se vuelve instantáneo sin reglas por elemento. Los tokens de curva son
`--ease-enter` (`cubic-bezier(0.23, 1, 0.32, 1)`, familia ease-out) y `--ease-exit` (`cubic-bezier(0.3, 0, 1, 1)`, la curva de aceleración
estándar de Material 3, familia ease-in); los nombres evitan `--ease-in` y `--ease-out`, que son de Tailwind. Las transiciones se
escriben con propiedades largas (`transition-property`, `-duration`, `-timing-function`, `-behavior`), nunca con la abreviatura.

**Alternativas descartadas.** Un fundido más suave en vez de cero (la skill de animación aconseja «más suave, no cero»): el brief pide
quitar todo movimiento no esencial y las capturas del paso D.1 se toman con movimiento reducido, así que cero es la opción que las deja
idénticas. `ease-in-cubic` para la salida (el consejo de las skills es no usar ease-in): se aceptó ease-in porque el brief lo exige, con
la variante de Material 3 por ser la de menor espera inicial a 200 ms. Reglas `transition: none` por elemento: duplican el interruptor.

**Motivo.** Un único punto de control para la reducción de movimiento y una excepción documentada frente a las skills.

---

## 208 — La pulsación escala solo con puntero; los botones del tema quedan fuera

**Estado:** aceptada (D.16).

**Decisión.** `transform: scale(0.97)` se aplica en `:active:not(:focus-visible)` a todo `button`, al resumen de la bandeja
(`.filter-tray > summary`) y a los chips (`.applied-filters__chip`); la base declara `transition-property: transform` con
`--duration-feedback` y `--ease-enter`, de modo que soltar también tiene tiempo. El teclado nunca escala (Espacio deja el botón
`:active` sin transformarlo) y un clic de ratón sobre un elemento que ya muestra `:focus-visible` tampoco: es una limitación aceptada
que quita la diferencia entre Chrome y Firefox, que no marca `:active` con Espacio. Los tres botones del selector de tema se excluyen con
`button:not(.theme-selector button)`: son `<button type="submit">` de un formulario que recarga la página, así que la animación no se
vería y su estado ya se distingue por peso y borde. Los colores de `:hover` y `:focus` siguen siendo instantáneos.

**Alternativas descartadas.** `:active` a secas: el teclado repetido animaría el botón, contra el brief. Una clase en el selector de tema o
`transform: none` en sus reglas: la exclusión en el selector no deja a esos botones ni transición. Transicionar color o fondo del `:hover`:
no es movimiento que explique un cambio de estado y rompería «solo `transform` y `opacity`».

**Motivo.** El movimiento solo responde a un gesto de puntero, nunca a una acción repetida de teclado.

---

## 209 — Las rutas de error solo para e2e se inyectan en la build de Docker, nunca en `src/app`

**Estado:** aceptada (D.17).

**Decisión.** `Dockerfile.e2e` copia `apps/web/e2e/inject/app/` a `apps/web/src/app/` justo antes de `next build`, con una guarda
`test ! -e` para no pisar nada. La carpeta contiene `e2e-only/error-boundary/page.tsx` (lanza al renderizar, `force-dynamic`),
`e2e-only/global-error/page.tsx` (no pinta nada) y `template.tsx` (de cliente; lanza solo en `/e2e-only/global-error`). La plantilla
raíz queda por encima del límite de error raíz (Layout, Template, ErrorBoundary), así que lo que lanza solo lo recoge
`global-error.tsx`. `test/e2e-injection-boundary.test.ts` fija la frontera: ni `src/app/template.*` ni `src/app/e2e-only` existen en el
árbol versionado, ninguna fuente de `src` menciona `e2e/inject` ni `E2E_ONLY`, y solo `Dockerfile.e2e` se refiere a `e2e/inject`. La build
de producción hecha en el anfitrión no tiene `/e2e-only` en `.next/app-path-routes-manifest.json`.

**Alternativas descartadas.** Una ruta de prueba versionada en `src/app` protegida por una variable de entorno: existiría en la build de
producción y D.15 ya había renunciado a ella (decisión 201). Renderizar los componentes con `react-dom/server` en un test: no es la página
servida con su CSS real, que es lo que se captura. Un parámetro de consulta que fuerce el fallo: sería un camino de fallo en producción.

**Motivo.** Es la única forma de capturar `error.tsx` y `global-error.tsx` tal como las sirve Next sin que nada de prueba llegue al
artefacto de producción, y el test de frontera lo hace comprobable.

---

## 210 — Dieciocho capturas de las páginas autónomas, con un cubo del limitador por proyecto

**Estado:** aceptada (D.17); la pidió el responsable antes de la crítica.

**Decisión.** `error.tsx`, `global-error.tsx` y la página 429 se capturan en los seis proyectos (3 anchos por 2 temas): 18 capturas nuevas,
de 102 a 120 en total. La 429 sale del segundo servidor (puerto 3101, limitador activo con tope 1, decisión 189) y cada proyecto envía su
propia cabecera `x-e2e-client-ip` (rango de documentación 198.51.100.x, cuatro direcciones reservadas por proyecto para los reintentos),
de modo que ninguno comparte cubo con otro. El espec comprueba además que `matchMedia` devuelve el esquema esperado, que el `body` no es
transparente y que axe no da ninguna violación.

**Alternativas descartadas.** Reiniciar el servidor 3101 entre proyectos: es lento y el estado del limitador es global al proceso. Capturar
un solo proyecto: no cubriría los tres anchos ni el tema oscuro del CSS autónomo de `standalone-page.ts`. No capturarlas: ese CSS es una
copia de `globals.css` que podía romperse sin que nada lo viera.

**Motivo.** Son las tres páginas que no cuelgan de ninguna ruta de `ROUTES` y la única copia manual de los tokens del sistema.

---

## 211 — Una sola palabra para el estado de un anuncio

**Estado:** aceptada (D.17); texto aprobado por el responsable.

**Decisión.** Un anuncio se muestra como «Disponible» o «No disponible» en toda la ficha, con `listingStatusLabel`
(`src/lib/listing-status.ts`): solo el valor exacto `'active'` es disponible, igual que el SQL, y cualquier otro estado (inactivo, retirado
o desconocido) es no disponible. Antes la fila de la fuente decía «Retirado» y la insignia del histórico «(no disponible)». Se eligió la
palabra que ya dominaba en el código y en los tests. Solo cambian los estados: «Ordenar por» y «Sentido: Cualquiera» no se tocan.

**Alternativas descartadas.** «Retirado» como palabra única: solo describe uno de los estados y un anuncio inactivo o de estado
desconocido no está retirado. Mantener las tres palabras: nombra con textos distintos el mismo estado en la misma página. Distinguir
retirado de inactivo: el producto no hace esa distinción hoy.

**Motivo.** El mismo estado debe leerse igual en la cabecera, en la lista de fuentes y en el histórico.

---

## 212 — Retirada de seis tokens sin uso

**Estado:** aceptada (D.17).

**Decisión.** Se eliminan de `globals.css` `--success` (en los tres bloques de tema), `--color-success`, `--z-base`, `--z-overlay` y las
utilidades `--color-focus` y `--color-danger`. Se conservan las variables `--focus` y `--danger`, que sí se usan con `var()` (anillo de
foco y borde de los paneles de alerta). Quedan 14 tokens de color y tres capas z (`map-controls`, `sticky-header`, `toast`).
`design-tokens.test.ts` se ajusta (14 colores, `focus` y `danger` fuera de las utilidades, pares de contraste sin `success`, z
reducida) y su snapshot pierde las seis filas.

**Alternativas descartadas.** Conservarlos por si hicieran falta: `DESIGN.md` documentaría tokens que ningún componente usa y el test de
contraste seguiría comprobando pares inertes. Retirar también `--focus` y `--danger`: se usan en el CSS base y en los avisos.

**Motivo.** Un sistema de diseño documentado debe contener solo lo que usa; el resto es deuda que el documento heredaría.

---

## 213 — Zona sin datos: chip marcado y rótulo de la lista, con el comportamiento intacto

**Estado:** aceptada (D.17); texto aprobado por el responsable.

**Decisión.** Cuando la zona pedida existe pero aún no tiene datos y no se aplica (D10), el chip dice «Zona: <Municipio> · sin datos
todavía» (`ZONE_UNAPPLIED_SUFFIX` en `search-labels.ts`) y sigue siendo quitable, y sobre la lista aparece el rótulo «Mientras tanto,
viviendas de todos los municipios» (`.search-results__caption`) cuando hay resultados. La búsqueda se comporta exactamente igual que
antes: la zona sigue sin aplicarse hasta que tenga datos.

**Alternativas descartadas.** Aplicar la zona y dejar la lista vacía: cambia el comportamiento y queda como seguimiento. Ocultar el chip:
el usuario vería viviendas de otros municipios sin saber por qué.

**Motivo.** La crítica señaló que el chip afirmaba una zona que la lista no respetaba; basta decirlo con texto sin cambiar la lógica.

**Reemplazada por la 224** (D.18): el sufijo, el rótulo y la lista de todos los municipios desaparecen; la zona se aplica siempre.

---

## 214 — Estado de la cobertura con etiqueta de texto y un único panel

**Estado:** aceptada (D.17).

**Decisión.** El aviso de la actualización de una zona lleva una etiqueta de texto con el estado del trabajo («En cola», «En curso»,
«Terminada», «Fallida») con borde `rule-control`, y vive dentro de un único `.coverage-panel` junto con la frase de refresco automático y,
al final, el enlace «Comprobar de nuevo». El aviso sigue siendo la región viva y el panel toma el borde `danger` solo cuando es una alerta.

**Alternativas descartadas.** Distinguir el estado solo con color o con un icono: no se distingue sin color. Un indicador de progreso
animado: sería movimiento nuevo fuera de las decisiones 205-208. Paneles anidados (aviso dentro de un panel): nunca se anidan cajas.

**Motivo.** El estado no puede depender solo del color y el enlace de recarga debe quedar al final, donde se lee la acción.

---

## 215 — La cabecera se compacta por debajo de 30rem sin reducir los objetivos de 40 px

**Estado:** aceptada (D.17); confirma la decisión 200.

**Decisión.** Por debajo de 30rem solo se reducen el relleno vertical y el hueco entre filas (`max-[30rem]:py-2` y
`max-[30rem]:gap-y-0`). Los cinco objetivos de la cabecera (marca, «Buscar» y los tres botones del tema) siguen midiendo 40 px
(`min-h-10`) a todos los anchos, y `layout-shell.test.ts` lo fija. Un primer intento los bajó a 32 px y se revirtió en la puerta del
orquestador. El selector de tema sigue en una segunda fila a 320 px: queda como seguimiento.

**Alternativas descartadas.** Objetivos de 32 px bajo 30rem: cumplen 2.5.8, pero contradicen el criterio de 40 px que la decisión 200
fijó para toda la cabecera. Un menú desplegable para el tema: sería un componente de cliente nuevo y la cabecera es estática (147).

**Motivo.** Recuperar altura sin tocar el contrato táctil de la app.

**Enmendada por la 223** (D.18): la cabecera pierde «Buscar» y cabe en una fila a 320 px; los botones del tema siguen en 40 px.

---

## 216 — `DESIGN.md` y su sidecar: formato, idioma y derivación comprobada por un test

**Estado:** aceptada (D.17).

**Decisión.** `DESIGN.md` en la raíz sigue el formato de la especificación (frontmatter con colores, tipografía, radios, espaciado y
componentes, y las ocho secciones canónicas con sus encabezados en inglés); la prosa, los nombres y la narrativa van en español, por la
regla de documentación del proyecto. `.impeccable/design.json` (esquema 2) guarda lo que el frontmatter no admite: rampas tonales, sombras,
movimiento, puntos de ruptura, escala z, anillo de foco, componentes con HTML y CSS, y la narrativa. Los valores se copian literalmente de
`globals.css` (el hex sigue siendo hex y el OKLCH, OKLCH; `accent` se llama `primary` y los valores oscuros llevan el sufijo `-dark`).
`test/design-md.test.ts` compara como texto cada valor con la hoja final y comprueba los ocho encabezados y el sidecar; lee el frontmatter
con un análisis plano propio (acepta comillas simples y dobles, porque Prettier las normaliza). Norte creativo «La Hoja del Mapa
Topográfico» y nombres de color (Azul de hidrografía, Siena de trama, Tinta de plancha, Filete de marco) confirmados por el responsable.

**Alternativas descartadas.** Redactarlo desde `DESIGN-ROADMAP.md` o desde las intenciones: se desvía del código entregado. Hacer de un
fichero de tokens la fuente y generar el CSS: cambia la fuente de verdad, que ya es `globals.css`. Añadir una dependencia de YAML: el
frontmatter es plano y no merece una dependencia.

**Motivo.** Un documento de diseño solo sirve a los agentes si no puede desviarse en silencio del código; el test lo garantiza.

---

## 217 — Fuentes deterministas en la imagen de capturas: Liberation Sans por `fontconfig`

**Estado:** aceptada (D.18, seguimiento 1).

**Decisión.** `apps/web/e2e/fontconfig/50-buscahogar-e2e-sans.conf` se copia a `/etc/fonts/conf.d/` en `Dockerfile.e2e`. Tres reglas
`<match target="pattern">` (familias `sans-serif`, `sans` y `system-ui`) anteponen Liberation Sans con `prepend_first` y `binding="strong"`;
el 50 hace que corra después de `49-sansserif.conf`. Un `RUN` de la imagen falla la build si `fc-match` no devuelve Liberation Sans para las tres
familias o si `demibold` y `bold` no se resuelven a la cara Bold. La producción no cambia. Como Liberation Sans no tiene cara SemiBold, todo el
peso 600 se pinta como Bold (700) en las capturas: se acepta y se documenta en `DESIGN.md`.

**Alternativas descartadas.** `<alias><prefer>`: inserta antes del genérico pero queda detrás del `prefer` anterior de `44-wqy-zenhei`, así que
depende del orden. Instalar Noto o DejaVu: de 2 a 43 MB sin ganancia.

**Motivo.** Solo `prepend_first` fuerza la familia a la cabeza sea cual sea el orden; D.17 había dejado los pesos 600 y 700 pintados como 400.

---

## 218 — Semilla coherente: la versión vigente toma la fecha del último avistamiento

**Estado:** aceptada (D.18, seguimiento 3).

**Decisión.** En la semilla e2e el `capturedAt` de la versión vigente de cada anuncio es su `lastSeenAt` (la fecha de siembra para los activos,
28/02 para el retirado, 31/08 para el inactivo) y `firstSeenAt` es `history[0] ?? currentCapturedAt`. Un test fija el invariante
`firstSeenAt = min(capturedAt) ≤ max(capturedAt) ≤ lastSeenAt`. Un anuncio con una sola observación dice «Primer precio observado el X; aún sin
cambios».

**Alternativas descartadas.** Cambiar la lógica de la ficha: no había error en ella.

**Motivo.** Los datos de la semilla eran contradictorios (una versión más reciente que el último avistamiento), no el código.

---

## 219 — Marca en las páginas independientes: franja de cabecera, no línea sobre el título

**Estado:** aceptada (D.18, seguimiento 6); sustituye la primera versión del diseño.

**Decisión.** `global-error.tsx` y `server/rate-limit-page.ts` pintan una franja `<header class="standalone-header">` con el enlace «Buscahogar»
(`standalone-header__brand`: `heading-3`, 40 px de alto, enlace a «/») y un filete inferior `--rule`, fuera del bloque centrado. `STANDALONE_PAGE_CSS`
copia `--rule` de `:root` y `.dark` y el test de paridad lo cubre. El bloque centrado pasa a `max-width: 37rem` con `padding: 1.5rem` porque
`box-sizing` es `border-box`: así el ancho útil sigue siendo 34rem.

**Alternativas descartadas.** La versión inicial: un `<p class="standalone__brand">` sobre el `h1`. La regla de impeccable prohíbe la «ceja» (una
etiqueta de marca encima del título) y se descartó al aplicar. Un enlace de marca sin franja: no imita la cabecera de la app. Primer intento de
la franja: sin aumentar el ancho, el relleno comía 3rem del bloque y lo estrechaba.

**Motivo.** La marca visible fuera del layout, con la apariencia de la cabecera de la app y sin una ceja.

---

## 220 — Los precios agrupan siempre los miles

**Estado:** aceptada (D.18, seguimiento 8).

**Decisión.** `formatPriceCents` usa `toLocaleString('es-ES', { useGrouping: 'always' })` y da «1.180 €». La superficie y el radio siguen con
`formatNumber` (regla de la RAE: cuatro cifras sin punto).

**Alternativas descartadas.** Agrupar todos los números: rompería la RAE para los m².

**Motivo.** La columna de precios quedaba desigual («1180 €» frente a «185.000 €»); Chromium lo confirma en e2e.

---

## 221 — «Último precio más bajo» cuando no hay anuncios activos

**Estado:** aceptada (D.18, seguimiento 10); enmienda la 180.

**Decisión.** `HIGHLIGHT_BY_MODE['none-active']` pasa de «Precio más bajo» a «Último precio más bajo». Con anuncios activos se mantiene «Más
económico».

**Alternativas descartadas.** Unificar las dos etiquetas: son estados distintos (el mínimo de los activos o el mínimo histórico).

**Motivo.** El responsable pidió que la etiqueta dijera que el precio es el último conocido.

---

## 222 — Gráfico de precios con dos SVG a escala 1:1

**Estado:** aceptada (D.18, seguimiento 5).

**Decisión.** `buildPriceChart(series, layout)` genera un modelo con dos disposiciones: `compact` (288 × 160, máximo 24rem, la de partida) y
`wide` (544 × 192, máximo 34rem). `.price-chart` es `container-type: inline-size` y desde 34rem de contenedor se oculta el compacto
(`display: none`, fuera del árbol de accesibilidad) y se muestra el ancho. Etiquetas del eje x: inicio, final y la primera captura de cada serie
posterior al inicio, con anchura fija de 70 más 8 de hueco; la que se solapa se descarta por prioridad (inicio, final, serie en orden temporal).

**Alternativas descartadas.** Un único `viewBox` escalado: el texto quedaría en ~6 px a 320 px, o en ~24 px si el de 288 se ensancha a 34rem.

**Motivo.** El texto del gráfico se lee igual a cualquier ancho y el resultado es determinista.

---

## 223 — Cabecera de una fila con el tema por iconos

**Estado:** aceptada (D.18, seguimiento 7); enmienda la 195 y la 215.

**Decisión.** Se quitan `<nav>` y «Buscar»; queda el enlace de marca. El selector de tema son tres botones de icono de 40 × 40
(`sun`, `moon`, `monitor` de `icon.tsx`), con la leyenda «Tema» y el nombre en `sr-only`, y `ml-auto` a todos los anchos. El texto alternativo de la
195 pasa al span del nombre: `.theme-selector [value=…] .theme-selector__name::after { content: '' / ', activo' }`, así que el nombre es exactamente
«Oscuro, activo». La señal visual del activo es el borde de 2px (1px más una sombra interior de 1px) y una barra de 2px en `button::before`; se
quitan el subrayado y el peso 600, que un icono no tiene.

**Alternativas descartadas.** `aria-pressed`/`aria-current`: exigen leer el tema al renderizar y vuelven dinámica la cabecera (147, 195).
`aria-label`: sustituye el contenido y pierde el texto alternativo. Barra y texto alternativo en el mismo `::after`: riesgo de un espacio
(«Oscuro , activo»).

**Motivo.** A 320 px la cabecera ocupaba dos filas; ahora marca y tres botones caben en una.

---

## 224 — La zona se aplica siempre que haya centroide y radio

**Estado:** aceptada (D.18, seguimientos 4 y 15); sustituye la 213 y enmienda la 190.

**Decisión.** Con centroide y `sweepRadiusM`, `effectiveCriteria.geo` se aplica en cualquier estado de cobertura; la resolución de cobertura y su
aviso no cambian. Una zona no localizable (desconocida, o sin centroide o radio) no consulta nada y devuelve una lista vacía con el aviso
existente. Se eliminan `ZONE_UNAPPLIED_SUFFIX`, `zoneApplied`, `DescribeAppliedFiltersOptions`, `zoneUnapplied` y `.search-results__caption`.
`scopeEmptyResultsFilters` solo trata el polígono y `ClearKeepKey` es `'polygon'`.

**Alternativas descartadas.** Listar todos los municipios mientras no hay datos (213): contradice el chip de la zona.

**Motivo.** El chip afirmaba una zona que la lista no respetaba; ahora la respeta y la lista vacía se explica con el aviso.

---

## 225 — Estado vacío con una sola acción, sin repetir los chips

**Estado:** aceptada (D.18, seguimiento 11); enmienda la 190, con el refinamiento del responsable en la puerta G-D.

**Decisión.** El vacío filtrado muestra el estado («Ninguna vivienda coincide con tu búsqueda.»), la frase «Los filtros aplicados están arriba;
pulsa uno para quitarlo.» y una única acción en `.empty-results__action`: «Quitar los demás filtros» si hay un polígono que conservar, y «Quitar todos
los filtros» en los demás casos. Refinamiento: la acción solo se muestra si la fila de chips no ofrece ya «Quitar todos» (menos de dos chips) o si hay
un polígono que conservar, para que nunca haya dos enlaces idénticos. Desaparecen el detalle «Prueba a quitar alguno…», la lista «Quitar «X»» y el
prop `filters`; `CLEAR_ALL_THRESHOLD` pasa a ser privado de `applied-filters.tsx`.

**Alternativas descartadas.** Conservar la lista por filtro: duplica los chips. Mostrar siempre la acción (primera versión): con dos o más
chips repetía «Quitar todos» con el mismo nombre y destino (WCAG 3.2.4 lo admite, pero era ruido).

**Motivo.** Los chips ya son la lista de filtros; el vacío solo añade la salida.

---

## 226 — «Filtros N» cuenta los chips

**Estado:** aceptada (D.18, seguimiento 12); sustituye la 154.

**Decisión.** `countAppliedFilters(criteria)` es `describeAppliedFilters(criteria, null).length`. `TRAY_FILTER_KEYS` y `countTrayFilters` se
eliminan, de modo que el número incluye zona y radio.

**Alternativas descartadas.** Mantener la lista de claves de la bandeja: obligaba a mantener dos fuentes.

**Motivo.** El número y los chips salen de la misma función y coinciden por construcción.

---

## 227 — Ordenación por enlaces predefinidos

**Estado:** aceptada (D.18, seguimientos 9 y 13).

**Decisión.** `lib/sort-presets.ts` define cinco ordenaciones: «Más recientes» (por defecto, no se escribe en la URL), «Precio: de menor a mayor»,
«Precio: de mayor a menor», «Superficie: de mayor a menor» y «Superficie: de menor a mayor». `SortPresets` pinta `<ul>` de enlaces de 40 px junto
al recuento (`buildSortHref` descarta `page`, `sort` y `dir`); el vigente lleva `aria-current="true"`, peso 600 y una barra de 2px. Una combinación
fuera de los cinco (por ejemplo `updated` ascendente) no marca ninguno. Se eliminan los desplegables «Ordenar por» y «Sentido». En la revisión de
`?q=` son cinco radios `name="order"` que `canonicalizeFormSubmission` convierte en `sort`/`dir`; un `order` desconocido o repetido se pasa tal cual a
`sort` para que Zod lo rechace con nombre.

**Alternativas descartadas.** Un `<nav>`: landmark de más. Enlaces en el panel de `?q=`: descartarían las ediciones. Dos desplegables: etiquetas
incoherentes. Ignorar un `order` inválido: incumple el rechazo con nombre.

**Motivo.** Sin JavaScript, sin «Cualquiera» ni «Sentido» y con las mismas etiquetas en todas partes.

---

## 228 — La caja de texto es un `<details>` plegable en un landmark `search`

**Estado:** aceptada (D.18, seguimiento 14); enmienda la 158.

**Decisión.** `SearchTextForm` pinta `<search><details><summary>Describe lo que buscas</summary><form>…</form></details></search>`, plegable a todos
los anchos. Se abre en la portada, en las dos ramas de `?q=`, con parámetros no válidos y con zona desconocida (extensión del diseño: su aviso
dice «Escribe el nombre del municipio en el buscador»). La etiqueta del campo queda `sr-only` pero asociada, de modo que el nombre del campo sigue
siendo «Describe lo que buscas» (2.5.3).

**Alternativas descartadas.** Las dos etiquetas visibles: las mismas palabras dos veces. `aria-labelledby` al resumen: nombra un campo con un control.
`role="search"` en el `<details>`: no permitido. Siempre abierta en escritorio: no confirmado.

**Motivo.** La caja competía con los filtros en las páginas de resultados.

---

## 229 — Un único orden en el DOM para la cabecera de la búsqueda

**Estado:** aceptada (D.18, seguimiento 16).

**Decisión.** `.search-header` sigue el orden de lectura sin `order` en CSS: título, pasos, `<search>`, `.search-toolbar` (bandeja de filtros y
ordenación, con `flex-wrap`), chips, sugerencias de zona, panel de cobertura, aviso del polígono y conmutador de vista. Con la bandeja abierta, y
desde 64rem, la bandeja ocupa toda la fila. Pulido tras G-D: el hueco de la barra es de 1rem; el aviso de cobertura no lleva margen propio; y los
resultados bajan 1rem tras un aviso solo desde 64rem, donde no hay conmutador (el primer intento a todos los anchos añadía 16 px bajo el
conmutador a 320 y 768).

**Alternativas descartadas.** CSS `order` o `row-reverse`: rompen 1.3.2 y 2.4.3.

**Motivo.** El mismo apilado a los dos anchos y un orden de tabulación igual al visual.

---

## 230 — Figtree autoalojada con `next/font/local`

**Estado:** aceptada (D.19); enmienda la 132 (tipografía de la pila del sistema).

**Decisión.** La fuente de la aplicación es Figtree variable (pesos 300-900, subconjunto latino que cubre el español), servida desde el propio
origen. El módulo vive en `apps/web/src/fonts/figtree.ts` (`localFont` con `display: 'swap'`, `adjustFontFallback: 'Arial'` y la variable
`--font-figtree`), junto al `woff2` (20.156 B, de `@fontsource-variable/figtree` 5.3.0, copiado sin añadir la dependencia) y su `OFL.txt`.
`layout.tsx` pone `figtree.variable` en `<html>`. En `globals.css` el puente es `--font-sans: var(--font-figtree, system-ui), <pila del sistema>`
dentro de `@theme static`. La CSP no cambia (`font-src 'self'`); Figtree es variable, así que el 600 es una cara real. Las páginas
independientes no la cargan (233).

**Alternativas descartadas.** `next/font/google`: descarga en la build y añade un origen de terceros. `@theme inline` para `--font-sans`: resolvería
`var(--font-figtree)` en cada utilidad y se rompería donde la variable no existe (páginas independientes, tests); `@theme static` emite la
variable en `:root` con el respaldo. Colocar el módulo en `app/fonts`: el spec lo decía, pero el directorio `app` está reservado a rutas y
convenciones; `src/fonts/` lo deja fuera. Instalar `@fontsource-variable/figtree` como dependencia: arrastra un `@font-face` con `url()` que la
guarda de tokens prohíbe.

**Motivo.** La web se veía demasiado seria; una familia propia es la palanca más barata de calidez y cumple la regla de no llamar a terceros.

---

## 231 — Paleta cálida, tema oscuro compuesto y verde de estado favorable con lavados: el azul sigue siendo el único acento interactivo

**Estado:** aceptada (D.19); enmienda la 132 (paleta) y la regla The One Blue Rule de `DESIGN.md`.

**Decisión.** Los neutros pasan del matiz frío de 235° a uno cálido (70-85°): papel `#faf8f3`, papel sobrepuesto `#fefdfb`, tinta `#1e1c19`; el
tema oscuro es un carbón cálido compuesto aparte (no una inversión). Se añaden cuatro tokens por tema: `vegetation` y tres lavados
(`vegetation-wash`, `primary-wash` —utilidad `accent-wash`— y `danger-wash`). El verde señala un estado favorable no interactivo («Disponible»,
la marca «Más económico», la insignia «Disponible en N fuentes») y siempre con texto. El azul sigue siendo el único acento **interactivo**; los
chips de filtro aplicados toman el lavado azul (`primary-wash`) y los paneles de alerta el lavado de `danger`. «Último precio más bajo» no se
pinta de verde: describe una captura, no un estado. Los pares de contraste nuevos se comprueban en `design-tokens.test.ts` en ambos temas.

**Alternativas descartadas.** Que el verde fuese un segundo acento: compite con la acción y rompe la jerarquía que da el azul. Verde en
«Último precio más bajo»: sugeriría un estado de la vivienda donde solo hay una comparación de capturas. Invertir el tema claro para el oscuro:
daría blancos hirvientes y sombras de matiz equivocado.

**Motivo.** Calidez sin extravagancia: el cambio de temperatura sale de los neutros y de un verde de estado, no de un segundo acento.

---

## 232 — Radios un paso más amables: 0,375 y 0,5rem

**Estado:** aceptada (D.19); enmienda los radios de D.3.

**Decisión.** `--radius-control` pasa de 0,25 a 0,375rem y `--radius-panel` de 0,375 a 0,5rem, en `globals.css`, `DESIGN.md`, `design.json` y la
página independiente (`standalone-page.ts`). Sin píldoras ni radios mayores, y los clústeres del mapa siguen siendo círculos.

**Alternativas descartadas.** Un radio de 0,75rem o píldoras en chips: cambia el carácter de la hoja técnica y presiona las cajas de ancho
fijo (etiquetas de 96×24px). Dejar los radios: la fuente nueva con esquinas casi rectas se leía rígida.

**Motivo.** Un solo escalón basta para acompañar a Figtree sin que el refinado derive en un rediseño.

---

## 233 — Páginas independientes con la pila del sistema y paridad de paleta

**Estado:** aceptada (D.19).

**Decisión.** El error global y la página 429 se renderizan fuera del árbol del layout y por eso no tienen la variable de Figtree ni
`globals.css`. `standalone-page.ts` conserva la pila del sistema y sus colores en línea, ahora con la paleta cálida y el radio de 0,375rem;
`standalone-page.test.ts` comprueba la paridad con los tokens de `globals.css`.

**Alternativas descartadas.** Cargar Figtree en estas páginas: el error global puede aparecer justo cuando la carga de recursos falla, y la
página 429 no debe pedir más al servidor que ya limita. Dejarlas en blanco y azul frío: se verían de otra aplicación.

**Motivo.** Robustez de las páginas de último recurso sin que desentonen con la paleta.

---

## 234 — Texto de la app en capturas = Figtree; Liberation Sans solo de respaldo (acota la 217)

**Estado:** aceptada (D.19); acota la 217.

**Decisión.** La regla de `fontconfig` de la 217 se conserva, pero ya no determina el texto de la aplicación en las capturas: lo pinta Figtree
(`fonts.spec.ts` comprueba que el cuerpo usa la familia, que existe la cara real `300 900` y que las cifras tabulares funcionan). Liberation Sans
queda para el respaldo y para las páginas independientes, donde el 600 sigue pintándose como 700. Se retira de `DESIGN.md` la nota «600 se pinta
como 700» para las páginas de la app. Además, `fixed-boxes.spec.ts` mide las cajas de ancho fijo con «1.234.567 €» a 320 y 1280, y el gráfico
bajó `Y_LABEL_GAP` de 8 a 4 tras desbordar 2px.

**Alternativas descartadas.** Retirar `fontconfig` de la imagen e2e: las páginas independientes seguirían sin una fuente determinista.

**Motivo.** El determinismo de las capturas pasa a depender del `woff2` del repositorio y no del sistema; el respaldo sigue fijado.

---

## 235 — Motivo de curvas de nivel junto al título de la búsqueda, en SVG incrustado (enmienda la 132)

**Estado:** aceptada (D.20); enmienda la regla de marginalia de la 132 (`docs/DECISIONS.md`, secciones OWN-WORLD y «Un solo marco y una sola
trama»).

**Decisión.** La regla «ninguna otra marginalia cartográfica» admite exactamente un motivo decorativo: curvas de nivel junto al título de los
resultados de búsqueda. Es el componente `contour-motif` (SVG de 240 × 48 con cinco anillos cerrados anidados alrededor de una cima y la tercera
curva como maestra), incrustado en línea, `aria-hidden`, sin foco, fuera del flujo (posición absoluta y `pointer-events: none`) y por debajo del
título. Solo aparece en `(search)/page.tsx`: no en la portada en lenguaje natural, ni en la ficha, ni en los 404. Trazo con tokens existentes
(`rule-control` al 35% en claro, `rule` entero en oscuro), sin colores nuevos. La misma redacción enmendada vive en `DESIGN.md`, `design.json` y
`PRODUCT.md`, y `design-md.test.ts` impide que se separen.

**Alternativas descartadas.** (1) Un fichero SVG en `public/` con `mask-image` o `background-image`: obliga a abrir el matcher del `proxy` a esa
ruta y a enmendar los tests que prohíben `url(` en la hoja de estilos, es decir, tocar la política de seguridad por un adorno. (2) Un motivo
repetido en la ficha, el vacío y la cabecera: contradice el principio 1 de `PRODUCT.md`. (3) El primer dibujo de líneas onduladas paralelas, que
se leía como un matasellos y no como curvas de nivel (se rehízo tras la revisión visual).

**Motivo.** Una decoración mínima, accesible y sin coste de red ni de CSP; el límite «uno solo» conserva la sobriedad de la 132.

---

## 236 — Fila de resultado: precio por peso, etiqueta de operación neutra y «Sin foto» con pauta

**Estado:** aceptada (D.20).

**Decisión.** El precio de la fila pesa 700 en todos los anchos y mantiene el tamaño y el interlineado de D.6b (heading-3 en móvil y heading-2
desde 48rem), con `letter-spacing` normal cuando falta; la fila no crece (alturas fijadas en U0 con tolerancia de 4px). La operación pasa a ser
la etiqueta `result-row__operation` en la línea de tipo («Piso · Venta»), neutra: peso 400, borde de 1px en `rule`, sin tono ni fondo, con el
mismo texto accesible. «Sin foto» dibuja una pauta cuadrada interior (`rule`, 1px, a 0,375rem) con texto en peso 600, sobre el tinte de tinta de
D.17 (P3). La insignia de una sola fuente lleva un contorno (`outline`, desplazamiento −1px) en lugar de un borde.

**Alternativas descartadas.** Subir el precio a heading-2 en móvil: la columna de 10rem y el alto de la fila lo impiden (la primera versión del
diseño añadía unos 6px a 320). Colorear la etiqueta de operación (azul o verde): el azul es solo para lo interactivo y el verde para un estado
favorable (decisión 231). Fondo `surface-sunken` en «Sin foto», como pedía el spec: en oscuro quedaba más oscuro que la página (razón de la P3 de D.17).
Un borde en la insignia de una fuente: añade alto y cambia la altura de la fila.

**Motivo.** Presencia del precio y carácter de la fila sin tocar la densidad ni el color semántico.

---

## 237 — Superficies neutras, banda de precio de la ficha y pie rebajado

**Estado:** aceptada (D.20).

**Decisión.** Sin tokens nuevos: los avisos (revisión en lenguaje natural, aviso del polígono, aviso de cobertura), el panel de cobertura, los
números de los pasos y el panel `panel` de `DESIGN.md` usan `surface-raised`; el estado vacío y las incidencias de la revisión usan
`surface-sunken`; las alertas conservan `danger-wash`; los chips, `primary-wash`. El pie pasa a `surface-sunken` con su filete. El precio de la
ficha es un panel elevado con borde `rule` y radio `panel`; desde 64rem es una banda con `margin-inline: -1rem` y `padding-inline: 1rem`, de modo
que el texto queda alineado con la rejilla de datos (corrección de la revisión visual).

**Alternativas descartadas.** Un token nuevo de «superficie de aviso»: duplica `surface-raised`. Dejar la banda al ras del contenido: el texto
quedaba sangrado respecto a la rejilla y el panel apenas se distinguía.

**Motivo.** Calidez por jerarquía de papeles ya existentes, con la paridad de `COLOR_TOKENS` intacta.

---

## 238 — Icono `check` como señal que no depende del color

**Estado:** aceptada (D.20).

**Decisión.** «Disponible» y la marca «Más económico» (solo en modo activo) llevan delante el icono `check` (`M20 6 9 17l-5-5`, trazo de 2,
`currentColor`, decorativo y sin foco). «Último precio más bajo» no lo lleva. El texto visible y el nombre accesible no cambian.

**Alternativas descartadas.** Un icono de otra familia o de colores propios: contradice «no cargar iconos de terceros» y la regla del verde.
Poner el icono también en «Último precio más bajo»: el verde no se usa ahí (decisión 231).

**Motivo.** El estado favorable ya se decía con texto; el icono añade una segunda señal visual sin depender del tono.

---

## 239 — Línea base visual: borrar y reescribir cuando el cambio queda por debajo del umbral

**Estado:** aceptada (D.20); acota la 130 y la regla de `test:e2e:update`.

**Decisión.** `--update-snapshots=changed` no reescribe una captura cuya diferencia queda por debajo del umbral de `toHaveScreenshot` (el pie y
el motivo, de pocos píxeles). Para un cambio visual transversal se borran los PNG afectados (102 en D.20: 17 por proyecto en 6 proyectos; no
`global-error`, `rate-limit` ni `draw-frame`, que no llevan el pie del layout raíz ni son una captura de página) y se regeneran con
`pnpm e2e:update`; después se revisa cada imagen en aislamiento y se corre `pnpm e2e` sin actualizar.

**Alternativas descartadas.** Confiar en `changed`: deja capturas obsoletas que pasan sin mostrar el pie. Bajar el umbral global: abre falsos
positivos en el resto de la suite.

**Motivo.** Una línea base completa o ninguna; es la misma salida que ya hubo que tomar con `rate-limit` en D.19.

---

## 240 — Tokens de movimiento, transiciones de color y nuevos estados de puntero (enmienda la 207 y la 208)

**Estado:** aceptada (D.21); amplía el sistema de movimiento de D.16 sin tocar su interruptor.

**Decisión.** Dos duraciones nuevas en `@theme static`: `--duration-hover` (150ms) y `--duration-appear` (200ms). El bloque de
`prefers-reduced-motion: reduce` pasa a poner a `0s` exactamente las cinco duraciones y la 207 sigue siendo el único interruptor. Las
transiciones de color van por longhands, con `--ease-enter` y listas de duración emparejadas, y solo en una lista cerrada de selectores
(`COLOUR_TRANSITION_SELECTORS` en `design-tokens.test.ts`): botones (salvo los del selector de tema), `.filter-tray > summary`,
`.applied-filters__chip`, `.nl-disclosure > summary`, enlaces (`a:not(.skip-link)`), `.sort-presets__link` y `.result-row__link`. Los
controles de formulario, el selector de tema y `:focus-visible` quedan instantáneos. El responsable aceptó tres estados de puntero que
no existían: el enlace pasa a `color-mix(in oklab, var(--accent), var(--ink) 12%)` (la receta del botón primario), el enlace de ordenación
no activo marca su filete con `--rule-control` y la paginación reutiliza el hover del enlace. La regla «sin movimiento decorativo» se
reescribe: el movimiento solo responde a una acción o anuncia un estado, sin bucles, paralaje ni movimiento ligado al desplazamiento, y con
movimiento reducido todo es instantáneo.

**Alternativas descartadas.** (1) `transition: all` o el atajo `transition`: arrastra propiedades de layout y permite el borde por accidente.
(2) Permitir las propiedades de color en cualquier selector (primer borrador del diseño): la barrera no distinguía el movimiento de un
control del de un adorno, y el enlace de salto habría animado. (3) Un segundo interruptor de movimiento reducido: dos fuentes de verdad.
(4) Pasar el enlace de `accent` a `ink` al pasar el puntero: pierde la señal de que sigue siendo un enlace. (5) Un borde de ordenación con
`--rule` (primer borrador): contradecía el spec, que pedía un cambio visible; queda en `--rule-control`.

**Motivo.** Calidez por respuesta, no por adorno, con una barrera que puede comprobarse en el CSS entregado.

---

## 241 — Realce de la fila de resultado y puerta de movimiento reducido

**Estado:** aceptada (D.21); amplía la 207.

**Decisión.** Al pasar el puntero (`hover: hover` y `pointer: fine`) la fila de resultado cambia su fondo a `--surface-sunken` con la
transición de color de la 240; la imagen se amplía a `scale(1.03)` solo si además se cumple `prefers-reduced-motion: no-preference`. La
miniatura conserva `overflow: hidden`, de modo que la caja no cambia de tamaño y la altura de fila queda fijada por los tests de D.20.
Con movimiento reducido el tinte se mantiene (instantáneo) y la imagen no se mueve. El factor de escala se limita a (1, 1.03] en el test de
tokens y su puerta de medios debe contener los tres requisitos.

**Alternativas descartadas.** (1) Tinte con `--surface-raised`: apenas visible en claro. (2) Escala con duración `0s` bajo movimiento reducido:
la imagen saltaría de tamaño; la puerta de medios hace que el movimiento no exista. (3) Elevar la fila con sombra o desplazarla: cambia
la caja y arriesga las alturas fijadas.

**Motivo.** Una señal de «esto se abre» sin mover la fila ni añadir un segundo interruptor.

---

## 242 — Aparición de los avisos y alertas instantáneas (enmienda la 205 y la barrera de D.16)

**Estado:** aceptada (D.21); enmienda la 205 y la prohibición de `@keyframes` de D.16.

**Decisión.** Un único `@keyframes notice-appear { from { opacity: 0 } }` (sin `to`) y una única regla que lo aplica con
`animation-name`, `-duration` (`--duration-appear`), `-timing-function` (`--ease-enter`) y `-fill-mode: none` a: el panel de cobertura sin
alerta, el aviso de cobertura que no es alerta, la revisión de lenguaje natural, la lista de fuentes con aviso y el estado vacío. Las
alertas (`role="alert"`) quedan instantáneas. La barrera de `design-tokens.test.ts` exige exactamente ese `@keyframes` y esa regla, y sigue
prohibiendo `@starting-style`, `@view-transition`, el atajo `animation`, el retardo, las repeticiones y todo movimiento en
`search-map-canvas.css`. Repetición: la aparición se reproduce en cada carga completa de página (los enlaces y formularios son `<a>`/GET sin
`next/link`); `router.refresh()` del estado de cobertura no la repite y `router.push` del dibujo de polígono **no** remonta el subárbol, así
que tampoco la repite. El diseño afirmaba lo contrario («verificado en código»); una lectura e2e lo refutó y el test se ajustó
(`docs/AI-NOTES.md`).

**Alternativas descartadas.** (1) `@starting-style`: solo anima el primer renderizado y su único efecto en la bandeja ya se descartó en D.16.
(2) Una isla de cliente que marque «aparecido»: añade JavaScript a avisos que son HTML de servidor. (3) Desplazamiento al aparecer:
movimiento de layout. (4) `fill-mode: forwards/both`: retendría la opacidad y un aviso podría quedar invisible. (5) Animar el panel y el
aviso interior: los fundidos se multiplican. (6) Animar las alertas: retrasa un mensaje que debe anunciarse ya.

**Motivo.** Anunciar un estado sin retener nunca el contenido ni animar lo urgente.

---

## 243 — Pulido de la fase: motivo, banda de la ficha y marca de estado

**Estado:** aceptada (D.21); cierra los seguimientos de D.20.

**Decisión.** (1) Motivo: el componente `contour-motif` pasa a un `<svg>` exterior sin `viewBox` (unidades = píxeles de la caja) con una
máscara de alfa en el espacio de la caja que desvanece los bordes visibles a cualquier ancho; el `<svg>` interior (`viewBox="-40 -7 330 66"`,
`xMidYMid slice`) contiene los cinco anillos con margen. (2) Banda de precio de la ficha (desde 64rem, en **ambos** temas): el desajuste con
la lista de fuentes era la extensión del filete (1rem de sangría a cada lado), no su grosor, que ya era de 1px `--rule` en los dos. El filete
pasa a un `::after` con `inset-inline: 1rem`; la banda conserva relleno, sangría y altura. (3) Marca de estado de cobertura: cuadrado con
`currentColor` delante del texto del estado, como señal de forma; la etiqueta de operación no cambia.

**Alternativas descartadas.** (1) Máscara en unidades del `viewBox` interior: `slice` recorta el desvanecido a 320. (2) `mask-image` en CSS o
un SVG servido: abre `url(` en la hoja de estilos (decisión 235). (3) Ocultar el motivo a 320: pierde el único momento decorativo en móvil.
(4) Quitar la sangría de la banda, engrosar el filete o limitarlo al tema claro: tocan lo que no estaba mal. (5) Etiqueta de operación en
versalitas o rellena, o punto redondo: se parte a 320, choca con el tinte de fila o contradice la 232.

**Motivo.** Cerrar los seguimientos de D.20 sin cambiar densidad ni alturas de fila.

---

## 244 — Correcciones de pulido tras la revisión visual (P1-P8 y F1-F4)

**Estado:** aceptada (D.21); decisiones 14 y 15 del responsable.

**Decisión.** La primera revisión (seis revisores sobre 120 capturas, sin bloqueantes ni mayores) dio ocho hallazgos menores y el responsable
los aceptó todos (P1-P8); la segunda (dos revisores) encontró una regresión mayor introducida por P8 y tres menores, también aceptados
(F1-F4). Elecciones con motivo:

- **P1 motivo:** máscara radial en lugar de lineal y anillos 4-5 ocultos bajo 25rem. **F3:** bajo 25rem el trazo grueso pasa al anillo 2, para
  que la curva maestra no sea la que se desvanece por los lados.
- **P2 etiqueta de estado:** 14px (`--text-dense`), no los 12-13px pedidos, porque no existe un token de 13px y no se crean tokens por un píxel.
  La marca pasa a 0,5rem.
- **P3 y F4 gráfica de precios:** cinco composiciones fijas (288x160, 416x176, 544x192, 704x200, 768x208) elegidas con consultas de contenedor
  a 26/34/44/48rem, en lugar de un `viewBox` estirado: el texto se pinta 1:1 (12px ±1 a 320, 768 y 1280) y la escala nunca pasa de 1,4.
- **P4 y F2 formulario NL:** pares de rango (`criteria-range`) con etiquetas cortas «Mínimo»/«Máximo» (prefijo y unidad solo para lectores, de
  modo que el nombre accesible no cambia; la unidad pasa a la leyenda), grupo propio «¿Cuántas habitaciones y baños?» y la misma separación de
  0,5rem en los tres pares (`.criteria-group fieldset` ganaba por especificidad a la regla del par).
- **P5 chips:** envoltorio de 48rem como máximo; «Quitar todos» sigue siendo hermano de la lista, limitado a esa columna.
- **P6 historial:** `table-layout: fixed` con columnas 30/24/20/26 %; la nota de hechos pasa a «—: no consolidado; consulta los anuncios de origen».
- **P7 fecha:** `<time>` sin salto de línea; las dos etiquetas del aviso con borde `--rule-control` y peso 400; solo la activa lleva verde.
- **P8 y F1 avisos:** los avisos y el conmutador de vista pasan de la cabecera a `.search-results__notices`, primer hijo de la rejilla de
  resultados (el orden de la 229 se conserva); desde 64rem el aviso ocupa la columna 1 y el mapa la 2; el conmutador se oculta en lista
  vacía; el panel de vacío sin aviso previo lleva `margin-block-start: 1rem` para no tocar los chips.

**Alternativas descartadas.** Un `viewBox` único y responsivo para la gráfica (texto a ~16px a 768); mover «Quitar todos» dentro de la lista
(rompe la semántica de la lista); un token de 13px; una máscara elíptica para F3 (más compleja que cambiar el anillo grueso); dejar el hueco de
260px bajo el aviso (la rejilla usa `auto 1fr`).

**Motivo.** Cada corrección responde a un hallazgo medido o visto en captura; ninguna cambia las alturas de fila.

---

## 245 — Bases de datos de test derivadas y aprovisionadas solas; cierra la 046 y enmienda la 069

**Estado:** aceptada (paso 3.2); cierra la 046 y enmienda la 069.

**Decisión.** Las suites con base de datos (`packages/db`, `apps/web`, `apps/ingestion`) nunca usan la base de desarrollo. A partir de
`DATABASE_URL` derivan `<dev>_db_test`, `<dev>_web_test` y `<dev>_ingestion_test` (`packages/db/src/test-database.ts`). Un `globalSetup` por
paquete crea la base si no existe (un `42P04` cuenta como éxito), la migra una vez y, en `apps/web`, aplica los `GRANT` de los roles
`web_readonly` y `web_coverage`. `setup-env` redirige `DATABASE_URL`, `WEB_DATABASE_URL` y `WEB_COVERAGE_DATABASE_URL` a la base derivada, y
los tres `truncateAll` llaman antes a `assertConnectedToTestDatabase`, que rechaza vaciar cualquier base cuyo nombre no termine en `_test`.
`TEST_DATABASE_URL` desaparece. La 069 se enmienda: `bootstrap-roles-grants.sql` pasa a usar `DO` con `format('%I', current_database())`, de
modo que sirve para cualquier base y el comando `psql` de desarrollo sigue igual. La fila de la 046 en «Pendientes de decidir» queda cerrada.

**Alternativas descartadas.** (1) Script `initdb.d` y `\gexec` de Compose para crear las bases: solo se ejecuta sobre un volumen vacío (el mismo
límite que ya documenta el README para PostGIS) y obliga a recrear el volumen. (2) Una `TEST_DATABASE_URL` por entorno: otra variable que
configurar a mano y que puede apuntar mal; la derivación y el guardián de nombre hacen el error imposible. (3) Solo el guardián, sin bases
separadas: evita la pérdida pero deja las suites sin poder correr contra una base con datos.

**Motivo.** Un `pnpm test` vació la base de desarrollo y dejó como única ubicación una fila de prueba (`18009 Granada`), de modo que una búsqueda
válida salía vacía (3.2). Un fallo de configuración debe ser ruidoso y ningún test debe poder tocar datos reales.

**Consecuencias.** `search-bench.db.test.ts` (que consume `BENCH_DATABASE_URL`) vaciaba en su `afterAll` la base de banco con 1M de filas;
ahora usa un `truncateBenchTables` local, condicionado a que el propio test haya generado los datos. Las pruebas de `apps/web` y
`apps/ingestion` por separado necesitan `pnpm --filter "./packages/*" build` antes, porque `./test-database` se resuelve contra `dist`.

---

## 246 — Aviso de zona cubierta sin resultados (enmienda la 225)

**Estado:** aceptada (paso 3.2); enmienda la 225.

**Decisión.** Si hay filtros, la zona está `covered` y es localizable (centroide y radio), el vacío de la lista añade bajo el estado:
«Los anuncios de {municipio} están al día, así que son los filtros los que dejan la lista vacía. Están arriba; pulsa uno para quitarlo.»
Sustituye a la frase de la 225 solo en ese caso; sin zona cubierta se conserva «Los filtros aplicados están arriba; pulsa uno para quitarlo.».
`EmptyResults` recibe `coveredZone?: string | null` y `page.tsx` lo rellena únicamente en la rama localizable. Sigue siendo un `<p>` sin
`role` ni `aria-live`, con una sola acción y sin repetir los chips; el texto del mapa no cambia.

**Alternativas descartadas.** La frase del diseño («… están al día. Los filtros aplicados están arriba…»): no enlazaba la causa con la
consecuencia y repetía «filtros aplicados». Un `role="status"`: el vacío ya se anuncia en el panel. Mostrarlo también en zonas sin cobertura
al día: sería falso, el aviso de cobertura ya explica ahí por qué puede faltar oferta.

**Motivo.** Con la zona al día, el usuario que ve la lista vacía debe saber que la causa son sus filtros y no una falta de datos.

---

## 247 — Escrituras masivas por lotes bajo el tope de parámetros, dentro de la misma transacción

**Estado:** aceptada (paso 3.2, seguimiento).

**Decisión.** Ninguna sentencia del reproceso liga más parámetros que un presupuesto fijo de 30 000, por debajo del tope de 65 535 del
protocolo de PostgreSQL (el recuento viaja como uint16). `chunkByBindParameters` (`packages/db/src/bind-parameters.ts`) parte filas o ids en
lotes consecutivos, sin perder ni reordenar ninguno. En `writeConsolidation` la evidencia por par y `property_listings` se insertan por
lotes cuyo coste por fila es el número total de columnas de la tabla (derivado del esquema con `getTableColumns`, como cota superior). Todos
los lotes van en la misma transacción: la escritura sigue siendo todo o nada (D8 del paso 1.10). `hydrateListingsForDedup` y
`fetchCurrentVersionInfo`, que filtran el corpus completo con `inArray` (un parámetro por id), consultan también por lotes.

**Alternativas descartadas.** (1) No hacer nada y subir el límite: no se puede, es del protocolo, no del servidor. (2) `COPY`: Drizzle no lo
expone, obliga a otro camino de escritura con serialización propia de `jsonb` y no aporta nada a este volumen. (3) Un único INSERT con
`unnest` de arrays por columna (un parámetro por columna): evita el tope, pero sustituye el INSERT tipado de Drizzle por SQL a mano con
conversiones explícitas de tipos para cada columna, y no sirve para `inArray`. Los lotes resuelven los tres casos con el mismo ayudante.

**Motivo.** El worker de cobertura cayó al consolidar tras barrer Granada (1 751 anuncios): un INSERT de ~12 485 pares × 8 parámetros =
99 880, que llegó al servidor como 34 344 (08P01). La transacción se revirtió sin dejar nada a medias, pero ningún reproceso podía terminar.

**Consecuencias.** El margen absorbe columnas con `default` (no ligan parámetro) y cualquier parámetro fuera de las filas. Siguen sin lotes
`fetchGroupMinPriceCents` (`inArray` por miembros de un grupo, acotado por el tamaño del grupo) y las inserciones de una sola fila.

---

## 248 — Registro mensual de cuota con reserva por carril: herencia entre meses, reserva única de peticiones y privilegios cerrados

**Estado:** aceptada (paso 3.3, PR4a). Decisiones de producto PD10 y PD12 del propietario.

**Contexto.** La cuota de la API de Idealista es mensual y de pago (CLAUDE.md), pero el único tope que el código conocía era el diario
(`daily_request_budget`, 066/104), una cifra de entorno que nada ligaba al total del mes. La prebúsqueda de las ciudades más pobladas
(PR4b) puede gastar miles de peticiones de golpe: necesita un techo mensual que **garantice** una reserva para la demanda de usuario y que
ningún proceso pueda saltarse.

**Decisión.**

1. **Tabla `monthly_request_budget`** (migración 0019), una fila por (mes UTC, fuente), PK `(month, source_id)`: `total_cap`, `reserve`,
   `search_requests` y su desglose por carril (`batch_requests`, `on_demand_requests`, `refresh_requests`), más `token_requests` aparte (el
   token no consume cuota de búsqueda). CHECK estructurales: `total_cap > 0`, `0 <= reserve < total_cap`, contadores ≥ 0, `search_requests =
   batch + on_demand + refresh` y `search_requests <= total_cap`. El mes lo fija el reloj de Postgres (`date_trunc('month', now() at time
   zone 'utc')`), nunca el de Node. Supuesto abierto: Idealista reinicia la cuota el mes natural UTC (por confirmar).
2. **Herencia (PD10).** Un mes sin fila hereda `total_cap` y `reserve` de la fila anterior más reciente de la fuente, con los contadores a 0:
   dentro de la reserva, `INSERT … SELECT … ON CONFLICT DO NOTHING` sobre la PK (dos primeras reservas del mes concurrentes crean una sola
   fila). **Sin ninguna fila previa no se inserta nada y TODO carril se deniega con `monthly-missing`**, también el de demanda de usuario
   (decisión 066: nunca una cifra por defecto). El total y la reserva solo se fijan con `set-monthly-quota`.
3. **Techo por carril (PD12).** El techo es sobre el gasto **total** del mes: batch, refresco y verificación de presencia comparten
   `total − reserva`; la demanda de usuario (on-demand, incluidos los jobs de presweep promovidos en PR4b) llega hasta `total`. La verificación
   de presencia reserva en el carril de refresco (mismo contador). La regla pura está en `packages/core/src/quota/monthly-allowance.ts`
   (`laneCeiling`, `laneRemaining`, `monthlyGrant`) y la sentencia SQL la implementa; el test de base de datos recorre los mismos casos
   contra ambas.
4. **Una sola función de gasto: `reserveRequestBudget`** (`packages/db/src/budget-ledger.ts`). En **una transacción**: (a) herencia; (b)
   `UPDATE … RETURNING` condicional sobre un `SELECT … FOR UPDATE` de la fila (dos procesos concurrentes se serializan sobre ella: con 1
   unidad de margen, solo uno gana); (c) para los carriles del worker, `reserveDailyBudget` sobre la **misma** transacción; un rechazo
   diario **revierte** el paso mensual entero, incluida la fila heredada. Devuelve un recibo con el **mes** de la reserva: la reconciliación
   (`reconcileRequestBudget`) devuelve lo no gastado a ese mes y a su carril aunque el tick cruce el cambio de mes. Si el proceso muere antes
   de reconciliar la reserva queda: sobre-cuenta, nunca sub-cuenta.
5. **Concesión parcial del batch (D6b).** El batch pide *hasta* n y recibe `min(n, margen)`; se deniega solo con margen 0. Con 3 de margen y
   `max-requests` 10, el barrido hace 3 peticiones (el tope duro del barrido es lo concedido). On-demand y refresco son exactos (todo o
   nada), como hasta ahora.
6. **El batch solo reserva contra el mes (D7).** No toca `daily_request_budget`: un día de barrido masivo no debe agotar el cupo diario de
   la demanda de usuario. `sweep-zone` (barrido manual) es gasto de este carril: reserva **antes** de reclamar el job (reclamar incrementa
   `attempts`), recibe una concesión posible parcial y sale con código 4 sin reclamar ni emitir nada si no hay cuota utilizable o margen.
7. **Privilegios (NF2, D8b).** `GRANT SELECT ON ALL TABLES` (bootstrap, línea 55) y `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES TO
   web_readonly` (línea 84) darían a `web_readonly` lectura del registro. La migración 0019 y `bootstrap-roles-grants.sql` ejecutan
   `REVOKE ALL ON TABLE monthly_request_budget FROM web_readonly, web_coverage`. En el bootstrap va **después de ambos** (moverlo antes lo
   anularía) y solo si la tabla existe; en la migración, solo para los roles que existen (los roles se crean fuera de las migraciones,
   decisión 064). Un REVOKE no es un GRANT nuevo: **`apps/web` no gana ningún GRANT y la regla de credenciales de CLAUDE.md no cambia**.
   Lo prueba `apps/web/test/db/monthly-ledger-role-privileges.test.ts` con `has_table_privilege` (SELECT/INSERT/UPDATE/DELETE de ambos roles),
   tras re-ejecutar el bootstrap y con una conexión real de `web_readonly`; y comprueba que el propietario lee `zone_query_signals` (R16).
8. **`set-monthly-quota`** (`apps/ingestion/scripts/set-monthly-quota.ts`, script `pnpm --filter @buscahogar/ingestion set-monthly-quota`):
   `--total` (entero > 0) y `--reserve` (entero ≥ 0, `< total`) **obligatorios y sin defecto**, `--month YYYY-MM` opcional (defecto: mes UTC
   en curso). Zod valida el argv antes de abrir ninguna conexión: negativos, decimales, notación científica, ceros a la izquierda y valores
   fuera de `integer` se rechazan; la reserva 0 solo con `--reserve 0` explícito. Hace *upsert* de total y reserva y **nunca** toca los
   contadores; bajar el total por debajo de lo ya gastado lo rechaza el CHECK (salida 1, registro intacto).

**Alternativas descartadas.** (1) Total y reserva en variables de entorno por proceso: tres procesos (worker, barrido manual, presweep)
podrían discrepar y el mes no persistiría. (2) Lectura-modificación-escritura en Node: carrera entre procesos; el bloqueo de fila lo hace
atómico. (3) Que el refresco gaste la reserva: la reserva existe para la cobertura bajo demanda de municipios pequeños. (4) Batch
todo-o-nada: con 3 de margen y 10 pedidas el barrido no haría nada en lugar de aprovechar las 3. (5) Confiar en que `web_readonly` no tenga
el privilegio: los privilegios por defecto se lo conceden. (6) Una fila de cuota por defecto en la migración: una cifra inventada
(decisión 066).

**Consecuencias.**

- **Inanición del refresco (PD12, asumida).** Un batch grande puede consumir todo `total − reserva` y dejar al refresco y a la
  verificación de presencia sin margen **el resto del mes**; la demanda de usuario conserva la reserva. Es el compromiso elegido: el
  refresco no sale de la reserva. La mitigación es operativa: elegir `--max-requests` del presweep con cabeza y revisar el desglose por carril.
- **Todo gasto falla cerrado sin cuota.** Hasta ejecutar `set-monthly-quota` por primera vez el worker no barre nada (ni a demanda), el
  barrido manual sale con 4 y el presweep (PR4b) saldrá con 1. El worker lo dice en el log con el comando a ejecutar.
- **Lo concedido por el batch es el tope duro del barrido**, no `--max-requests`; el informe del barrido refleja lo realmente gastado.
- El mes de una reserva se guarda en un recibo en memoria (puerto del worker, `WeakMap` por objeto de reserva): suficiente porque un
  proceso que muere no reconcilia de todas formas (sobre-cuenta).
- No se añade ninguna variable de entorno ni ningún `GRANT`. Para el propietario: aplicar la migración 0019, ejecutar `set-monthly-quota`
  y, opcionalmente, volver a ejecutar el bootstrap (el REVOKE también va en la migración).
- **SQL inverso (manual, las migraciones son solo hacia delante):** `DROP TABLE monthly_request_budget;`

---

## 249 — Población municipal en el catálogo: columna nulable, parseo estricto y guarda de deriva

**Estado:** aceptada (paso 3.3, PR1).

**Decisión.** `locations` gana `population integer` **nulable** (migración 0017, solo `ADD COLUMN`). NULL significa «desconocida», nunca 0. El
valor sale de `POBLACION_MUNI` del NGMEP: solo una celda que cumple `/^[1-9]\d*$/` y es ≤ 2^31−1 (el tope de `integer`) es un dato; vacía,
solo espacios, `0`, decimales, signo, separador de miles o texto es NULL y el parseo continúa. Solo hay dos fallos ruidosos: la cabecera sin
`POBLACION_MUNI` (`MissingNgmepColumnError`, el camino existente) y la guarda de deriva del importador (`assertPopulationCoverage`): si menos
del 90 % de las filas trae población, aborta **antes** de escribir el catálogo generado. El seed pasa de `ON CONFLICT DO NOTHING` a
`DO UPDATE SET population = coalesce(excluded.population, locations.population)` sobre `ine_code`: las filas anteriores a la migración
ganan su población en el re-seed conservando `id` (de él cuelgan zonas y jobs), y un catálogo sin población nunca borra una ya guardada.
`mergeCatalogues` rellena la población desde el importado si la entrada hand-cited no la trae, y no inventa la clave si ninguna la tiene.

**Alternativas descartadas.** (1) Fallar ante cualquier celda inválida: una celda dudosa tumbaría las 8 132 filas por un dato que solo ordena
el top-N. (2) Guardar 0 como «sin dato»: un 0 es indistinguible de una población real y alteraría el orden DESC en silencio. (3) `DO UPDATE`
de todas las columnas: sobrescribiría centroides y radios que el responsable haya corregido a mano. (4) Una tabla aparte de poblaciones: un
join más sin ganancia, la población es un atributo del municipio.

**Motivo.** La prebúsqueda de las ciudades más pobladas (paso 3.3) necesita ordenar municipios por población; el dato ya viaja en el fichero
que importamos pero se descartaba.

**Consecuencias.** El umbral del 90 % es una hipótesis: con el fichero real de marzo de 2026 el 100 % de las filas (8 132) trae población
válida, así que hay margen; hay que reconfirmarlo si el IGN cambia el formato. El catálogo generado se vuelve a emitir (la fecha de
«importado» de cada fila pasa a la del día de la regeneración). **SQL inverso (manual, las migraciones son solo hacia delante):**
`ALTER TABLE locations DROP COLUMN population;`

---

## 250 — `coverage_jobs` por operación: relleno con `rent`, cobertura por (zona, operación) y claves únicas con la operación

**Estado:** aceptada (paso 3.3, PR2).

**Decisión.** Venta y alquiler de una zona pasan a ser jobs **independientes**, cada uno con su cursor (migración 0018).

- `coverage_jobs.operation text NOT NULL` con `CHECK (operation in ('sale','rent'))` y **sin valor por defecto** (el mismo patrón que
  `listing_versions.operation`): cada escritor debe decidirla. Los jobs existentes se rellenan con **`rent`**: hasta el paso 3.2 solo se
  barrió con `OPERATION=rent`. Un rellenado erróneo es *fail-safe*: el cursor lleva la huella del área (que incluye la operación) y se
  rechaza como `invalid-cursor` con cero gasto, nunca reanuda otra búsqueda. Un job cuya operación no se pudiera determinar también recibe
  `rent`, así que la migración no falla ni pierde jobs ni cursores.
- **Cobertura por (zona, operación) = `coverage_jobs.last_completed_at` no nulo.** La fija `finishJob(completed)` (y limpia a la vez
  `presweep_requested_at`); un refresco, un fallo o un presupuesto agotado **nunca** la limpian. La migración la rellena desde
  `zones.last_swept_at` en las zonas `covered`. `zones.state` y `zones.last_swept_at` quedan como agregado y ya no deciden nada en el
  ciclo de vida: el planificador de refresco usa el último barrido **de la operación** (`last_completed_at`) y la elegibilidad exige la
  operación cubierta. Una purga de zona borra los jobs de las dos operaciones, así que la zona vuelve a no estar cubierta para ambas.
- **Los dos índices únicos incluyen la operación:** `coverage_jobs_zone_source_op_idx (zone_id, source_id, operation)` y el parcial
  `coverage_jobs_zone_source_op_pending_idx (zone_id, source_id, operation) WHERE status in ('pending','running')`. Los dos anteriores se
  eliminan. Con el parcial antiguo, un par sale+rent pendiente de la misma zona chocaba y el `ON CONFLICT DO NOTHING` sin `target` de
  `registerCoverageJob` descartaba uno en silencio, rompiendo la cobertura por operación de la web (PD9, PR3).
- `registerCoverageJob` y `getCoverageJobState` reciben la operación. El `GRANT INSERT` de `web_coverage` es a nivel de tabla, así que
  cubre la columna nueva: **no se añade ningún `GRANT`** (el test de privilegios inserta con `operation` y pasa).
- `presweep_requested_at timestamptz` queda creada y sin uso en este paso: la fijará el reclamo del carril por lotes y la limpiará el
  ciclo completado; una zona con demanda reciente promoverá esos jobs parciales al carril a demanda (PR4b).
- **Hasta PR3 la web registra `rent`** (constante provisional en `apps/web/src/server/coverage.ts`): un único job por zona, como hasta
  3.2, sin cambio de comportamiento. `countZonesOpenedToday` sigue contando filas; PR3 lo cambiará a zonas distintas.

**Alternativas descartadas.** (1) Deducir la operación decodificando el cursor (hash `sha256` de la huella, no reversible) o inferirla de los
anuncios de la zona: más complejo y no más correcto que el hecho histórico de que solo se corrió `rent`. (2) Borrar los jobs existentes:
perdería cursores ya pagados. (3) Una tabla `zone_coverage` o columnas por operación en `zones`: una tabla más y el mismo dato que ya vive
en el job; la purga borra el job y la zona queda sin cobertura sin lógica extra. (4) Mantener el índice parcial antiguo: choca con el par
sale+rent.

**Motivo.** La prebúsqueda de las ciudades más pobladas barre venta y alquiler de cada una (paso 3.3) y la web debe saber qué operación
está cubierta sin mentir al usuario.

**Consecuencias.** Las migraciones son solo hacia delante (0000-0019, sin ficheros *down*). **SQL inverso completo, manual, por orden
inverso de aplicación** (si un día hiciera falta volver a antes de 3.3):

```sql
-- 0019 (PR4a, tabla del ledger mensual)
DROP TABLE monthly_request_budget;

-- 0018: conservar el job de rent y descartar el de sale de la misma zona y fuente (se pierde su cursor y su cobertura)
DELETE FROM coverage_jobs s USING coverage_jobs r
 WHERE s.zone_id = r.zone_id AND s.source_id = r.source_id
   AND s.operation = 'sale' AND r.operation = 'rent';
DROP INDEX coverage_jobs_zone_source_op_pending_idx;
DROP INDEX coverage_jobs_zone_source_op_idx;
ALTER TABLE coverage_jobs DROP CONSTRAINT coverage_jobs_operation_check;
ALTER TABLE coverage_jobs
  DROP COLUMN operation,
  DROP COLUMN last_completed_at,
  DROP COLUMN presweep_requested_at;
CREATE UNIQUE INDEX coverage_jobs_zone_source_idx ON coverage_jobs (zone_id, source_id);
CREATE UNIQUE INDEX coverage_jobs_zone_source_pending_idx ON coverage_jobs (zone_id, source_id)
  WHERE status IN ('pending', 'running');
-- y restaurar OPERATION=rent en el .env del worker

-- 0017
ALTER TABLE locations DROP COLUMN population;
```

Un job de `sale` sin su par de `rent` sobreviviría al `DELETE` y el worker antiguo lo trataría con la `OPERATION` que tenga. Los jobs
de `sale` que se creen a partir de 3.3 solo existen si alguien los pidió (web, tras PR3) o los lanzó la prebúsqueda.

---

## 251 — La web registra cobertura por operación (PD9) y el worker prioriza el carril a demanda por días con señal

**Estado:** aceptada (paso 3.3, PR3). Decisión de producto PD9 del propietario.

**Contexto.** Desde la 250 un job es por (zona, fuente, operación) y la cobertura es `last_completed_at` de esa operación. `apps/web`
seguía tratando la zona como un único job de `rent` (cambio provisional de PR2) y el worker atendía el carril a demanda por antigüedad.

**Decisión.**

1. **Cobertura por operación en la web.** `resolveCoverageForZone` recibe la operación del filtro de la búsqueda. Con filtro, la zona está
   cubierta si esa operación tiene `last_completed_at`; **sin filtro, solo si venta Y alquiler lo tienen**. Por cada operación que falta y
   no tiene fila se registra un job (`registerCoverageJob` con `ON CONFLICT DO NOTHING` sin objetivo, sin cambios); un par sale+rent
   pendiente de la misma zona convive (índices de la 250) y una operación que ya tiene job no se duplica. `zones.state` es un agregado y la
   web ya no lo consulta para decidir: `page.tsx` resuelve siempre la cobertura y «Los anuncios de X están al día» sale del resultado
   `covered` de la operación pedida. El aviso nunca da por cubierta una operación sin cubrir.
2. **El tope global cuenta zonas, no filas.** `countZonesOpenedToday` pasa a `count(distinct zone_id)`: una búsqueda sin filtro registra dos
   jobs de una misma zona y ocupa **una** plaza. Una zona que ya tiene un job pedido hoy ya ocupa su plaza, así que añadirle la operación
   que le falta no se bloquea aunque el tope esté lleno (sin esta excepción una zona se bloquearía a sí misma al llenar ella sola el tope).
3. **La cuota por cliente se consume una vez por zona**, justo antes de registrar, aunque se registren dos jobs; si no hay ningún job
   nuevo que registrar (ya existen) no se consume. Se mantiene el orden de la 079: tope global (lectura) antes que cuota (escritura).
4. **Estado que se enseña.** Con dos jobs, el aviso muestra el más vivo de las operaciones que faltan: en curso > en cola > fallido >
   terminado (`pickDisplayJob`).
5. **Prioridad del carril a demanda en el worker (R13).** `selectNextClaimableJob` ordena: carril a demanda antes que refresco; dentro del
   carril a demanda, **días con señal de la zona en la ventana de 30 días UTC DESC**, después `requested_at` ASC y por último `id`. Sin
   señales cuenta 0. La ventana son los 30 días naturales UTC incluido hoy, `day > hoy - 30` (`[hoy-29, hoy]`); una señal de hace 30 días ya
   no cuenta. La constante `PRIORITY_SIGNAL_WINDOW_DAYS = 30` vive en `packages/core`. El **carril de refresco no usa señales** y conserva el
   orden por `requested_at` (S13.5): el `CASE` del `ORDER BY` las anula para esos jobs. Las señales son de la zona, así que los jobs de
   venta y alquiler de una zona con demanda suben juntos.
6. **Privilegios.** Sin `GRANT` nuevo: `web_coverage` sigue con `INSERT` en `coverage_jobs` (a nivel de tabla, cubre las columnas nuevas) y
   `web_readonly` lee la tabla entera para `listCoverageJobStates`. Lo comprueba un test con el rol real.

**Alternativas descartadas.** (1) Dejar `zones.state='covered'` como atajo: una zona cubierta solo de alquiler se daría por cubierta para
venta, lo que PD9 prohíbe. (2) Contar filas en el tope global: una búsqueda sin filtro gastaría dos plazas. (3) Priorizar por señales
también el refresco: R13 lo limita al carril a demanda, y un refresco no es demanda nueva. (4) Ordenar por señales en Node: hay que
elegir con `LIMIT 1` en SQL. (5) `day >= hoy - 30` (31 días): contradice «últimos 30 días» y la tarea 3.5, que fija `[hoy-29, hoy]`.

**Consecuencias.** Cada petición de una zona localizable lee `sources` y `coverage_jobs` aunque la zona esté cubierta (antes se
cortocircuitaba con `zones.state`), y ya no se puede renderizar una zona cubierta sin `NEW_ZONES_DAILY_CAP` definido (se resuelve siempre
antes de llamar a la cobertura). Una zona con `zones.state='covered'` pero sin `last_completed_at` por operación (fixtures antiguos) se
trata como no cubierta; la migración 0018 ya rellenó `last_completed_at` de las zonas reales cubiertas. Sin cambio de esquema: no hay SQL
inverso; revertir es volver al commit anterior. Un job `failed` agotado de una operación que falta sigue mostrándose (terminal) cuando es el
único que queda por cubrir.
El dataset e2e (`packages/db/src/e2e`) se adapta: Getafe lleva un job completado por operación y cada zona de aviso lleva un gemelo de venta
en el mismo estado que su job de alquiler (sin `last_completed_at`), para que visitarlas sin filtro no registre jobs nuevos ni cambie el aviso.
El estado `done` sin `last_completed_at` solo existe ya en datos antiguos o fixtures: el worker fija ambos a la vez, así que en producción un
job terminado deja la operación cubierta y desaparece el aviso.

---

## 252 — Un único worker de cobertura para venta y alquiler; `OPERATION` se rechaza al arrancar

**Estado:** aceptada (paso 3.3, PR2).

**Decisión.** El worker de cobertura sirve las dos operaciones. La operación de cada barrido es la de su job (`PollJob.operation`, leída de
`coverage_jobs.operation`): con ella se construye el área, se reclama el job (`claimJob(zoneId, sourceId, operation, fingerprint)`, cuya clave
ya incluye la operación) y se juzga la ausencia. La huella del área incluye la operación, así que un cursor de `sale` no se reanuda como
`rent`. El orden de selección **no cambia** (carril a demanda antes que refresco, `requested_at` ascendente); la prioridad por señales es
PR3.

- **`readEnv` rechaza `OPERATION`** con un `WorkerEnvError` que explica que fue retirada y pide quitarla del `.env`, venga con valor o vacía.
  `CoverageWorkerOptions` ya no tiene `operation`.
- **Verificación de presencia:** `listDuePresenceCandidates` deja de filtrar por operación (el worker único verifica las dos; el lote ya
  agrupa por operación); `markAbsenceCandidates` nomina solo anuncios cuya versión vigente tiene la operación **del job** (`lv.operation =
  j.operation`): un job de `sale` no juzga anuncios de `rent`.
- **Mantenimiento de zonas:** el plan puro recibe una foto por (zona, operación). La **purga es de la zona** (se deduplica por zona y el tope
  de 20 por pasada cuenta zonas) y la demanda de la zona es la señal más reciente o, sin señales, el `requested_at` más reciente de sus
  jobs, de modo que una zona no se purga y se refresca a la vez. El **refresco es por (zona, operación)** (`RefreshTarget`): cada operación
  vence según su propio último barrido y `scheduleRefresh` re-encola solo las pedidas.
- `sweep-zone.ts` conserva `--operation` (es una invocación puntual y explícita) y la pasa a `claimJob`.

**Alternativas descartadas.** (1) Ignorar `OPERATION` en silencio: el operador creería acotar el gasto por proceso mientras el worker barre
`sale` por su cuenta. (2) Un worker por operación: duplica el sondeo, el ledger diario se comparte igualmente y la prebúsqueda de PR4 ya no
tendría un único punto de gasto. (3) Que la zona se purgue por operación: la purga reinicia la cobertura de la zona (decisión 108) y
dejaría anuncios huérfanos de una operación cubiertos por el círculo de la otra.

**Consecuencias.** Hay que quitar `OPERATION` del `.env` antes de arrancar el worker (paso manual del propietario). Las dos operaciones
comparten `DAILY_SEARCH_CAP` y el carril de refresco. `countZonesOpenedToday` y el tope global contaban filas hasta PR3; la 251 los pasa a zonas distintas.

---

## 253 — Presweep de las ciudades más pobladas: topes obligatorios sin valor por defecto, cuota solo del registro y promoción por demanda

**Estado:** aceptada (paso 3.3, PR4b).

**Decisión.** `presweep-top-cities` (`apps/ingestion/scripts/presweep-top-cities.ts`, script `pnpm --filter @buscahogar/ingestion presweep`)
barre las N ciudades con más población conocida, venta y alquiler de cada una, contra el **carril batch** del registro mensual (decisión 248).

- **Contrato de argumentos (Zod, sin valores por defecto).** `--top`, `--max-requests` (tope de peticiones de toda la ejecución) y
  `--max-requests-per-sweep` (tope de cada barrido) son obligatorios, enteros positivos (sin signo, sin ceros a la izquierda, sin notación
  científica, como máximo el límite de `integer`). `--dry-run` es opcional. Cualquier flag desconocido se rechaza, en particular `--total` y
  `--reserve`: **el total y la reserva mensuales no son flags de este comando; salen únicamente del registro** (`set-monthly-quota`). Un
  argumento inválido o ausente sale con código 2 **antes** de abrir la base de datos: cero token, cero peticiones, cero escrituras.
- **Preflight de solo lectura, antes de cualquier token** (`readMonthlyLedgerState`): sin fila del mes ni heredable → motivo `monthly-missing`,
  salida 1; techo del batch (`total − reserva − gastado`, mínimo 0) en 0 → motivo `monthly-batch-ceiling`, salida 0. En ambos casos, cero
  gasto y ningún job tocado. Con `--dry-run` se hace el mismo preflight y se imprime el plan sin reservar ni barrer nada (y sin exigir las
  credenciales de Idealista).
- **Planificador puro** (`packages/core/src/presweep/plan.ts`): población DESC y, en empate, código INE ASC; población desconocida (`NULL`)
  nunca se selecciona; el corte `--top` cuenta **ciudades** (una ciudad ya cubierta ocupa su plaza y no se sustituye por la siguiente);
  por ciudad, venta y luego alquiler; las unidades completadas (`last_completed_at`) o en curso (`running`) se omiten y se informan; las
  parciales se reanudan por su cursor persistido. La consulta (`selectPresweepCandidates`) exige población, centroide y radio.
- **Concesión por barrido** (`packages/core/src/presweep/allowance.ts`): `min(tope por barrido, tope de la ejecución restante, margen mensual del
  batch)`. Se reserva exactamente esa cifra y el **tope duro del barrido es lo concedido** (`maxSearchRequestsPerSweep` del conector), así que
  ningún bucle de paginación puede pedir más de lo reservado. Motivos de parada de una unidad: `unit-exhausted`, `per-sweep-cap`, `run-cap`,
  `monthly-batch-ceiling`, `upstream-signal`; si coinciden varios términos manda el más global (techo mensual > tope de la ejecución > tope por
  barrido). El techo mensual, el tope de la ejecución y la señal de la fuente detienen toda la ejecución; el tope por barrido y la unidad
  agotada pasan a la siguiente. Una concesión menor que la pedida (otro proceso gastó margen entre la lectura y la reserva) se informa como
  `monthly-batch-ceiling`. Un reclamo que falla (job ya en curso o cursor no reanudable) devuelve toda la reserva y se informa como omitida.
- **El gasto real manda:** la reconciliación devuelve al mes de la reserva lo concedido y no gastado. Un token por barrido.
- **Marca de presweep y promoción por demanda (PD11, R16).** El reclamo del carril batch del presweep fija `coverage_jobs.presweep_requested_at`
  (`claimJob(..., { presweep: 'mark' })`); el ciclo completado la limpia. El worker **ignora** los jobs con esa marca salvo que su zona tenga al
  menos un día con señal de demanda en la misma ventana de 30 días UTC de la prioridad (`day > hoy − 30`); entonces el job se selecciona en el
  carril a demanda —puede gastar la reserva, siempre acotado por el cupo diario y el total mensual (R14)— y compite por días con señal como
  cualquier job a demanda. El reclamo del worker limpia la marca (`{ presweep: 'clear' }`), así que desde ese momento es trabajo a demanda. El
  barrido manual (`sweep-zone`) no toca la marca.
- **Informe:** una línea por unidad (ciudad, operación, peticiones, motivo) y un resumen de la ejecución con su motivo (`plan-complete`,
  `run-cap`, `monthly-batch-ceiling`, `upstream-signal`, `monthly-missing`, `dry-run`). Salida 0 en los topes (son el diseño), 1 si no hay cuota
  o la fuente señala un error (cursor persistido), 2 si el uso o el entorno son inválidos.
- Cualquier fallo del barrido (transporte, envelope, cursor) se trata como `upstream-signal` y **detiene** la ejecución: con cuota mensual de
  pago es preferible parar y que el responsable mire el error a seguir gastando contra una fuente que está fallando.
- Sin variables de entorno nuevas (el presweep usa `DATABASE_URL`, `IDEALISTA_API_KEY` e `IDEALISTA_API_SECRET`, ya existentes). Sin `GRANT`
  nuevo ni migración nueva.

**Alternativas descartadas.** (1) Valores por defecto de los topes: en un sistema con cuota mensual limitada y de pago sería gasto contra un
techo que nadie decidió (decisión 066). (2) Pasar el total y la reserva como flags del presweep: dos fuentes de verdad para la cuota; el
worker y el barrido manual no las verían. (3) Que el worker procese siempre el trabajo parcial del presweep: gastaría la reserva sin ninguna
demanda detrás. (4) Que el worker nunca lo toque: el trabajo parcial de una ciudad en la que ya hay usuarios buscando quedaría esperando a la
siguiente ejecución manual. (5) Limitar el top-N a «las N primeras pendientes»: `--top 100` dejaría de significar «las 100 mayores» según se
vayan cubriendo.

**Consecuencias.** La primera ejecución real gasta cuota de Idealista: la lanza el propietario con topes explícitos (paso manual, no una
tarea). Un job parcial de presweep cuya zona no recibe nunca demanda permanece pendiente hasta que se relance el presweep. Sin migración
propia: la columna `presweep_requested_at` llegó con la 0018 (decisión 250). Reversión: no hay SQL (solo código); para olvidar la marca
`UPDATE coverage_jobs SET presweep_requested_at = NULL`.

---

## 254 — Paso 3.4: arquitectura de producción y alcance «código listo para desplegar»; el despliegue real pasa al paso 3.5

**Estado:** aceptada (paso 3.4, cierre). Decisiones de producto PD1 (arquitectura), PD8–PD11 y el aplazamiento del despliegue, todas del
propietario. Reservada desde la 255 y redactada al cerrar el paso.

**Contexto.** Buscahogar es un TFM y también una web real que usarán personas reales (ROADMAP 3.4). Hasta ahora solo corría en la máquina del
desarrollador: ni imágenes de `web` e `ingestion`, ni despliegue, ni copias de seguridad, ni avisos, ni páginas legales, y el limitador de
peticiones era un `Map` por proceso (decisión 074) que se rompe con más de una instancia. La investigación (Vercel, Neon, hosts de worker,
teselas; instantánea del 2026-10-21, que habrá que repetir con los precios vigentes) fijó dos hechos: una función de Vercel es de
petición, con un máximo de 300 s en Hobby y 800 s en Pro, **sin proceso siempre encendido**, así que el worker de cobertura no puede vivir
allí; y la web, en Vercel, ejecuta varias instancias efímeras a la vez.

**Decisión.**

1. **Arquitectura A (PD1).** `apps/web` en Vercel (plan Pro), PostgreSQL 17 con PostGIS en Neon (región de Frankfurt) y `apps/ingestion` como
   worker siempre encendido en un host aparte (imagen `apps/ingestion/Dockerfile`, decisión 258). La web usa la URL del **pooler** con sus dos
   roles; el worker, el despliegue y las copias usan la URL **directa** (decisión 256). Ningún servicio nuevo en `apps/web` hace llamadas
   externas (NF1): los avisos, el latido y las copias viven solo en `apps/ingestion` y `ops/`.
2. **El paso 3.4 entrega código listo para desplegar, no un despliegue.** Todo lo que pide cuentas, dinero o una decisión del propietario pasa al
   nuevo **paso 3.5** (aprovisionamiento y puesta en marcha), que empieza **tras la aprobación del TFM** (PD, 2026-10-21): crear las cuentas,
   dominio y DNS, secretos en los gestores del proveedor, primer despliegue, latido externo, condiciones del proveedor de teselas y de Idealista
   antes de indexar, y las comprobaciones que solo se pueden hacer contra Neon (verificador SCRAM, `jit` por rol, `attachDatabasePool`, latencia
   del proxy, agregación de IPv6 por `/64`). La lista de traspaso está en `docs/ROADMAP.md` (paso 3.5) y en `docs/DEPLOYMENT.md`.
3. **Criterio de «listo».** Lo verificable en local con Docker, MinIO y dobles, sin red real: la CI en verde, un despliegue idempotente (dos
   ejecuciones, la segunda sin cambios), el worker en su imagen con parada ordenada y recuperación de jobs atascados, avisos con deduplicación
   duradera, copia cifrada → MinIO → restauración en una base vacía con la matriz de privilegios comprobada, y el entorno documentado y
   vigilado por tests.
4. **Reparto en decisiones.** 255 limitador compartido en PostgreSQL (enmienda la 074); 256 conexión detrás de un pooler; 257 despliegue
   (enmienda la 064 y la 069); 258 worker en producción (parte 1: imagen, supervisión, parada, latido; parte 2: arrendamiento y recuperación de
   `running`); 259 avisos por Telegram; 260 copias de seguridad y simulacro; 261 teselas configurables (enmienda la 112); 262 interruptor de
   indexación; 263 salud, páginas legales, y entorno y CI; 264 jit (enmienda la 101); 265 credencial del limitador en el e2e (enmienda la 135 y
   la 255).
5. **Reglas que se mantienen.** Las fuentes se consultan solo desde `apps/ingestion` (nunca en tiempo de búsqueda); la cuota de Idealista sigue
   siendo mensual y limitada, con corte explícito en todo lo que pagina; las credenciales de las fuentes no llegan a `apps/web`; ninguna
   credencial es `NEXT_PUBLIC_*`. Cambia una: `web_coverage` gana `SELECT/INSERT/UPDATE/DELETE` sobre `proxy_rate_limit` (PD8, decisión 255), y la
   regla de credenciales de `CLAUDE.md` ya la recoge.

**Alternativas descartadas.** (a) Un único VPS con Docker Compose y Caddy (la primera recomendación de la exploración, ~10-20 EUR al mes): más
barato, pero deja al propietario operando el sistema operativo, los certificados y la base de datos; para una web real se prefirió el
servicio gestionado, con su coste. (b) El worker en Vercel (cron o funciones): una función es de petición y de duración acotada; el barrido
reanudable por cursor no cabe. (c) Redis o la WAF de Vercel para el limitador: fuera del alcance de `ARCHITECTURE.md` y sin verificar
(decisión 255). (d) Hacer el despliegue real dentro del 3.4: gastaría dinero y expondría datos y condiciones de terceros (Idealista, teselas)
antes de que el TFM esté aprobado y de que el propietario haya revisado los textos legales.

**Consecuencias.** El paso 3.4 se cierra con unas 21 000 líneas autoradas repartidas en doce commits de trabajo y una sola PR con `size:exception`
(la previsión era de ~5 600; el grueso son tests, como en los pasos 1.6, 1.7 y 3.3). El responsable hereda una lista de comprobaciones concretas
para el 3.5 y un conjunto de tests que vigilan que el entorno documentado, el flujo de CI y los umbrales no divergen del código. Lo que no se
puede saber hasta el 3.5 (Neon, Vercel, los precios) falla de forma ruidosa o está en la lista, no oculto.

---

## 255 — Limitador de peticiones compartido en PostgreSQL, con fallo abierto y plazo de 200 ms (enmienda la 074)

**Estado:** aceptada (paso 3.4, S1). Decisiones de producto PD8 y PD9 del propietario. La 254 es la decisión de
arquitectura general del paso 3.4 (redactada al cerrarlo).

**Contexto.** La 074 dejó el limitador de `apps/web/src/proxy.ts` en un `Map` por proceso y documentó que se rompe con más de una instancia.
El despliegue previsto (Vercel) ejecuta varias instancias a la vez y las recicla constantemente: cada una contaría por su cuenta y el límite
real sería «máximo × número de instancias vivas». En Next.js 16 el proxy corre en Node.js (el ajuste `runtime` lanza), así que `pg` es viable
dentro del proxy.

**Decisión.**

1. **Tabla `proxy_rate_limit`** (migración 0020): `key_hash text` (PK, HMAC-SHA256 de la identidad, decisión 076, nunca la IP), `window_start_ms
   bigint`, `hits integer CHECK (hits >= 1)` e índice sobre `window_start_ms`. Migración aditiva.
2. **Una sentencia atómica** (`createPgProxyRateLimitStore`, `packages/db/src/proxy-rate-limit.ts`): un CTE que purga como mucho 100 filas
   vencidas (`FOR UPDATE SKIP LOCKED`, la clave propia excluida, recorriendo el índice por las más antiguas) y un `INSERT ... ON CONFLICT DO
   UPDATE ... RETURNING` que abre la ventana, suma o la reinicia. `hits` se acota a `max + 1`. Sin planificador: la purga es perezosa y acotada
   por petición.
3. **El llamador aporta `nowMs`**, no el reloj de Postgres (a diferencia de la cuota diaria): así la lógica es exactamente la de la ventana
   fija del núcleo y se comprueba contra ella con instantes inyectados. La decisión (permitida y `Retry-After`) la toma `fixedWindowVerdict`,
   extraída de `evaluateFixedWindow` (que ahora delega en ella); el SQL solo calcula el estado.
4. **Fallo abierto con plazo total de 200 ms** (PD9). Si el almacén rechaza, tarda más de 200 ms (obtener conexión + consulta) o no se puede ni
   crear el pool, la petición se permite, nunca hay 5xx, y se emite UNA línea JSON `{ts, level:"error", component:"proxy-limiter",
   msg:"store-unavailable", reason:"timeout"|"error"}`, sin clave, IP, URL ni mensaje del error, como mucho una cada 10 s por instancia. El pool
   fija `connectionTimeoutMillis: 150` y `query_timeout: 150` (del lado del cliente: tras un pooler no se puede asumir un `statement_timeout`
   en el servidor) y un `Promise.race` de 200 ms es la red de seguridad. Una consulta abandonada puede acabar ejecutándose: el sobreconteo es
   inocuo. La cuota mensual de Idealista (248) y la cuota diaria por cliente de cobertura (077) conservan su cierre en fallo.
5. **Pool propio del proxy** (`apps/web/src/server/proxy-limiter-db.ts`): la credencial `web_coverage`, máximo 4 conexiones, clave global
   `buscahogarProxyLimiterDb`, **sin `server-only`** (decisión 081: el runtime del proxy no lo admite).
6. **Privilegios (PD8, enmienda el CLAUDE.md).** `web_coverage` recibe exactamente `SELECT`/`INSERT`/`UPDATE`/`DELETE` sobre `proxy_rate_limit`
   (el `SELECT` lo exigen la subconsulta de la purga y el `RETURNING`); es el único `GRANT` nuevo de todo el paso 3.4 y la regla de credenciales
   de CLAUDE.md se actualiza para listarlo. `web_readonly` no debe tener ninguno, pero los privilegios por defecto del bootstrap le concederían
   `SELECT` sobre cualquier tabla nueva: la migración 0020 revoca (solo si el rol existe) y el bloque final de
   `bootstrap-roles-grants.sql` repite el `REVOKE` solo a `web_readonly`, después de `GRANT SELECT ON ALL TABLES` y de
   `ALTER DEFAULT PRIVILEGES` (mismo patrón que la 248). Probado con el catálogo, con conexiones reales de ambos roles y con una recreación de
   la tabla dentro de una transacción.
7. **IP del cliente.** En Vercel `CLIENT_IP_HEADER=x-forwarded-for`, que la plataforma reescribe con una sola IP. No cambia
   `parseTrustedClientIp`: una lista con comas, vacía o no-IP cae en el cubo compartido `unknown` (075); no se elige ninguna entrada de una
   lista, porque el cliente puede falsear el primer elemento. `/api/health` queda fuera del `matcher` (`api/health$`): ni se limita ni escribe
   en la tabla.
8. **El `Map` en memoria desaparece**: `createProxyRateLimiter` ya no mantiene contadores, solo el veredicto, el plazo y el estrangulado del log.

**Alternativas descartadas.** (1) Redis o un servicio de límites externo: más infraestructura y credenciales para un contador que cabe en la
base de datos que ya existe. (2) Mantener el `Map` por proceso: con N instancias el límite efectivo se multiplica y se reinicia en cada
reciclaje. (3) Cerrar en fallo (rechazar si la base de datos no responde): un parpadeo de la base de datos sería una caída total del sitio,
peor que el abuso que se quiere frenar. (4) Una conexión de 2 s para el limitador (v1 del diseño): demasiado para una ruta caliente. (5) Reloj
de Postgres en la sentencia: no se puede probar contra la lógica pura con instantes inyectados. (6) Reutilizar `coverage-db.ts`: importa
`server-only`, que el proxy no admite. (7) Confiar solo en el orden del bootstrap para que `web_readonly` no lea la tabla: los privilegios por
defecto la volverían a exponer al recrearla.

**Consecuencias.** Cada petición limitada cuesta una ida y vuelta a la base de datos (dentro del plazo de 200 ms); con tráfico normal la
purga mantiene la tabla pequeña, y sin tráfico no hay nada que purgar. El límite es aproximado cuando el almacén está caído (se permite todo
mientras dure). La región del proxy frente a la de la base de datos condiciona la latencia (a medir en el paso 3.5). IPv6: la clave es la
dirección completa, no el /64. Reversión: volver al código anterior no pierde datos; `DROP TABLE proxy_rate_limit` y el `GRANT` huérfano
desaparece con ella.

---

## 256 — Conexión de `apps/web` detrás de un pooler: URL del pooler, pools acotados y sin estado de sesión

**Estado:** aceptada (paso 3.4, S1).

**Contexto.** En Vercel cada instancia serverless abre sus propios pools; con una URL directa a PostgreSQL, unas pocas instancias agotan las
conexiones del servidor. Neon ofrece una URL de pooler (`-pooler`, PgBouncer en modo transacción) para esto.

**Decisión.**

1. **`apps/web` usa la URL del pooler** para sus dos credenciales (`DATABASE_URL` y `WEB_COVERAGE_DATABASE_URL`) en producción.
   `apps/ingestion`, las migraciones, el aprovisionamiento de roles y las copias de seguridad usan la URL **directa** (variable distinta,
   `sslmode=verify-full`): el DDL y la sesión estable no funcionan por un pooler. La variable directa es `DIRECT_DATABASE_URL`, validada por el
   despliegue (decisión 257).
2. **Pools acotados por llamador**: `createDb(url, poolOptions?)` acepta `max`, `connectionTimeoutMillis` y `query_timeout` (el paquete sigue sin
   leer `process.env`, decisión 024). Lectura `max: 5`, registro de cobertura `max: 2`, limitador `max: 4` con plazos de 150 ms (255). Sin
   opciones, el comportamiento es el de antes.
3. **Sin estado de sesión en `apps/web`**: nada de sentencias preparadas con nombre, `SET`/`SET LOCAL`/`set_config`, `LISTEN`/`NOTIFY`,
   bloqueos consultivos ni tablas temporales, ni en `apps/web/src` ni en las consultas de `packages/db` que ejecuta. Una prueba estática lo
   comprueba (excluye las herramientas del propietario: semilla, bases de prueba y e2e). El `jit = off` de `web_readonly` es un ajuste de rol
   y de base de datos, no de sesión, y se trata aparte (decisión 264).

**Alternativas descartadas.** (1) `attachDatabasePool` de Vercel: se evalúa en el paso 3.5 con medidas reales. (2) URL directa desde Vercel:
agota conexiones. (3) Un pool por defecto de 10: con el pooler delante no aporta y multiplica las conexiones por instancia.

**Consecuencias.** Si una consulta futura de `apps/web` necesitara estado de sesión, la prueba estática falla y obliga a reabrir esta decisión.
La aceptación real de las URL del pooler y los tamaños de pool se verifican al aprovisionar (paso 3.5).

---

## 257 — Despliegue con migraciones programáticas, roles aprovisionados por el propio despliegue y comprobaciones finales (enmienda la 064 y la 069)

**Estado:** aceptada (paso 3.4, S4).

**Contexto.** Hasta ahora el esquema se aplicaba con `drizzle-kit migrate` (dependencia de desarrollo) y los dos roles web los creaba a mano
el responsable (decisión 069: «el rol y la credencial siguen siendo tarea manual»). Para desplegar en un entorno gestionado (Neon) y poder
repetir el proceso sin pasos manuales ocultos hace falta un único punto de entrada, idempotente y que falle de forma ruidosa.

**Decisión.**

1. **Un solo punto de entrada `deploy`** (`apps/ingestion/scripts/deploy.ts`, compilado a `dist-runtime/scripts/deploy.js` con
   `tsconfig.runtime.json`; los pasos viven en `packages/db`, exportados como `@buscahogar/db/deploy`, y solo el script lee `process.env`).
   Usa la **URL directa** del propietario (`DIRECT_DATABASE_URL`, obligatoria y SIN respaldo: nunca cae a `DATABASE_URL` ni a la del
   pooler, decisión 256). Orden: conexión → migraciones → roles → privilegios → catálogo → cuota → comprobaciones. La cuota se siembra
   **después** del catálogo (la especificación la numeraba antes): necesita el id de la fuente `idealista`, que crea el catálogo.
2. **Migraciones por programa** con el migrador de `drizzle-orm` (`runMigrations`), sobre el mismo registro `drizzle.__drizzle_migrations`
   y los mismos ficheros que `drizzle-kit migrate`; `drizzle-kit` no viaja en producción. `packages/db` publica `migrations` y `sql` en
   `files`.
3. **Roles (enmienda la 069).** El despliegue crea `web_readonly` y `web_coverage` si faltan (`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
   NOREPLICATION`) y fija su contraseña desde secretos de entorno (`WEB_READONLY_PASSWORD`, `WEB_COVERAGE_PASSWORD`). El fichero
   `bootstrap-roles-grants.sql` **sigue sin crear roles ni contraseñas**: solo concede. La credencial nunca está en el repositorio.
   - La contraseña se guarda como **verificador SCRAM-SHA-256 calculado en Node** (`node:crypto`, PBKDF2 4096): la contraseña en claro
     no aparece en SQL, registros ni errores. Solo se aceptan contraseñas ASCII imprimibles (PostgreSQL aplica SASLprep al resto).
   - **Idempotencia**: si el rol existe se prueba PRIMERO el inicio de sesión con el secreto actual; si entra, no se reescribe nada
     (`unchanged`, el verificador almacenado no cambia entre ejecuciones). Solo ante `28P01` se rota (`rotated`).
   - Tras crear o rotar se vuelve a iniciar sesión; si falla, el despliegue termina con el código 4 y un mensaje explícito («¿el servidor no
     acepta el verificador SCRAM precalculado?»). **No hay respaldo automático con la contraseña en claro.**
   - Los atributos del rol se exigen siempre; un rol existente con `CREATEDB`/superusuario se rechaza en lugar de degradarse en silencio.
   - `WEB_READONLY_ROLE` / `WEB_COVERAGE_ROLE` (opcionales) permiten otros nombres: los roles son globales al servidor, y dos entornos en un
     mismo servidor (o las pruebas, que no deben tocar los roles reales) no pueden compartirlos. El bootstrap se aplica con los nombres
     sustituidos como palabra completa; con los nombres por defecto es el fichero tal cual.
4. **Privilegios.** El bootstrap sigue siendo la única definición (GRANT primero, bloque REVOKE al final, decisiones 064, 248 y 255) y se
   aplica como una sola consulta (transacción implícita). Una **huella** de las ACL de las tablas, los privilegios por defecto y los de la
   base y el esquema, calculada antes y después, permite informar «privileges unchanged». Al final, `checkPrivilegeMatrix` compara los
   privilegios **efectivos** (`has_table_privilege`, incluidos PUBLIC y la herencia) con la matriz documentada: `web_coverage` exactamente
   `INSERT` en `coverage_jobs`, `S/I/U/D` en `coverage_client_quota`, `INSERT` en `zone_query_signals` y `S/I/U/D` en `proxy_rate_limit`;
   `web_readonly` solo `SELECT` y nada sobre las tablas del propietario (`OWNER_ONLY_TABLES`: `monthly_request_budget`,
   `proxy_rate_limit`; cada tabla nueva del propietario se añade ahí y su REVOKE al bloque final). `spatial_ref_sys` (PostGIS, legible por
   PUBLIC) queda fuera de la comprobación. Un desajuste es el código 4.
5. **Semillas.** La cuota mensual se siembra **solo si la fuente no tiene ninguna fila** (`seedMonthlyQuotaIfEmpty`, una sentencia
   `INSERT ... WHERE NOT EXISTS`), con `SEED_MONTHLY_QUOTA_TOTAL` y `SEED_MONTHLY_QUOTA_RESERVE` (todo o nada, validadas con Zod). **Sin
   valor por defecto**: sin configuración y con el registro vacío se emite un aviso ruidoso y el worker sigue cerrando en fallo (decisión
   248); nunca se inventa una cifra (066). El catálogo usa `seedReferenceDataIfNeeded`, que no escribe nada si ya está completo.
6. **Códigos de salida**: 0 hecho (también «sin cambios»), 1 paso fallido (se nombra), 2 configuración o secreto ausente (antes de cualquier
   cambio), 3 base inaccesible, 4 comprobación posterior fallida (inicio de sesión, jit, privilegios). Salida: una línea JSON por evento,
   sin secretos (los mensajes de error se redactan además contra las contraseñas y la URL del propietario). Una segunda ejecución sin cambios
   informa `0 migrations, roles unchanged, privileges unchanged, seeds skipped`.
7. **Servicio local** `deploy` en `docker-compose.yml`: perfil propio, `restart: 'no'`, espera a la base sana, sin `env_file`.

**Alternativas descartadas.** (a) `drizzle-kit` en tiempo de ejecución: dependencia de desarrollo, sin garantías de salida estable. (b)
Reescribir siempre el verificador: la segunda ejecución nunca sería «sin cambios» y cada despliegue invalidaría las sesiones nuevas durante
la rotación. (c) `PASSWORD '<texto en claro>'` en SQL: queda en el registro del servidor. (d) Respaldo con la contraseña en claro si el
servidor rechaza el verificador: oculta justo el fallo que hay que ver. (e) Respaldar la URL directa en `DATABASE_URL`: un pooler en modo
transacción rompe el DDL sin avisar.

**Consecuencias.** La frontera de la 069 pasa de «ningún agente crea roles» a «los crea el despliegue con secretos que solo conoce quien lo
ejecuta»; las credenciales siguen fuera del repositorio. Pendiente del paso 3.5: comprobar que Neon acepta verificadores precalculados
(si no, el código 4 lo dirá). `pg` trata `sslmode=prefer|require|verify-ca` como `verify-full` (con aviso): se usa `sslmode=verify-full`
explícito en las URL directas.

---

## 258 — Worker en modo producción: JavaScript compilado, imagen propia, supervisión en proceso, parada ordenada y latido (parte 1; paso 3.4, S5a)

**Estado:** aceptada (paso 3.4, S5a). La parte 2 (arrendamiento con `lease_renewed_at` y recuperación de trabajos `running` huérfanos)
se añadió con S5b, al final de esta misma decisión.

**Contexto.** El worker solo se ejecutaba con `tsx` y un `.env` local: sin imagen, sin código de salida con significado, sin registro
estructurado, y una señal de parada que dejaba terminar el tick entero (un barrido puede encadenar muchas páginas facturables). Un host
gestionado da unos segundos entre SIGTERM y SIGKILL, y un `SIGKILL` deja el trabajo en `running` (S5b).

**Decisión.**

1. **JavaScript compilado.** `tsconfig.runtime.json` pasa a compilar también `scripts/coverage-worker.ts` →
   `dist-runtime/scripts/coverage-worker.js`. La imagen no lleva `tsx` ni fuentes TypeScript.
2. **Imagen `apps/ingestion/Dockerfile`** (contexto: la raíz del monorepo), multi-etapa y agnóstica del host. Etapa `build`: `node:22.23.4-bookworm-slim`
   (etiqueta EXACTA, la misma en las dos etapas; satisface `engines`), `pnpm@11.25.0` (la de `packageManager`), `pnpm fetch` +
   `pnpm install --frozen-lockfile --offline --filter "@buscahogar/ingestion..."` (no se instala `apps/web`), compilación de `core` y `db` y de
   `build:runtime`, y `pnpm deploy --legacy --prod`. **`--legacy` es obligatorio**: pnpm 11 solo despliega sin él desde workspaces con
   `inject-workspace-packages=true` (`ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`, comprobado en la construcción real); activarlo cambiaría el
   enlazado de todo el desarrollo y el lockfile. Etapa final: solo `package.json`, `node_modules` (producción, con `core` y `db` compilados y
   las `migrations` y `sql` de `db`) y `dist-runtime`; usuario `node` (no root), `NODE_ENV=production`,
   `WORKDIR /app/apps/ingestion`, `CMD ["node", "dist-runtime/scripts/coverage-worker.js"]`. El servicio `deploy` (decisión 257) usa la **misma
   imagen** con otro comando. `.dockerignore` excluye `**/dist-runtime` del host. `docker-compose.yml`: `ingestion` se construye desde ese
   Dockerfile, sigue en el perfil `app`, con `init: true` y `stop_grace_period: 20s`, y **sin política de reinicio**: la fija el host en el
   paso 3.5 (con `restart: on-failure` o equivalente; la salida 2 espera 30 s antes de salir justamente para que ese reinicio no sea un bucle
   caliente).
3. **Registro JSON** (`createJsonLogger`, sin dependencias): una línea por evento `{ts, level, component, msg, ...}` en la salida estándar. Los
   registros de prosa que ya emitían los módulos del worker pasan por `log.line` como eventos `info`. Los valores secretos de la configuración
   (claves de Idealista, URL de la base, URL del latido) se sustituyen por `[redacted]` en cualquier mensaje, y `describeError` elimina
   credenciales incrustadas en URL de conexión. Nunca se registran objetos de error ni configuración.
4. **Supervisión en proceso** (`runSupervised`): una excepción inesperada de `runCoverageWorker` se registra (`fatal`/`error`), espera
   `min(1 s · 2^n, 300 s)` (interrumpible) y reintenta; la cuenta de caídas seguidas se reinicia si la ejecución aguantó ≥ 600 s; a la décima
   caída consecutiva el proceso sale con 1 (la política de reinicio del host es la segunda línea). La conexión inicial reintenta con backoff
   1 → 60 s y 8 intentos y, si la base sigue inaccesible, sale con 3. Una configuración inválida registra un `fatal`, espera 30 s (interrumpible)
   y sale con 2. **Códigos de salida del worker:** 0 parada limpia · 1 diez caídas seguidas o salida forzada (plazo vencido / segunda señal) ·
   2 configuración inválida · 3 base inaccesible.
5. **Parada ordenada.** La primera señal (SIGTERM/SIGINT) interrumpe las esperas (sondeo, backoff) y pide parar; el bucle no arranca ticks
   nuevos, y dentro del tick no se elige trabajo nuevo ni se verifica presencia. El barrido en curso se cierra en el **límite de página**:
   `runSweep` consulta `shouldStop` DESPUÉS de persistir cada página (cursor incluido, en su misma transacción) y, si el barrido no ha
   terminado, usa el desenlace `budget-exhausted` que ya existía (job a `pending` con el cursor confirmado, `attempts` ya contado al reclamar,
   presupuesto reconciliado con lo realmente gastado). Una parada pedida durante la última página no la degrada: el barrido se completa. El
   plazo `WORKER_STOP_GRACE_MS` (8000 por defecto, por debajo de los pocos segundos que da un proveedor) arranca con la primera señal; si vence,
   registro `fatal` y salida 1. La segunda señal sale con 1 al instante. El plazo se cancela en TODOS los caminos de salida limpia (un
   `finally` único): la prueba con el proceso real encontró que, en la ruta de configuración inválida, el plazo seguía armado y convertía una
   salida 2 en una salida 1 a los 8 s.
6. **Latido** (dead-man's-switch). `HEARTBEAT_URL` (https, opcional; en blanco = no configurada): tras un tick que terminó sin lanzar y SOLO si han
   pasado ≥ `HEARTBEAT_MIN_INTERVAL_MS` (60 000 por defecto; 0 = uno por tick) desde el último INTENTO (también el fallido), un GET con tiempo
   límite de 5 s y sin seguir redirecciones. Cada ping toma una plaza del `OutboundBudget` del tick (`MAX_OUTBOUND_CALLS_PER_TICK`, 4 por
   defecto; si no queda ninguna no llama y no gasta el intervalo). Un fallo (red, HTTP, tiempo) se registra como `warn` y nunca es fatal; la
   URL no se registra jamás. Un tick que lanza no emite latido. El presupuesto de salida lo compartirá Telegram en S6.
7. **Avisos de producción** (`classifyWorkerEnv`, solo nombres y motivos fijos): `HEARTBEAT_URL` sin definir se registra UNA vez al arrancar como
   `warn`. S8 generaliza el clasificador (`env:check --target production`).
8. **Variables nuevas del worker** (todas opcionales, validadas con Zod en `readEnv`): `WORKER_STOP_GRACE_MS`, `HEARTBEAT_URL`,
   `HEARTBEAT_MIN_INTERVAL_MS`, `MAX_OUTBOUND_CALLS_PER_TICK`.

**Alternativas descartadas.** (a) `tsx` en producción: arrastra el compilador y las fuentes a la imagen y arranca más lento. (b) Activar
`inject-workspace-packages`: cambia todo el desarrollo para resolver un detalle de la imagen. (c) Solo política de reinicio del host: un
fallo de configuración o de base sería un bucle caliente sin diagnóstico. (d) Dejar terminar el tick entero al recibir SIGTERM: puede
superar con mucho el plazo del proveedor y acabar en SIGKILL con el trabajo en `running`. (e) Latido en cada tick sin intervalo mínimo: cuatro
llamadas por minuto contra el monitor sin necesidad. (f) `pino`: una dependencia más para una línea JSON.

**Consecuencias.** El worker puede ejecutarse en cualquier host con la imagen y una política de reinicio; el cierre cuesta como mucho una
página ya pagada (no se repite: el cursor está confirmado) más el plazo configurado. La imagen no se prueba arrancando el worker con
credenciales reales (cuota): la prueba de proceso usa un entorno vacío (configuración inválida, sin red ni base). La recuperación de
`running` tras un SIGKILL es la parte 2 (abajo).

### Parte 2 — Arrendamiento del job y recuperación de `running` abandonados (S5b)

**Estado:** aceptada (paso 3.4, S5b). Completa la parte 1: un `SIGKILL`, un fallo del host o un OOM matan al worker sin cierre ordenado y
dejan su job en `running`; como `running` no es reclamable (`RECLAIMABLE_STATUSES`, protege al worker vivo), ese job quedaría
inalcanzable para siempre.

**Decisión.**

1. **Arrendamiento.** Migración `0021`: `coverage_jobs.lease_renewed_at timestamptz`, NULLABLE. Lo fija el reloj de la BASE DE DATOS
   (`now()`) en `claimJob` (inserción y reclamo de una fila existente) y se renueva en el `UPDATE` del cursor de `persistPage`, dentro de
   la MISMA transacción que las filas de la página: si la página se revierte, el arrendamiento tampoco avanza. La última página (sin cursor
   siguiente) no lo toca: la cierra `finishJob`. Relleno de las filas existentes en la propia migración: un job `running` recibe `now()`
   (puede estar en manos de un worker vivo con el código anterior, que no renueva: así cuenta con el margen completo) y el resto, su última
   actividad conocida (`finished_at`, o `started_at`); un job que nunca se intentó queda en NULL. La columna no cambia ningún privilegio:
   `web_coverage` conserva `INSERT` a nivel de tabla en `coverage_jobs` y `web_readonly` solo `SELECT`; la matriz del `deploy` sigue
   siendo la misma.
2. **Recuperación.** `reclaimStaleRunningJobs(db, staleAfterMs, limit = 50)` (`apps/ingestion/src/sweep/stale-job-reclaim.ts`): una sola
   sentencia que pasa a `failed` (`error = 'stale-running-reclaimed'`, `finished_at = now()`) los jobs `running` cuyo
   `coalesce(lease_renewed_at, started_at, requested_at)` es más antiguo que `staleAfterMs` (reloj de Postgres), con corte explícito
   (`LIMIT`, `FOR UPDATE SKIP LOCKED`, los más antiguos primero) y devolviendo los ids. El último recurso `requested_at` evita que una fila
   `running` sin `started_at` (insertada a mano) sea inalcanzable.
3. **A `failed`, no a `pending`.** Se conservan el cursor y `cycle_started_at`, así que la reselección retoma donde quedó sin repetir
   páginas ya pagadas. `attempts` ya se incrementó al reclamar, de modo que `COVERAGE_JOB_MAX_ATTEMPTS` (3) acota a un job que mata al worker
   una y otra vez: tras el tercer intento deja de ser seleccionable (`failed` con `attempts` al tope) y la web lo muestra como fallido sin
   reintentos. Con `pending` no habría tope y la caída se repetiría sin fin (el mismo motivo por el que `budget-exhausted`, que no es un
   fallo, no incrementa `attempts`).
4. **Cuándo corre.** Puerto opcional `reclaimStaleJobs` del driver, invocado con `runIsolatedStep` al principio de CADA tick, tras la purga
   de cuotas de cliente y antes de elegir trabajo; el primer tick es el arranque del worker. Aislado: una avería se registra y el tick sigue.
5. **Evento y gancho de alerta.** Si se reclamó algún job, una línea de registro
   `coverage-worker: stale-running-reclaimed count=N job_ids=a,b alert_key=stale-reclaim:<día UTC>` (solo ids, sin secretos) y el gancho
   opcional `onStaleJobsReclaimed({ jobIds, alertKey })`, también aislado. `staleReclaimAlertKey(now)` fija la clave de deduplicación de la
   alerta del día (decisión 259, D17); S6 implementa el envío y cablea el gancho. Sin gancho, solo se registra.
6. **Libro de cuota.** La reclamación NO toca el registro de cuota (decisión 248): la reserva del tick abortado nunca se concilia, de modo que
   el contador queda sobre-contado, en la dirección segura y acotado por `MAX_SEARCH_REQUESTS_PER_SWEEP` + `TOKEN_RESERVE` por incidente.
   Reconciliar sería adivinar lo gastado; el exceso se corrige solo al cambiar el día/mes del registro.
7. **Un solo worker (decisión 252).** La recuperación asume un único worker. Con varios, un dueño lento pero vivo podría ver su job
   reclamado y terminarlo después; es benigno (`finishJob` fija el estado final) pero deja de ser un caso previsto.
8. **Variable nueva** (worker, opcional, Zod en `readEnv`): `STALE_RUNNING_JOB_AFTER_MS`, 900000 por defecto y mínimo 120000: debe exceder
   con holgura lo que tarda una página, o un worker vivo vería su job reclamado.

**Alternativas descartadas.** (a) Devolverlo a `pending`: sin tope de intentos, un job que mata al worker lo mataría en bucle. (b) Una tabla
de latidos por job: una tabla más para lo que ya cubre una columna actualizada en la transacción que hace el trabajo. (c) Dejarlo al
operador con SQL manual: un SIGKILL en producción dejaría la cobertura de esa zona parada hasta que alguien lo viera (el SQL manual existe
como respaldo en el runbook). (d) Conciliar la reserva del tick muerto: es adivinar lo gastado; se prefiere sobre-contar. (e) Reloj del
proceso para el arrendamiento: el que reclama y el que renueva podrían tener relojes distintos; el de Postgres es el único común.

**Consecuencias.** Un worker matado deja de ser un incidente manual: en 15 minutos (por defecto) su job vuelve a ser candidato con su
cursor, como mucho 3 veces. La alerta del día y el runbook (SQL manual de reclamación) se completan en S6 y S8.

---

## 259 — Avisos operativos por Telegram con deduplicación duradera y tope de salidas por tick (paso 3.4, S6)

**Estado:** aceptada (paso 3.4, S6). Hasta ahora un fallo de cobertura, una cuota casi agotada o un job atascado solo quedaban en el
registro del worker, que nadie lee en tiempo real. El worker necesita avisar al operador sin poder inundar el canal ni bloquear un tick, y sin
que `apps/web` haga ninguna llamada externa (NF1).

**Decisión.**

1. **Dónde.** Solo `apps/ingestion` (`src/alerts/`). La lógica de dominio es pura y vive en `packages/core/src/alerts/`:
   `evaluateAlertChecks(foto, config)` devuelve candidatos `{dedupKey, severity, text, cooldownMs}` y `selectAlertsToSend(candidatos,
   últimoEnvío, ahora, {maxPerTick, slots})` decide qué se envía. No leen reloj ni red. Los textos llevan solo cifras agregadas: ningún
   secreto, URL, IP ni id de job (R7.5).
2. **Condiciones.** (a) Jobs `failed` con `finished_at` dentro de la ventana (`ALERT_FAILED_JOBS_WINDOW_MS`, 24 h) ≥ `ALERT_FAILED_JOBS_THRESHOLD`
   (5): UN aviso agregado, no uno por job (clave `failed-jobs`). (b) Recuperación de jobs atascados (decisión 258, parte 2): clave
   `stale-reclaim:<día UTC>`, cableada al gancho `onStaleJobsReclaimed` del driver. (c) Cuota mensual: `quota-80:<mes>` al pasar del 80 %,
   `quota-100:<mes>` al agotarse y `quota-missing:<mes>` si no hay fila utilizable; comparación entera, una vez por mes. (d) Reservas de cuota
   denegadas hoy (`denied-reservations:<día UTC>`), contadas en el proceso. (e) Arranque del worker (`worker-started`, enfriamiento de 1 h, para
   que un reinicio en bucle no inunde). Un fallo del propio canal solo se registra (R7.2.f).
3. **Deduplicación duradera.** Tabla `alert_dispatch_log(dedup_key PK, last_sent_at timestamptz)` (migración `0022`, aditiva, con índice por
   `last_sent_at`). Un aviso no se reenvía dentro de su enfriamiento (`ALERT_COOLDOWN_MS`, 6 h por defecto, para el aviso agregado de fallos;
   24 h para los diarios y 32 días para los mensuales, cuyas claves ya llevan el periodo). Solo se registra lo realmente enviado: un
   fallo de Telegram se reintenta tras la espera de fallo. Como el estado está en la base, un reinicio dentro del enfriamiento no reenvía.
   Las filas de más de 90 días se purgan (como mucho 100 por pasada).
4. **Privilegios: tabla solo del propietario.** Ni `web_readonly` ni `web_coverage` tienen ningún privilegio. Los privilegios por defecto del
   bootstrap le darían `SELECT` a `web_readonly` sobre una tabla nueva, así que la migración (con la guarda `pg_roles` de la 0019) y el
   bloque final de `bootstrap-roles-grants.sql` hacen `REVOKE ALL` a AMBOS roles; `alert_dispatch_log` se añade a `OWNER_ONLY_TABLES`, de
   modo que la matriz del `deploy` y el simulacro de restauración la comprueban. No hay ningún `GRANT` nuevo.
5. **Presupuesto de salidas compartido con el latido.** Cada tick que no lanzó crea UN `OutboundBudget` (`MAX_OUTBOUND_CALLS_PER_TICK`, 4).
   Primero corre el paso de avisos y después el latido, cada uno aislado con `runIsolatedStep`. Los avisos envían como mucho 3 mensajes por tick
   y dejan siempre 1 plaza libre para el latido: una ráfaga de avisos nunca deja sin plaza al dead-man's-switch. Si hay más avisos elegibles que
   plazas, se envían `plazas − 1` y UN resumen «+N avisos más»; lo plegado no se registra y se recalcula del estado en el tick siguiente,
   así que nunca hay una cola que crezca (R7.4).
6. **Envío.** `POST https://api.telegram.org/bot<token>/sendMessage` (JSON, sin seguir redirecciones), secuencial, separación mínima de
   1000 ms por chat (con la espera abortable del apagado, para que un SIGTERM no quede retenido), tiempo límite de 5 s por petición
   (`AbortSignal.timeout`). Nunca lanza: devuelve `false` y registra un aviso con el motivo (`timeout`, `http`, `error`). El primer fallo
   corta el tick y activa una espera de 60 s antes de volver a intentar. El token se elimina del mensaje de error y el logger oculta token y
   chat aunque llegaran a un campo.
7. **Sin configuración, sin red.** `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` se definen las dos o ninguna (Zod en `readEnv`; en blanco = no
   definida; el error nombra la variable y nunca repite el valor). Sin ellas, los avisos quedan desactivados: ni lecturas de estado ni
   intentos de red, y el clasificador de arranque emite un único aviso de producción. Variables opcionales de umbrales:
   `ALERT_FAILED_JOBS_THRESHOLD` (mín. 1), `ALERT_FAILED_JOBS_WINDOW_MS` (mín. 60000), `ALERT_COOLDOWN_MS` (mín. 60000).
8. **Telegram falso.** `TELEGRAM_API_BASE_URL` (opcional) cambia la base de la API: solo `https://<host>` o `http://127.0.0.1:<puerto>`, sin
   credenciales, ruta ni consulta. `apps/ingestion/scripts/fake-telegram.ts` es un servidor HTTP en el bucle local (modos `ok`, `error500`,
   `hang`) que registra los mensajes sin guardar el token. Ninguna prueba habla con la API real.

**Alternativas descartadas.** (a) Estado de deduplicación en un fichero o en memoria: se pierde al reiniciar un contenedor (el disco de la imagen
no es persistente) y un reinicio en bucle reenviaría todo; la base de datos ya es el estado duradero del worker. (b) Una cola de mensajes
pendientes: crece sin límite con un canal caído; se prefiere recalcular los avisos del estado y plegar el exceso en un resumen. (c) Un aviso por
job fallido: 10 fallos en un tick serían 10 mensajes; el umbral agregado informa igual y respeta el tope. (d) Que `apps/web` avise de la
cuota o del limitador: rompería NF1 y daría a la web una credencial de salida.

**Consecuencias.** Un fallo operativo llega al operador en el tick en que se detecta, como mucho 3 mensajes por tick y sin repetirse dentro de
su enfriamiento, aunque el worker se reinicie. Un canal caído cuesta como mucho 5 s por intento y un intento por minuto. Quedan fuera la
detección de «el worker no arranca» (la cubre el latido externo, paso 3.5) y las variables nuevas en la documentación de entorno
(`docs/DEPLOYMENT.md`, S8).

---

## 260 — Copias de seguridad cifradas, retención 7/4/3 y simulacro de restauración (paso 3.4, S7)

**Estado:** aceptada (paso 3.4, S7). La base de datos es el único estado duradero del proyecto: el histórico de precios que no se puede
reconstruir (`listings` no se sobrescribe), la evidencia de deduplicación y lo que costó la cuota mensual de Idealista. Hasta ahora no había
ninguna copia. La copia sale del host, así que debe salir cifrada; y una copia que nunca se ha restaurado es una esperanza, no una copia.

**Decisión.**

1. **Dónde.** `ops/backup/` (bash) y `ops/backup/Dockerfile` (imagen `postgres:17.11-bookworm` con `age` y `rclone` de Debian fijados por
   versión exacta). Nada vive en `apps/web` (NF1). Dos destinos de imagen: `backup` (pg_dump + age + rclone) y `drill` (lo anterior más
   `node` y el JavaScript compilado de `apps/ingestion`, para repetir el aprovisionamiento por la ruta del despliegue en el simulacro).
   Los scripts se ejecutan con `set -euo pipefail`, sin `set -x` jamás y con los secretos solo por entorno.
2. **Volcado cifrado en streaming.** `pg_dump -Fc --no-password | age -r "$AGE_RECIPIENT" > "$TMP.age"` contra la URL DIRECTA (decisión
   256: un volcado exige una sesión estable y una instantánea coherente, que un pooler en modo transacción no garantiza). El texto plano
   no toca el disco: pasa por la tubería. En disco solo hay texto cifrado, en un directorio 0700 que un `trap` borra en `EXIT`, `INT` y
   `TERM`. La tubería corre como trabajo de fondo con su propio grupo de procesos (`set -m`) para que `wait` atienda las señales y la
   limpieza pueda matar `pg_dump` y `age`; sin eso, un `SIGTERM` quedaría retenido hasta el final del volcado. Del host solo se necesita la
   clave PÚBLICA (`AGE_RECIPIENT`); una clave privada (`AGE-SECRET-KEY-…`) en esa variable se rechaza sin repetirla. La URL de la base se
   descompone en variables `PG*` (no viaja por argumentos) y rclone se configura por `RCLONE_CONFIG_BKP_*`.
3. **Subida verificada y retención posterior.** El objeto se sube con el nombre provisional `<nombre>.uploading`, se compara su tamaño
   remoto con el local (`rclone size --json`) y solo entonces se publica con `rclone moveto` como `<prefijo>-AAAAMMDDTHHMMSSZ.dump.age`
   (UTC, ordenable). Una subida a medias no tiene el formato de copia, así que nunca se cuenta ni se poda; la retención limpia sus
   restos. La poda corre SOLO tras la publicación verificada: un fallo de volcado, cifrado, subida, tamaño o publicación termina con
   código 1, una línea JSON de nivel `error` y ningún borrado. Códigos: 0 hecho · 1 paso fallido · 2 configuración inválida (antes de usar
   ninguna herramienta de red) · 3 base o almacenamiento inaccesibles · 4 comprobación del simulacro fallida.
4. **Retención 7 diarias + 4 semanales + 3 mensuales.** Constantes en `retention.sh`, no configuración: la página de privacidad las
   publica y una variable de entorno permitiría que el texto dejara de ser cierto (una prueba de `apps/web` exige que el texto de
   `/legal/privacy` y las constantes coincidan). Selección pura sobre los nombres (`retention.sh select`): de cada día cuenta la copia más
   reciente; `daily` = los 7 días más recientes con copia; `weekly` = los 4 domingos más recientes aún no conservados; `monthly` = los 3
   días 01 más recientes aún no conservados. Los niveles son disjuntos (hasta 14 copias, sin que un solape recorte el total). La más
   reciente nunca se borra, lo que no tiene el formato exacto no se toca y nunca se borra todo.
5. **Simulacro de restauración** (`restore-drill.sh`). Descarga la copia más reciente, la descifra en streaming (la clave privada se
   facilita solo en ese momento, `AGE_IDENTITY_FILE`) y la restaura con `pg_restore --no-owner --no-privileges --single-transaction`
   en una base VACÍA: los roles son globales al servidor y el volcado no los lleva, y restaurar sus privilegios sería ocultar justo lo que
   queremos comprobar. Después repite el aprovisionamiento por la ruta del despliegue (`deploy.js`: migraciones, roles, privilegios,
   jit) y ejecuta `restore-verify`: extensión PostGIS, tablas núcleo, recuentos de filas (los esperados, si se facilitan), diario de
   migraciones = ficheros de migración y la matriz de privilegios, que es la MISMA función del despliegue (`checkPrivilegeMatrix`):
   `monthly_request_budget`, `proxy_rate_limit` y `alert_dispatch_log` invisibles para `web_readonly`; `web_coverage` exactamente sus
   cuatro tablas. Cualquier desajuste sale con código 4 y nombra la comprobación (`failed checks: privilege-matrix`). Rechaza un destino
   que no esté vacío y uno igual a `DIRECT_DATABASE_URL`: nunca restaura sobre la base de producción.
6. **Pruebas sin servicios reales (R8.5).** `ops/backup/test/e2e.sh` levanta MinIO y dos PostGIS (origen y destino, otro servidor) en un
   compose APARTE (`ops/backup/compose.yml`, proyecto propio, todo en `tmpfs`, sin `.env` ni volúmenes): `docker compose down -v` en el
   `docker-compose.yml` principal borraría el volumen de desarrollo (`buscahogar_postgres_data`, de nombre fijo) desde cualquier proyecto.
   La clave age se genera en cada ejecución dentro del contenedor y desaparece con él. MinIO ya no se publica como `minio/minio` en
   Docker Hub (la descarga se deniega): imagen de Chainguard fijada por digest. La selección de retención tiene además su prueba pura sin
   Docker (`retention.test.sh`, también desde vitest).
7. **Variables de entorno (se documentan en S8):** `DIRECT_DATABASE_URL`, `AGE_RECIPIENT`, `BACKUP_S3_BUCKET`,
   `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_PREFIX`,
   `BACKUP_NAME_PREFIX`, `BACKUP_TMPDIR`; simulacro: `DRILL_DATABASE_URL`, `AGE_IDENTITY_FILE`, `DRILL_EXPECTED_ROW_COUNTS`,
   `DRILL_BACKUP_NAME`, `DRILL_INGESTION_DIR`. Ninguna es `NEXT_PUBLIC_*` y ninguna llega a `apps/web`.
8. **Clave privada.** No está en el repositorio, ni en la imagen, ni en el host que hace la copia: el host solo conoce la pública. La
   custodia (dónde se guarda, cómo se prueba la recuperación) se documenta en `ops/backup/README.md`. Perder la privada equivale a no
   tener copias, y por eso el simulacro la usa de verdad.

**Alternativas descartadas.** (a) Volcar a un fichero temporal y cifrarlo después: deja texto plano en disco hasta que termina el cifrado
y, tras una caída del proceso, indefinidamente. (b) `gpg`: depende de un llavero y de un agente, es más difícil de usar sin estado y de
probar; `age` cifra en streaming con una clave de una línea. (c) El CLI de AWS: pesado y atado a un proveedor; `rclone` habla con cualquier
almacenamiento compatible con S3 y se configura solo por entorno. (d) Retención por reglas de ciclo de vida del bucket: dependen del
proveedor y no se pueden probar en local; el script aplica la misma lógica en cualquiera (las reglas del bucket pueden añadirse después como
defensa en profundidad). (e) Restaurar con privilegios y propietarios: el simulacro dependería de que los roles ya existan y no probaría el
aprovisionamiento, que es justo lo que se necesita en una recuperación real. (f) Un único nivel de retención «últimos 14»: no cubre un daño
que se detecta semanas después, que es para lo que sirven las semanales y mensuales.

**Consecuencias.** Hay una copia cifrada y verificada por tamaño de la base, con retención acotada y una forma probada de restaurarla. Un
dato borrado de la base puede seguir en las copias hasta que caduquen (lo dice la página de privacidad: 7 + 4 + 3). Quedan fuera, para el
paso 3.5: la cuenta del almacenamiento, la programación diaria (cron o planificador del host), dónde se custodia la clave privada y la
frecuencia del simulacro. La documentación de entorno y el procedimiento paso a paso van a `docs/DEPLOYMENT.md` (S8).

---

## 261 — Teselas del mapa configurables: plantilla, host de la CSP y atribución desde una sola configuración (enmienda la 112)

**Estado:** aceptada (paso 3.4, S2). Decisiones de producto PD6 y PD11 del propietario. Enmienda la 112 y la regla de `CLAUDE.md` sobre la
única excepción del lado del navegador.

**Contexto.** La 112 fijó el host de teselas de OpenStreetMap en `img-src`. Las teselas estándar de OSM no admiten uso intensivo ni comercial
(política de uso de teselas); un sitio en producción necesitará un proveedor propio sin tocar código. El host debe poder cambiar sin que la CSP,
la plantilla y la atribución se desincronicen.

**Decisión.**

1. **Una configuración, tres consumidores** (`apps/web/src/lib/tile-config.ts`, `parseTileConfig`): variables de servidor `TILE_URL_TEMPLATE` y
   `TILE_ATTRIBUTION` (nunca `NEXT_PUBLIC_*`), validadas con Zod. Sin definir, las teselas estándar de OpenStreetMap con su atribución (ODbL),
   exactamente como antes (NF5). La plantilla alimenta el lienzo del mapa y el mapa estático de la ficha; el origen alimenta `img-src`;
   la atribución alimenta el control de Leaflet y el pie del servidor.
2. **Validación de la plantilla.** Debe ser `https`, tener un único host (sin `{s}` ni comodines), sin credenciales (`usuario:clave@`) ni
   fragmento, contener `{z}`, `{x}` e `{y}` y ningún otro marcador. **Puede llevar una cadena de consulta con parámetros literales**: una clave
   **publicable y restringida por dominio** del proveedor (PD11). Esa clave llega a todos los navegadores, así que **nunca** puede ser un
   secreto; está documentado y es responsabilidad del propietario configurarla restringida por dominio. La cadena de consulta no entra en la CSP.
3. **Atribución.** Con proveedor propio `TILE_ATTRIBUTION` es obligatoria: texto plano, no vacío, sin marcado, hasta 200 caracteres. Se pinta
   escapada (en servidor como nodo de texto; en Leaflet, escapada a HTML); el único enlace es el de OpenStreetMap, fijado en código. Definir
   `TILE_ATTRIBUTION` con la plantilla por defecto se rechaza: la atribución de OSM (ODbL) no se sustituye mientras se usen sus teselas.
4. **CSP.** `img-src 'self' blob: data: <origen configurado>`: el origen del parser, sin ruta ni consulta. Sigue habiendo UN solo host de teselas, sin
   `connect-src` y sin comodines. Una variable inválida hace fallar `headers()`, así que el arranque o la compilación no continúan.
5. **El navegador sigue pidiendo las teselas directamente** (la excepción de la 112 se conserva): el servidor de `apps/web` solo lee
   configuración y construye URLs; no descarga ni proxea nada. La regla de `CLAUDE.md` se reescribe: el host de teselas es el del proveedor
   configurado (OSM por defecto), sigue siendo solo del lado del navegador y sigue siendo el único host externo de `img-src`.
6. **Cuándo se evalúa.** `headers()` (CSP) se evalúa al compilar. En Vercel las variables deben existir en el build y un cambio exige
   **redesplegar**; las páginas que leen la configuración en el servidor también quedan fijadas por el despliegue.
7. **Privacidad.** El proveedor de teselas recibe la IP de cada visitante; la página de privacidad (S3, decisión 263) lo declara.

**Alternativas descartadas.** (1) `NEXT_PUBLIC_*` para la plantilla: mezcla configuración de servidor con la de cliente y expone el valor en el
bundle por convención, no por necesidad. (2) Proxy de teselas del mismo origen: es una llamada externa desde `apps/web`, contra la regla de
`CLAUDE.md` (ya descartado en la 112). (3) Atribución como HTML libre en la variable: una variable de entorno mal copiada se convertiría en
inyección de marcado; el texto plano escapado cierra esa vía. (4) Permitir `http` o `{s}`: amplían la CSP a varios hosts o a tráfico sin
cifrar. (5) Rechazar toda cadena de consulta: impediría los proveedores que autentican por clave publicable en la URL.

**Consecuencias.** Un proveedor mal configurado no arranca en vez de romper el mapa en silencio. La clave publicable es visible en las
peticiones de cada navegador (por diseño). El proveedor de teselas y sus condiciones de uso se confirman en el paso 3.5.

---

## 262 — Interruptor de indexación: apagado por defecto, `robots`, `noindex` y mapa del sitio con 404

**Estado:** aceptada (paso 3.4, S2). Decisión de producto PD7 del propietario.

**Contexto.** El sitio puede desplegarse en producción antes de que el propietario haya revisado las condiciones de las fuentes (Idealista,
entre otras) para mostrar sus datos a buscadores. Indexar por accidente no se puede deshacer bien.

**Decisión.**

1. **`SITE_INDEXING`** (`true`/`false`, apagado si no se define o está vacía; otro valor es un error de arranque) y **`SITE_URL`** (solo un
   origen `http(s)`, sin credenciales, ruta, consulta ni fragmento; obligatoria si `SITE_INDEXING=true`, porque el mapa del sitio lleva URLs
   absolutas). Validadas con Zod en `lib/site-indexing.ts`.
2. **Apagado:** `robots.txt` con `User-agent: *` / `Disallow: /`, `<meta name="robots" content="noindex, nofollow">` en todas las páginas (desde
   `generateMetadata` del layout) y **`/sitemap.xml` responde 404**. No se usa `sitemap.ts` devolviendo una lista vacía, porque sería un 200 que
   anuncia un sitio sin páginas; por eso el mapa del sitio es un manejador de ruta (`app/sitemap.xml/route.ts`).
3. **Encendido:** `robots.txt` permite el rastreo salvo `/api/` y `/theme`, anuncia el mapa del sitio, y `/sitemap.xml` devuelve XML
   (`buildSitemapXml`, función pura) con la home y las tres páginas legales (S3). El contenido fino (fichas, zonas) queda fuera de alcance.
4. **Cuándo se evalúa.** `robots.ts`, el mapa del sitio y los metadatos se resuelven al compilar en Vercel: cambiar el interruptor exige
   redesplegar.
5. **Antes de encenderlo** (paso 3.5): confirmar las condiciones de las fuentes para mostrar y permitir indexar sus datos.

**Alternativas descartadas.** (1) Solo `robots.txt`: no impide que una URL enlazada desde fuera se indexe sin contenido; `noindex` sí.
(2) `sitemap.ts` con lista vacía: 200 engañoso. (3) `notFound()` dentro de una ruta de metadatos: no verificado en Next 16.3.4; el
manejador de ruta devuelve el 404 explícitamente. (4) Encendido por defecto: el riesgo es asimétrico.

**Consecuencias.** No se añade `X-Robots-Tag`: los recursos no HTML (imágenes de `/_next/image`) podrían indexarse si alguien los enlaza; es un
riesgo menor y se revisa al encender el interruptor.

---

## 263 — Salud, páginas legales y pie del sitio; identidad del titular desde la configuración

**Estado:** aceptada (paso 3.4, S2 y S3). Esta decisión tiene tres partes: la **A** (salud) y la **B** (páginas legales) están redactadas
aquí; la **C** (variables de entorno, clasificador, `env:check` y CI) se redactó en S8 al cerrar el paso.

### A. Punto de salud (S2)

`GET /api/health` hace `select 1` con la credencial de solo lectura y un plazo de 1 s. Responde 200 con el cuerpo exacto
`{"status":"ok"}` o 503 con `{"status":"degraded"}`, sin ningún otro campo (ni errores, ni nombres de host, ni versiones), con
`Cache-Control: no-store` y `force-dynamic`. El proxy no la limita (decisión 255) y no hace llamadas externas. Alternativa descartada:
campos de detalle (`db`, mensaje de error), que filtrarían información de la infraestructura a quien consulte el punto.

### B. Páginas legales y pie del sitio (S3)

**Contexto.** Un sitio público que trata la huella de la IP de sus visitantes y fija una cookie necesita una política de privacidad, una
política de cookies y un aviso legal (LSSI-CE), enlazados desde todas las páginas. El texto debe describir el tratamiento REAL, no uno
genérico.

**Decisión.**

1. **Tres rutas estáticas en español**, `/legal/privacy`, `/legal/cookies` y `/legal/notice`, como Server Components sin JavaScript de cliente,
   sin formularios, sin scripts ni recursos de terceros y sin llamadas externas. Los enlaces a otros sitios son solo de atribución o
   reclamación (OpenStreetMap, AEPD, Idealista, IGN, Creative Commons, BOE). Entran en el mapa del sitio de S2 (decisión 262).
2. **La retención del texto es la retención real**, verificada en el código y fijada por tests:
   - Huella HMAC-SHA256 de la IP (decisión 076): `proxy_rate_limit` (ventana de limitación configurable; las filas vencidas se borran de forma
     perezosa, hasta 100 por petición, decisión 255, de modo que con poco tráfico una fila vencida puede permanecer) y `coverage_client_quota`
     (el día UTC en curso; las filas de días cerrados se purgan en el siguiente consumo y en cada ciclo del worker, decisión 082).
   - `zone_query_signals` (decisión 102): una anotación por zona y día, **sin ningún identificador de la persona**, 180 días
     (`SIGNAL_RETENTION_DAYS`, decisión 103). La cifra se importa de `@buscahogar/core`: el texto no puede divergir del código.
   - Anuncios retirados (decisión 107): a los 180 días de inactividad se redactan descripción, `raw` y miniatura; precio y campos
     estructurados se conservan (`LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS`, importada también).
   - Cookie `theme` (decisión 146): 1 año, `Path=/`, `SameSite=Lax`, `Secure` bajo HTTPS, sin `HttpOnly` porque la lee el script del `<head>`;
     se crea solo al elegir Claro u Oscuro y «Sistema» la borra.
   - Copias de seguridad (S7): 7 diarias, 4 semanales y 3 mensuales. **Si S7 cambia esas cifras, hay que actualizar la política.**
3. **Teselas.** La política nombra al proveedor de teselas leyendo `readTileConfig()` (decisión 261): el host y la atribución configurados, no un
   nombre fijo. Dice que el proveedor recibe la IP del navegador, porque las teselas no pasan por nuestro servidor (decisión 112).
4. **Identidad del titular desde la configuración.** `LEGAL_OWNER_NAME`, `LEGAL_OWNER_TAX_ID`, `LEGAL_OWNER_ADDRESS` y `LEGAL_OWNER_EMAIL`
   (variables de servidor, opcionales, validadas con Zod en `server/legal-identity.ts`: texto plano de una línea, hasta 300 caracteres, correo
   con forma de correo). Un dato sin definir se muestra como `[Pendiente de configurar: …]`, en negrita y visible: **nunca se inventa una
   identidad**. Un valor inválido es un error que nombra la variable sin su valor. En producción con la identidad incompleta debe haber un aviso de
   arranque (no un fallo): `legalIdentityStartupWarning` ya lo calcula; **S8 lo conectó** a `instrumentation.ts` y a `env:check` (parte C).
   Cambiar la identidad exige redesplegar (las páginas se generan al compilar).
5. **Pie del sitio** (`components/site-footer.tsx`): sustituye al pie de atribución del layout y conserva su frase CC-BY del IGN/CNIG (orden
   FOM/2807/2015) y el mismo `<footer>`. Añade una lista de tres enlaces (sin `<nav>`: la app no tiene landmark de navegación, decisión 223) con
   objetivos de 40 px. La atribución de las teselas sigue junto a cada mapa (decisión 261).
6. **Lista permitida de cookies.** `test/cookie-allowlist.test.ts` recorre `src/` y falla si algo escribe una cookie que no sea `theme` o con
   un nombre no resoluble en estático (con autoprueba del escáner); `e2e/cookie-allowlist.spec.ts` comprueba las cookies reales del
   navegador sobre inicio, mapa, búsqueda en lenguaje natural, ficha y páginas legales.
7. **El texto no afirma cumplimiento normativo.** Describe el tratamiento y cita las bases habituales (interés legítimo), pero **lo debe
   revisar el responsable** (y, si procede, un profesional) antes de publicar. Quedan por nombrar en el paso 3.5 los proveedores de alojamiento y
   de base de datos como encargados del tratamiento.

**Alternativas descartadas.** (1) Identidad escrita en el código: fabricaría o filtraría datos personales y obligaría a un commit para
cambiarla. (2) Una sola página legal: la ley y los usuarios esperan documentos distintos y enlaces nombrados. (3) Cifras de retención escritas en el texto
sin conexión con el código: divergirían en silencio. (4) `<nav>` en el pie: contradice la decisión 223. (5) Pie nuevo junto al de atribución:
dos landmarks `contentinfo`.

**Consecuencias.** Todas las líneas base visuales cambian por el pie (el e2e visual es el único juicio de apariencia) y las tres rutas
nuevas entran en el conjunto de rutas del e2e visual y de accesibilidad.

### C. Variables de entorno, clasificador, `env:check` y CI (S8)

**Contexto.** Al terminar el 3.4 hay cuatro servicios con variables de entorno (web, worker, despliegue y copias/simulacro), la mayoría
nuevas, y nada que impida que la documentación, el arranque y una comprobación previa al despliegue digan cosas distintas. Un error de
configuración que un servicio acepta y otro rechaza, o un secreto impreso en un informe, son justo los fallos que una puesta en
producción no puede permitirse.

**Decisión.**

1. **Un clasificador por aplicación, con una sola lista.** `classifyEnv(env, destino)` (`apps/web/src/server/env-classifier.ts`,
   `apps/ingestion/src/ops/env-classifier.ts`) devuelve `{name, severity, reason}[]` con dos severidades: `error` (el servicio no puede
   funcionar con esto) y `production-warning` (funciona, pero en producción conviene configurarlo). **Los errores usan los mismos
   lectores Zod que el runtime** (`server/env.ts`, `parseTileConfig`, `parseSiteIndexing`, `parseLegalIdentity`, `readEnv`,
   `readDeployConfig`), que ahora reciben el entorno como parámetro: el clasificador no puede aceptar lo que el runtime rechaza. En el worker
   los lectores se inyectan (`EnvReaders`) porque `readEnv` vive en `scripts/`.
2. **Solo nombres y motivos fijos.** Un problema es el nombre de la variable y un motivo de una lista cerrada («falta o está en blanco»,
   «valor inválido (el valor no se muestra)»); nunca un valor ni el mensaje de un error de Zod, que podría citar una URL, una clave o un token.
   Los tests recorren el informe buscando valores de prueba.
3. **Avisos de producción.** Web: `LEGAL_OWNER_*` sin definir (una entrada por variable, con la frase de `legalIdentityStartupWarning` de la parte
   B) y teselas de OpenStreetMap por defecto (`TILE_URL_TEMPLATE`, decisión 261). Worker: Telegram sin configurar (`TELEGRAM_BOT_TOKEN`,
   decisión 259) y `HEARTBEAT_URL` sin definir (decisión 258). Solo se calculan con destino `production`.
4. **El arranque avisa y la comprobación previa falla, con la misma lista.** El worker registra sus avisos una vez al arrancar como líneas
   JSON `warn` (`classifyWorkerEnv`, la misma función que `env:check`; un test compara ambas listas). La web lo hace desde
   `src/instrumentation.ts` (`register()` de Next 16, que se llama una vez por instancia antes de atender peticiones, solo en el runtime de
   Node y solo con `NODE_ENV=production`), también como JSON. **Un aviso nunca impide arrancar**; tampoco un error en la web, que registra
   una línea `error` y mantiene su fallo perezoso y nombrado en el punto de uso (decisiones 066 y 078): `env:check` es la puerta previa.
5. **`env:check [--target local|production]` por aplicación** (`apps/web/scripts/env-check.ts`, `apps/ingestion/scripts/env-check.ts` con
   `--service worker|deploy`; `pnpm env:check` en la raíz ejecuta web y worker). Inspecciona el entorno **del proceso**: no lee ni escribe
   ningún `.env*` (para comprobar un fichero se carga con `node --env-file`, que lo lee Node). `local` sale 1 solo con errores;
   `production` sale 1 con errores **y** con avisos; 2 si los argumentos son incorrectos. Sin `DIRECT_DATABASE_URL`, el despliegue falla y la
   nombra (R2.3, R12.2). Las copias de seguridad y el simulacro (shell) validan su propio entorno.
6. **Ninguna credencial como `NEXT_PUBLIC_*`.** `src/lib/public-env.ts` prohíbe `NEXT_PUBLIC_` seguido de un nombre que contenga `SECRET`,
   `TOKEN`, `PASSWORD`, `PASS`, `KEY`, `PRIVATE`, `CREDENTIAL`, `AUTH`, `DATABASE` o `DB_URL`. `pnpm check:public-env` aplica la regla a los
   nombres del entorno y al contenido de `git ls-files`, **excluyendo todo `.env*` sin abrirlo**; el clasificador la aplica al entorno. Falla la
   CI.
7. **Documentación vigilada.** Cada app tiene un inventario (`env-manifest.ts`: nombre, obligatoriedad, valor por defecto, ejemplo, tipo
   de URL, descripción) del que salen las tablas por servicio de `docs/DEPLOYMENT.md`. Los tests de deriva (`deployment-docs.test.ts` en `web`
   e `ingestion`) fallan si una tabla y su inventario divergen, y también si el código declara una variable que el inventario no conoce (esquema
   de `readEnv`, del despliegue, y las que exige `backup.sh`). `.env.example` queda fuera del alcance (ninguna herramienta lo puede leer ni
   editar): la lista de variables a añadir es la de `docs/DEPLOYMENT.md`.
8. **CI** (`.github/workflows/ci.yml`, solo comprueba). `checks`: `pnpm install --frozen-lockfile`, lint, typecheck, test, build y
   `check:public-env`. `db`: PostGIS `17-3.5` como servicio, JavaScript de producción del despliegue, **despliegue dos veces** (la segunda debe
   informar `0 migrations, roles unchanged, privileges unchanged, seeds skipped`) y las suites con base de datos de `db`, `ingestion` y `web`
   con los roles recién aprovisionados. `backup`: el e2e de copias contra MinIO local. Node `22.23.4` y pnpm `11.25.0` (los de la imagen del
   worker y de `packageManager`), caché del almacén de pnpm ligada a `pnpm-lock.yaml`, acciones oficiales fijadas por SHA completo, permisos
   `contents: read`, sin `continue-on-error`, **sin despliegue, publicación ni credenciales de nube, de las fuentes o de Telegram**. Un test
   estático (`ci-workflow.test.ts`) vigila la forma del flujo.

**Alternativas descartadas.** (a) Dos listas, una para el arranque y otra para `env:check`: divergirían (el motivo de existir de esta parte).
(b) Reglas de validación copiadas en el clasificador: aceptarían algo que el runtime rechaza o al revés; se reutilizan los lectores. (c) Que
`env:check` lea un fichero `.env`: contradice la regla de no abrir `.env*` y obligaría a decidir cuál. (d) Fallar el arranque de la web ante un
error de configuración: rompería los servidores e2e que dejan variables vacías a propósito (decisiones 135 y 265) y cambiaría el modelo de
fallo perezoso y nombrado que ya tienen los lectores. (e) `pnpm/action-setup` y `actions/cache`: una acción de terceros más sin necesidad;
`npm install --global pnpm@<versión>` es lo que ya usa `Dockerfile.e2e`, y `actions/setup-node` con `cache: pnpm` liga la caché al lockfile.
(f) Ejecutar el e2e visual de Playwright en la CI: una imagen de varios GB por cada ejecución; se mantiene como paso manual antes de fusionar
cambios de interfaz.

**Consecuencias.** Entre el arranque, `env:check`, la documentación y la CI hay una sola definición de lo que es un error y de lo que es un
aviso, y un test que falla cuando divergen. La CI no se ha podido ejecutar en GitHub desde el entorno de desarrollo: cada job se reprodujo en
local y la primera ejecución real ocurre al subir la rama (los comandos y el resultado están en las notas del paso). Cambiar la versión de Node o
de pnpm exige tocar el `Dockerfile` o `packageManager` **y** `ci.yml`; el test avisa si solo se toca uno.

## 264 — JIT apagado: ajuste de rol preferente y respaldo a nivel de base de datos verificado (enmienda la 101)

**Estado:** aceptada (paso 3.4, S4).

**Contexto.** La decisión 101 fija `jit = off` con `ALTER ROLE web_readonly IN DATABASE ... SET jit = off` en el bootstrap. Un proveedor
gestionado (Neon) puede no dejar a quien ejecuta el bootstrap cambiar ajustes de un rol: el bloque fallaba con `insufficient_privilege` y
abortaba todo el bootstrap.

**Decisión.**

1. El bloque de jit del bootstrap captura `insufficient_privilege` y emite un aviso (`RAISE NOTICE`) en lugar de abortar (S1).
2. El despliegue **verifica** el resultado observable: inicia sesión como `web_readonly` y ejecuta `SHOW jit`. Si es `off`, registra la
   estrategia (`role` si viene del ajuste del rol, `database` si del de la base, `server` si de la configuración del servidor).
3. Si no es `off`, aplica `ALTER DATABASE <base> SET jit = off` (el nombre se cita en el servidor con `format('%I', ...)`), registra un
   aviso («database-level fallback») y vuelve a comprobar. Si sigue encendido (por ejemplo, un ajuste de rol lo anula), el despliegue
   termina con el **código 4** y el motivo. El respaldo afecta a **toda la base**, `apps/ingestion` incluida (la 101 la dejaba con jit).
4. La segunda ejecución con el respaldo ya aplicado no vuelve a avisar.

**Alternativas descartadas.** (a) `options=-c jit=off` en la URL: un pooler en modo transacción descarta las opciones de arranque
(decisión 256). (b) `SET LOCAL jit = off` por búsqueda: estado de sesión en `apps/web`, prohibido por la 256 y por su prueba estática. (c)
Tolerar el aviso sin comprobar: dejaría la búsqueda con 500 ms de compilación sin que nadie se enterase.

**Consecuencias.** Con el respaldo, el jit de ingesta y deduplicación queda apagado: el coste es menor que el de un fallo silencioso de la
búsqueda (consultas de ingesta largas y pocas). Si el proveedor tampoco permitiera `ALTER DATABASE`, el código 4 obliga a decidirlo en el
paso 3.5. La comprobación real contra Neon es del paso 3.5.

---

## 265 — Credencial del limitador para el servidor e2e «limitado» (enmienda la 135 y la 255)

**Estado:** aceptada (paso 3.4, corrección de la regresión de S1).

**Contexto.** Desde la decisión 255 el limitador del proxy cuenta en PostgreSQL con la credencial `web_coverage` y falla abierto si no
puede conectar. El servidor e2e «limitado» (puerto 3101) tenía `WEB_COVERAGE_DATABASE_URL` vacía por la decisión 135 («el e2e solo lee»),
así que nunca emitía el 429 y 7 pruebas e2e (`rate-limit.spec.ts` y la 429 de `standalone-visual.spec.ts` en 6 proyectos) recibían 404.

**Decisión.** La 135 se enmienda de forma acotada: el e2e escribe SOLO contadores del limitador.

1. El seed (`seed:e2e`) crea el rol `web_limiter_e2e` (`LOGIN`, sin superusuario, sin `CREATEDB`/`CREATEROLE`) con `CONNECT` a la base
   `*_e2e`, `USAGE` del esquema y `SELECT/INSERT/UPDATE/DELETE` únicamente sobre `proxy_rate_limit`: los mismos privilegios que `web_coverage`
   tiene sobre esa tabla en producción. Ninguno sobre `coverage_jobs`, `coverage_client_quota`, `zone_query_signals` ni `listings`. El seed
   lo comprueba tras concederlo y falla si no coincide. También revoca a `web_readonly` todo sobre `proxy_rate_limit` (paridad con la
   migración 0020, que el `GRANT SELECT ON ALL TABLES` del seed deshacía) y vacía la tabla.
2. `playwright.config.ts` deriva la URL del rol de la de `web_readonly` (`e2eLimiterDatabaseUrl`, guard puro: misma base `_e2e`, host y
   puerto; otro rol y otra contraseña) y la pasa SOLO como `WEB_COVERAGE_DATABASE_URL` del servidor de 3101. El de 3100 mantiene
   `WEB_COVERAGE_DATABASE_URL` vacía, `CLIENT_IP_HEADER` vacío y sin limitador: se comporta como antes. No hay variable nueva en `.env`.
3. La contraseña es una constante de prueba del repositorio (`E2E_LIMITER_PASSWORD`), no un secreto: el rol solo tiene privilegios dentro
   de la base desechable `*_e2e`, no existe credencial de producción ni de propietario en el servidor Next, y nunca es `NEXT_PUBLIC_*`.
4. Los contadores no se filtran entre ejecuciones: la base se destruye y se recrea en cada siembra (y la tabla se vacía de forma explícita).
   Dentro de una ejecución, cada prueba usa su propio cubo (`x-e2e-client-ip` por proyecto; el cubo «unknown» solo lo usa `rate-limit.spec.ts`).

**Alternativas descartadas.** (a) Reutilizar `web_coverage`: su contraseña es del `.env` del responsable, y el seed ni debe leerla ni
cambiarla (afectaría a desarrollo); además tendría `INSERT` en `coverage_jobs` y demás tablas que el e2e no necesita. (b) Una variable nueva
`E2E_WEB_COVERAGE_DATABASE_URL` en `.env`: obligaría al responsable a editarlo para una base desechable. (c) Volver a un limitador en
memoria solo para e2e: probaría un código que producción ya no ejecuta.

**Consecuencia.** Los roles son del servidor, no de la base: `web_limiter_e2e` persiste en el servidor PostgreSQL local tras el e2e, pero
sin privilegios fuera de `buscahogar_e2e` (que se destruye en la siguiente siembra).

---

## 266 — Marca «casa encontrada»: una lupa con una casa dentro, en SVG incrustado con una sola geometría

**Estado:** aceptada (D.22); enmienda la ausencia de logotipo de `PRODUCT.md` (y la lectura de la 149 como «glifo funcional, no logotipo»).

**Contexto.** Hasta D.21 la cabecera era solo el nombre en texto y el icono de D.5 (un tejado dentro de un marco) era un glifo de pestaña. El
responsable pidió un logotipo simple y directo y una web menos seria. Tras dos rondas de propuestas renderizadas eligió la variante 2c.

**Decisión.** La marca es una lupa con una casa dentro («casa encontrada»): un SVG de 32 × 32 con la lente (`cx`/`cy` 13,5, radio 10, trazo
3) y el mango (`M21 21l7.5 7.5`, trazo 4, extremos redondos) en `currentColor`, y la casa con la puerta recortada (`evenodd`) rellena con
`var(--accent)`. La geometría vive solo en `lib/brand-mark.ts` (módulo puro, sin JSX ni `server-only`, alcanzable desde el `proxy`):
constantes `BRAND_MARK` y `brandMarkSvg()`. El componente `BrandMark` (servidor, sin props ni `className`) y el HTML de las páginas sueltas
(429 y error global) salen de las mismas constantes, y una prueba de paridad exige que `renderToStaticMarkup(<BrandMark />)` sea idéntico
a `brandMarkSvg()`. Mide 1,75rem, es `aria-hidden` y `focusable="false"`, y va antes del nombre «Buscahogar», que sigue siendo texto vivo y
el único nombre accesible del enlace de la cabecera. No añade ningún token de color.

**Alternativas descartadas.** (1) `dangerouslySetInnerHTML` con una cadena: inyecta HTML sin necesidad. (2) Dos copias a mano (React y cadena):
se separan en silencio. (3) Un fichero generado en la compilación: añade un paso y saca la geometría del código revisable. (4) El nombre como
texto SVG: perdería el texto vivo. (5) Marca solo en pantallas anchas: a 320 px cabe (28 px en una fila de 40). (6) Las demás propuestas de
las dos rondas renderizadas, descartadas por el responsable al elegir la 2c.

**Motivo.** Una fuente de geometría para el componente, las páginas sueltas y el icono; la marca aporta calidez con tokens que ya existen.

---

## 267 — Iconos derivados de la marca: `icon.svg` con variante oscura y `apple-icon.png` regenerado (enmienda la 149)

**Estado:** aceptada (D.22); enmienda la 149.

**Contexto.** La 149 fijó `icon.svg` (tejado en un marco sobre una baldosa blanca, colores del tema claro) y `apple-icon.png` (180 × 180,
opaco). Con la marca nueva ambos debían cambiar, y la pestaña oscura del navegador dejaba la baldosa blanca como un parche.

**Decisión.** `icon.svg` pasa a ser la marca sobre fondo transparente, escrito a mano y fijado por prueba: la geometría es la de `BRAND_MARK` y
una hoja interna define `.i` (trazo) y `.h` (casa) con los literales del tema claro (`#1e1c19` y `#1f5fa8`) y un bloque
`@media (prefers-color-scheme: dark)` con los del oscuro (`oklch(92% 0.012 85)` y `oklch(72% 0.12 252)`); la prueba compara esos literales con
`--ink` y `--accent` de `:root` y `.dark`. Sin texto, `href`, `url(` ni script. `apple-icon.png` se regenera con el comando de la 149 dentro de
la imagen e2e (solo cambia el `setContent`): baldosa opaca `#faf8f3` (el papel claro) y la marca de 120 px con 30 px de margen. Sigue sin haber
manifiesto ni imagen para redes. A 16 px la lente y la silueta se distinguen en ambos temas; la puerta recortada solo se ve como una muesca
tenue, y el responsable decide en la puerta de capturas si se simplifica la casa en `icon.svg` (solo ahí).

**Alternativas descartadas.** (1) Un script de generación (la 149 ya lo descartó: fuera de `tsconfig` y del lint). (2) `icon.tsx` con
`ImageResponse`: pierde el SVG y el estilo oscuro. (3) Conservar la baldosa blanca en la pestaña. (4) Baldosa blanca o oscura en el icono de
pantalla de inicio: iOS exige opacidad y el papel coincide con la aplicación.

**Motivo.** Los literales de color quedan fuera del TypeScript, el favicon es un documento aislado donde no se pueden leer variables, y una
prueba impide que se desvíen de los tokens.

---

## 268 — Portada con invitación: franja tintada, búsquedas de ejemplo por criterios y filtros plegados

**Estado:** aceptada (D.22); enmienda la 132 (tono de la portada), la 153 (la bandeja plegada también en la portada ancha) y la 235 (el motivo,
ahora dentro de la franja).

**Contexto.** La portada era el motivo, «Buscar vivienda», los pasos y la caja de texto sobre una barra de filtros siempre abierta: correcta pero
fría. El responsable pidió un diseño más acogedor y que invite a probar.

**Decisión.** La portada sin criterios (`isPlainHome`) renderiza `HomeHero` (servidor): una franja con `--accent-wash`, radio `panel` y
`overflow: hidden`, con el titular «Todas las viviendas de los portales, en una sola búsqueda» (un solo `h1`), una frase de apoyo, los pasos,
la caja de texto abierta y «Búsquedas para empezar». Son seis enlaces de ejemplo (`lib/example-searches.ts`) que navegan por **criterios** con
GET (por ejemplo `/?operation=rent&propertyType=flat&maxPrice=900`), de 44 px de alto, validados por prueba con `searchQuerySchema`, con
claves que son un subconjunto de las del `FilterBar` y sin zona, polígono, coordenadas, radio ni `q`. Los filtros avanzados quedan plegados bajo
la franja a todos los anchos con el modificador `filter-tray--disclosure` de `FilterBar` (mismo formulario, mismos nombres y campos ocultos,
misma URL); las reglas de apertura forzada desde 64rem llevan `:not(.filter-tray--disclosure)`. El resto de ramas de la página conservan
`<h1>Buscar vivienda</h1>` y el motivo junto al título. Dentro de la franja el motivo va arriba a la derecha y se oculta bajo 48rem.

**Alternativas descartadas.** (1) Enlaces con `?q=`: aterrizan en la revisión de la interpretación y no en resultados. (2) Enlaces con `zone=`
(códigos INE): `resolveCoverageForZone` puede registrar un `coverage_job`, de modo que un rastreador que siguiera los chips gastaría cuota de la
API de Idealista. (3) Una franja a todo el ancho con márgenes negativos: choca con `SHELL_CONTAINER`. (4) Un tamaño de titular nuevo: ya
existen `heading-1` y la escala es cerrada. (5) Un componente de filtros nuevo o alternarlos con JavaScript: cambiaría el comportamiento.

**Motivo.** Resultados inmediatos, sin cuota y sin código de cliente, con los tokens y el formulario que ya existen.

**Enmienda (puerta GATE-1, 2026-10-26).** El responsable aprobó las capturas pidiendo ajustar los 320 px. (1) Bajo 30rem la portada muestra solo
los tres primeros enlaces de ejemplo (`.example-searches__list > li:nth-child(n+4) { display: none }`): seis chips apilados empujaban el primer
resultado hasta y≈1380 y con tres queda en y≈1200. (2) Los pasos de la franja (`.home-hero .steps`) no se parten y llevan `column-gap` de
0,75rem, acotado a la franja porque `StepIndicator` también se usa en la rama `?q=`. (3) Orden de los chips a todos los anchos: 1 «Pisos en
alquiler hasta 900 €», 2 «Venta hasta 250.000 €», 3 «Venta con 3 habitaciones o más», 4 «Áticos en venta», 5 «Estudios en alquiler», 6
«Casas de más de 120 m²»; los tres visibles son los de un solo criterio más amplio y cubren alquiler y venta. El responsable decidió conservar
«Áticos en venta» aunque devuelve 0 con la semilla de e2e. Alternativa descartada: reducir el tamaño de los chips a 320 px (rompe el objetivo
táctil de 44 px).

---

## 269 — Estados ilustrados con una acción principal y voz cercana (enmienda la 225 y la 189)

**Estado:** aceptada (D.22); enmienda la 225 y la 189; no enmienda la 187.

**Contexto.** Los estados vacío, 404, error y 429 eran texto con un enlace. El responsable quería que dejaran de ser callejones fríos.

**Decisión.** Tres ilustraciones de 96 × 64 (`lib/state-illustrations.ts` y `StateIllustration`): `empty` (lupa vacía sobre tres curvas de
nivel), `not-found` (curvas con un rastro que acaba en una parcela vacía) y `unavailable` (la casa de la marca con una curva rota; error de ruta,
error global y 429). Se renderizan a 6 × 4rem, `aria-hidden`, con trazo de ancho constante y solo tokens o `currentColor`; en las páginas
sueltas se reutiliza la cadena. Cada estado tiene una única acción principal con la receta del botón primario: vacío «Comprobar de nuevo»
(sin filtros) o la salida de filtros, 404 «Ir a la búsqueda», error «Reintentar» (con «Ir a la búsqueda» como enlace secundario), error
global «Reintentar», fin de lista «Ir a la primera página». Enmienda de la 225: la acción del vacío filtrado se muestra **siempre** (antes solo
si la fila de chips no ofrecía «Quitar todos»), porque comparte nombre y destino con ese enlace (WCAG 3.2.4) y el estado no puede quedar sin
salida; la prop `clearAllOffered` desaparece. Enmienda de la 189: la página 429 gana una acción («Ir a la búsqueda», `href="/"`). Las páginas
sueltas ponen la ilustración antes del `h1`. Un arreglo de paso: `buildCurrentHref` usa `toHref` y devuelve `/` y no `/?` con parámetros
vacíos. Las ilustraciones y la voz son solo de estos estados; la 187 (existencia de la ficha) no cambia.

**Alternativas descartadas.** (1) Ilustraciones rasterizadas o servidas: una petición más y sin paridad de tema. (2) Una ilustración ad hoc por
estado: se desvía. (3) Mantener la condición de la 225: dejaba el vacío sin acción con dos o más chips. (4) Mantener la 429 sin acción: el
resto de estados ya la tienen y el usuario bloqueado no sabe adónde ir. (5) Dos acciones principales: la jerarquía se pierde.

**Motivo.** Cada estado dice qué pasa, tranquiliza y ofrece un camino, sin añadir colores ni código de cliente.

---

## 270 — Entrada escalonada de la lista, barrido del motivo y pulsación (enmienda la regla «sin movimiento decorativo» de D.21)

**Estado:** aceptada (D.22); enmienda la 240 (regla de movimiento) y completa la 207 y la 242.

**Contexto.** La regla de D.21 solo admitía el movimiento que responde a una acción o anuncia un estado. El responsable quiso un poco más de
vida en la entrada de los resultados y en la portada, sin bucles.

**Decisión.** La regla pasa a: «El movimiento responde a una acción, anuncia un estado o acompaña una entrada única: pulsación, bandeja de
filtros, color de los controles, realce de la fila, aparición de los avisos, entrada escalonada de la lista y barrido del motivo del inicio».
Tres `@keyframes` exactos (`notice-appear`, `row-enter`, `contour-wipe`), sin ningún token nuevo. (1) Lista: `.result-list > li:nth-child(-n+6)`
con `row-enter` (opacidad desde 0 y desplazamiento de 0,25rem), `--duration-appear` (200 ms), `--ease-enter`, `animation-fill-mode: backwards` y
retardo `calc(var(--duration-feedback) / 5 * (k - 1))` (0, 20, 40, 60, 80 y 100 ms): termina a 300 ms; las filas 7 y siguientes no se animan.
(2) Motivo: `.home-hero .contour-motif__fade` con `contour-wipe` (`scaleX` desde 0, origen a la izquierda, `--duration-panel-enter`, 250 ms), solo
en la portada. (3) Pulsación: los chips de ejemplo y la acción de los estados entran en el conjunto de pulsación (escala 0,97 en `:active`
sin foco visible) y en la lista cerrada de transiciones de color. La barrera de `design-tokens.test.ts` fija los tres `@keyframes`, dónde
puede haber `animation-*` y que `backwards` solo vive en la fila. Notas: **W1.** Un `router.refresh()` de `CoverageStatus` conserva las filas
con clave estable, pero si una fila nueva desplaza a otra a las seis primeras posiciones, su entrada se repite; se acepta por rara y
cosmética, y una prueba e2e comprueba que ninguna fila queda oculta (opacidad 1 al final, todas en el DOM). **W2.** Con movimiento reducido (la
207) las duraciones y los retrasos valen `0s`: la animación existe pero dura 0 y la opacidad es 1 en la primera lectura, lo que cumple «nada o
solo opacidad» del requisito MS-1. **W3.** El barrido sobre el rectángulo de la máscara se probó antes de apoyarse en él: anima en Chromium y
WebKit (fotogramas a 0, 60, 125, 190 y 249 ms distintos de la referencia y el final idéntico al estático), así que no hizo falta el
fundido de reserva.

**Alternativas descartadas.** (1) Animar todas las filas: alarga la lista y la entrada pasaría de 300 ms. (2) `fill-mode: none`: las filas
parpadearían antes del retraso. (3) `IntersectionObserver` o `@starting-style`: JavaScript o soporte desigual. (4) Dibujar el trazo con
`stroke-dashoffset`: no es opacidad ni transformación. (5) Un fundido de opacidad del motivo: solo como reserva si W3 fallaba.

**Motivo.** Un único interruptor de movimiento reducido (la 207), CSS puro y un tope visible de 300 ms en una herramienta de uso diario.

---

## 271 — Voz cálida en tuteo fuera de las pantallas con precios (enmienda la 132, la 134 y los principios 1 y 5 de `PRODUCT.md`)

**Estado:** aceptada (D.22); enmienda la 132 (voz factual), la 134 (registro) y la 235 (el motivo, ahora también dentro de la portada).

**Contexto.** La 132 fijó una voz factual y sin lenguaje comercial; los principios de `PRODUCT.md` priorizaban consistencia y densidad frente a
efecto. El responsable quiere una web menos seria y más acogedora sin perder esa disciplina donde se comparan precios.

**Decisión.** Voz cálida en tuteo («no has hecho nada mal», «Prueba a quitar algún filtro») en la portada y en los estados vacío, 404, error y
429; voz neutra y factual en la lista, la ficha, el histórico y las cifras. El principio 1 admite la marca, las ilustraciones y la voz
cercana fuera de las pantallas con precios, y el 5 añade que la calidez se gana con detalles y no a costa de la densidad. La prueba de
cadenas de la lista, la ficha y el histórico no cambia. El motivo de la 235 aparece también dentro de la franja de la portada. El tuteo ya
era el registro de la 134: lo que cambia es el tono, no el tratamiento.

**Alternativas descartadas.** (1) Voz cálida en toda la web: contamina los precios y las cifras comparables. (2) Mantener la voz factual en
los estados: era la fuente del tono frío que motivó el paso. (3) Reescribir los principios enteros: basta con acotar el 1 y el 5.

**Motivo.** El tono cercano donde el usuario se pierde o decide si seguir, y el neutro donde compara dinero.

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
- ~~**Base de datos de test separada para `packages/db`** (decisión 046)~~: resuelto en el paso
  3.2, decisión 245 (bases `_test` derivadas, aprovisionadas por `globalSetup` y con guardián de nombre).
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
