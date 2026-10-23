#!/usr/bin/env bash
# Prueba extremo a extremo de las copias de seguridad (ROADMAP 3.4, decisión 260, D18; R8.1-R8.5).
#
# Levanta (ops/backup/compose.yml, proyecto aparte, sin volúmenes): MinIO, un PostGIS de origen, otro de destino y
# un contenedor `tools` con la imagen `drill`. NUNCA usa S3 real, ni la base de desarrollo, ni ningún `.env`.
# Las claves `age` se generan AQUÍ, dentro del contenedor, y desaparecen con él; nada secreto entra en el repo.
#
# Escenarios:
#   A  configuración ausente o inválida: sale con 2 ANTES de usar ninguna herramienta de red (registro de llamadas)
#   B  parada mitad de volcado (SIGTERM): sin texto plano en disco, sin subida, sin procesos huérfanos
#   C  fallo de pg_dump: exit 1, sin texto plano, sin subida
#   D  subida fallida: exit 1 y NO se poda; subida a medias o tamaño distinto: exit 1, no cuenta como copia
#   E  éxito: objeto cifrado (ilegible sin la clave), sin texto plano, sin secretos en argumentos ni salida, y
#      retención (veintiún objetos -> los esperados)
#   F  simulacro de restauración sobre una base vacía de otro servidor: todas las comprobaciones pasan
#   G  privilegio alterado tras el simulacro: exit 4 nombrando la comprobación
#   H  el simulacro rechaza un destino no vacío, un destino igual al origen y una clave equivocada
#
# Uso: `bash ops/backup/test/e2e.sh` (necesita Docker). `E2E_SKIP_BUILD=1` reutiliza las imágenes ya construidas.
# `E2E_KEEP=1` deja los contenedores levantados al terminar (depuración). Salida 0 = todo en verde.
set -euo pipefail

# Git Bash en Windows convertiría las rutas de Unix de los argumentos de docker (`/tmp/...`).
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && (pwd -W 2>/dev/null || pwd))"
PROJECT=buscahogar-backup-e2e
INGESTION_IMAGE="${BACKUP_E2E_INGESTION_IMAGE:-buscahogar-ingestion:backup-e2e}"
export BACKUP_E2E_INGESTION_IMAGE="$INGESTION_IMAGE"
COMPOSE=(docker compose -f "$ROOT/ops/backup/compose.yml" -p "$PROJECT")

SOURCE_PASSWORD=e2e-source-owner-pw
S3_SECRET=e2e-minio-secret-0001
READONLY_PASSWORD=e2e-readonly-secret-77
COVERAGE_PASSWORD=e2e-coverage-secret-77

passed=0
failed=0

pass() { passed=$((passed + 1)); printf '  ok   %s\n' "$1"; }
fail() { failed=$((failed + 1)); printf '  FAIL %s\n' "$1" >&2; }

check() { # descripción valor-esperado valor-real
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (esperado [$(printf '%s' "$2" | tr '\n' ' ')] real [$(printf '%s' "$3" | tr '\n' ' ')])"; fi
}
expect_contains() { # descripción texto patrón
  if printf '%s' "$2" | grep -Eq -- "$3"; then pass "$1"; else fail "$1 (no contiene /$3/): $(printf '%s' "$2" | head -c 400)"; fi
}
expect_lacks() { # descripción texto patrón
  if printf '%s' "$2" | grep -Eq -- "$3"; then fail "$1 (contiene /$3/)"; else pass "$1"; fi
}

section() { printf '\n== %s\n' "$1"; }

# --- Acceso al contenedor `tools` -------------------------------------------------------------------------------
tx() { "${COMPOSE[@]}" exec -T tools "$@"; }

# txe VAR=valor... -- orden...: ejecuta con variables de entorno extra (nunca por argumentos de la orden).
txe() {
  local flags=()
  while [ "$1" != "--" ]; do
    flags+=(-e "$1")
    shift
  done
  shift
  "${COMPOSE[@]}" exec -T "${flags[@]}" tools "$@"
}

cleanup() {
  if [ "${E2E_KEEP:-0}" = "1" ]; then
    printf '\nE2E_KEEP=1: contenedores del proyecto %s dejados levantados\n' "$PROJECT"
    return
  fi
  # `-v` es seguro SOLO aquí: este compose es de otro proyecto, no declara volúmenes con nombre y solo retira los
  # anónimos de sus propios contenedores (la imagen de postgres declara VOLUME). Un test estático lo vigila. El
  # volumen de desarrollo (`buscahogar_postgres_data`) no se nombra ni existe en este fichero.
  "${COMPOSE[@]}" down -v --remove-orphans --timeout 1 >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- Preparación ------------------------------------------------------------------------------------------------
section "preparación"
if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  docker build --quiet -f "$ROOT/apps/ingestion/Dockerfile" -t "$INGESTION_IMAGE" "$ROOT" >/dev/null
  "${COMPOSE[@]}" build --quiet tools
fi
"${COMPOSE[@]}" up -d --wait source-db drill-db minio tools >/dev/null
pass "servicios levantados (minio, source-db, drill-db, tools)"

TOOLS_PATH="$(tx printenv PATH | tr -d '\r')"
SHIM_PATH="/tmp/shims:$TOOLS_PATH"

# Claves age de PRUEBA, generadas dentro del contenedor (tmpfs) y destruidas con él.
tx bash -c 'umask 077; mkdir -p /tmp/keys /tmp/backup-work; age-keygen -o /tmp/keys/id.txt 2>/tmp/keys/pub.txt; age-keygen -o /tmp/keys/wrong.txt 2>/tmp/keys/wrong-pub.txt; sed -n "s/^Public key: //p" /tmp/keys/pub.txt > /tmp/keys/recipient.txt'
RECIPIENT="$(tx cat /tmp/keys/recipient.txt | tr -d '\r\n')"
expect_contains "clave pública age generada" "$RECIPIENT" '^age1[a-z0-9]+$'

# Interposición de herramientas (shims): registran cada llamada y los argumentos de TODOS los procesos del
# contenedor en ese instante, y permiten forzar fallos. Por defecto delegan en la herramienta real.
tx bash -c 'mkdir -p /tmp/shims && cat > /tmp/shims/_shim && chmod +x /tmp/shims/_shim && for t in pg_dump pg_isready rclone; do ln -sf /tmp/shims/_shim /tmp/shims/$t; done' <<'SHIM'
#!/bin/bash
name="$(basename "$0")"
real="/usr/bin/$name"
case "$name" in pg_*) real="/usr/lib/postgresql/17/bin/$name" ;; esac
printf '%s %s\n' "$name" "$*" >> /tmp/shims/calls.log
cat /proc/[0-9]*/cmdline 2>/dev/null | tr '\0' ' ' >> /tmp/shims/proc.snapshot || true
case "$name:${SHIM_PG:-}" in
  pg_dump:hang) printf 'PARTIAL-PLAINTEXT-DUMP'; exec sleep 600 ;;
  pg_dump:fail) printf 'x'; exit 7 ;;
esac
if [ "$name" = rclone ]; then
  case "${SHIM_RCLONE:-}:${1:-}" in
    copyto:copyto) exit 9 ;;
    after-copyto:copyto) "$real" "$@"; exit 9 ;;
    size:size) echo '{"count":1,"bytes":1}'; exit 0 ;;
    moveto:moveto) exit 9 ;;
  esac
fi
exec "$real" "$@"
SHIM
pass "shims instalados"

reset_shim_logs() { tx bash -c ': > /tmp/shims/calls.log; : > /tmp/shims/proc.snapshot'; }

# rclone real (sin shims) para preparar y observar el almacenamiento.
storage() { # comando de rclone... (el remoto se llama BKP)
  tx bash -c 'source /opt/backup/lib.sh && setup_rclone_env && "$@"' _ "$@"
}
list_objects() { storage rclone lsf --files-only "BKP:buscahogar-backups-e2e/" | tr -d '\r' | sort; }

# Los scripts de producción usan `no_check_bucket` (la clave de la copia no suele poder crear buckets); aquí, en
# cambio, el bucket hay que crearlo.
tx bash -c 'source /opt/backup/lib.sh && setup_rclone_env && export RCLONE_CONFIG_BKP_NO_CHECK_BUCKET=false && rclone mkdir "BKP:buscahogar-backups-e2e"' >/dev/null
check "bucket existente tras crearlo" 1 "$(tx bash -c 'source /opt/backup/lib.sh && setup_rclone_env && rclone lsd BKP: | grep -c buscahogar-backups-e2e' | tr -d '\r')"
pass "bucket creado en MinIO"

# Base de origen: el despliegue REAL (esquema, roles, privilegios, catálogo) contra source-db.
deploy_out="$(txe "WEB_READONLY_PASSWORD=$READONLY_PASSWORD" "WEB_COVERAGE_PASSWORD=$COVERAGE_PASSWORD" -- \
  bash -c 'cd /opt/ingestion && DIRECT_DATABASE_URL="$DIRECT_DATABASE_URL" node dist-runtime/scripts/deploy.js' 2>&1)" || {
  printf '%s\n' "$deploy_out" >&2
  fail "despliegue de la base de origen"
  exit 1
}
pass "base de origen desplegada"

# Recuentos de las tablas núcleo en el ORIGEN (lo que el simulacro debe reencontrar).
EXPECTED_COUNTS="$(tx bash -c 'source /opt/backup/lib.sh; parse_database_url DIRECT_DATABASE_URL
for t in sources locations zones listings listing_versions properties property_listings coverage_jobs; do
  printf "%s=%s," "$t" "$(psql -Atq -c "select count(*) from $t")"
done' | tr -d '\r' | sed 's/,$//')"
expect_contains "recuentos de origen leídos" "$EXPECTED_COUNTS" '^sources=1,locations=[0-9]+,'

# Copias antiguas (20 diarias consecutivas, 2026-03-01 domingo .. 2026-03-20): la retención debe podarlas.
seed_old_objects() {
  tx bash -c 'rm -rf /tmp/seed && mkdir -p /tmp/seed && for d in $(seq 1 20); do printf "seed" > "$(printf "/tmp/seed/buscahogar-202603%02dT020000Z.dump.age" "$d")"; done'
  storage rclone copy /tmp/seed "BKP:buscahogar-backups-e2e/" >/dev/null
}
seed_old_objects
seeded_count="$(list_objects | grep -c '^buscahogar-202603' || true)"
check "veinte copias antiguas sembradas" 20 "$seeded_count"
SEEDED_LIST="$(list_objects)"

run_backup() { # VAR=valor... -- (sale con el código de backup.sh; salida en $BACKUP_OUT)
  BACKUP_RC=0
  BACKUP_OUT="$(txe "PATH=$SHIM_PATH" "$@" -- backup.sh 2>&1)" || BACKUP_RC=$?
}
tmp_entries() { tx bash -c 'ls -A /tmp/backup-work | wc -l' | tr -d '\r'; }
final_objects() { list_objects | grep -E '^buscahogar-[0-9]{8}T[0-9]{6}Z\.dump\.age$' || true; }

# --- A. Configuración ausente o inválida: antes de cualquier red -----------------------------------------------
section "A. configuración inválida aborta antes de la red"
reset_shim_logs
start=$SECONDS
run_backup "BACKUP_S3_ENDPOINT=http://unreachable.invalid:9" "DIRECT_DATABASE_URL=postgres://u:p@unreachable.invalid:5/db"
check "sin AGE_RECIPIENT: exit 2" 2 "$BACKUP_RC"
expect_contains "sin AGE_RECIPIENT: nombra la variable" "$BACKUP_OUT" 'AGE_RECIPIENT'
check "sin AGE_RECIPIENT: ninguna herramienta de red usada" "" "$(tx cat /tmp/shims/calls.log | tr -d '\r')"
if [ $((SECONDS - start)) -lt 10 ]; then pass "sin AGE_RECIPIENT: falla enseguida (sin esperas de red)"; else fail "tardó demasiado en abortar"; fi

reset_shim_logs
run_backup "AGE_RECIPIENT=AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ"
check "AGE_RECIPIENT es una clave PRIVADA: exit 2" 2 "$BACKUP_RC"
expect_lacks "la clave privada no se repite en la salida" "$BACKUP_OUT" 'QQQQQQQQQQ'
expect_contains "indica que debe ser la clave pública" "$BACKUP_OUT" 'public'

run_backup "AGE_RECIPIENT=not-an-age-key"
check "AGE_RECIPIENT con formato inválido: exit 2" 2 "$BACKUP_RC"

run_backup "AGE_RECIPIENT=$RECIPIENT" "BACKUP_S3_BUCKET=bad/bucket"
check "bucket con caracteres no permitidos: exit 2" 2 "$BACKUP_RC"

run_backup "AGE_RECIPIENT=$RECIPIENT" "DIRECT_DATABASE_URL=mysql://u:p@h/db"
check "URL de base que no es postgres: exit 2" 2 "$BACKUP_RC"
check "ninguna de esas ejecuciones tocó la red" "" "$(tx cat /tmp/shims/calls.log | tr -d '\r')"

# --- B. SIGTERM a mitad de volcado -------------------------------------------------------------------------------
section "B. parada a mitad de volcado"
reset_shim_logs
txe "PATH=$SHIM_PATH" "AGE_RECIPIENT=$RECIPIENT" SHIM_PG=hang -- \
  bash -c 'backup.sh > /tmp/kill.out 2>&1 & pid=$!; sleep 5; kill -TERM "$pid"; rc=0; wait "$pid" || rc=$?; echo "$rc" > /tmp/kill.rc; true'
KILL_RC="$(tx cat /tmp/kill.rc | tr -d '\r\n')"
if [ "$KILL_RC" != "0" ]; then pass "SIGTERM mitad de volcado: salida distinta de 0 ($KILL_RC)"; else fail "SIGTERM mitad de volcado salió con 0"; fi
check "no queda ningún fichero temporal" 0 "$(tmp_entries)"
check "no queda texto plano en disco" 0 "$(tx bash -c 'grep -rl PARTIAL-PLAINTEXT-DUMP /tmp /var/tmp /home 2>/dev/null | grep -v -e "^/tmp/kill" -e "^/tmp/shims/" | wc -l' | tr -d '\r')"
check "no queda ningún proceso huérfano (sleep)" 0 "$(tx bash -c 'cat /proc/[0-9]*/cmdline 2>/dev/null | tr "\0" " " | grep -c "sleep 60[0]" || true' | tr -d '\r')"
check "no se subió nada nuevo" "$SEEDED_LIST" "$(list_objects)"
expect_contains "el aborto queda registrado como error" "$(tx cat /tmp/kill.out)" '"level":"error"'

# --- C. pg_dump falla ----------------------------------------------------------------------------------------------
section "C. fallo del volcado"
run_backup "AGE_RECIPIENT=$RECIPIENT" SHIM_PG=fail
check "pg_dump falla: exit 1" 1 "$BACKUP_RC"
check "pg_dump falla: sin ficheros temporales" 0 "$(tmp_entries)"
check "pg_dump falla: nada subido" "$SEEDED_LIST" "$(list_objects)"
expect_contains "pg_dump falla: registro de error con el paso" "$BACKUP_OUT" '"level":"error".*dump'

# --- D. subida fallida: sin poda, sin copia contada -----------------------------------------------------------------
section "D. fallos de subida"
run_backup "AGE_RECIPIENT=$RECIPIENT" SHIM_RCLONE=copyto
check "subida fallida: exit 1" 1 "$BACKUP_RC"
check "subida fallida: ninguna copia nueva ni poda (las veinte siguen)" "$SEEDED_LIST" "$(list_objects)"
check "subida fallida: sin ficheros temporales" 0 "$(tmp_entries)"
expect_lacks "subida fallida: no hubo borrados" "$BACKUP_OUT" 'expired backup deleted'

run_backup "AGE_RECIPIENT=$RECIPIENT" SHIM_RCLONE=after-copyto
check "subida a medias: exit 1" 1 "$BACKUP_RC"
check "subida a medias: no cuenta como copia (solo las veinte)" "$(printf '%s\n' "$SEEDED_LIST")" "$(final_objects)"
check "subida a medias: sin poda (las veinte siguen)" 20 "$(list_objects | grep -c '^buscahogar-202603' || true)"
check "subida a medias: sin ficheros temporales" 0 "$(tmp_entries)"

run_backup "AGE_RECIPIENT=$RECIPIENT" SHIM_RCLONE=size
check "tamaño remoto distinto del local: exit 1" 1 "$BACKUP_RC"
check "tamaño distinto: no cuenta como copia" "$SEEDED_LIST" "$(final_objects)"

run_backup "AGE_RECIPIENT=$RECIPIENT" SHIM_RCLONE=moveto
check "fallo al publicar el objeto: exit 1" 1 "$BACKUP_RC"
check "fallo al publicar: no cuenta como copia" "$SEEDED_LIST" "$(final_objects)"
check "fallo al publicar: las veinte siguen" 20 "$(list_objects | grep -c '^buscahogar-202603' || true)"

# --- E. éxito, cifrado, secretos y retención ----------------------------------------------------------------------
section "E. copia correcta"
# Un resto de subida a medias antiguo: la poda posterior lo limpia y nunca lo cuenta.
tx bash -c 'printf partial > /tmp/stale.part'
storage rclone copyto /tmp/stale.part "BKP:buscahogar-backups-e2e/buscahogar-20260102T020000Z.dump.age.uploading" >/dev/null
reset_shim_logs
run_backup "AGE_RECIPIENT=$RECIPIENT"
check "copia correcta: exit 0" 0 "$BACKUP_RC"
NEW_OBJECT="$(final_objects | grep -v '^buscahogar-202603' || true)"
expect_contains "copia correcta: nombre ordenable con marca de tiempo UTC" "$NEW_OBJECT" '^buscahogar-[0-9]{8}T[0-9]{6}Z\.dump\.age$'
check "copia correcta: sin ficheros temporales ni texto plano" 0 "$(tmp_entries)"

kept="$(final_objects | sed -E 's/^buscahogar-([0-9]{8})T.*/\1/' | sort | tr '\n' ' ' | sed 's/ $//')"
NEW_DAY="$(printf '%s' "$NEW_OBJECT" | sed -E 's/^buscahogar-([0-9]{8})T.*/\1/')"
expected_kept="20260301 20260308 20260315 20260316 20260317 20260318 20260319 20260320 $NEW_DAY"
check "retención: 1 nueva + 6 diarias + 2 semanales conservadas, 12 podadas" "$expected_kept" "$kept"
check "retención: el resto de subida a medias se limpió" 0 "$(list_objects | grep -c '\.uploading$' || true)"

# Cifrado: formato age, ilegible sin la clave, legible con ella y es un volcado en formato personalizado.
tx bash -c "source /opt/backup/lib.sh && setup_rclone_env && rclone copyto 'BKP:buscahogar-backups-e2e/$NEW_OBJECT' /tmp/new.age"
head_bytes="$(tx bash -c 'head -c 21 /tmp/new.age' | tr -d '\r')"
check "el objeto es un fichero age" "age-encryption.org/v1" "$head_bytes"
check "el objeto no contiene el volcado en claro (PGDMP)" 0 "$(tx bash -c 'grep -c PGDMP /tmp/new.age || true' | tr -d '\r')"
wrong_rc=0
tx bash -c 'age -d -i /tmp/keys/wrong.txt /tmp/new.age > /dev/null 2>&1' || wrong_rc=$?
if [ "$wrong_rc" != "0" ]; then pass "con otra clave age NO se descifra"; else fail "se descifró con una clave equivocada"; fi
check "con la clave correcta es un volcado de pg_dump -Fc" "PGDMP" "$(tx bash -c 'age -d -i /tmp/keys/id.txt /tmp/new.age | head -c 5' | tr -d '\r')"
check "el volcado descifrado es legible por pg_restore --list" 0 "$(tx bash -c 'age -d -i /tmp/keys/id.txt /tmp/new.age | pg_restore --list > /dev/null; echo $?' | tr -d '\r')"
tx rm -f /tmp/new.age

# Secretos: ni en la salida ni en los argumentos de ningún proceso durante el volcado y la subida.
SNAPSHOT="$(tx cat /tmp/shims/proc.snapshot)"
for secret in "$SOURCE_PASSWORD" "$S3_SECRET"; do
  expect_lacks "el secreto no aparece en la salida del script" "$BACKUP_OUT" "$secret"
  expect_lacks "el secreto no aparece en los argumentos de ningún proceso" "$SNAPSHOT" "$secret"
done
expect_lacks "la URL de la base no aparece en los argumentos de pg_dump" "$(tx cat /tmp/shims/calls.log)" 'postgres://'
check "se llamó a pg_dump con formato personalizado" 1 "$(tx grep -c '^pg_dump .*-Fc' /tmp/shims/calls.log | tr -d '\r')"
expect_contains "cada línea de la salida es JSON" "$(printf '%s\n' "$BACKUP_OUT" | head -1)" '^\{"ts":"[0-9T:Z-]+","level":"info","component":"backup"'

# --- F. simulacro de restauración ------------------------------------------------------------------------------------
section "F. simulacro de restauración"
DRILL_URL="postgres://postgres:e2e-drill-owner-pw@drill-db:5432/drill_target"
tx bash -c "source /opt/backup/lib.sh; export DRILL_ADMIN_URL=postgres://postgres:e2e-drill-owner-pw@drill-db:5432/postgres; parse_database_url DRILL_ADMIN_URL; psql -Atq -c 'create database drill_target'" >/dev/null
drill_env=("DRILL_DATABASE_URL=$DRILL_URL" "AGE_IDENTITY_FILE=/tmp/keys/id.txt" "WEB_READONLY_PASSWORD=$READONLY_PASSWORD" \
  "WEB_COVERAGE_PASSWORD=$COVERAGE_PASSWORD" "DRILL_EXPECTED_ROW_COUNTS=$EXPECTED_COUNTS")

DRILL_RC=0
DRILL_OUT="$(txe "${drill_env[@]}" -- restore-drill.sh 2>&1)" || DRILL_RC=$?
check "simulacro sobre base vacía: exit 0" 0 "$DRILL_RC"
if [ "$DRILL_RC" != "0" ]; then printf '%s\n' "$DRILL_OUT" | tail -20 >&2; fi
for name in postgis-extension core-tables row-counts migration-journal privilege-matrix; do
  expect_contains "simulacro: comprobación $name superada" "$DRILL_OUT" "\"check\":\"$name\",\"ok\":true"
done
expect_contains "simulacro: restauró el objeto más reciente" "$DRILL_OUT" "$NEW_OBJECT"
expect_lacks "simulacro: sin secretos en la salida" "$DRILL_OUT" "($READONLY_PASSWORD|$COVERAGE_PASSWORD|e2e-drill-owner-pw|$S3_SECRET)"
check "simulacro: no deja texto plano en disco" 0 "$(tmp_entries)"
check "simulacro: los roles web existen en el servidor de destino (los creó el aprovisionamiento, no el volcado)" 2 \
  "$(tx bash -c "export U=postgres://postgres:e2e-drill-owner-pw@drill-db:5432/postgres; source /opt/backup/lib.sh; parse_database_url U; psql -Atq -c \"select count(*) from pg_roles where rolname in ('web_readonly','web_coverage')\"" | tr -d '\r')"

# --- G. privilegio alterado -------------------------------------------------------------------------------------------
section "G. privilegio alterado tras la restauración"
tx bash -c "export U=$DRILL_URL; source /opt/backup/lib.sh; parse_database_url U; psql -Atq -c 'grant select on table proxy_rate_limit to web_readonly'" >/dev/null
TAMPER_RC=0
TAMPER_OUT="$(txe "DRILL_DATABASE_URL=$DRILL_URL" "DRILL_EXPECTED_ROW_COUNTS=$EXPECTED_COUNTS" -- restore-drill.sh verify 2>&1)" || TAMPER_RC=$?
check "privilegio alterado: exit 4" 4 "$TAMPER_RC"
expect_contains "privilegio alterado: se nombra la comprobación" "$TAMPER_OUT" 'failed checks: privilege-matrix'
expect_contains "privilegio alterado: se nombra el privilegio" "$TAMPER_OUT" 'web_readonly must not have SELECT on proxy_rate_limit'
expect_contains "privilegio alterado: el simulacro lo declara fallido" "$TAMPER_OUT" 'restore drill FAILED'

# --- H. salvaguardas del simulacro -------------------------------------------------------------------------------------
section "H. salvaguardas del simulacro"
REUSE_RC=0
REUSE_OUT="$(txe "${drill_env[@]}" -- restore-drill.sh 2>&1)" || REUSE_RC=$?
check "destino NO vacío: exit 2" 2 "$REUSE_RC"
expect_contains "destino no vacío: lo dice" "$REUSE_OUT" 'not empty'

SAME_RC=0
SAME_OUT="$(txe "${drill_env[@]}" "DIRECT_DATABASE_URL=$DRILL_URL" -- restore-drill.sh 2>&1)" || SAME_RC=$?
check "destino igual al origen de las copias: exit 2" 2 "$SAME_RC"

tx bash -c "source /opt/backup/lib.sh; export A=postgres://postgres:e2e-drill-owner-pw@drill-db:5432/postgres; parse_database_url A; psql -Atq -c 'create database drill_wrongkey'" >/dev/null
WRONG_URL="postgres://postgres:e2e-drill-owner-pw@drill-db:5432/drill_wrongkey"
WRONG_RC=0
WRONG_OUT="$(txe "DRILL_DATABASE_URL=$WRONG_URL" "AGE_IDENTITY_FILE=/tmp/keys/wrong.txt" "WEB_READONLY_PASSWORD=$READONLY_PASSWORD" "WEB_COVERAGE_PASSWORD=$COVERAGE_PASSWORD" -- restore-drill.sh 2>&1)" || WRONG_RC=$?
check "clave equivocada: exit 1" 1 "$WRONG_RC"
check "clave equivocada: la base destino sigue vacía" 0 \
  "$(tx bash -c "export U=$WRONG_URL; source /opt/backup/lib.sh; parse_database_url U; psql -Atq -c \"select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not in ('spatial_ref_sys')\"" | tr -d '\r')"

# --- Resumen ---------------------------------------------------------------------------------------------------------------
printf '\n%s comprobaciones OK, %s fallidas\n' "$passed" "$failed"
if [ "$failed" -gt 0 ]; then
  exit 1
fi
