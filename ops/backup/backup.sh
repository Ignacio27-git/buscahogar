#!/usr/bin/env bash
# Copia de seguridad cifrada de la base de datos (ROADMAP 3.4, decisión 260, D18; R8.1-R8.3, R8.5).
#
#   pg_dump -Fc | age -r "$AGE_RECIPIENT" > "$TMP.age"  ->  rclone (S3)  ->  comprobación de tamaño  ->  retención
#
# El volcado en claro NUNCA toca el disco: pasa por una tubería directamente a `age`, y en disco solo hay texto
# cifrado, en un directorio temporal 0700 que se borra en CUALQUIER salida (éxito, error, SIGINT, SIGTERM). Solo se
# necesita la clave PÚBLICA del destinatario; la privada no existe en este host (docs/DEPLOYMENT.md, «Clave de las
# copias»). Los secretos llegan solo por entorno: nunca por argumentos y nunca con `set -x`.
#
# Entorno:
#   DIRECT_DATABASE_URL         obligatoria. URL DIRECTA (no la del pooler) de la base a copiar.
#   AGE_RECIPIENT               obligatoria. Clave pública age (`age1...`). Una clave privada se rechaza.
#   BACKUP_S3_BUCKET            obligatoria. Bucket de destino.
#   BACKUP_S3_ACCESS_KEY_ID     obligatoria.
#   BACKUP_S3_SECRET_ACCESS_KEY obligatoria.
#   BACKUP_S3_ENDPOINT          opcional. Vacío = AWS S3; con valor (MinIO, R2...) se usa ese endpoint.
#   BACKUP_S3_REGION            opcional (por defecto us-east-1).
#   BACKUP_S3_PREFIX            opcional. «carpeta» dentro del bucket.
#   BACKUP_NAME_PREFIX          opcional (por defecto buscahogar). Prefijo del nombre de cada copia.
#   BACKUP_TMPDIR               opcional (por defecto /tmp). Donde se crea el directorio temporal del texto cifrado.
#
# Códigos de salida: 0 hecho · 1 volcado/cifrado/subida/retención fallidos · 2 configuración inválida (antes de
# cualquier acceso a la red) · 3 base o almacenamiento inaccesibles. Todo fallo escribe una línea JSON de nivel
# `error` (apta para una alerta). Una subida a medias nunca cuenta como copia y un fallo NUNCA dispara la poda.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
COMPONENT=backup

WORKDIR=""
DUMP_PGID=""
REMOTE=""
UPLOAD_KEY=""
PROMOTED=0

# Limpieza en CUALQUIER salida. `kill -- -PGID` para el volcado en curso (tubería pg_dump | age) si lo hay; después
# se borra el directorio temporal y, si quedó una subida a medias que no llegó a publicarse, se intenta quitarla
# (la retención también limpia estos restos, así que un fallo aquí no es grave).
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [ -n "$DUMP_PGID" ]; then
    kill -TERM -- "-$DUMP_PGID" 2>/dev/null || true
    wait "$DUMP_PGID" 2>/dev/null || true
  fi
  if [ -n "$WORKDIR" ]; then
    rm -rf -- "$WORKDIR"
  fi
  if [ -n "$UPLOAD_KEY" ] && [ "$PROMOTED" -eq 0 ] && [ -n "$REMOTE" ]; then
    timeout 20 rclone deletefile "${REMOTE}${UPLOAD_KEY}" >/dev/null 2>&1 || true
  fi
  exit "$rc"
}

on_signal() { # señal código
  log error "backup interrupted by signal" "signal=$1" "step=interrupted"
  exit "$2"
}

trap cleanup EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

# --- 1. Configuración (antes de cualquier acceso a la red) -------------------------------------------------------
require_env DIRECT_DATABASE_URL AGE_RECIPIENT BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY

case "$AGE_RECIPIENT" in
  AGE-SECRET-KEY-*) die "$EXIT_CONFIG" "AGE_RECIPIENT must be the age public key (age1...), never the private key" ;;
esac
if ! [[ "$AGE_RECIPIENT" =~ ^age1[a-z0-9]{50,}$ ]]; then
  die "$EXIT_CONFIG" "AGE_RECIPIENT is not a valid age public key (expected age1...)"
fi
validate_storage_names
parse_database_url DIRECT_DATABASE_URL
setup_rclone_env
REMOTE="$(remote_dir)"

log info "backup started" "bucket=$BACKUP_S3_BUCKET"

# --- 2. Directorio temporal (solo contendrá texto cifrado) --------------------------------------------------------
TMPBASE="${BACKUP_TMPDIR:-/tmp}"
mkdir -p -- "$TMPBASE"
WORKDIR="$(mktemp -d "$TMPBASE/backup.XXXXXX")"
TMP="$WORKDIR/dump"

# --- 3. Comprobaciones previas de la red (exit 3 si no responden) --------------------------------------------------
pg_isready --timeout=15 --quiet || die "$EXIT_UNREACHABLE" "database unreachable" "step=preflight"
rclone lsf --max-depth 1 "$REMOTE" >/dev/null 2>&1 || die "$EXIT_UNREACHABLE" "backup storage unreachable or bucket missing" "step=preflight"

# --- 4. Volcado cifrado en streaming -------------------------------------------------------------------------------
# La tubería se lanza como trabajo de fondo con su PROPIO grupo de procesos (`set -m`): `wait` se interrumpe con las
# señales atrapadas (un primer plano las retrasaría hasta que terminara el volcado) y la limpieza puede matar el grupo
# entero. Con `pipefail`, un fallo de pg_dump O de age falla la tubería.
set -m
(
  set -o pipefail
  pg_dump -Fc --no-password | age -r "$AGE_RECIPIENT" >"$TMP.age"
) &
DUMP_PGID=$!
dump_rc=0
wait "$DUMP_PGID" || dump_rc=$?
DUMP_PGID=""
set +m
if [ "$dump_rc" -ne 0 ]; then
  die "$EXIT_STEP" "dump or encryption failed" "step=dump"
fi

if [ ! -s "$TMP.age" ]; then
  die "$EXIT_STEP" "encrypted dump is empty" "step=dump"
fi
if [ "$(head -c 21 "$TMP.age")" != "age-encryption.org/v1" ]; then
  die "$EXIT_STEP" "dump is not an age file" "step=dump"
fi
LOCAL_BYTES="$(stat -c %s "$TMP.age")"

# --- 5. Subida con nombre provisional, comprobación de tamaño y publicación -----------------------------------------
# Hasta publicarla, la subida se llama `<nombre>.uploading`: no tiene el formato de copia, así que ni la retención ni
# el simulacro la cuentan jamás (R8.3, «una subida a medias no es una copia»).
NAME="${BACKUP_NAME_PREFIX}-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
UPLOAD_KEY="${NAME}.uploading"

rclone copyto "$TMP.age" "${REMOTE}${UPLOAD_KEY}" || die "$EXIT_STEP" "upload failed" "step=upload" "object=$NAME"

SIZE_JSON="$(rclone size --json "${REMOTE}${UPLOAD_KEY}")" || die "$EXIT_STEP" "could not verify the uploaded size" "step=upload" "object=$NAME"
REMOTE_BYTES="$(printf '%s' "$SIZE_JSON" | sed -n 's/.*"bytes":[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
REMOTE_COUNT="$(printf '%s' "$SIZE_JSON" | sed -n 's/.*"count":[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
if [ "$REMOTE_COUNT" != "1" ] || [ "$REMOTE_BYTES" != "$LOCAL_BYTES" ]; then
  die "$EXIT_STEP" "uploaded size differs from the local size" "step=upload" "object=$NAME" "local_bytes=$LOCAL_BYTES" "remote_bytes=${REMOTE_BYTES:-none}"
fi

rclone moveto "${REMOTE}${UPLOAD_KEY}" "${REMOTE}${NAME}" || die "$EXIT_STEP" "could not publish the uploaded backup" "step=upload" "object=$NAME"
PROMOTED=1
log info "backup uploaded" "object=$NAME" "bytes=$LOCAL_BYTES"

# --- 6. Retención: SOLO tras una subida verificada y publicada -------------------------------------------------------
bash "$HERE/retention.sh" prune || die "$EXIT_STEP" "retention failed after a verified upload" "step=retention" "object=$NAME"

log info "backup finished" "object=$NAME"
