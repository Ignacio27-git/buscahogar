# Copias de seguridad (paso 3.4, decisión 260)

Copia cifrada de la base de datos a un almacenamiento compatible con S3, retención de 7 diarias, 4 semanales y 3 mensuales, y un
simulacro de restauración. Diseño y motivos: `docs/DECISIONS.md`, decisión 260, y `docs/ARCHITECTURE.md`, «Copias de seguridad».

| Fichero | Para qué |
| --- | --- |
| `backup.sh` | `pg_dump -Fc \| age` → subida verificada → retención. Sale con 0/1/2/3 (ver la cabecera). |
| `retention.sh` | `select` (puro: nombres → conservar/borrar) y `prune` (lo aplica al almacenamiento). |
| `restore-drill.sh` | Descarga la última copia, la descifra en streaming, la restaura en una base vacía, repite el aprovisionamiento y comprueba. Sale con 0/1/2/3/4. |
| `lib.sh` | Funciones comunes: registro JSON, validación de entorno, URL de la base → variables `PG*`, rclone por entorno. |
| `Dockerfile` | Imagen `backup` (por defecto) e imagen `drill` (`--target drill`, con node y `apps/ingestion/dist-runtime`). |
| `compose.yml` | SOLO para la prueba e2e: MinIO y dos PostGIS efímeros, proyecto aparte, sin volúmenes. |
| `test/e2e.sh` | Prueba extremo a extremo (Docker). |
| `test/retention.test.sh` | Prueba de la selección de retención (sin Docker). |

## Variables de entorno

Los valores reales NUNCA se escriben en el repositorio ni en la imagen. Ninguna es `NEXT_PUBLIC_*` y ninguna llega a `apps/web`.

| Variable | Obligatoria en | Descripción |
| --- | --- | --- |
| `DIRECT_DATABASE_URL` | backup | URL **directa** (no la del pooler) de la base a copiar. |
| `AGE_RECIPIENT` | backup | Clave **pública** age (`age1…`). Una clave privada se rechaza. |
| `BACKUP_S3_BUCKET` | backup, drill | Bucket de las copias. |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | backup, drill | Credenciales S3. Para el backup basta un permiso de escritura, listado y borrado en ese bucket; no hace falta crear buckets. |
| `BACKUP_S3_ENDPOINT` | opcional | Vacío = AWS S3. Con valor (MinIO, R2, etc.) se usa ese endpoint con direccionamiento por ruta. |
| `BACKUP_S3_REGION` | opcional | Por defecto `us-east-1`. |
| `BACKUP_S3_PREFIX` | opcional | «Carpeta» dentro del bucket. |
| `BACKUP_NAME_PREFIX` | opcional | Prefijo del nombre (por defecto `buscahogar`). |
| `BACKUP_TMPDIR` | opcional | Dónde se crea el directorio temporal del texto cifrado (por defecto `/tmp`). |
| `DRILL_DATABASE_URL` | drill | URL directa de la base de DESTINO, **vacía**. |
| `AGE_IDENTITY_FILE` | drill (`run`) | Ruta de la clave **privada** age. |
| `WEB_READONLY_PASSWORD`, `WEB_COVERAGE_PASSWORD` | drill (`run`) | Secretos con los que el aprovisionamiento crea los roles web en el destino. |
| `DRILL_EXPECTED_ROW_COUNTS` | opcional | `tabla=n,tabla=n`: recuentos que la base restaurada debe tener (p. ej. los del origen). |
| `DRILL_BACKUP_NAME` | opcional | Restaurar esa copia en lugar de la más reciente. |
| `DRILL_INGESTION_DIR` | opcional | Por defecto `/opt/ingestion` (la imagen `drill`). |

## Uso

```bash
# Imagen de la copia (contexto: la raíz del repositorio)
docker build -f ops/backup/Dockerfile -t buscahogar-backup .
docker run --rm --env-file <fichero-de-variables-FUERA-del-repositorio> buscahogar-backup            # copia + retención

# Imagen del simulacro (necesita la imagen de apps/ingestion)
docker build -f apps/ingestion/Dockerfile -t buscahogar-ingestion:latest .
docker build -f ops/backup/Dockerfile --target drill -t buscahogar-drill .
docker run --rm --env-file <fichero> -v <ruta-a-la-clave-privada>:/run/age/id.txt:ro \
  -e AGE_IDENTITY_FILE=/run/age/id.txt buscahogar-drill                                                # simulacro completo
docker run --rm --env-file <fichero> buscahogar-drill restore-drill.sh verify                          # solo comprobaciones
```

La programación diaria (cron o el planificador del host) y la cuenta del almacenamiento son del paso 3.5; este directorio solo aporta lo
que se programa.

## Clave privada: cómo se maneja

La copia se cifra con una clave **pública**; solo quien tenga la **privada** puede descifrarla. Por eso:

- **La clave privada no existe en el host que hace la copia**, ni en la imagen, ni en una variable de entorno de producción, ni en el
  repositorio. Si llegara a `AGE_RECIPIENT`, el script la rechaza y no la repite.
- **Generación.** En una máquina de confianza, fuera del servidor: `age-keygen -o buscahogar-backup.key`. El fichero contiene la privada
  (`AGE-SECRET-KEY-…`) y, en un comentario, la pública (`# public key: age1…`). Solo la pública va a `AGE_RECIPIENT`.
- **Custodia.** Guarda la privada en un gestor de contraseñas **y** en una copia fuera de línea (otro soporte, otro lugar). Perderla equivale
  a no tener copias: nadie puede recuperar los datos sin ella, ni siquiera el proveedor del almacenamiento.
- **Uso.** Solo se facilita en el momento del simulacro o de una recuperación real, como fichero (`AGE_IDENTITY_FILE`) montado de solo
  lectura, y se retira después. El simulacro descifra en streaming: la privada se lee, el texto plano no se escribe.
- **Rotación.** Una clave nueva solo cifra las copias nuevas. Conserva la anterior hasta que caduque la última copia cifrada con ella
  (como máximo 3 meses por la retención mensual). Comprueba la nueva con un simulacro antes de retirar la antigua.
- **Pruebas.** Las claves de `test/e2e.sh` se generan en cada ejecución dentro del contenedor y se destruyen con él. No existe ninguna
  clave de prueba guardada en el repositorio, y no debe existir: un secreto de prueba versionado acaba copiándose a producción.

## Pruebas

```bash
bash ops/backup/test/retention.test.sh   # selección de retención, sin Docker (necesita bash con date de GNU)
bash ops/backup/test/e2e.sh              # extremo a extremo: Docker, MinIO y dos PostGIS efímeros
```

`e2e.sh` construye la imagen de `apps/ingestion` y la de `drill` (omitir con `E2E_SKIP_BUILD=1` si ya existen) y deja el entorno limpio al
terminar (`E2E_KEEP=1` lo conserva para depurar). No usa `.env`, ni S3 real, ni la base de desarrollo.
