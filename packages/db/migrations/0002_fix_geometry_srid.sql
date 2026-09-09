-- Custom SQL migration file, put your code below! --

-- CHK-SRID detectó que drizzle-kit 0.31.10 emitió `geometry(point)` sin SRID
-- en `0001_fixed_speed_demon.sql` para `listings.location` y
-- `properties.location`, en vez del `geometry(Point,4326)` declarado en el
-- esquema (gap G1 anticipado en el diseño). Esta migración `--custom` fija
-- el tipo real de columna a nivel de base de datos; el esquema TypeScript ya
-- estaba correcto, así que no requiere ningún cambio adicional. Sin datos
-- que perder: ninguna tabla tiene filas todavía en este punto del proyecto.
ALTER TABLE "listings"
  ALTER COLUMN "location" TYPE geometry(Point, 4326)
  USING "location"::geometry(Point, 4326);

ALTER TABLE "properties"
  ALTER COLUMN "location" TYPE geometry(Point, 4326)
  USING "location"::geometry(Point, 4326);
