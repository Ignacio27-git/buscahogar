CREATE TABLE "monthly_request_budget" (
	"month" date NOT NULL,
	"source_id" uuid NOT NULL,
	"total_cap" integer NOT NULL,
	"reserve" integer NOT NULL,
	"search_requests" integer DEFAULT 0 NOT NULL,
	"batch_requests" integer DEFAULT 0 NOT NULL,
	"on_demand_requests" integer DEFAULT 0 NOT NULL,
	"refresh_requests" integer DEFAULT 0 NOT NULL,
	"token_requests" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_request_budget_pk" PRIMARY KEY("month","source_id"),
	CONSTRAINT "monthly_request_budget_total_cap_check" CHECK ("monthly_request_budget"."total_cap" > 0),
	CONSTRAINT "monthly_request_budget_reserve_check" CHECK ("monthly_request_budget"."reserve" >= 0 and "monthly_request_budget"."reserve" < "monthly_request_budget"."total_cap"),
	CONSTRAINT "monthly_request_budget_counters_check" CHECK ("monthly_request_budget"."batch_requests" >= 0 and "monthly_request_budget"."on_demand_requests" >= 0 and "monthly_request_budget"."refresh_requests" >= 0 and "monthly_request_budget"."token_requests" >= 0),
	CONSTRAINT "monthly_request_budget_search_requests_check" CHECK ("monthly_request_budget"."search_requests" = "monthly_request_budget"."batch_requests" + "monthly_request_budget"."on_demand_requests" + "monthly_request_budget"."refresh_requests" and "monthly_request_budget"."search_requests" <= "monthly_request_budget"."total_cap")
);
--> statement-breakpoint
ALTER TABLE "monthly_request_budget" ADD CONSTRAINT "monthly_request_budget_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Decisión 248 (D8b, NF2): el registro mensual es solo del propietario (apps/ingestion). Los
-- privilegios por defecto del bootstrap (`ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO
-- web_readonly`) y `GRANT SELECT ON ALL TABLES` la expondrían a `web_readonly`, así que se revoca
-- explícitamente. Un REVOKE no es un GRANT nuevo. Los roles se crean fuera de las migraciones
-- (decisión 064) y pueden no existir en un entorno recién creado: solo se revoca a los que existen.
-- `bootstrap-roles-grants.sql` repite el REVOKE para el caso de que el bootstrap se ejecute después.
DO $$
DECLARE
  web_role text;
BEGIN
  FOREACH web_role IN ARRAY ARRAY['web_readonly', 'web_coverage'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = web_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE monthly_request_budget FROM %I', web_role);
    END IF;
  END LOOP;
END
$$;
