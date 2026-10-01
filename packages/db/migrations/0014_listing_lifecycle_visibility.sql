ALTER TABLE "listings" ADD COLUMN "inactive_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "inactive_reason" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "active_listing_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_inactive_reason_check" CHECK ("listings"."inactive_reason" in ('delisted', 'zone_purged'));--> statement-breakpoint
-- ROADMAP 2.5 (decisión 109, PS-8/S-PS-11): hasta ahora ningún listing puede
-- estar inactivo, así que todos los anuncios de cada vivienda cuentan como
-- activos. Idempotente.
UPDATE "properties" SET "active_listing_count" = "listing_count";
