# Imagen de apps/ingestion (ROADMAP 3.4, decisión 258, D13): el worker de cobertura y, con otro comando, el
# despliegue de un solo uso (`deploy`, decisión 257). Multi-etapa y agnóstica del host.
#
# Contexto de construcción: la RAÍZ del monorepo (`docker compose --profile app build ingestion`), porque la
# construcción necesita el lockfile y los paquetes compartidos (core, db, config).
#
# - Etapa `build`: instala con el lockfile congelado, compila los paquetes y el JavaScript de producción
#   (`tsconfig.runtime.json` -> `dist-runtime/`) y poda a dependencias de producción con `pnpm deploy`.
# - Etapa final: SIN pnpm, SIN tsx, SIN fuentes TypeScript, SIN .env. Usuario no root. Solo `node` y lo copiado.
#
# La política de reinicio y el cierre ordenado pertenecen al host (paso 3.5): el worker se supervisa a sí mismo
# (backoff y salida 1 tras 10 caídas seguidas) y atiende SIGTERM con el plazo `WORKER_STOP_GRACE_MS`. Ejecutar
# con `--init` (Compose: `init: true`).

# Etiqueta EXACTA de Node (nunca `22` ni `lts`): la imagen es reproducible y el cambio de versión es un commit.
# La misma etiqueta en las dos etapas (lo comprueba test/worker-image.test.ts).
FROM node:22.23.4-bookworm-slim AS build

# Misma versión que `packageManager` del package.json raíz (lo comprueba test/worker-image.test.ts).
RUN npm install --global pnpm@11.25.0

ENV CI=true
WORKDIR /app

# `pnpm fetch` solo necesita el lockfile: esta capa se reutiliza mientras no cambien las dependencias.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .

# Solo ingestion y lo que necesita (core, db, config); no se instala apps/web. `--offline`: todo sale del
# `pnpm fetch` anterior.
RUN pnpm install --frozen-lockfile --offline --filter "@buscahogar/ingestion..."

# Con `--filter` el `prepare` de la raíz no corre: los paquetes se compilan aquí (db depende de core; pnpm los
# ordena topológicamente). Después, el JavaScript de producción del worker y del despliegue.
RUN pnpm --filter @buscahogar/core --filter @buscahogar/db build \
    && pnpm --filter @buscahogar/ingestion build:runtime

# Dependencias de producción (incluidos core y db ya compilados, con sus `migrations` y `sql`). pnpm 11 solo
# despliega sin `--legacy` desde workspaces con `inject-workspace-packages=true` (cambiaría el enlazado de todo el
# desarrollo y el lockfile); `--legacy` copia los paquetes del workspace respetando su campo `files` (verificado
# con `pnpm deploy --help` y con esta construcción, ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE sin él). Solo se
# materializa el árbol de `node_modules`: `dist-runtime/` está en .gitignore y se copia aparte.
RUN pnpm --filter @buscahogar/ingestion deploy --legacy --prod /prod/ingestion

FROM node:22.23.4-bookworm-slim AS runtime

ENV NODE_ENV=production

# Misma ruta que usa el servicio `deploy` de docker-compose.yml (`working_dir`).
WORKDIR /app/apps/ingestion

# Solo el árbol de dependencias de producción y el JavaScript compilado. `pnpm deploy` copia también las fuentes,
# los tests y la configuración del paquete (no declara `files`): se dejan fuera a propósito.
COPY --from=build --chown=node:node /prod/ingestion/package.json ./package.json
COPY --from=build --chown=node:node /prod/ingestion/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/ingestion/dist-runtime ./dist-runtime

# `node` (uid 1000) viene en la imagen oficial.
USER node

# Worker de cobertura. El despliegue sustituye el comando: `node dist-runtime/scripts/deploy.js`.
CMD ["node", "dist-runtime/scripts/coverage-worker.js"]
