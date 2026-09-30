CREATE TABLE "listing_presence_checks" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"suspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"check_attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD COLUMN "cycle_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_presence_checks" ADD CONSTRAINT "listing_presence_checks_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_presence_checks" ADD CONSTRAINT "listing_presence_checks_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_presence_checks_zone_id_idx" ON "listing_presence_checks" USING btree ("zone_id");