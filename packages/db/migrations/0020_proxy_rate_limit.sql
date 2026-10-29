CREATE TABLE "proxy_rate_limit" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_start_ms" bigint NOT NULL,
	"hits" integer NOT NULL,
	CONSTRAINT "proxy_rate_limit_hits_check" CHECK ("proxy_rate_limit"."hits" >= 1)
);
--> statement-breakpoint
CREATE INDEX "proxy_rate_limit_window_start_ms_idx" ON "proxy_rate_limit" USING btree ("window_start_ms");
--> statement-breakpoint
-- Decisión 255 (D5b, R1.5): el limitador compartido solo lo toca `web_coverage` (SELECT/INSERT/UPDATE/DELETE,
-- que concede `bootstrap-roles-grants.sql`). `web_readonly` NO debe tener ningún privilegio, pero los
-- privilegios por defecto del bootstrap (`ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO
-- web_readonly`) le darían SELECT sobre esta tabla recién creada, así que se revoca explícitamente
-- (mismo patrón que la 0019). Un REVOKE no es un GRANT nuevo. Los roles se crean fuera de las migraciones
-- (decisión 064) y pueden no existir en un entorno recién creado: solo se revoca si existe.
-- `bootstrap-roles-grants.sql` repite el REVOKE para el caso de que el bootstrap se ejecute después.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_readonly') THEN
    REVOKE ALL ON TABLE proxy_rate_limit FROM web_readonly;
  END IF;
END
$$;
