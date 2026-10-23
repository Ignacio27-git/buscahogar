#!/usr/bin/env bash
# Funciones comunes de las copias de seguridad (ROADMAP 3.4, decisión 260, D18). Se carga con `source`; no hace
# nada por sí sola. Reglas que comparten todos los scripts de este directorio:
#   - Los secretos llegan SOLO por variables de entorno. Nunca por argumentos (se ven en `ps` y en `/proc`) y
#     nunca con `set -x`. La URL de la base se descompone aquí en variables `PG*` de libpq.
#   - Una línea JSON por evento: {ts, level, component, msg, ...}. Los mensajes llevan nombres de variable y de
#     objeto, jamás valores secretos.
#   - Códigos de salida: 0 hecho · 1 un paso falló (volcado, cifrado, subida, retención) · 2 configuración
#     inválida (antes de cualquier acceso a la red) · 3 base o almacenamiento inaccesibles · 4 el simulacro de
#     restauración detectó una comprobación fallida.

EXIT_STEP=1
EXIT_CONFIG=2
EXIT_UNREACHABLE=3
EXIT_CHECK=4

# Prefijo del nombre de las copias. El nombre es `<prefijo>-AAAAMMDDTHHMMSSZ.dump.age` (UTC, ordenable).
BACKUP_NAME_PREFIX="${BACKUP_NAME_PREFIX:-buscahogar}"

COMPONENT="${COMPONENT:-backup}"

json_escape() {
  local text="$1"
  text="${text//\\/\\\\}"
  text="${text//\"/\\\"}"
  text="${text//$'\n'/ }"
  text="${text//$'\r'/ }"
  text="${text//$'\t'/ }"
  printf '%s' "$text"
}

# log NIVEL MENSAJE [clave=valor ...]. Los errores van a la salida de error, el resto a la estándar.
log() {
  local level="$1" msg="$2" line extra pair key value
  shift 2
  line="{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"level\":\"$level\",\"component\":\"$COMPONENT\",\"msg\":\"$(json_escape "$msg")\""
  extra=""
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    extra="$extra,\"$(json_escape "$key")\":\"$(json_escape "$value")\""
  done
  line="$line$extra}"
  if [ "$level" = "error" ]; then
    printf '%s\n' "$line" >&2
  else
    printf '%s\n' "$line"
  fi
}

die() { # código mensaje [clave=valor ...]
  local code="$1"
  shift
  log error "$@" "exit_code=$code"
  exit "$code"
}

# Comprueba que cada variable existe y no está en blanco. Nombra TODAS las que faltan y sale con 2.
require_env() {
  local name missing=""
  for name in "$@"; do
    if [ -z "${!name:-}" ] || [ -z "${!name//[[:space:]]/}" ]; then
      missing="$missing $name"
    fi
  done
  if [ -n "$missing" ]; then
    die "$EXIT_CONFIG" "missing required environment variables:${missing}"
  fi
}

# Decodifica %XX de una URL. Las barras invertidas literales se duplican antes para que `%b` no las interprete.
url_decode() {
  local text="$1"
  text="${text//\\/\\\\}"
  printf '%b' "${text//%/\\x}"
}

# parse_database_url NOMBRE_DE_VARIABLE: exporta PGHOST, PGPORT, PGUSER, PGPASSWORD y PGDATABASE (y
# PGSSLMODE & co. si la URL los trae) a partir de una URL postgres://. Así `pg_dump`, `pg_restore` y `psql` no
# reciben la contraseña por argumentos. Acepta host IPv6 entre corchetes. Una opción de la URL que no se
# reconoce es un error de configuración (no se ignora en silencio).
parse_database_url() {
  local var="$1" url rest authority path query userinfo hostport host port user password db option key value
  url="${!var}"
  case "$url" in
    postgres://* | postgresql://*) ;;
    *) die "$EXIT_CONFIG" "$var must be a postgres:// or postgresql:// URL" ;;
  esac
  rest="${url#*://}"
  authority="${rest%%/*}"
  if [ "$authority" = "$rest" ]; then
    die "$EXIT_CONFIG" "$var has no database name"
  fi
  path="${rest#*/}"
  db="${path%%\?*}"
  query=""
  case "$path" in *\?*) query="${path#*\?}" ;; esac

  hostport="$authority"
  user=""
  password=""
  case "$authority" in
    *@*)
      userinfo="${authority%@*}"
      hostport="${authority##*@}"
      user="${userinfo%%:*}"
      case "$userinfo" in *:*) password="${userinfo#*:}" ;; esac
      ;;
  esac

  case "$hostport" in
    \[*\]*)
      host="${hostport%%\]*}"
      host="${host#\[}"
      port="${hostport#*\]}"
      port="${port#:}"
      ;;
    *:*)
      host="${hostport%%:*}"
      port="${hostport#*:}"
      ;;
    *)
      host="$hostport"
      port=""
      ;;
  esac

  [ -n "$host" ] || die "$EXIT_CONFIG" "$var has no host"
  [ -n "$user" ] || die "$EXIT_CONFIG" "$var has no user"
  [ -n "$db" ] || die "$EXIT_CONFIG" "$var has no database name"
  case "$port" in
    '' | *[!0-9]*) if [ -n "$port" ]; then die "$EXIT_CONFIG" "$var has an invalid port"; fi ;;
  esac

  export PGHOST="$(url_decode "$host")"
  export PGPORT="${port:-5432}"
  export PGUSER="$(url_decode "$user")"
  export PGDATABASE="$(url_decode "$db")"
  if [ -n "$password" ]; then
    export PGPASSWORD="$(url_decode "$password")"
  else
    unset PGPASSWORD
  fi
  unset PGSSLMODE PGSSLROOTCERT PGSSLCERT PGSSLKEY PGCHANNELBINDING PGCONNECT_TIMEOUT PGAPPNAME

  if [ -n "$query" ]; then
    local IFS='&'
    for option in $query; do
      key="${option%%=*}"
      value="$(url_decode "${option#*=}")"
      case "$key" in
        sslmode) export PGSSLMODE="$value" ;;
        sslrootcert) export PGSSLROOTCERT="$value" ;;
        sslcert) export PGSSLCERT="$value" ;;
        sslkey) export PGSSLKEY="$value" ;;
        channel_binding) export PGCHANNELBINDING="$value" ;;
        connect_timeout) export PGCONNECT_TIMEOUT="$value" ;;
        application_name) export PGAPPNAME="$value" ;;
        *) die "$EXIT_CONFIG" "$var has an unsupported option: $key" ;;
      esac
    done
  fi
}

# Configuración de rclone SOLO por variables de entorno (nunca por argumentos ni por fichero): un remoto S3
# llamado `BKP`. `BACKUP_S3_ENDPOINT` es opcional (vacío = AWS); con un endpoint propio (MinIO...) se usa
# direccionamiento por ruta, que es lo que esos servidores esperan.
setup_rclone_env() {
  export RCLONE_CONFIG=/dev/null
  export RCLONE_CONFIG_BKP_TYPE=s3
  export RCLONE_CONFIG_BKP_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
  export RCLONE_CONFIG_BKP_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_BKP_REGION="${BACKUP_S3_REGION:-us-east-1}"
  export RCLONE_CONFIG_BKP_NO_CHECK_BUCKET=true
  if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
    export RCLONE_CONFIG_BKP_PROVIDER=Other
    export RCLONE_CONFIG_BKP_ENDPOINT="$BACKUP_S3_ENDPOINT"
    export RCLONE_CONFIG_BKP_FORCE_PATH_STYLE=true
  else
    export RCLONE_CONFIG_BKP_PROVIDER=AWS
  fi
}

# Ruta del almacenamiento: `BKP:<bucket>/<prefijo>` (el prefijo, si existe, termina en `/`).
remote_dir() {
  local prefix="${BACKUP_S3_PREFIX:-}"
  if [ -n "$prefix" ]; then
    prefix="${prefix#/}"
    prefix="${prefix%/}/"
  fi
  printf 'BKP:%s/%s' "$BACKUP_S3_BUCKET" "$prefix"
}

# El bucket y el prefijo solo pueden contener caracteres seguros: van dentro de una ruta de rclone.
validate_storage_names() {
  case "$BACKUP_S3_BUCKET" in
    *[!A-Za-z0-9._-]* | '') die "$EXIT_CONFIG" "BACKUP_S3_BUCKET contains unsupported characters" ;;
  esac
  case "${BACKUP_S3_PREFIX:-}" in
    *[!A-Za-z0-9._/-]*) die "$EXIT_CONFIG" "BACKUP_S3_PREFIX contains unsupported characters" ;;
  esac
  case "$BACKUP_NAME_PREFIX" in
    *[!A-Za-z0-9_-]* | '') die "$EXIT_CONFIG" "BACKUP_NAME_PREFIX contains unsupported characters" ;;
  esac
}
