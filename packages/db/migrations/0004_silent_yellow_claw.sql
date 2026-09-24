ALTER TABLE "properties" ADD COLUMN "property_type" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "operation" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bathrooms" smallint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "floor" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "description" text;--> statement-breakpoint
CREATE INDEX "properties_operation_property_type_idx" ON "properties" USING btree ("operation","property_type");--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_operation_check" CHECK ("properties"."operation" in ('sale', 'rent'));