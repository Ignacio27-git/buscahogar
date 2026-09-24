CREATE TABLE "dedup_pair_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"listing_a_id" uuid NOT NULL,
	"listing_b_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"signals" jsonb NOT NULL,
	"band" text NOT NULL,
	"scored_listing_version_id_a" uuid,
	"scored_listing_version_id_b" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dedup_pair_evidence_band_check" CHECK ("dedup_pair_evidence"."band" in ('accept', 'undecided', 'reject')),
	CONSTRAINT "dedup_pair_evidence_listing_order_check" CHECK ("dedup_pair_evidence"."listing_a_id" < "dedup_pair_evidence"."listing_b_id")
);
--> statement-breakpoint
CREATE TABLE "dedup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_name" text NOT NULL,
	"strategy_version" text NOT NULL,
	"radius_meters" double precision NOT NULL,
	"price_band_cents" bigint NOT NULL,
	"surface_tolerance_m2" integer NOT NULL,
	"listings_considered" integer NOT NULL,
	"candidate_pairs" integer NOT NULL,
	"accept_pairs" integer NOT NULL,
	"undecided_pairs" integer NOT NULL,
	"reject_pairs" integer NOT NULL,
	"properties_created" integer NOT NULL,
	"refused_components" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dedup_pair_evidence" ADD CONSTRAINT "dedup_pair_evidence_run_id_dedup_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."dedup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_pair_evidence" ADD CONSTRAINT "dedup_pair_evidence_listing_a_id_listings_id_fk" FOREIGN KEY ("listing_a_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_pair_evidence" ADD CONSTRAINT "dedup_pair_evidence_listing_b_id_listings_id_fk" FOREIGN KEY ("listing_b_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_pair_evidence" ADD CONSTRAINT "dedup_pair_evidence_scored_listing_version_id_a_listing_versions_id_fk" FOREIGN KEY ("scored_listing_version_id_a") REFERENCES "public"."listing_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_pair_evidence" ADD CONSTRAINT "dedup_pair_evidence_scored_listing_version_id_b_listing_versions_id_fk" FOREIGN KEY ("scored_listing_version_id_b") REFERENCES "public"."listing_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dedup_pair_evidence_run_listings_idx" ON "dedup_pair_evidence" USING btree ("run_id","listing_a_id","listing_b_id");--> statement-breakpoint
CREATE INDEX "dedup_pair_evidence_run_band_idx" ON "dedup_pair_evidence" USING btree ("run_id","band");--> statement-breakpoint
CREATE INDEX "dedup_pair_evidence_signals_idx" ON "dedup_pair_evidence" USING gin ("signals" jsonb_ops);