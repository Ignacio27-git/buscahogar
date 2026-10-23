CREATE TABLE "alert_dispatch_log" (
	"dedup_key" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alert_dispatch_log_last_sent_at_idx" ON "alert_dispatch_log" USING btree ("last_sent_at");
--> statement-breakpoint
-- Decisión 259 (D17, R7.3): `alert_dispatch_log` es solo del propietario (`apps/ingestion`). Los privilegios por
-- defecto del bootstrap (`ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO web_readonly`) le darían SELECT
-- a `web_readonly` sobre la tabla recién creada, así que se revoca explícitamente a AMBOS roles web (patrón de
-- la 0019). Un REVOKE no es un GRANT nuevo. Los roles se crean fuera de las migraciones (decisión 064) y pueden
-- no existir en un entorno recién creado: solo se revoca a los que existen.
-- `bootstrap-roles-grants.sql` repite el REVOKE para el caso de que el bootstrap se ejecute después.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_readonly') THEN
    REVOKE ALL ON TABLE alert_dispatch_log FROM web_readonly;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_coverage') THEN
    REVOKE ALL ON TABLE alert_dispatch_log FROM web_coverage;
  END IF;
END
$$;
