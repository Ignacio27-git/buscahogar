CREATE TABLE "zone_query_signals" (
	"zone_id" uuid NOT NULL,
	"day" date DEFAULT (now() at time zone 'utc')::date NOT NULL,
	CONSTRAINT "zone_query_signals_zone_id_day_pk" PRIMARY KEY("zone_id","day")
);
--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD COLUMN "refresh_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "zone_query_signals" ADD CONSTRAINT "zone_query_signals_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ROADMAP 2.5 (decisión 102, QSR-7): las zonas ya cubiertas conservan una
-- referencia de demanda. Se siembra una señal por job en la fecha UTC de
-- `requested_at` (no depende de la zona horaria de la sesión). Idempotente.
INSERT INTO "zone_query_signals" ("zone_id", "day") SELECT "zone_id", ("requested_at" AT TIME ZONE 'utc')::date FROM "coverage_jobs" ON CONFLICT DO NOTHING;
