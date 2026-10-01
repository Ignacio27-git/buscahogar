#!/bin/sh
# Entrypoint del contenedor e2e (paso D.1a, diseño A4/A8, decisión 135).
#
# 1. Siembra la base `*_e2e` con la credencial de PROPIETARIO (la única
#    operación que la necesita: DROP/CREATE DATABASE y migraciones).
# 2. Lanza Playwright con `E2E_DATABASE_URL` ELIMINADA del entorno: el servidor
#    Next que arranca Playwright hereda `process.env`, y la credencial de
#    propietario no debe llegar nunca a ese proceso. `playwright.config.ts`
#    lo comprueba y falla si sigue definida.
#
# Uso: docker-entrypoint.sh [run|update] [argumentos de playwright...]
set -eu

mode="${1:-run}"
[ "$#" -gt 0 ] && shift

case "$mode" in
  run) script="test:e2e" ;;
  update) script="test:e2e:update" ;;
  *)
    echo "Modo desconocido: $mode (usa 'run' o 'update')" >&2
    exit 2
    ;;
esac

pnpm --filter @buscahogar/db seed:e2e

exec env -u E2E_DATABASE_URL pnpm --filter @buscahogar/web "$script" "$@"
