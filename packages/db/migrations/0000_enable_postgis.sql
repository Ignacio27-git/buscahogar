-- Custom SQL migration file, put your code below! --

-- Activa la extensión PostGIS antes de cualquier migración que declare una
-- columna `geometry`/`geography`. La imagen `postgis/postgis` ya trae la
-- extensión disponible, pero solo la deja creada en el volumen de datos de
-- desarrollo (decisión 014 de docs/DECISIONS.md): en CI, en un clon nuevo o
-- tras un `docker compose down -v`, la base de datos parte vacía y necesita
-- este `CREATE EXTENSION` explícito. `IF NOT EXISTS` lo hace idempotente:
-- reaplicarlo sobre una base de datos que ya la tiene es un no-op seguro.
CREATE EXTENSION IF NOT EXISTS postgis;
