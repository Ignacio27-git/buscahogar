ALTER TABLE "coverage_jobs" ADD COLUMN "lease_renewed_at" timestamp with time zone;--> statement-breakpoint
-- Decisión 258, parte 2 (D14b): relleno de las filas existentes. Un job `running` en el momento de aplicar la
-- migración puede estar en manos de un worker vivo con código anterior (que no renueva el arrendamiento): se le
-- da un arrendamiento a "ahora" para que cuente con el margen completo antes de poder reclamarse. El resto
-- recibe su última actividad conocida (fin, o inicio si nunca terminó); un job que nunca se intentó queda en NULL.
UPDATE "coverage_jobs" SET "lease_renewed_at" = now() WHERE "status" = 'running';--> statement-breakpoint
UPDATE "coverage_jobs" SET "lease_renewed_at" = coalesce("finished_at", "started_at") WHERE "status" <> 'running';
