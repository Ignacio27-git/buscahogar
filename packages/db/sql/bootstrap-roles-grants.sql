-- Bootstrap idempotente de los GRANT sobre los dos roles de superficie
-- acotada que usa `apps/web` (docs/DECISIONS.md, decisiones 056, 064 y
-- 069). Re-ejecutable sin efecto tras la primera vez: cada GRANT de
-- PostgreSQL es un no-op si el privilegio ya existe, así que este fichero
-- puede correrse después de CUALQUIER recreación de la base de datos
-- (`DROP DATABASE` + `CREATE DATABASE`, que borra los GRANT per-database
-- junto con todo lo demás) sin comprobar antes si hacía falta.
--
-- FRONTERA DELIBERADA, NO TOCAR: este fichero NUNCA crea los roles
-- (`CREATE ROLE`) ni fija ninguna contraseña. Aprovisionar los roles
-- (`web_readonly`, `web_coverage`) y sus credenciales sigue siendo tarea
-- EXCLUSIVA del responsable del proyecto (ROADMAP 1.13, tarea 10.5;
-- decisión 064) — ningún agente tiene permiso para crear roles de
-- PostgreSQL ni para leer o escribir ningún `.env`, y ninguna credencial
-- debe aparecer jamás en este repositorio. Ejecutar este script ASUME que
-- ambos roles ya existen; si no existen, cada `GRANT` falla alto con
-- `role "web_readonly" does not exist`, nunca en silencio.
--
-- Motivo de existir (decisión 069): estos GRANT vivían solo en la memoria
-- del responsable del proyecto, emitidos a mano, y una recreación de la
-- base de datos (necesaria para probar una migración corregida, ROADMAP
-- 1.13, sdd-verify obs #231/#232) los borró sin que ningún test lo
-- detectara, porque toda la suite de integración conecta como el
-- propietario. Ver decisión 069 para el relato completo.
--
-- Cómo ejecutarlo (el responsable del proyecto, tras confirmar que ambos
-- roles ya existen):
--   docker compose exec -T db psql -U buscahogar -d buscahogar \
--     -f packages/db/sql/bootstrap-roles-grants.sql
--
-- NO es una migración de drizzle-kit (deliberado): las migraciones aplican
-- el ESQUEMA en el despliegue; esto es aprovisionamiento del ENTORNO,
-- condicionado a una decisión operativa (si el rol existe) que
-- drizzle-kit no puede expresar, y que además le daría un hash de
-- contenido rastreado que rompería en cualquier entorno sin esos roles.

-- Conexión: ambos roles deben poder autenticarse contra `buscahogar` en
-- absoluto, antes de que importe ningún otro privilegio.
GRANT CONNECT ON DATABASE buscahogar TO web_readonly, web_coverage;

-- Uso del esquema `public`: sin esto, ningún SELECT/INSERT posterior sobre
-- una tabla de `public` es alcanzable, aunque el GRANT sobre la tabla en
-- sí ya exista.
GRANT USAGE ON SCHEMA public TO web_readonly, web_coverage;

-- `web_readonly` (decisión 056): SELECT sobre TODAS las tablas existentes
-- de `public`, nunca INSERT/UPDATE/DELETE sobre ninguna.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_readonly;

-- `web_coverage` (decisión 064): INSERT únicamente sobre `coverage_jobs`,
-- nada más.
GRANT INSERT ON TABLE coverage_jobs TO web_coverage;

-- `web_coverage` (ROADMAP 1.15, security-hardening, spec #261 "The Per-
-- Client Limiter's Role Can Touch Only Its Own Table") — el UPSERT atómico
-- de `consumeClientQuota` (decisión 077) necesita SELECT (lo exige la
-- cláusula `WHERE` de `ON CONFLICT ... DO UPDATE` y el propio `RETURNING`),
-- INSERT y UPDATE para el upsert en sí, y DELETE para la purga de ventana
-- cerrada (decisión 076) que la misma función ejecuta en cada consumición.
-- Ningún otro privilegio, ninguna otra tabla.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coverage_client_quota TO web_coverage;

-- Privilegio por defecto para tablas FUTURAS creadas por el propietario:
-- sin esto, una tabla nueva de una migración posterior (por ejemplo,
-- `daily_request_budget`) no sería legible por `web_readonly` hasta
-- volver a ejecutar un GRANT explícito sobre ella.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO web_readonly;
