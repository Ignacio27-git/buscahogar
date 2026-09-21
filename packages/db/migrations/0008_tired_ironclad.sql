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
ALTER TABLE "locations" ADD COLUMN "search_name" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_jobs_zone_source_idx" ON "coverage_jobs" USING btree ("zone_id","source_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_ine_code_check" CHECK ("locations"."ine_code" ~ '^[0-9]{5}$');