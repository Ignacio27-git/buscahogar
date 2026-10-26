# Despliegue y operación

Guía de operación del paso 3.4: qué variables necesita cada servicio, cómo se despliega, cómo se copia y se restaura la base de datos, qué
hacer cuando algo se atasca y qué queda por hacer en el paso 3.5. El código y la configuración están listos y comprobados en local (Docker,
MinIO y simulacros); **nada de esto crea cuentas ni gasta dinero**: aprovisionar Vercel, Neon, el host del worker, el almacenamiento y
Telegram, el dominio y el primer despliegue real son el paso 3.5 (ver «Paso 3.5: lista de traspaso»).

Decisiones y motivos: `docs/DECISIONS.md` (254 y 255–265). Arquitectura: `docs/ARCHITECTURE.md`, «Infraestructura».

## Ruta rápida

1. Comprueba el entorno de cada servicio con `env:check` (solo nombres, nunca valores): [«Comprobaciones»](#comprobaciones-envcheck-y-checkpublic-env).
2. Despliega la base de datos con el JavaScript compilado, **dos veces**: la segunda no debe cambiar nada
   ([«Desplegar»](#desplegar-la-base-de-datos)).
3. Arranca `apps/web` y `apps/ingestion` con su propio entorno ([«Pila local tipo producción»](#pila-local-tipo-producción)).
4. Programa la copia de seguridad y haz **un simulacro de restauración antes de fiarte de ella**
   ([«Copias de seguridad»](#copias-de-seguridad), [«Simulacro de restauración»](#simulacro-de-restauración)).

## Quién usa qué

| Servicio | Dónde corre | Base de datos | Credenciales que ve |
|---|---|---|---|
| `apps/web` | Vercel (paso 3.5) | **URL del pooler**, dos roles: `web_readonly` y `web_coverage` | solo las dos de la base; ninguna de las fuentes |
| `apps/ingestion` (worker) | host aparte, siempre encendido | URL **directa** | base, fuente (Idealista), latido, Telegram |
| `deploy` | una vez por versión (CI o el host) | URL **directa** del propietario | propietario y los dos secretos de rol |
| `ops/backup` | cron del host | URL **directa** | propietario, clave **pública** age, almacenamiento |

Regla de URL: las **sesiones largas, DDL y volcados van por la URL directa**; el servidor sin estado de `apps/web` va por el pooler (decisión
256: sin sentencias con nombre, `SET`, `LISTEN`, bloqueos consultivos ni tablas temporales; lo vigila un test estático).

## Variables de entorno

Las tablas de abajo son **la lista completa y vigilada**: `apps/web/test/deployment-docs.test.ts` y
`apps/ingestion/test/deployment-docs.test.ts` fallan si una variable del código no está aquí, si sobra una fila, o si «Obligatoria», «Por
defecto» o «URL» no coinciden con el inventario del código (`env-manifest.ts` de cada app). Los ejemplos no son secretos reales.

- **Obligatoria**: `sí`, `no` o `condicional` (lo explica la descripción). **URL**: `pooler`, `directa` o `—` (no es una URL de base de datos).
- Ninguna credencial se expone como variable `NEXT_PUBLIC_*`: Next incrusta esas variables en el JavaScript de cada navegador.
  `pnpm check:public-env` lo comprueba en CI.
- Los valores reales viven en el gestor de secretos del proveedor (paso 3.5) o en un fichero **fuera del repositorio**; nunca en el repositorio,
  en una imagen ni en un `.env*` versionado.

### Web (`apps/web`)

| Variable | Obligatoria | Por defecto | Ejemplo | URL | Descripción |
|---|---|---|---|---|---|
| `DATABASE_URL` | sí | — | `postgresql://web_readonly:<secreto>@<host>-pooler/<base>?sslmode=verify-full` | pooler | Rol `web_readonly` (solo lectura). En Compose llega desde `WEB_DATABASE_URL`. |
| `WEB_COVERAGE_DATABASE_URL` | sí | — | `postgresql://web_coverage:<secreto>@<host>-pooler/<base>?sslmode=verify-full` | pooler | Rol `web_coverage`: `coverage_jobs`, `coverage_client_quota`, `zone_query_signals` y `proxy_rate_limit` (limitador). |
| `NEW_ZONES_DAILY_CAP` | sí | — | `20` | — | Tope de zonas nuevas por día (decisión de operación, nunca inventada en código). |
| `CLIENT_IP_HEADER` | no | — (limitadores desactivados) | `x-forwarded-for` | — | Cabecera de confianza con la IP del cliente. En Vercel, `x-forwarded-for`. Definida, exige las cuatro siguientes. |
| `CLIENT_IP_HMAC_KEY` | condicional | — | `<32 o más caracteres aleatorios>` | — | Clave del HMAC-SHA256 con el que se reduce la IP a una huella antes de guardar nada. Obligatoria si hay `CLIENT_IP_HEADER`. |
| `COVERAGE_PER_CLIENT_DAILY_CAP` | condicional | — | `5` | — | Cobertura bajo demanda por cliente y día. Obligatoria si hay `CLIENT_IP_HEADER`. |
| `PROXY_RATE_LIMIT_MAX` | condicional | — | `30` | — | Peticiones por ventana y cliente. Obligatoria si hay `CLIENT_IP_HEADER`. |
| `PROXY_RATE_LIMIT_WINDOW_SECONDS` | condicional | — | `60` | — | Duración de la ventana del limitador. Obligatoria si hay `CLIENT_IP_HEADER`. |
| `TILE_URL_TEMPLATE` | no | teselas estándar de OpenStreetMap | `https://tiles.example.test/{z}/{x}/{y}.png?key=<clave-publicable>` | — | https, un solo host, `{z}/{x}/{y}`. La clave de la consulta llega a todos los navegadores: publicable y restringida por dominio, nunca secreta. |
| `TILE_ATTRIBUTION` | condicional | — (la de OpenStreetMap) | `© Proveedor de teselas` | — | Texto plano. Obligatoria con `TILE_URL_TEMPLATE` propia; se rechaza con la plantilla por defecto. |
| `SITE_INDEXING` | no | false | `true` | — | `true` permite el rastreo y expone `/sitemap.xml`. Se evalúa al compilar: cambiarla exige un nuevo despliegue. |
| `SITE_URL` | condicional | — | `https://buscahogar.example` | — | Origen público, sin ruta. Obligatoria con `SITE_INDEXING=true`. |
| `LEGAL_OWNER_NAME` | no | — (marcador «Pendiente de configurar») | `Nombre o razón social` | — | Titular del aviso legal. Sin definir, producción avisa al arrancar. |
| `LEGAL_OWNER_TAX_ID` | no | — (marcador «Pendiente de configurar») | `NIF o CIF` | — | NIF o CIF del titular. |
| `LEGAL_OWNER_ADDRESS` | no | — (marcador «Pendiente de configurar») | `Calle y número, código postal, ciudad` | — | Domicilio del titular. |
| `LEGAL_OWNER_EMAIL` | no | — (marcador «Pendiente de configurar») | `contacto@example.test` | — | Correo de contacto del titular. |

Notas: `TILE_URL_TEMPLATE`, `SITE_INDEXING` y `LEGAL_OWNER_*` se evalúan **al compilar** en Vercel: defínelas en «Build y Runtime» y vuelve a desplegar al
cambiarlas (las identidades `LEGAL_OWNER_*` quedan en el HTML generado). Sin `CLIENT_IP_HEADER` los dos limitadores por IP están
**desactivados** (es el interruptor de reversión de la decisión 078): en producción define las cinco.

### Worker (`apps/ingestion`)

| Variable | Obligatoria | Por defecto | Ejemplo | URL | Descripción |
|---|---|---|---|---|---|
| `IDEALISTA_API_KEY` | sí | — | `<clave de la API>` | — | Credencial de la fuente. Solo existe en el worker; nunca en `apps/web`. |
| `IDEALISTA_API_SECRET` | sí | — | `<secreto de la API>` | — | Credencial de la fuente. Solo existe en el worker. |
| `DATABASE_URL` | sí | — | `postgresql://<propietario>:<secreto>@<host-directo>/<base>?sslmode=verify-full` | directa | Base de datos del worker (rol propietario o de ingesta). Directa: el worker usa sesiones largas. |
| `DAILY_SEARCH_CAP` | sí | — | `<peticiones por día>` | — | Tope diario de peticiones de búsqueda. Decisión de operación: la cuota de Idealista es mensual y limitada. |
| `BLOCKING_RADIUS_METERS` | sí | — | `<metros>` | — | Radio del bloqueo geográfico de la deduplicación. |
| `BLOCKING_PRICE_BAND_CENTS` | sí | — | `<céntimos>` | — | Banda de precio del bloqueo, en céntimos. |
| `BLOCKING_SURFACE_TOLERANCE_M2` | sí | — | `<m²>` | — | Margen de superficie del bloqueo, en m². |
| `POLL_INTERVAL_MS` | no | 15000 | `15000` | — | Pausa entre ticks del worker. |
| `MAX_SEARCH_REQUESTS_PER_SWEEP` | no | 10 | `10` | — | Corte explícito de páginas por barrido (protege la cuota). |
| `REFRESH_BUDGET_FRACTION` | no | 0 | `0.2` | — | Fracción del tope diario que el refresco puede gastar (0 lo desactiva). |
| `MAINTENANCE_EVERY_TICKS` | no | 20 | `20` | — | Ticks entre pasadas de mantenimiento. |
| `MAX_VERIFICATION_REQUESTS_PER_TICK` | no | 2 | `2` | — | Peticiones de verificación de presencia por tick. |
| `VERIFICATION_RADIUS_MARGIN_M` | no | 500 | `500` | — | Margen (m) que la verificación suma al radio de la zona. |
| `WORKER_STOP_GRACE_MS` | no | 8000 | `8000` | — | Plazo de parada ordenada tras SIGTERM/SIGINT; al vencer, sale con 1. Debe ser menor que el plazo del host. |
| `STALE_RUNNING_JOB_AFTER_MS` | no | 900000 | `900000` | — | Antigüedad del arrendamiento a partir de la cual un job `running` se da por abandonado (mínimo 120000). |
| `HEARTBEAT_URL` | no | — (sin latido; aviso de producción) | `https://hc-ping.example/<uuid>` | — | URL https del dead-man's-switch. La URL es un secreto: se pide tras cada tick correcto y nunca se registra. |
| `HEARTBEAT_MIN_INTERVAL_MS` | no | 60000 | `60000` | — | Intervalo mínimo entre pings del latido (0 = uno por tick correcto). |
| `MAX_OUTBOUND_CALLS_PER_TICK` | no | 4 | `4` | — | Tope de llamadas salientes por tick; el latido y Telegram lo comparten. |
| `TELEGRAM_BOT_TOKEN` | no | — (avisos desactivados; aviso de producción) | `<id>:<clave de BotFather>` | — | Token del bot. Las dos variables de Telegram o ninguna. |
| `TELEGRAM_CHAT_ID` | no | — | `-1001234567890` | — | Chat, grupo (negativo) o `@canal` de destino. Con `TELEGRAM_BOT_TOKEN` o ninguna. |
| `ALERT_FAILED_JOBS_THRESHOLD` | no | 5 | `5` | — | Jobs fallidos en la ventana a partir de los cuales se avisa (mínimo 1). |
| `ALERT_FAILED_JOBS_WINDOW_MS` | no | 86400000 | `86400000` | — | Ventana del aviso de jobs fallidos (mínimo 60000). |
| `ALERT_COOLDOWN_MS` | no | 21600000 | `21600000` | — | Enfriamiento del aviso de jobs fallidos (mínimo 60000). Los diarios duran 24 h y los mensuales 32 días. |
| `TELEGRAM_API_BASE_URL` | no | — (la API real) | `http://127.0.0.1:8081` | — | Solo para el Telegram falso de las pruebas (`scripts/fake-telegram.ts`). No se define en producción. |

Notas: la operación (`sale`/`rent`) ya no es una variable: cada job lleva la suya (decisión 252) y un `OPERATION` heredado se **rechaza** al
arrancar. Todo lo que pagina tiene corte explícito (`MAX_SEARCH_REQUESTS_PER_SWEEP`, `DAILY_SEARCH_CAP`): la cuota de Idealista es mensual y
limitada. `WORKER_STOP_GRACE_MS` debe ser menor que el plazo que da el host entre SIGTERM y SIGKILL.

### Despliegue (`deploy`)

| Variable | Obligatoria | Por defecto | Ejemplo | URL | Descripción |
|---|---|---|---|---|---|
| `DIRECT_DATABASE_URL` | sí | — | `postgresql://<propietario>:<secreto>@<host-directo>/<base>?sslmode=verify-full` | directa | URL DIRECTA del propietario (migraciones, roles, DDL). Sin respaldo: nunca cae a `DATABASE_URL`. |
| `WEB_READONLY_PASSWORD` | sí | — | `<secreto del rol>` | — | Secreto del rol `web_readonly`. ASCII imprimible; nunca se registra. |
| `WEB_COVERAGE_PASSWORD` | sí | — | `<secreto del rol>` | — | Secreto del rol `web_coverage`. ASCII imprimible; nunca se registra. |
| `WEB_READONLY_ROLE` | no | web_readonly | `web_readonly` | — | Nombre del rol de solo lectura. |
| `WEB_COVERAGE_ROLE` | no | web_coverage | `web_coverage` | — | Nombre del rol de cobertura. |
| `SEED_MONTHLY_QUOTA_TOTAL` | no | — (sin siembra; el worker queda cerrado) | `<cuota mensual>` | — | Total mensual a sembrar SOLO si no hay ninguna fila. Con la reserva, o ninguna de las dos. |
| `SEED_MONTHLY_QUOTA_RESERVE` | no | — | `<reserva>` | — | Reserva de la cuota; menor que el total. |

En Compose, `DIRECT_DATABASE_URL` llega desde `DEPLOY_DIRECT_DATABASE_URL` (para no confundirla con el resto de URL del `.env`). El
despliegue **no usa nunca `DATABASE_URL` como respaldo**: sin la URL directa sale con 2 y lo dice. Las contraseñas de rol son ASCII imprimible.

### Copias de seguridad (`ops/backup/backup.sh`)

| Variable | Obligatoria | Por defecto | Ejemplo | URL | Descripción |
|---|---|---|---|---|---|
| `DIRECT_DATABASE_URL` | sí | — | `postgresql://<propietario>:<secreto>@<host-directo>/<base>?sslmode=verify-full` | directa | URL DIRECTA de la base a copiar (nunca la del pooler). |
| `AGE_RECIPIENT` | sí | — | `age1<clave pública>` | — | Clave PÚBLICA age. Una clave privada se rechaza. La privada no existe en este host. |
| `BACKUP_S3_BUCKET` | sí | — | `buscahogar-backups` | — | Bucket de destino. |
| `BACKUP_S3_ACCESS_KEY_ID` | sí | — | `<id de acceso>` | — | Credencial S3 con escritura, listado y borrado solo en ese bucket. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | sí | — | `<secreto de acceso>` | — | Credencial S3. |
| `BACKUP_S3_ENDPOINT` | no | — (AWS S3) | `https://<cuenta>.r2.cloudflarestorage.com` | — | Endpoint S3-compatible (MinIO, R2…), con direccionamiento por ruta. |
| `BACKUP_S3_REGION` | no | us-east-1 | `eu-central-1` | — | Región del almacenamiento. |
| `BACKUP_S3_PREFIX` | no | — | `produccion` | — | «Carpeta» dentro del bucket. |
| `BACKUP_NAME_PREFIX` | no | buscahogar | `buscahogar` | — | Prefijo del nombre de cada copia (`<prefijo>-AAAAMMDDTHHMMSSZ.dump.age`). |
| `BACKUP_TMPDIR` | no | /tmp | `/tmp` | — | Dónde se crea el directorio temporal (0700) del texto cifrado. |

### Simulacro de restauración (`ops/backup/restore-drill.sh`)

| Variable | Obligatoria | Por defecto | Ejemplo | URL | Descripción |
|---|---|---|---|---|---|
| `DRILL_DATABASE_URL` | sí | — | `postgresql://<propietario>:<secreto>@<host-directo>/<base>?sslmode=verify-full` | directa | Base de DESTINO, vacía y de otro servidor. Se rechaza si no está vacía o es la de `DIRECT_DATABASE_URL`. |
| `AGE_IDENTITY_FILE` | condicional | — | `/run/age/id.txt` | — | Ruta de la clave PRIVADA age, solo en `run`. Solo existe donde se hace el simulacro. |
| `WEB_READONLY_PASSWORD` | condicional | — | `<secreto del rol>` | — | Solo en `run`: con ellos el aprovisionamiento crea el rol en el destino. |
| `WEB_COVERAGE_PASSWORD` | condicional | — | `<secreto del rol>` | — | Solo en `run`. |
| `WEB_READONLY_ROLE` | no | web_readonly | `web_readonly` | — | Nombre del rol de solo lectura. |
| `WEB_COVERAGE_ROLE` | no | web_coverage | `web_coverage` | — | Nombre del rol de cobertura. |
| `DRILL_EXPECTED_ROW_COUNTS` | no | — | `properties=1200,listings=3400` | — | `tabla=n,tabla=n`: recuentos que la base restaurada debe tener. |
| `DRILL_BACKUP_NAME` | no | — (la más reciente) | `buscahogar-20260101T030000Z.dump.age` | — | Restaurar esa copia en lugar de la última. |
| `DRILL_INGESTION_DIR` | no | /opt/ingestion | `/opt/ingestion` | — | JavaScript compilado de `apps/ingestion` dentro de la imagen `drill`. |
| `SEED_MONTHLY_QUOTA_TOTAL` | no | — | `<cuota mensual>` | — | Se pasa al aprovisionamiento, igual que en el despliegue. |
| `SEED_MONTHLY_QUOTA_RESERVE` | no | — | `<reserva>` | — | Se pasa al aprovisionamiento. |

El simulacro necesita además las variables `BACKUP_S3_*` de la tabla anterior (`BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` y, si las
usas, `ENDPOINT`, `REGION`, `PREFIX`) y `BACKUP_NAME_PREFIX`.

## Comprobaciones: `env:check` y `check:public-env`

| Orden | Qué hace |
|---|---|
| `pnpm --filter @buscahogar/web env:check [--target local\|production]` | Valida el **entorno del proceso** de `apps/web` con los mismos lectores Zod que el runtime. |
| `pnpm --filter @buscahogar/ingestion env:check [--target …] [--service worker\|deploy]` | Igual para el worker (por defecto) o el despliegue. |
| `pnpm env:check [--target …]` | Las dos primeras (web y worker) seguidas. |
| `pnpm check:public-env` | Ninguna credencial como `NEXT_PUBLIC_*`: nombres del entorno y contenido de `git ls-files`. |

- **Solo nombres, nunca valores.** Ni siquiera el de las variables que fallan: un error de configuración dice «falta o está en blanco» o
  «valor inválido», y nada más.
- **No lee ni escribe ningún `.env*`.** Inspecciona `process.env`. Para comprobar un fichero, cárgalo tú: `node --env-file=<fichero>
  --import tsx scripts/env-check.ts` desde la carpeta de la app (lo lee Node, no el script).
- `--target local` (por defecto) sale 1 **solo si hay errores**. `--target production` sale 1 con errores **y con avisos de producción**; son
  los mismos avisos que cada servicio registra al arrancar (mismo clasificador): `LEGAL_OWNER_*` sin definir, teselas de OpenStreetMap por
  defecto, Telegram sin configurar y `HEARTBEAT_URL` sin definir.
- Con `apps/web` y el worker, el aviso de arranque sale como una línea JSON `warn` (`msg: "production-warning"`, `name`, `reason`) **una vez**; en
  la web lo emite `instrumentation.ts` (`register()` de Next 16). Un aviso nunca impide arrancar.
- Las copias de seguridad y el simulacro (shell) validan su propio entorno y salen con 2 antes de usar la red.

## Códigos de salida

| Herramienta | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| `deploy` | hecho (incluida una ejecución sin cambios) | un paso falló (se nombra) | configuración inválida o secreto ausente, **antes de cambiar nada** | base inaccesible | una comprobación posterior falló (inicio de sesión de un rol, `jit`, matriz de privilegios) |
| Worker | parada limpia | diez caídas seguidas, o salida forzada (plazo de parada o segunda señal) | configuración inválida (tras 30 s de espera, para no entrar en bucle) | base inaccesible tras el backoff de arranque | — |
| `backup.sh` | hecho | volcado, cifrado, subida o retención fallidos | configuración inválida (antes de usar la red) | base o almacenamiento inaccesibles | — |
| `restore-drill.sh` | todas las comprobaciones pasan | un paso falló | configuración inválida, destino no vacío o igual al origen | base o almacenamiento inaccesibles | una comprobación falló (se nombra) |
| `env:check` | sin problemas bloqueantes | hay problemas | argumentos incorrectos | — | — |
| `check:public-env` | limpio | hay una credencial `NEXT_PUBLIC_*` | no se pudo listar `git ls-files` | — | — |

Docker `on-failure` no filtra por código de salida: el worker espera 30 s antes de salir con 2 precisamente para que un reinicio no sea un bucle
caliente.

## Pila local tipo producción

Objetivo: ejercitar en tu máquina lo mismo que irá a producción (JavaScript compilado, imagen del worker, deploy idempotente, `web` en modo
producción), sin cuentas ni dinero y **sin tocar la base de desarrollo**.

> **Usa una base aparte.** El despliegue crea los roles `web_readonly` y `web_coverage`, que son **globales al servidor de PostgreSQL**, y si
> ya existen con otra contraseña los **rota** (el inicio de sesión falla → reemplazo del verificador). Si lo apuntas al contenedor `db` de
> desarrollo, tus `WEB_DATABASE_URL`/`WEB_COVERAGE_DATABASE_URL` del `.env` dejarían de funcionar.

```bash
# 0. Un servidor PostGIS desechable, en otro puerto y con otro nombre (es lo mismo que levanta la CI)
docker run -d --name buscahogar-prodlike-db -p 55432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=prodlike-owner-pw -e POSTGRES_DB=buscahogar_prodlike \
  postgis/postgis:17-3.5

# 1. Entorno del despliegue, exportado en la shell (ningún fichero)
export DIRECT_DATABASE_URL=postgresql://postgres:prodlike-owner-pw@localhost:55432/buscahogar_prodlike
export WEB_READONLY_PASSWORD=prodlike-readonly-pw WEB_COVERAGE_PASSWORD=prodlike-coverage-pw
pnpm install --frozen-lockfile
pnpm --filter @buscahogar/ingestion env:check --service deploy --target production      # salida 0

# 2. Desplegar dos veces (ver «Desplegar la base de datos»)
pnpm --filter @buscahogar/ingestion run build:runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime

# 3. La web en modo producción, con los roles que acaba de crear el despliegue
export DATABASE_URL=postgresql://web_readonly:prodlike-readonly-pw@localhost:55432/buscahogar_prodlike
export WEB_COVERAGE_DATABASE_URL=postgresql://web_coverage:prodlike-coverage-pw@localhost:55432/buscahogar_prodlike
export NEW_ZONES_DAILY_CAP=20
pnpm --filter @buscahogar/web env:check --target production      # salida 1: avisos de identidad y de teselas (esperado en local)
pnpm --filter @buscahogar/web build
pnpm --filter @buscahogar/web start                              # http://localhost:3000
curl -s http://localhost:3000/api/health                         # {"status":"ok"}
```

El worker se comprueba como imagen (la misma que irá al host), **sin credenciales reales**: así se ve la configuración inválida sin gastar cuota.

```bash
docker build -f apps/ingestion/Dockerfile -t buscahogar-ingestion:prodlike .        # node:22.23.4-bookworm-slim, usuario node
docker run --rm buscahogar-ingestion:prodlike                                       # JSON `fatal` con los nombres que faltan; sale 2 a los 30 s
```

Arrancar el worker con credenciales de Idealista **gasta cuota real** (límite `DAILY_SEARCH_CAP`, corte `MAX_SEARCH_REQUESTS_PER_SWEEP`): hazlo
solo a propósito, con topes pequeños, y nunca desde un test (los tests usan fixtures grabados). Para parar y limpiar:
`docker rm -f buscahogar-prodlike-db`.

Compose conserva sus perfiles: `docker compose --profile deploy run --rm deploy` ejecuta el despliegue contra el servicio `db` **de desarrollo**
(lee `DEPLOY_DIRECT_DATABASE_URL` y las contraseñas de tu shell o de `.env`), y `docker compose --profile app build ingestion` construye la
imagen del worker. Tienen la advertencia de arriba.

## Desplegar la base de datos

`deploy` es el único punto de entrada: migraciones, roles, privilegios, semillas y comprobaciones, contra la URL **directa** del propietario.
Es **idempotente**: se puede repetir sin miedo y la segunda ejecución no cambia nada.

```bash
pnpm --filter @buscahogar/ingestion run build:runtime        # una vez por versión: compila a apps/ingestion/dist-runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime       # node dist-runtime/scripts/deploy.js
```

| Paso | Qué hace | Si falla |
|---|---|---|
| connect | abre la URL directa | salida 3 |
| migrate | `migrate()` de `drizzle-orm` con el registro de `packages/db/migrations` (no hay `drizzle-kit` en producción) | salida 1, paso nombrado |
| roles | crea `web_readonly` y `web_coverage` si faltan; si existen y entran con el secreto actual, **no se tocan**; solo se rota ante un 28P01 | salida 4 si no entra tras crear o rotar |
| grants | `bootstrap-roles-grants.sql`: GRANT primero y REVOKE al final; huella de ACL antes y después | salida 1 |
| catalogue / quota | catálogo municipal (omitido si ya está) y cuota mensual **solo si no hay ninguna fila** y hay `SEED_MONTHLY_QUOTA_*` | salida 1; sin variables, aviso y el worker sigue cerrado |
| verify | `SHOW jit` como `web_readonly` y matriz de privilegios de los dos roles | salida 4 |

Resultado esperado:

- **Primera ejecución** (base vacía): `23 migrations, roles created, privileges changed, seeds applied`.
- **Segunda ejecución**: `0 migrations, roles unchanged, privileges unchanged, seeds skipped`, salida 0. La CI exige esta línea.
- Una línea JSON por evento; nunca contraseñas, verificadores ni URL de conexión.

Si cambia un secreto de rol, el inicio de sesión con el valor antiguo falla (28P01) y el despliegue **rota** el verificador; si el nuevo secreto
tampoco entra, sale 4 con un mensaje explícito (¿el proveedor no acepta verificadores SCRAM ya calculados?: ver «Neon»).

## Copias de seguridad

`ops/backup/backup.sh` hace `pg_dump -Fc | age -r $AGE_RECIPIENT`, sube con `rclone` a un almacenamiento compatible con S3, verifica el tamaño
y solo entonces aplica la retención **7 diarias, 4 semanales y 3 mensuales** (la misma que declara la página de privacidad; un test las ata).
El texto sin cifrar **nunca toca el disco**: pasa por una tubería directa a `age`. Una subida a medias no cuenta como copia y un fallo nunca
dispara la poda.

```bash
docker build -f ops/backup/Dockerfile -t buscahogar-backup .
docker run --rm --env-file <fichero-de-variables-FUERA-del-repositorio> buscahogar-backup     # copia + retención
```

- **Programación** (cron del host, una vez al día) y **cuenta del almacenamiento**: paso 3.5. Este repositorio solo aporta lo que se programa.
- **Errores**: cada fallo escribe una línea JSON de nivel `error` y sale con un código distinto de 0 (tabla de códigos): engancha tu programador
  a ese código de salida.
- La prueba de extremo a extremo (`bash ops/backup/test/e2e.sh`, Docker) usa MinIO y dos PostGIS efímeros en `ops/backup/compose.yml`, que es un
  fichero **aparte y sin volúmenes**: el volumen de desarrollo `buscahogar_postgres_data` tiene nombre fijo y un `down -v` desde cualquier
  proyecto lo borraría.
- **Retención y fechas**: los tramos son disjuntos (7 diarias, 4 semanales y 3 mensuales sin solaparse). Con 20 copias diarias seguidas quedan
  9 (las 7 diarias más las semanales y mensuales que existan); se llega a 7 + 4 + 3 con unos cuatro meses de historia. Es el diseño, no un fallo.

### Clave de las copias

La copia se cifra con una clave **pública**; solo quien tenga la **privada** puede descifrarla. Resumen (el detalle está en
`ops/backup/README.md`, «Clave privada: cómo se maneja»):

- La **privada no existe** en el host que hace la copia, ni en la imagen, ni en una variable de producción, ni en el repositorio. Si llegara a
  `AGE_RECIPIENT`, el script la rechaza y no la repite.
- Se genera fuera del servidor: `age-keygen -o buscahogar-backup.key`. Solo la línea `# public key: age1…` va a `AGE_RECIPIENT`.
- Guarda la privada en un gestor de contraseñas **y** en una copia fuera de línea. Perderla equivale a no tener copias.
- Solo se facilita en el momento del simulacro o de una recuperación real (`AGE_IDENTITY_FILE`, montada en solo lectura) y se retira después.

## Simulacro de restauración

Una copia que nunca se ha restaurado es una esperanza, no una copia. `restore-drill.sh` descarga la última, la descifra **en streaming**, la
restaura con `pg_restore --no-owner --no-privileges` en una base **vacía de otro servidor**, repite el aprovisionamiento por la ruta del
despliegue (el volcado no lleva los roles, que son globales, ni los privilegios) y comprueba:

| Comprobación | Qué exige |
|---|---|
| `postgis-extension` | la extensión PostGIS está instalada |
| `core-tables` | existen las tablas del núcleo |
| `row-counts` | los recuentos coinciden con `DRILL_EXPECTED_ROW_COUNTS`, si se indicó |
| `migration-journal` | el registro de migraciones = los ficheros de `packages/db/migrations` |
| `privilege-matrix` | `monthly_request_budget` y `alert_dispatch_log` invisibles para los dos roles web; `proxy_rate_limit` invisible para `web_readonly`; `web_coverage` con exactamente sus cuatro tablas |

```bash
docker build -f apps/ingestion/Dockerfile -t buscahogar-ingestion:latest .
docker build -f ops/backup/Dockerfile --target drill -t buscahogar-drill .
docker run --rm --env-file <fichero> -v <ruta-a-la-clave-privada>:/run/age/id.txt:ro \
  -e AGE_IDENTITY_FILE=/run/age/id.txt buscahogar-drill                          # simulacro completo
docker run --rm --env-file <fichero> buscahogar-drill restore-drill.sh verify    # solo las comprobaciones
```

Rechaza un destino no vacío y uno igual a `DIRECT_DATABASE_URL`: nunca restaura sobre el origen. Un desajuste sale con **4** y nombra la
comprobación (por ejemplo `failed checks: privilege-matrix`). Frecuencia recomendada: tras la primera copia real y después de cada cambio de
esquema o de privilegios; el calendario es del paso 3.5.

## Jobs running atascados

**Síntoma.** Un `coverage_job` lleva horas en `running` y la zona no avanza, o llegó el aviso de Telegram `stale-reclaim:<día UTC>`. Pasa cuando
el worker muere sin parada ordenada (SIGKILL, fallo del host, falta de memoria): su job se queda `running`, y ni la selección ni el reclamo lo
tocan porque protegen al worker vivo.

**Automático (decisión 258, parte 2).** Cada job `running` tiene un arrendamiento (`coverage_jobs.lease_renewed_at`, reloj de la base de datos,
renovado por cada avance de cursor). En cada tick, antes de elegir trabajo, el worker pasa a `failed` (`error = 'stale-running-reclaimed'`) los
jobs cuyo `coalesce(lease_renewed_at, started_at, requested_at)` supera `STALE_RUNNING_JOB_AFTER_MS` (900000 por defecto; mínimo 120000), como
mucho 50 por pasada, y avisa. Se **conservan el cursor y `attempts`**: la reselección retoma donde quedó, sin repetir páginas pagadas, y
`COVERAGE_JOB_MAX_ATTEMPTS` (3) acota a un job que mata al worker una y otra vez. El libro de cuota no se toca: el tick abortado queda
**sobre-contado** (la dirección segura, decisión 248).

**Manual**, si no hay worker vivo que lo haga (conéctate con la URL **directa** del propietario):

```sql
-- 1. Candidatos, con el mismo criterio que el worker (sustituye 900 por los segundos de STALE_RUNNING_JOB_AFTER_MS / 1000)
select id, zone_id, operation, attempts, cursor,
       coalesce(lease_renewed_at, started_at, requested_at) as last_sign_of_life
from coverage_jobs
where status = 'running'
  and coalesce(lease_renewed_at, started_at, requested_at) < now() - interval '900 seconds'
order by last_sign_of_life;

-- 2. Reclamarlos: la misma sentencia que ejecuta el worker (añade `and id = '<uuid>'` para reclamar uno solo)
update coverage_jobs
set status = 'failed', error = 'stale-running-reclaimed', finished_at = now()
where status = 'running'
  and coalesce(lease_renewed_at, started_at, requested_at) < now() - interval '900 seconds'
returning id, attempts, cursor;
```

Antes de ejecutar el paso 2, **comprueba que no hay ningún worker vivo** (`docker ps` o el panel del host): con uno vivo, su job no está
atascado. Con un único worker (decisión 252) un dueño lento pero vivo podría terminar un job ya reclamado; es benigno (`finishJob` fija el estado
final). Tras el paso 2, el worker lo vuelve a elegir si le quedan intentos. Un job con `attempts` igual a 3 **no se reintenta**: es el diseño;
investiga por qué mata al worker antes de forzarlo (cada intento gasta cuota). No hay que tocar `monthly_request_budget`.

## Teselas del mapa: la regla de la clave

`TILE_URL_TEMPLATE` define el proveedor (https, un solo host, `{z}/{x}/{y}`) y `TILE_ATTRIBUTION` su atribución, obligatoria con un proveedor
propio. La CSP admite en `img-src` **solo ese host**; la cadena de consulta no entra en la CSP.

**La clave de la consulta llega a todos los navegadores** (las teselas las pide directamente el navegador, decisión 112; no pasan por nuestro
servidor). Por eso:

- Debe ser una clave **publicable y restringida por dominio** que el proveedor emite para este uso. **Nunca** una clave secreta.
- No se puede ocultar ni rotar sin redesplegar: se evalúa al compilar.
- Las teselas estándar de OpenStreetMap (valor por defecto) tienen una política de uso que no ampara el tráfico de una web en producción: por
  eso `env:check --target production` avisa. Elegir proveedor y firmar sus condiciones es del paso 3.5.

## Neon: comprobaciones SCRAM y `jit`

Dos supuestos del diseño que **no se pueden verificar sin una cuenta de Neon** (paso 3.5) y que fallan de forma ruidosa, no silenciosa:

| Comprobación | Cómo | Si falla |
|---|---|---|
| El proveedor acepta el verificador SCRAM-SHA-256 ya calculado (`ALTER ROLE … PASSWORD 'SCRAM-SHA-256$4096:…'`) | ejecutar `deploy` y comprobar que el inicio de sesión posterior de ambos roles pasa | salida 4 con «¿verificador SCRAM no aceptado?»; no hay respaldo en texto plano. Decidir en 3.5 |
| `ALTER ROLE web_readonly … SET jit = off` está permitido | `psql "<URL de web_readonly>" -c 'SHOW jit'` → `off` | el despliegue aplica `ALTER DATABASE … SET jit = off` (afecta a toda la base, la ingesta incluida; decisión 264) y lo registra; si tampoco se permite, salida 4 |
| La URL del pooler (`-pooler`) funciona con el código de la web | `GET /api/health` y una búsqueda desde Vercel | revisar la decisión 256 (sin estado de sesión) |
| `sslmode=verify-full` en todas las URL | las URL de producción llevan `?sslmode=verify-full` | `pg` interpreta `sslmode` según su versión: confirmar con una conexión real |

## CI

`.github/workflows/ci.yml` (GitHub Actions) se ejecuta en `push` y en `pull_request`. **Solo comprueba**: no despliega, no publica y no usa
ninguna credencial de nube, de las fuentes ni de Telegram.

| Job | Qué hace | Cómo reproducirlo en local |
|---|---|---|
| `checks` | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:public-env` | las mismas órdenes |
| `db` | PostGIS `17-3.5` como servicio; compila el JavaScript de producción; **despliega dos veces** (la segunda debe decir `0 migrations, roles unchanged, privileges unchanged, seeds skipped`); suites de `packages/db`, de `apps/ingestion` (`test:db`) y de `apps/web` con los roles aprovisionados | «Pila local tipo producción» con `DATABASE_URL`, `WEB_DATABASE_URL` y `WEB_COVERAGE_DATABASE_URL` apuntando a la base desechable |
| `backup` | `bash ops/backup/test/e2e.sh`: MinIO y dos PostGIS efímeros, claves age generadas en cada ejecución | `bash ops/backup/test/e2e.sh` (Docker) |

- Node es `22.23.4` y pnpm `11.25.0`, los de la imagen del worker y de `packageManager`; un test vigila que no diverjan.
- La caché del almacén de pnpm se liga a `pnpm-lock.yaml` (`actions/setup-node` con `cache: pnpm`).
- Las acciones (`actions/checkout`, `actions/setup-node`) se fijan por **SHA completo**; subirlas es un commit revisable.
- Si un paso falla, falla el flujo: no hay `continue-on-error`.
- Queda fuera, a propósito: el e2e visual de Playwright (`pnpm e2e`), que necesita una imagen de Docker de varios GB; se ejecuta a mano antes de
  fusionar cambios de interfaz.
- `apps/ingestion/test/ci-workflow.test.ts` comprueba de forma estática la forma del flujo (versiones, `--frozen-lockfile`, despliegue doble,
  ausencia de secretos y de despliegue). GitHub Actions no se puede ejecutar en local: la primera ejecución real ocurre al subir la rama.

## Paso 3.5: lista de traspaso

Todo lo de abajo requiere cuentas, dinero o decisiones del propietario, y por eso **no** forma parte del paso 3.4. El 3.5 empieza tras la
aprobación del TFM.

**Cuentas y servicios**

- [ ] Vercel (plan Pro) para `apps/web`; proyecto, rama de producción y variables «Build y Runtime».
- [ ] Neon (región Frankfurt, PostgreSQL 17 con PostGIS): base, rol propietario, URL **directa** y URL del **pooler**.
- [ ] Host del worker (siempre encendido): imagen de `apps/ingestion/Dockerfile`, política de reinicio, `stop_grace_period` mayor que
      `WORKER_STOP_GRACE_MS`, y el comando de despliegue.
- [ ] Almacenamiento S3-compatible para las copias, con una credencial limitada a ese bucket.
- [ ] Bot de Telegram y chat de avisos (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
- [ ] Monitor de latido (dead-man's-switch) y su `HEARTBEAT_URL`: sin él, nadie se entera de que el worker ha dejado de funcionar.

**Dominio y secretos**

- [ ] Dominio y DNS; `SITE_URL` con el origen definitivo.
- [ ] Todos los secretos en el gestor del proveedor (nunca en el repositorio): URL, contraseñas de rol, claves de la fuente, token de Telegram,
      credenciales del almacenamiento, `CLIENT_IP_HMAC_KEY`.
- [ ] `CLIENT_IP_HEADER=x-forwarded-for` y las cuatro variables del limitador; cifras reales de `PROXY_RATE_LIMIT_*` y
      `COVERAGE_PER_CLIENT_DAILY_CAP`.
- [ ] Clave age: generar el par fuera del servidor, `AGE_RECIPIENT` en el host de copias, la privada en gestor de contraseñas y copia fuera de línea.

**Primer despliegue**

- [ ] `env:check --target production` de web, worker y despliegue en verde (sin avisos).
- [ ] `deploy` contra Neon, dos veces; la segunda sin cambios. Cuota mensual real con `SEED_MONTHLY_QUOTA_*` o `set-monthly-quota`.
- [ ] Verificar en Neon: verificador SCRAM aceptado y `jit` apagado por rol (ver «Neon»).
- [ ] Verificar `attachDatabasePool` y la latencia del proxy frente a Neon dentro del plazo de 200 ms del limitador (fallo abierto).
- [ ] Decidir si la agregación de IPv6 por `/64` hace falta (hoy cada dirección es su propia clave).
- [ ] Primera copia real, **simulacro de restauración** completo y programación diaria de la copia.
- [ ] Alerta de prueba por Telegram y ping de prueba del latido; comprobar que el monitor avisa al parar el worker.

**Contenido, condiciones y limpieza**

- [ ] Rellenar `LEGAL_OWNER_*` (el aviso legal y la privacidad muestran marcadores hasta entonces) y que el responsable, con asesoría si procede,
      **revise los textos legales**; nombrar en la política de privacidad a los encargados del tratamiento (alojamiento y base de datos).
- [ ] Proveedor de teselas con acuerdo, su clave publicable restringida por dominio y su atribución (`TILE_URL_TEMPLATE`, `TILE_ATTRIBUTION`).
- [ ] **Condiciones de Idealista** revisadas antes de activar `SITE_INDEXING=true` (la indexación expone el contenido a buscadores).
- [ ] Ejecutar `pnpm e2e` (visual y accesibilidad) sobre el candidato a producción.
- [ ] Comprobar que `.env.example` recoge las variables de las tablas de arriba. Ninguna herramienta del proyecto puede leer ni editar los
      `.env*`, así que es un paso del responsable.
- [ ] Decidir qué hacer con el servicio `web` de `docker-compose.yml` (perfil `app`): apunta a un `apps/web/Dockerfile` que no existe y, con la
      web en Vercel, no hace falta una imagen de la web. Quitarlo o dejarlo documentado como solo de desarrollo.
