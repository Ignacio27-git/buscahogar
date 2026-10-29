#!/usr/bin/env bash
# Retención de copias (ROADMAP 3.4, decisión 260, D18; R8.2): 7 diarias, 4 semanales y 3 mensuales. Los números
# son CONSTANTES, no configuración: la página de privacidad (/legal/privacy) los publica y una variable de
# entorno permitiría que el texto dejara de ser cierto sin que nadie lo notara.
#
#   retention.sh select   Lee nombres de objeto por la entrada estándar y escribe una línea por copia:
#                         `keep <nombre> <niveles>` o `delete <nombre>`. FUNCIÓN PURA: sin red ni entorno
#                         (solo `BACKUP_NAME_PREFIX`). Es lo que prueba test/retention.test.sh.
#   retention.sh prune    Lista el almacenamiento, aplica `select` y borra lo que toca. Solo lo invoca
#                         backup.sh DESPUÉS de una subida verificada. Necesita el entorno de backup.sh.
#
# Reglas (por el orden de nombre ISO, `AAAAMMDDTHHMMSSZ` en UTC; más reciente primero):
#   1. De cada día se considera solo la copia más reciente (las demás de ese día se borran).
#   2. daily:   las copias de los 7 días más recientes que tienen copia.
#   3. weekly:  las 4 copias más recientes de un DOMINGO que no estén ya conservadas.
#   4. monthly: las 3 copias más recientes del DÍA 01 que no estén ya conservadas.
#   Los niveles son disjuntos: 7 + 4 + 3 = 14 copias como máximo, nunca menos por solaparse.
#   5. La copia más reciente NUNCA se borra.
#   6. Lo que no tiene exactamente el formato de copia (`<prefijo>-AAAAMMDDTHHMMSSZ.dump.age`) ni se cuenta ni
#      se toca ni aparece en la salida; las subidas a medias (`*.uploading`) se limpian aparte, en `prune`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
COMPONENT=retention

KEEP_DAILY=7
KEEP_WEEKLY=4
KEEP_MONTHLY=3

select_retention() {
  local prefix_pattern name day dow
  case "$BACKUP_NAME_PREFIX" in
    *[!A-Za-z0-9_-]* | '') die "$EXIT_CONFIG" "BACKUP_NAME_PREFIX contains unsupported characters" ;;
  esac
  prefix_pattern="$BACKUP_NAME_PREFIX"

  local -a names=()
  local -a reps=()
  local -A seen_day=()
  local -A tier=()
  mapfile -t names < <(grep -E "^${prefix_pattern}-[0-9]{8}T[0-9]{6}Z\.dump\.age\$" | LC_ALL=C sort -ru)

  if [ "${#names[@]}" -eq 0 ]; then
    return 0
  fi

  # Regla 1: el representante de cada día es el primero que aparece (orden descendente = el más reciente).
  for name in "${names[@]}"; do
    day="${name#"${prefix_pattern}"-}"
    day="${day:0:8}"
    if [ -z "${seen_day[$day]:-}" ]; then
      seen_day[$day]=1
      reps+=("$name")
    fi
  done

  # Regla 2: daily.
  local count=0
  for name in "${reps[@]}"; do
    if [ "$count" -lt "$KEEP_DAILY" ]; then
      tier[$name]="daily"
      count=$((count + 1))
    fi
  done

  # Regla 3: weekly (domingo = 7 en `date +%u`).
  count=0
  for name in "${reps[@]}"; do
    [ "$count" -lt "$KEEP_WEEKLY" ] || break
    [ -z "${tier[$name]:-}" ] || continue
    day="${name#"${prefix_pattern}"-}"
    day="${day:0:8}"
    dow="$(date -u -d "${day:0:4}-${day:4:2}-${day:6:2}" +%u)"
    if [ "$dow" = "7" ]; then
      tier[$name]="weekly"
      count=$((count + 1))
    fi
  done

  # Regla 4: monthly (día 01).
  count=0
  for name in "${reps[@]}"; do
    [ "$count" -lt "$KEEP_MONTHLY" ] || break
    [ -z "${tier[$name]:-}" ] || continue
    day="${name#"${prefix_pattern}"-}"
    day="${day:0:8}"
    if [ "${day:6:2}" = "01" ]; then
      tier[$name]="monthly"
      count=$((count + 1))
    fi
  done

  # Regla 5: red de seguridad. Por construcción la más reciente ya es `daily`; si alguien rompe esa invariante,
  # este bloque la restablece en lugar de permitir que se borre.
  if [ -z "${tier[${names[0]}]:-}" ]; then
    tier[${names[0]}]="newest"
  fi

  for name in "${names[@]}"; do
    if [ -n "${tier[$name]:-}" ]; then
      printf 'keep %s %s\n' "$name" "${tier[$name]}"
    else
      printf 'delete %s\n' "$name"
    fi
  done
}

prune_remote() {
  require_env BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY
  validate_storage_names
  setup_rclone_env
  local remote listing decisions line verb name keeps=0 deletes=0 leftovers=0
  remote="$(remote_dir)"

  listing="$(rclone lsf --files-only "$remote")" || die "$EXIT_STEP" "could not list the backup storage"
  decisions="$(printf '%s\n' "$listing" | select_retention)"

  # Nunca se borra todo: si hay copias pero la selección no conserva ninguna, algo va mal.
  if [ -n "$decisions" ] && ! printf '%s\n' "$decisions" | grep -q '^keep '; then
    die "$EXIT_STEP" "retention would delete every backup; refusing to prune"
  fi

  while read -r line; do
    [ -n "$line" ] || continue
    verb="${line%% *}"
    name="${line#* }"
    name="${name%% *}"
    if [ "$verb" = "keep" ]; then
      keeps=$((keeps + 1))
    else
      rclone deletefile "${remote}${name}" || die "$EXIT_STEP" "could not delete an expired backup" "object=$name"
      deletes=$((deletes + 1))
      log info "expired backup deleted" "object=$name"
    fi
  done <<<"$decisions"

  # Subidas a medias de intentos anteriores: no son copias y nunca se cuentan; se limpian tras una subida buena.
  while read -r name; do
    case "$name" in
      "${BACKUP_NAME_PREFIX}"-*.dump.age.uploading)
        rclone deletefile "${remote}${name}" || die "$EXIT_STEP" "could not delete a stale partial upload" "object=$name"
        leftovers=$((leftovers + 1))
        ;;
    esac
  done <<<"$listing"

  log info "retention applied" "kept=$keeps" "deleted=$deletes" "partials_removed=$leftovers"
}

case "${1:-}" in
  select) select_retention ;;
  prune) prune_remote ;;
  *)
    printf 'uso: retention.sh select|prune\n' >&2
    exit "$EXIT_CONFIG"
    ;;
esac
