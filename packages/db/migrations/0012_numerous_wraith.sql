CREATE INDEX "properties_updated_at_id_idx" ON "properties" USING btree ("updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "properties_operation_property_type_updated_at_idx" ON "properties" USING btree ("operation","property_type","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "properties_operation_property_type_min_price_cents_idx" ON "properties" USING btree ("operation","property_type","min_price_cents","id");--> statement-breakpoint
CREATE INDEX "properties_min_price_cents_desc_id_idx" ON "properties" USING btree ("min_price_cents" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "properties_surface_m2_id_idx" ON "properties" USING btree ("surface_m2","id");