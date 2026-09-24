-- Corrige un defecto de generación de SQL de drizzle-kit@0.31.10, distinto del
-- que anticipaba CHK-GEOG-STORED/FB-GEOG-EXPR (SQLSTATE 42P17, "generation
-- expression is not immutable"). `parseType` en drizzle-kit solo deja sin
-- comillas los tipos nativos de su lista blanca (incluye "geometry" pero NO
-- "geography"); al no reconocer el `customType` `geographyPoint`, envuelve la
-- cadena completa entre comillas dobles y emite `"geography(Point,4326)"`
-- como identificador literal, un tipo que Postgres no encuentra (SQLSTATE
-- 42704, "type \"geography(Point,4326)\" does not exist"). Por eso
-- `0001_fixed_speed_demon.sql` ya NO declara la columna `location_geography`
-- ni su índice GiST para `listings`/`properties`: aquí se crean a mano con el
-- tipo sin comillas, preservando exactamente la decisión de diseño D2
-- (columna `geography` generada STORED + GiST sobre esa columna), verificada
-- con SQL crudo contra esta misma base de datos antes de aplicar este cambio.
ALTER TABLE "listings"
  ADD COLUMN "location_geography" geography(Point, 4326) GENERATED ALWAYS AS (("location"::geography)) STORED;
CREATE INDEX "listings_location_geography_idx" ON "listings" USING gist ("location_geography");

ALTER TABLE "properties"
  ADD COLUMN "location_geography" geography(Point, 4326) GENERATED ALWAYS AS (("location"::geography)) STORED;
CREATE INDEX "properties_location_geography_idx" ON "properties" USING gist ("location_geography");
