# Buscahogar

Buscador de vivienda en España que reúne en un solo sitio las ofertas de varias fuentes, detecta los anuncios
que corresponden a la misma vivienda y enlaza siempre con el anuncio original. Trabajo Fin de Máster.

| Entregable    | Enlace                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| Demo          | [buscahogar.vercel.app](https://buscahogar.vercel.app/)                               |
| Código fuente | [github.com/Ignacio27-git/buscahogar](https://github.com/Ignacio27-git/buscahogar)    |
| Presentación  | [Buscahogar: presentación del TFM](https://claude.ai/artifact/R4Vvt7wcGyVr636BqaPvHC) |
| Vídeo         | Pendiente de publicar                                                                 |

**No hay usuario ni contraseña de prueba:** la aplicación no tiene cuentas ni inicio de sesión.

## Descripción

Quien busca vivienda encuentra la misma casa repetida en varios portales, con precios distintos y sin saber cuál
es el anuncio más barato. Buscahogar descarga las ofertas de forma programada, las convierte a un modelo común y
agrupa las que son la misma vivienda. La búsqueda consulta siempre la base de datos propia, nunca las fuentes en
directo.

El modelo distingue dos conceptos: `listings` (un anuncio de una fuente) y `properties` (la
vivienda canónica que agrupa uno o varios anuncios). Por eso se puede repetir la deduplicación sin volver a gastar
cuota de la API, y cada cambio de precio se conserva como una versión nueva.

## Funcionalidades principales

**Búsqueda**

- Filtros por ubicación, operación, tipo, precio, superficie y habitaciones, con paginación y orden. Viven en la URL,
  así que una búsqueda se puede guardar y compartir.
- Búsqueda en lenguaje natural: interpreta una frase como «piso en alquiler en Getafe» y muestra el resultado en un
  formulario editable antes de buscar. Es determinista, sin modelo de lenguaje.
- Mapa con marcadores agrupados y dibujo de una zona a mano.
- Cobertura bajo demanda: si un municipio no tiene datos, el usuario puede pedirlo y un proceso en segundo plano lo
  descarga después, con cuota diaria por cliente y aviso del estado.

**Ficha de la vivienda**

- Datos consolidados y precio más económico entre los anuncios activos.
- Comparativa de los anuncios de origen, con enlace a cada uno.
- Histórico de precios en gráfico y en tabla accesible.
- Ubicación aproximada: un círculo de 500 m en el mapa, sin punto exacto.

**Procesamiento de datos**

- Ingesta con límites explícitos de peticiones, para no agotar la cuota mensual de la API.
- Deduplicación en dos fases: bloqueo de candidatos en SQL por proximidad, precio y superficie, y puntuación con
  estrategias intercambiables (por reglas y probabilística de Fellegi-Sunter, con una señal opcional de imagen). Se
  guarda el desglose por señal de cada decisión.
- Prioridad a evitar falsos positivos: agrupar dos viviendas distintas es peor que no detectar un duplicado.

**Interfaz**

- Diseño adaptable, tema claro y oscuro y accesibilidad comprobada con axe.
- Toda página funciona sin JavaScript, salvo el mapa de búsqueda y el refresco automático del aviso de cobertura.

## Limitaciones de la demo

- **Datos fijos:** es una copia de la base de desarrollo, con 4 413 anuncios y 4 375 viviendas el 2026-11-09. No se
  actualiza sola.
- **Sin proceso en segundo plano:** una zona sin datos se puede pedir, pero queda en cola y no llega a cubrirse.
- **Sin fotos:** Idealista ha respondido por escrito que el uso de sus imágenes no está autorizado (decisión 276).
- **Una sola fuente real:** los datos proceden de Idealista, así que casi todas las viviendas tienen un único anuncio.
  Existe también un adaptador para feeds de Kyero. La deduplicación se ha evaluado con pares etiquetados.

## Stack tecnológico

| Área            | Tecnología                                                 |
| --------------- | ---------------------------------------------------------- |
| Lenguaje        | TypeScript en modo estricto, Node.js 20.11 o superior      |
| Web             | Next.js 16 (App Router, Server Components), React 19       |
| Mapas           | Leaflet, React Leaflet, teselas de OpenStreetMap           |
| Base de datos   | PostgreSQL 17 con PostGIS 3.5, Drizzle ORM                 |
| Validación      | Zod, en toda entrada externa                               |
| Ingesta         | Worker en Node.js, `fast-xml-parser`, `sharp`              |
| Pruebas         | Vitest, Playwright y axe                                   |
| Monorepo        | pnpm workspaces                                            |
| Infraestructura | Docker Compose, GitHub Actions, Vercel y Neon para la demo |

## Estructura del proyecto

```text
apps/web          Next.js: interfaz y búsqueda
apps/ingestion    worker: barridos, normalización y deduplicación
packages/core     modelo de dominio, contratos y estrategias, sin Next ni ORM
packages/db       esquema, migraciones y cliente de base de datos
packages/config   configuración compartida de TypeScript y linting
ops/backup        copias de seguridad cifradas, retención y simulacro de restauración
docs              arquitectura, decisiones, hoja de ruta y registro del proceso
```

`apps/web` y `apps/ingestion` no se importan entre sí: se comunican solo por base de datos. El flujo completo es:

```text
API de la fuente → adaptador → normalizador → listings + listing_versions → deduplicación → properties → búsqueda
```

## Instalación y ejecución

La forma más rápida de probar Buscahogar es la [demo](https://buscahogar.vercel.app/). Para ejecutarlo en local hacen
falta Node.js 20.11 o superior, pnpm 11 y Docker. Estos pasos usan una base desechable y no necesitan ningún fichero
`.env`:

```bash
# 1. Instalar dependencias
pnpm install --frozen-lockfile

# 2. Levantar PostgreSQL con PostGIS
docker run -d --name buscahogar-local-db -p 55432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=local-owner-pw -e POSTGRES_DB=buscahogar \
  postgis/postgis:17-3.5

# 3. Crear tablas, roles y datos de referencia
export DIRECT_DATABASE_URL=postgresql://postgres:local-owner-pw@localhost:55432/buscahogar
export WEB_READONLY_PASSWORD=local-readonly-pw WEB_COVERAGE_PASSWORD=local-coverage-pw
pnpm --filter @buscahogar/ingestion run build:runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime

# 4. Compilar y arrancar la web en http://localhost:3000
export DATABASE_URL=postgresql://web_readonly:local-readonly-pw@localhost:55432/buscahogar
export WEB_COVERAGE_DATABASE_URL=postgresql://web_coverage:local-coverage-pw@localhost:55432/buscahogar
export NEW_ZONES_DAILY_CAP=20
pnpm --filter @buscahogar/web build
pnpm --filter @buscahogar/web start
```

La web arranca **sin anuncios**: se crean al ejecutar la ingesta, que necesita credenciales propias de la API de
Idealista y gasta cuota real. Para borrar la base: `docker rm -f buscahogar-local-db`.

Pruebas sin red ni credenciales: `pnpm test`, `pnpm lint` y `pnpm typecheck`.

## Documentación

| Documento                    | Contenido                                                  |
| ---------------------------- | ---------------------------------------------------------- |
| `docs/ARCHITECTURE.md`       | Arquitectura, modelo de datos y pipeline                   |
| `docs/DECISIONS.md`          | Decisiones de arquitectura y su justificación              |
| `docs/DEMO-DEPLOYMENT.md`    | Despliegue de la demo en Vercel y Neon                     |
| `docs/DEPLOYMENT.md`         | Variables, runbook y CI; la producción real no se ejecutó  |
| `docs/SEARCH-PERFORMANCE.md` | Mediciones de rendimiento de la búsqueda                   |
| `ops/backup/README.md`       | Copias de seguridad cifradas y simulacro de restauración   |
| `docs/VIDEO-SCRIPT.md`       | Guion del vídeo de presentación                            |
| `docs/DEMO-SCRIPT.md`        | Guion completo de la demo en directo                       |
| `docs/ROADMAP.md`            | Pasos de desarrollo, con el prompt de cada uno y su estado |
| `docs/AI-NOTES.md`           | Registro de fallos de la asistencia                        |
| `docs/PROMPTS.md`            | Registro de prompts                                        |
| `CLAUDE.md`                  | Contexto y reglas para el desarrollo asistido              |

## Desarrollo con la base de datos de Compose

Para trabajar en el proyecto, con credenciales y datos propios:

```bash
cp .env.example .env    # completar credenciales
docker compose up -d    # postgres + postgis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`apps/web` lee sus dos URL de base de datos de `apps/web/.env.local`, con los roles `web_readonly` y `web_coverage`.

## Base de datos

Solo la base de datos se levanta con Docker. `web` e `ingestion` se ejecutan en local con
`pnpm dev:web` y `pnpm dev:ingestion`.

El worker de cobertura (`apps/ingestion/scripts/coverage-worker.ts`) no lo arranca `pnpm dev:ingestion`: se
lanza aparte con `pnpm --filter @buscahogar/ingestion worker`, con los paquetes ya compilados. Al arrancar retoma
cualquier `coverage_job` pendiente y gasta cuota real, con el límite de `DAILY_SEARCH_CAP` al día. No arranca si en
el `.env` falta alguna de estas variables: `IDEALISTA_API_KEY`, `IDEALISTA_API_SECRET`, `DATABASE_URL`,
`DAILY_SEARCH_CAP`, `BLOCKING_RADIUS_METERS`, `BLOCKING_PRICE_BAND_CENTS` y `BLOCKING_SURFACE_TOLERANCE_M2`
(la operación, venta o alquiler, ya no es una variable: cada job lleva la suya, decisión 252). Sin worker, las zonas
que se piden desde la web quedan en cola y nunca se cubren. La lista completa de variables de cada servicio, con sus
valores por defecto, está en `docs/DEPLOYMENT.md`; `pnpm env:check` comprueba el entorno sin imprimir valores.

```bash
docker compose up -d      # levantar en segundo plano
docker compose stop       # parar, conservando los datos
docker compose down       # parar y eliminar el contenedor, conservando los datos
```

Para comprobar que PostGIS está realmente habilitado en la base de datos de la aplicación,
y no solo instalado en la imagen:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Version();"'
```

Debe devolver una cadena de versión. Si responde `function postgis_version() does not exist`,
la extensión no llegó a crearse: el volumen ya tenía datos la primera vez que arrancó el
contenedor, y el script de inicialización de la imagen solo se ejecuta sobre un volumen
vacío. La solución es resetear.

**Resetear borra todos los datos de forma irreversible.** No hay copia de seguridad ni
confirmación: `-v` elimina el volumen con el contenido de la base de datos.

```bash
docker compose down -v    # BORRA el volumen y todos los datos
docker compose up -d      # recrea la base de datos vacía, con PostGIS habilitado
```

`-v` afecta a todos los volúmenes declarados en `docker-compose.yml`, no solo al de la base
de datos. Hoy solo hay uno, pero si más adelante se añade otro, este comando también lo
borrará.

Alternativa quirúrgica, con el contenedor ya parado:

```bash
docker volume rm buscahogar_postgres_data
```

## Pruebas con base de datos

Las suites que usan PostgreSQL (`packages/db`, `apps/web`, `apps/ingestion`) **nunca tocan la base de
desarrollo**. Derivan del nombre de `DATABASE_URL` una base propia por paquete (`<dev>_db_test`,
`<dev>_web_test`, `<dev>_ingestion_test`), la crean y migran solas la primera vez y rechazan vaciar cualquier
base cuyo nombre no termine en `_test` (decisión 245). No hay variable `TEST_DATABASE_URL`: basta con
`docker compose up -d db` y `DATABASE_URL` en el `.env`.

- Las pruebas de `apps/web` y `apps/ingestion` por separado necesitan los paquetes compilados:
  `pnpm --filter "./packages/*" build` (los scripts raíz `test`, `typecheck` y `lint` ya lo hacen).
- `BENCH_DATABASE_URL` (banco de búsqueda, `search-bench.db.test.ts`) debe apuntar a una base propia y
  vacía, p. ej. `buscahogar_test_bench`, no a `buscahogar_bench` con los datos del banco.

## Pruebas e2e visuales y de accesibilidad

Capturas con Playwright (3 anchos x tema claro/oscuro) y comprobación de accesibilidad con axe. **Solo
se ejecutan en Docker**: las capturas dependen del sistema operativo y de las fuentes, y los baselines son
de Linux.

```bash
pnpm e2e           # comprueba contra los baselines (apps/web/e2e/baselines)
pnpm e2e:update    # regenera capturas y la línea base axe (revisar el diff antes de commitear)
```

- Requieren `docker compose up -d` y, en el `.env` de la raíz, las variables `E2E_DATABASE_URL`
  (propietario de la base `buscahogar_e2e`, host `db`) y `E2E_WEB_DATABASE_URL` (rol `web_readonly` sobre
  esa base). Ver `.env.example`; el servidor de la web solo recibe la segunda (y el servidor «limitado» un rol e2e-only que el
  propio seed crea, con acceso solo a `proxy_rate_limit`; decisión 265). La siembra recrea
  `buscahogar_e2e` en cada ejecución y rechaza cualquier base cuyo nombre no termine en `_e2e`; nunca toca
  la de desarrollo.
- Una ejecución de `test:e2e` en el anfitrión (Windows) NO es autoritativa: fallará en las capturas por
  diferencias de renderizado. Es lo esperado; no se arregla.
- La primera ejecución descarga la imagen de Playwright (varios GB).
- La línea base axe (`apps/web/e2e/baselines/axe-baseline.json`) falla tanto con violaciones nuevas como
  con entradas obsoletas; se reescribe solo con `pnpm e2e:update` (decisión 138).

## Producción y operación

El proyecto termina en la demo: la puesta en producción real se descartó (decisión 275). El código quedó preparado y
comprobado en local, y el procedimiento se conserva sin ejecutar en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): variables de
entorno por servicio, códigos de salida y runbook.

```bash
pnpm env:check --target production                # entorno de web y worker: solo nombres, nunca valores
pnpm check:public-env                             # ninguna credencial como NEXT_PUBLIC_*
pnpm --filter @buscahogar/ingestion run build:runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime    # migraciones, roles y privilegios; idempotente, probar dos veces
bash ops/backup/test/e2e.sh                       # copias cifradas de extremo a extremo contra MinIO local (Docker)
```

- **Pila local tipo producción** (base desechable, JavaScript compilado, imagen del worker, `web` en modo producción):
  `docs/DEPLOYMENT.md`, «Pila local tipo producción». Usa una base **aparte** de la de desarrollo: el despliegue crea y
  rota roles que son globales al servidor.
- **CI** (`.github/workflows/ci.yml`): `checks` (lint, typecheck, test, build, `check:public-env`), `db` (PostGIS, despliegue dos
  veces y suites con base de datos) y `backup` (e2e con MinIO). Solo comprueba: no despliega ni usa credenciales de nube.
- **Copias de seguridad y simulacro de restauración**: `ops/backup/README.md`. La clave privada de descifrado nunca está en el
  repositorio ni en el host de la copia.

## Aviso sobre la cuota

La API de la fuente tiene un límite mensual de peticiones. Los barridos consumen cuota real.
No ejecutar ingestas de prueba sin acotar la zona, y no llamar nunca a la API desde tests:
usar los fixtures grabados.
