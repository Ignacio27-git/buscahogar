-- CORRECCIÓN MANUAL (mismo defecto que 0003_fix_geography_generated_column.sql,
-- docs/AI-NOTES.md 2026-09-09): drizzle-kit@0.31.10 no reconoce el customType
-- `geographyPoint` en su lista blanca de tipos nativos y entrecomilla la
-- cadena completa como si fuera un identificador —
-- `"geography(Point,4326)"`—, que Postgres rechaza (SQLSTATE 42704, "type ...
-- does not exist"). `drizzle-kit generate` emitió exactamente esa forma
-- entrecomillada; esta línea la sustituye por el tipo real sin comillas,
-- verificado aplicando la migración contra esta misma base de datos.
ALTER TABLE "locations" ADD COLUMN "centroid" geography(Point,4326);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "sweep_radius_m" integer;--> statement-breakpoint
-- CORRECCIÓN post-verify (sdd-verify obs #231, hallazgo C2): la forma
-- original de esta línea era `ADD COLUMN "search_name" text NOT NULL` en una
-- sola sentencia, sin DEFAULT ni backfill. Aplicaba limpio solo porque la
-- tabla `locations` de desarrollo estaba vacía en ese momento; contra
-- cualquier base ya seedeada (el flujo ordinario del proyecto es
-- migrar-y-luego-seedear, `packages/db/src/seed.ts`, decisión 039),
-- PostgreSQL la rechaza — reproducido: "column "search_name" of relation
-- "locations" contains null values". Reescrita en tres pasos: columna
-- nulable, backfill desde "municipality" con la misma regla de plegado de
-- acentos que `normalizeSearchName`
-- (`packages/core/src/normalize-search-name.ts`) expresada en SQL mediante
-- `translate()` (sin la extensión `unaccent`, no instalada en esta base y
-- STABLE, no IMMUTABLE — ver el comentario de `normalize-search-name.ts`),
-- y solo entonces NOT NULL.
ALTER TABLE "locations" ADD COLUMN "search_name" text;--> statement-breakpoint
UPDATE "locations" SET "search_name" = lower(trim(regexp_replace(translate("municipality", 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuCc'), '\s+', ' ', 'g'))) WHERE "search_name" IS NULL;--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "search_name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_jobs_zone_source_idx" ON "coverage_jobs" USING btree ("zone_id","source_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_ine_code_check" CHECK ("locations"."ine_code" ~ '^[0-9]{5}$');