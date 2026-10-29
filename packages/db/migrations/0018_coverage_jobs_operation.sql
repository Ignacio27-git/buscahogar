ALTER TABLE "coverage_jobs" ADD COLUMN "operation" text;--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD COLUMN "last_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD COLUMN "presweep_requested_at" timestamp with time zone;--> statement-breakpoint
UPDATE "coverage_jobs" SET "operation" = 'rent' WHERE "operation" IS NULL;--> statement-breakpoint
UPDATE "coverage_jobs" SET "last_completed_at" = "zones"."last_swept_at" FROM "zones" WHERE "zones"."id" = "coverage_jobs"."zone_id" AND "zones"."state" = 'covered' AND "zones"."last_swept_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "coverage_jobs" ALTER COLUMN "operation" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coverage_jobs" ADD CONSTRAINT "coverage_jobs_operation_check" CHECK ("coverage_jobs"."operation" in ('sale', 'rent'));--> statement-breakpoint
DROP INDEX "coverage_jobs_zone_source_pending_idx";--> statement-breakpoint
DROP INDEX "coverage_jobs_zone_source_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_jobs_zone_source_op_pending_idx" ON "coverage_jobs" USING btree ("zone_id","source_id","operation") WHERE "coverage_jobs"."status" in ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_jobs_zone_source_op_idx" ON "coverage_jobs" USING btree ("zone_id","source_id","operation");
