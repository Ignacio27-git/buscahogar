# Imagen de las copias de seguridad (ROADMAP 3.4, decisión 260, D18). Contexto de construcción: la RAÍZ del
# monorepo (`docker build -f ops/backup/Dockerfile .`).
#
# Dos destinos (`--target`):
#   backup  (por defecto)  pg_dump 17 + age + rclone + los scripts. Hace la copia cifrada y la retención.
#   drill                  lo anterior MÁS node y el JavaScript compilado de apps/ingestion: el simulacro de
#                          restauración repite el aprovisionamiento por la ruta del despliegue (decisión 257) y
#                          las comprobaciones (`restore-verify`). Se construye con la imagen de ingestion:
#                          `--build-arg INGESTION_IMAGE=<imagen de apps/ingestion/Dockerfile>`.
#
# Versiones fijadas: etiquetas exactas de las imágenes y versiones exactas de los paquetes de Debian (si el
# repositorio las retira, la construcción FALLA a propósito: cambiarlas es un commit revisable).

ARG POSTGRES_IMAGE=postgres:17.11-bookworm
ARG NODE_IMAGE=node:22.23.4-bookworm-slim
ARG INGESTION_IMAGE=buscahogar-ingestion:latest

FROM ${NODE_IMAGE} AS node
FROM ${INGESTION_IMAGE} AS ingestion

FROM ${POSTGRES_IMAGE} AS base

# `age` y `rclone` vienen de Debian bookworm (verificados con `apt-cache policy`). `pg_dump` 17 coincide con el
# servidor 17 de Neon y del contenedor local. Sin `curl`, `wget` ni compiladores en la imagen final.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        age=1.1.1-1+b3 \
        rclone=1.60.1+dfsg-2+b5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /home/dbbackup --shell /usr/sbin/nologin dbbackup

# Los scripts viajan con LF (`.gitattributes`); la imagen no los convierte.
COPY ops/backup/lib.sh ops/backup/backup.sh ops/backup/retention.sh ops/backup/restore-drill.sh /opt/backup/
RUN chmod 0555 /opt/backup/*.sh

ENV PATH="/opt/backup:${PATH}"
WORKDIR /home/dbbackup
USER dbbackup

FROM base AS drill

# node de la imagen oficial (mismo Debian bookworm y glibc que la base de postgres) y el JavaScript compilado
# de producción de apps/ingestion: `dist-runtime/scripts/{deploy,restore-verify}.js`.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=ingestion --chown=root:root /app/apps/ingestion /opt/ingestion

ENV NODE_ENV=production
CMD ["restore-drill.sh"]

FROM base AS backup

CMD ["backup.sh"]
