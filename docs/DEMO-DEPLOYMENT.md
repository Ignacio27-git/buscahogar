# Despliegue de demostración para la defensa del TFM

Guía del paso 3.4b. El objetivo es tener una URL pública con la que el tribunal pueda probar Buscahogar, **sin coste** y sin adelantar el
paso 3.5, que es la puesta en producción real y empieza después de la aprobación del TFM. Decisión 273.

La demo usa la misma arquitectura que producción (decisión 254), pero reducida: `apps/web` en Vercel, PostgreSQL 17 con PostGIS en Neon
y **ningún worker**. Los datos son una **foto fija** de la base de desarrollo, volcada una sola vez.

## Qué cambia respecto al paso 3.5

| Pieza | Paso 3.5 (producción) | Demo |
|---|---|---|
| `apps/web` | Vercel **Pro** | Vercel **Hobby**: gratis, solo para uso personal no comercial |
| Base de datos | Neon de pago, en Frankfurt | Neon **Free**, en Frankfurt: 0,5 GB por proyecto, 100 CU-hora al mes y suspensión tras 5 min de inactividad |
| Datos | El worker ingiere de forma continua | Volcado de la base local; **no se gasta cuota de Idealista** |
| Worker, copias, Telegram, latido | Sí | No |
| Dominio | Propio, con `SITE_URL` | `*.vercel.app`, con `SITE_INDEXING=false` (valor por defecto) |
| Teselas | Proveedor con acuerdo | OpenStreetMap por defecto (uso puntual) |

**Lo que no cambia y no se negocia:** la web solo ve los roles `web_readonly` y `web_coverage` a través del pooler, ninguna credencial de
fuentes llega a Vercel, y el esquema, los roles y los privilegios se crean con `deploy`, igual que en producción.

**Límites revisados el 2026-10-29.** La base de desarrollo ocupa 129 MB (4 413 anuncios y 4 328 viviendas), así que cabe en Neon Free con
margen. Si cambian los planes, vuelve a comprobarlo en [neon.com/pricing](https://neon.com/pricing) y en
[vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby).

## Consecuencias de no tener worker

- Si alguien pide una zona que no está cubierta, se crea un `coverage_job` que se queda en `pending` para siempre. En la demo conviene
  enseñar las zonas que ya tienen datos: Granada y las 12 ciudades del pre-barrido.
- Los jobs del pre-barrido que estaban pendientes en local (`pending`) también se copian y tampoco avanzan. Es el comportamiento real del
  sistema sin worker.
- Los precios y los anuncios no se actualizan. Si quieres datos más recientes, repite el volcado (ver «Actualizar los datos»).

## 0. Antes de empezar

1. **Elige cuándo hacer la foto.** Lo mejor es volcar los datos **después** del pre-barrido de noviembre y de su `reprocess` (paso 3.3,
   pendiente desde el 2026-11-01). Así la demo tiene 2 páginas por ciudad y operación. Si haces el volcado antes, solo tendrá 1.
2. **Comprueba que la base local está al día:** `drizzle.__drizzle_migrations` debe tener tantas filas como ficheros hay en
   `packages/db/migrations` (hoy, 23).
3. **Sube la rama a GitHub.** Vercel construye desde el repositorio remoto, así que la rama que quieras desplegar tiene que estar subida.
4. Ten Docker Desktop arrancado y el contenedor `buscahogar-db-1` en marcha (`docker compose up -d`). Los comandos usan su `pg_dump`,
   su `pg_restore` y su `psql`, que son de la versión 17, la misma que el servidor de Neon.

Todos los comandos son de **PowerShell** y se ejecutan desde la raíz del repositorio. **Ninguna URL ni contraseña se escribe en un
fichero del repositorio:** solo se usan en la shell o en el gestor de variables de cada proveedor.

## 1. Neon: proyecto y URL

1. Crea una cuenta en Neon y un proyecto con **PostgreSQL 17**, región **AWS Europe Central 1 (Frankfurt)**.
2. Deja la base `neondb` y el rol propietario `neondb_owner` que crea Neon. La base está vacía.
3. En «Connect» copia dos URL del propietario:
   - la **directa** (host sin `-pooler`), que se usa para el volcado y para `deploy`;
   - la del **pooler** (host con `-pooler`), que solo sirve para saber el host del pooler.
4. Sustituye la cadena de consulta de las dos URL por `?sslmode=verify-full`, que es la que usa el proyecto (decisión 256 y
   `docs/DEPLOYMENT.md`, «Neon»).

```powershell
$env:NEON_DIRECT_URL = 'postgresql://neondb_owner:<secreto>@<endpoint>.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full'
```

## 2. Volcar la base local y restaurarla en Neon

Es la misma ruta que el simulacro de restauración: `pg_restore --no-owner --no-privileges` sobre una base vacía y, después, el
aprovisionamiento con `deploy`. El volcado no incluye los roles, que son globales, ni los privilegios.

Se excluyen los **datos** (no la estructura) de tres tablas que solo tienen huellas de IP y contadores de desarrollo.

```powershell
# El volcado se queda dentro del contenedor: nunca toca el disco del repositorio
docker exec buscahogar-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --exclude-table-data=proxy_rate_limit --exclude-table-data=coverage_client_quota --exclude-table-data=zone_query_signals -f /tmp/demo.dump'

docker exec -e NEON_DIRECT_URL="$env:NEON_DIRECT_URL" buscahogar-db-1 sh -c 'pg_restore --no-owner --no-privileges -d "$NEON_DIRECT_URL" /tmp/demo.dump'

docker exec buscahogar-db-1 rm /tmp/demo.dump
```

Puede que `pg_restore` termine con `errors ignored on restore` porque Neon no deje ejecutar `COMMENT ON EXTENSION` a un rol que no es
superusuario. Ese error **no importa**. Si aparece cualquier otro, para y revísalo antes de seguir.

Comprueba los recuentos. Deben coincidir con los de la base local:

```powershell
docker exec -e NEON_DIRECT_URL="$env:NEON_DIRECT_URL" buscahogar-db-1 sh -c 'psql "$NEON_DIRECT_URL" -At -c "select (select count(*) from listings), (select count(*) from properties), (select count(*) from drizzle.__drizzle_migrations), (select extversion from pg_extension where extname = \$\$postgis\$\$);"'
```

## 3. Roles y privilegios con `deploy`

Genera **dos secretos nuevos**. No reutilices los de desarrollo. Guárdalos en tu gestor de contraseñas, porque los necesitarás en el paso 4.

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # una vez para cada rol
```

```powershell
$env:DIRECT_DATABASE_URL   = $env:NEON_DIRECT_URL
$env:WEB_READONLY_PASSWORD = '<secreto de web_readonly>'
$env:WEB_COVERAGE_PASSWORD = '<secreto de web_coverage>'

pnpm --filter @buscahogar/ingestion env:check --service deploy --target production
pnpm --filter @buscahogar/ingestion run build:runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime
pnpm --filter @buscahogar/ingestion run deploy:runtime

Remove-Item Env:DIRECT_DATABASE_URL, Env:WEB_READONLY_PASSWORD, Env:WEB_COVERAGE_PASSWORD, Env:NEON_DIRECT_URL
```

Qué debería salir:

- **Primera ejecución:** `0 migrations` (vienen con el volcado), `roles created` y `privileges changed`. Las semillas se omiten, porque el
  catálogo y la cuota ya vienen en el volcado.
- **Segunda ejecución:** `0 migrations, roles unchanged, privileges unchanged, seeds skipped`, con salida 0.
- **Si sale con 4** («¿verificador SCRAM no aceptado?» o un fallo de `jit`): es uno de los dos supuestos sobre Neon que el paso 3.4 no pudo
  comprobar (`docs/DEPLOYMENT.md`, «Neon»). **Para** y registra el resultado. Es justo lo que el paso 3.5 necesita saber, así que la demo
  lo adelanta.

## 4. Vercel: proyecto y variables

1. Crea una cuenta **Hobby** con GitHub e importa el repositorio `buscahogar`.
2. Configura el proyecto:

| Ajuste | Valor |
|---|---|
| Root Directory | `apps/web` (deja activado «Include files outside the root directory») |
| Framework Preset | Next.js |
| Build Command | `pnpm --filter "@buscahogar/web..." build` |
| Install Command | por defecto (`pnpm install`) |
| Node.js Version | 22.x |
| Production Branch (Settings → Git) | la rama que quieras enseñar |
| Function Region (Settings → Functions) | Frankfurt (`fra1`), junto a Neon |

Hace falta cambiar el Build Command porque `packages/core` y `packages/db` publican `dist/`, que no está en git. Con `...`, pnpm compila
primero las dependencias del espacio de trabajo y después la web. Se comprobó en local el 2026-10-29.

3. Añade estas variables de entorno en «Production»:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://web_readonly:<secreto>@<endpoint>-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full` |
| `WEB_COVERAGE_DATABASE_URL` | `postgresql://web_coverage:<secreto>@<endpoint>-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full` |
| `NEW_ZONES_DAILY_CAP` | `1` (sin worker no tiene sentido abrir más zonas) |
| `CLIENT_IP_HEADER` | `x-forwarded-for` |
| `CLIENT_IP_HMAC_KEY` | 32 o más caracteres aleatorios (mismo comando de `node` que en el paso 3) |
| `COVERAGE_PER_CLIENT_DAILY_CAP` | `1` |
| `PROXY_RATE_LIMIT_MAX` | `30` |
| `PROXY_RATE_LIMIT_WINDOW_SECONDS` | `60` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, para que Vercel use `pnpm@11.25.0` de `packageManager` y no la versión que deduce del lockfile |
| `LEGAL_OWNER_NAME`, `LEGAL_OWNER_EMAIL` | opcionales; sin ellas, el aviso legal muestra «Pendiente de configurar» |

La URL es pública, así que los limitadores van activados. Recuerda que las URL apuntan al **pooler** (`-pooler`) y usan los roles de la
web, **nunca** a `neondb_owner`.

4. Despliega. Si la instalación falla por la versión de pnpm, revisa los registros del build antes de cambiar nada.

## 5. Comprobaciones

1. `https://<proyecto>.vercel.app/api/health` → `{"status":"ok"}`.
2. Una búsqueda en Granada y otra en una de las 12 ciudades, con mapa y teselas.
3. El detalle de una vivienda con varios anuncios (agrupación y desglose de la deduplicación).
4. `/robots.txt` bloquea el rastreo (`SITE_INDEXING=false`).
5. Comprueba que `jit` está desactivado para la web:
   `docker exec buscahogar-db-1 psql "<URL de web_readonly>" -c "SHOW jit"` → `off`.

## El día de la presentación

- Neon suspende la base tras 5 minutos sin uso, y la primera petición después tarda unos segundos. **Abre la URL un par de minutos
  antes** y haz una búsqueda.
- Ten preparada una lista de zonas con datos, por si el tribunal pregunta por una que no está cubierta. Puedes aprovecharlo para explicar
  que la cobertura bajo demanda depende del worker, que en la demo está apagado a propósito.

## Actualizar los datos

Para volcar una foto nueva (por ejemplo, después del pre-barrido de noviembre):

1. En la consola de Neon, borra la base `neondb` y créala de nuevo, vacía y con propietario `neondb_owner`. El host no cambia, y los roles
   `web_readonly` y `web_coverage` se conservan porque pertenecen a la rama, no a la base.
2. Repite los pasos 2 y 3. `deploy` debería decir `roles unchanged` si usas los mismos secretos. En Vercel no hay que tocar nada.

## Desmontaje

Al terminar la defensa, borra el proyecto de Neon y el de Vercel, o déjalos en pausa. Nada de esto afecta al paso 3.5, que usa sus
propias cuentas, sus propios planes y su propia base.
