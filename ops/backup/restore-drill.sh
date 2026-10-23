#!/usr/bin/env bash
# Simulacro de restauración (ROADMAP 3.4, decisión 260, D18; R8.4, R8.5). Una copia que nunca se ha restaurado es una
# esperanza, no una copia. Descarga la copia más reciente, la descifra EN STREAMING (sin texto plano en disco) hacia
# `pg_restore --no-owner --no-privileges` sobre una base VACÍA, repite el aprovisionamiento de roles y privilegios por la
# ruta del despliegue (el volcado no lleva roles —son globales al servidor— ni privilegios) y ejecuta las comprobaciones.
#
#   restore-drill.sh [run]   Simulacro completo: 1 descargar+descifrar+restaurar · 2 aprovisionar (deploy.js) ·
#                            3 comprobar (restore-verify.js). Por defecto.
#   restore-drill.sh verify  Solo el paso 3, contra una base ya restaurada y aprovisionada.
#
# Entorno (además del de almacenamiento de backup.sh: BACKUP_S3_*):
#   DRILL_DATABASE_URL         obligatoria. URL DIRECTA de la base de DESTINO, vacía. Se rechaza si no está vacía o si es
#                              la misma que DIRECT_DATABASE_URL (nunca se restaura sobre la base de producción).
#   AGE_IDENTITY_FILE          obligatoria en `run`. Ruta de la clave PRIVADA age. Solo existe donde se hace el simulacro y
#                              se borra después; no está en el repositorio ni en la imagen.
#   WEB_READONLY_PASSWORD,
#   WEB_COVERAGE_PASSWORD      obligatorias en `run`: secretos con los que el aprovisionamiento crea los roles web.
#   WEB_READONLY_ROLE,
#   WEB_COVERAGE_ROLE          opcionales (nombres de rol; por defecto web_readonly y web_coverage).
#   DRILL_EXPECTED_ROW_COUNTS  opcional, `tabla=n,tabla=n`: recuentos que la base restaurada debe tener.
#   DRILL_BACKUP_NAME          opcional: restaurar esa copia en lugar de la más reciente.
#   DRILL_INGESTION_DIR        opcional (por defecto /opt/ingestion): el JavaScript compilado de apps/ingestion.
#   SEED_MONTHLY_QUOTA_TOTAL,
#   SEED_MONTHLY_QUOTA_RESERVE opcionales; se pasan al aprovisionamiento.
#
# Códigos de salida: 0 todo bien · 1 un paso falló (descarga, descifrado, restauración, aprovisionamiento) ·
# 2 configuración inválida o destino no vacío · 3 base o almacenamiento inaccesibles · 4 una comprobación falló (se nombra).
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
COMPONENT=restore-drill

MODE="${1:-run}"
INGESTION_DIR="${DRILL_INGESTION_DIR:-/opt/ingestion}"

case "$MODE" in
  run | verify) ;;
  *)
    printf 'uso: restore-drill.sh [run|verify]\n' >&2
    exit "$EXIT_CONFIG"
    ;;
esac

trap 'log error "restore drill interrupted by signal" "step=interrupted"; exit 143' TERM
trap 'log error "restore drill interrupted by signal" "step=interrupted"; exit 130' INT

# --- Configuración (antes de cualquier acceso a la red) ---------------------------------------------------------------
require_env DRILL_DATABASE_URL
if [ "$MODE" = "run" ]; then
  require_env AGE_IDENTITY_FILE BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY WEB_READONLY_PASSWORD WEB_COVERAGE_PASSWORD
  [ -r "$AGE_IDENTITY_FILE" ] || die "$EXIT_CONFIG" "AGE_IDENTITY_FILE is not a readable file"
  validate_storage_names
fi
if [ -n "${DIRECT_DATABASE_URL:-}" ] && [ "$DIRECT_DATABASE_URL" = "$DRILL_DATABASE_URL" ]; then
  die "$EXIT_CONFIG" "DRILL_DATABASE_URL must not be the same database as DIRECT_DATABASE_URL: the drill never restores over the source"
fi
parse_database_url DRILL_DATABASE_URL

# Entorno de los programas de Node: la URL del destino, y solo ella, como URL directa.
node_env() {
  DIRECT_DATABASE_URL="$DRILL_DATABASE_URL" "$@"
}

fail_checks() { # mensaje
  log error "restore drill FAILED: $1" "step=verify" "exit_code=$EXIT_CHECK"
  exit "$EXIT_CHECK"
}

run_verify() {
  local rc=0
  (cd "$INGESTION_DIR" && node_env node dist-runtime/scripts/restore-verify.js) || rc=$?
  case "$rc" in
    0) log info "restore drill passed" "step=verify" ;;
    4) fail_checks "one or more checks did not pass (see failed checks above)" ;;
    *) die "$rc" "restore checks could not run" "step=verify" ;;
  esac
}

if [ "$MODE" = "verify" ]; then
  pg_isready --timeout=15 --quiet || die "$EXIT_UNREACHABLE" "restore target unreachable" "step=preflight"
  run_verify
  exit 0
fi

# --- 0. Comprobaciones previas -----------------------------------------------------------------------------------------
log info "restore drill started"
pg_isready --timeout=15 --quiet || die "$EXIT_UNREACHABLE" "restore target unreachable" "step=preflight"

# El destino debe estar VACÍO: ni tablas propias (las de una extensión no cuentan: PostGIS crea las suyas) ni el
# esquema del diario de migraciones.
LEFTOVERS="$(psql --no-psqlrc -Atq -c "
  select (select count(*) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
             and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e'))
       + (select count(*) from pg_namespace where nspname = 'drizzle')" 2>/dev/null)" ||
  die "$EXIT_UNREACHABLE" "could not inspect the restore target" "step=preflight"
if [ "$LEFTOVERS" != "0" ]; then
  die "$EXIT_CONFIG" "restore target database is not empty ($LEFTOVERS objects): the drill needs an empty database" "step=preflight"
fi

# El almacenamiento va con SU entorno de rclone; la restauración con las variables PG* del destino ya exportadas.
setup_rclone_env
REMOTE="$(remote_dir)"
rclone lsf --max-depth 1 "$REMOTE" >/dev/null 2>&1 || die "$EXIT_UNREACHABLE" "backup storage unreachable or bucket missing" "step=preflight"

# --- 1. Copia más reciente --------------------------------------------------------------------------------------------
if [ -n "${DRILL_BACKUP_NAME:-}" ]; then
  [[ "$DRILL_BACKUP_NAME" =~ ^[A-Za-z0-9_-]+-[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]] || die "$EXIT_CONFIG" "DRILL_BACKUP_NAME is not a backup object name"
  OBJECT="$DRILL_BACKUP_NAME"
else
  OBJECT="$(rclone lsf --files-only "$REMOTE" | grep -E "^${BACKUP_NAME_PREFIX}-[0-9]{8}T[0-9]{6}Z\.dump\.age\$" | LC_ALL=C sort | tail -1 || true)"
  [ -n "$OBJECT" ] || die "$EXIT_STEP" "no backup found in the storage" "step=download"
fi
log info "restoring backup" "object=$OBJECT" "step=restore"

# --- 2. Descarga -> descifrado -> restauración, todo en streaming ------------------------------------------------------
# `--no-owner --no-privileges`: los roles no viajan en el volcado (son globales al servidor) y sus privilegios se
# reconstruyen por la ruta del despliegue, que es justo lo que este simulacro comprueba. `--single-transaction` implica
# `--exit-on-error`: o se restaura todo o nada. Con `pipefail`, falla si falla la descarga, el descifrado o la restauración.
if ! rclone cat "${REMOTE}${OBJECT}" | age --decrypt -i "$AGE_IDENTITY_FILE" | pg_restore --no-owner --no-privileges --single-transaction --no-password --dbname="$PGDATABASE"; then
  die "$EXIT_STEP" "download, decryption or restore failed" "step=restore" "object=$OBJECT"
fi
log info "backup restored" "object=$OBJECT" "step=restore"

# --- 3. Aprovisionamiento por la ruta del despliegue (migraciones, roles, privilegios, jit) -----------------------------
if (cd "$INGESTION_DIR" && node_env node dist-runtime/scripts/deploy.js); then
  log info "provisioning completed" "step=provision"
else
  provision_rc=$?
  if [ "$provision_rc" -eq 4 ]; then
    fail_checks "provisioning post-checks failed (see the deploy output above)"
  fi
  die "$EXIT_STEP" "provisioning failed" "step=provision" "provision_exit=$provision_rc"
fi

# --- 4. Comprobaciones ---------------------------------------------------------------------------------------------------
run_verify
log info "restore drill finished" "object=$OBJECT"
