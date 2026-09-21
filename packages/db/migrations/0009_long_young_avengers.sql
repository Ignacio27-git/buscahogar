CREATE TABLE "daily_request_budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"source_id" uuid NOT NULL,
	"search_requests" integer DEFAULT 0 NOT NULL,
	"token_requests" integer DEFAULT 0 NOT NULL,
	"search_cap" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_request_budget" ADD CONSTRAINT "daily_request_budget_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_request_budget_day_source_idx" ON "daily_request_budget" USING btree ("day","source_id");