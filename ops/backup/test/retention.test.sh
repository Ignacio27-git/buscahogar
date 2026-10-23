#!/usr/bin/env bash
# Pruebas de la SELECCIÓN de retención (decisión 260, R8.2): función pura sobre una lista de nombres, sin red ni
# almacenamiento. 7 diarias + 4 semanales (domingo) + 3 mensuales (día 01), por orden de nombre ISO; la más
# reciente nunca se borra; lo que no tiene el formato de copia (p. ej. subidas a medias `.uploading`) no se
# cuenta ni se toca. Se ejecuta con `bash ops/backup/test/retention.test.sh` (y desde el e2e y vitest).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RETENTION="$HERE/../retention.sh"

failures=0
checks=0

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_eq() { # esperado real descripción
  checks=$((checks + 1))
  if [ "$1" != "$2" ]; then
    fail "$3 (esperado: [$1] real: [$2])"
  fi
}

# Nombre de copia a partir de una fecha y una hora.
name_of() { printf 'buscahogar-%sT%sZ.dump.age' "$1" "${2:-020000}"; }

# Fechas consecutivas (YYYYMMDD) desde $1, $2 días.
days_from() {
  local start="$1" count="$2" i
  for ((i = 0; i < count; i++)); do
    date -u -d "$start + $i day" +%Y%m%d
  done
}

list_of() { # fecha-inicial número-de-días
  local day
  while read -r day; do
    name_of "$day"
    printf '\n'
  done < <(days_from "$1" "$2")
}

select_of() { bash "$RETENTION" select; }

kept_dates() { grep '^keep ' | sed -E 's/^keep buscahogar-([0-9]{8})T.*/\1/' | sort | tr '\n' ' ' | sed 's/ $//'; }
deleted_count() { grep -c '^delete ' || true; }

# 1. Veinte diarios consecutivos (2026-03-01 domingo .. 2026-03-20): 7 diarios, domingos 03-08 y 03-01 como
# semanales (solo hay dos fuera de la ventana diaria) y el día 01 ya conservado como semanal.
out="$(list_of 20260301 20 | select_of)"
assert_eq '20260301 20260308 20260314 20260315 20260316 20260317 20260318 20260319 20260320' \
  "$(printf '%s\n' "$out" | kept_dates)" '20 diarios: conservados'
assert_eq '11' "$(printf '%s\n' "$out" | deleted_count)" '20 diarios: borrados'

# 2. 120 diarios (2026-03-03 .. 2026-06-30): exactamente 7 + 4 + 3 = 14, sin solapes entre niveles.
out="$(list_of 20260303 120 | select_of)"
expected_120='20260401 20260501 20260531 20260601 20260607 20260614 20260621 20260624 20260625 20260626 20260627 20260628 20260629 20260630'
assert_eq "$expected_120" "$(printf '%s\n' "$out" | kept_dates)" '120 diarios: 7 diarios + 4 semanales + 3 mensuales'
assert_eq '106' "$(printf '%s\n' "$out" | deleted_count)" '120 diarios: borrados'
assert_eq '14' "$(printf '%s\n' "$out" | grep -c '^keep ')" '120 diarios: 14 conservados'
assert_eq '7' "$(printf '%s\n' "$out" | grep -c '^keep .* daily')" '120 diarios: 7 etiquetados daily'
assert_eq '4' "$(printf '%s\n' "$out" | grep -c '^keep .* weekly')" '120 diarios: 4 etiquetados weekly'
assert_eq '3' "$(printf '%s\n' "$out" | grep -c '^keep .* monthly')" '120 diarios: 3 etiquetados monthly'

# 3. La más reciente nunca se borra, aunque sea la única o no encaje en ningún nivel.
out="$(name_of 20260610 | select_of)"
assert_eq 'keep buscahogar-20260610T020000Z.dump.age daily' "$out" 'una sola copia: se conserva'

# 4. Varias copias el mismo día: se conserva la más reciente de ese día y se borran las anteriores.
out="$( { name_of 20260610 010000; echo; name_of 20260610 230000; echo; name_of 20260610 120000; echo; } | select_of)"
assert_eq 'keep buscahogar-20260610T230000Z.dump.age daily' "$(printf '%s\n' "$out" | grep '^keep ')" 'mismo día: conserva la última'
assert_eq '2' "$(printf '%s\n' "$out" | deleted_count)" 'mismo día: borra las dos anteriores'

# 5. Lo ajeno al formato no cuenta ni se toca (ni se lista): subidas a medias, otros ficheros, otro prefijo.
out="$( { name_of 20260610; echo; echo 'buscahogar-20260610T020000Z.dump.age.uploading'; echo 'notes.txt'; echo 'otra-20260101T020000Z.dump.age'; echo 'buscahogar-2026T020000Z.dump.age'; } | select_of)"
assert_eq 'keep buscahogar-20260610T020000Z.dump.age daily' "$out" 'formato ajeno: ignorado, ni keep ni delete'

# 6. Entrada vacía: sin salida y código 0.
out="$(printf '' | select_of)"
assert_eq '' "$out" 'vacía: sin salida'

# 7. Determinista: el orden de entrada no importa.
asc="$(list_of 20260303 120 | select_of)"
desc="$(list_of 20260303 120 | sort -r | select_of)"
assert_eq "$asc" "$desc" 'el orden de entrada no cambia la salida'

# 8. Una copia con timestamp con prefijo configurable.
out="$(printf 'miprefijo-20260610T020000Z.dump.age\nbuscahogar-20260101T020000Z.dump.age\n' | BACKUP_NAME_PREFIX=miprefijo bash "$RETENTION" select)"
assert_eq 'keep miprefijo-20260610T020000Z.dump.age daily' "$out" 'prefijo configurable'

# 9. Subcomando desconocido: error de uso (2).
set +e
bash "$RETENTION" nonsense >/dev/null 2>&1
code=$?
set -e
assert_eq '2' "$code" 'subcomando desconocido: exit 2'

if [ "$failures" -gt 0 ]; then
  printf '%s de %s comprobaciones fallaron\n' "$failures" "$checks" >&2
  exit 1
fi
printf 'retention: %s comprobaciones OK\n' "$checks"
