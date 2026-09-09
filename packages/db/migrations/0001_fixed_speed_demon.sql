CREATE TYPE "public"."coverage_job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "coverage_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "coverage_job_status" DEFAULT 'pending' NOT NULL,
	"cursor" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label_es" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "features_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "listing_features" (
	"listing_version_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"value" text,
	CONSTRAINT "listing_features_listing_version_id_feature_id_pk" PRIMARY KEY("listing_version_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "listing_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"price_cents" bigint NOT NULL,
	"surface_m2" integer,
	"rooms" smallint,
	"bathrooms" smallint,
	"floor" text,
	"title" text,
	"description" text,
	"address" text,
	"property_type" text,
	"operation" text NOT NULL,
	"raw" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_versions_operation_check" CHECK ("listing_versions"."operation" in ('sale', 'rent'))
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"location_id" uuid,
	"url" text NOT NULL,
	"location" geometry(point),
	"coordinates_obfuscated" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_status_check" CHECK ("listings"."status" in ('active', 'inactive', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ine_code" text NOT NULL,
	"municipality" text NOT NULL,
	"province" text NOT NULL,
	"province_code" text NOT NULL,
	"autonomous_community" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_ine_code_unique" UNIQUE("ine_code")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid,
	"location" geometry(point),
	"min_price_cents" bigint,
	"surface_m2" integer,
	"rooms" smallint,
	"listing_count" integer DEFAULT 0 NOT NULL,
	"consolidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"strategy_name" text NOT NULL,
	"strategy_version" text NOT NULL,
	"signals" jsonb NOT NULL,
	"scored_listing_version_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key"),
	CONSTRAINT "sources_kind_check" CHECK ("sources"."kind" in ('api', 'scrape'))
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"state" text DEFAULT 'uncovered' NOT NULL,
	"last_swept_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zones_location_id_unique" UNIQUE("location_id"),
	CONSTRAINT "zones_state_check" CHECK ("zones"."state" in ('uncovered', 'covering', 'covered', 'stale'))
);
--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD CONSTRAINT "coverage_jobs_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD CONSTRAINT "coverage_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_features" ADD CONSTRAINT "listing_features_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_features" ADD CONSTRAINT "listing_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_versions" ADD CONSTRAINT "listing_versions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_scored_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("scored_listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coverage_jobs_status_requested_at_idx" ON "coverage_jobs" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_jobs_zone_source_pending_idx" ON "coverage_jobs" USING btree ("zone_id","source_id") WHERE "coverage_jobs"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "listing_features_feature_id_idx" ON "listing_features" USING btree ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_versions_listing_id_version_idx" ON "listing_versions" USING btree ("listing_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_versions_current_idx" ON "listing_versions" USING btree ("listing_id") WHERE "listing_versions"."is_current";--> statement-breakpoint
CREATE INDEX "listing_versions_listing_captured_idx" ON "listing_versions" USING btree ("listing_id","captured_at");--> statement-breakpoint
CREATE INDEX "listing_versions_price_surface_current_idx" ON "listing_versions" USING btree ("price_cents","surface_m2") WHERE "listing_versions"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_external_id_idx" ON "listings" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "listings_location_id_idx" ON "listings" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "locations_municipality_idx" ON "locations" USING btree ("municipality");--> statement-breakpoint
CREATE INDEX "properties_min_price_cents_idx" ON "properties" USING btree ("min_price_cents");--> statement-breakpoint
CREATE UNIQUE INDEX "property_listings_listing_id_idx" ON "property_listings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "property_listings_property_id_idx" ON "property_listings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_listings_signals_idx" ON "property_listings" USING gin ("signals" jsonb_ops);--> statement-breakpoint
CREATE INDEX "property_listings_strategy_idx" ON "property_listings" USING btree ("strategy_name","strategy_version");