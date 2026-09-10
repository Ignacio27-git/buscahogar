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
únicamente el cuerpo de `withinMeters`; ningún punto de llamada cambia. Esta comprobación
(`CHK-GEOG-STORED`) pertenece a la fase 3 del paso 1.3, bloqueada por la caída del motor
Linux de Docker, y sigue sin ejecutarse.

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
