CREATE TABLE "coverage_client_quota" (
	"key_hash" text NOT NULL,
	"day" date NOT NULL,
	"registrations" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "coverage_client_quota_key_hash_day_pk" PRIMARY KEY("key_hash","day"),
	CONSTRAINT "coverage_client_quota_registrations_check" CHECK ("coverage_client_quota"."registrations" >= 0)
);
