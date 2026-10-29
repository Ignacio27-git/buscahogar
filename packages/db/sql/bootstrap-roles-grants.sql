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
-- Agnóstico de la base (decisión 245): usa `current_database()`, así que el mismo
-- fichero sirve a la de desarrollo (`psql -d buscahogar`) y a la `_web_test`, que
-- el `globalSetup` de `apps/web` aprovisiona ejecutándolo.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO web_readonly, web_coverage', current_database());
END
$$;

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

-- `web_coverage` (ROADMAP 2.5, refresh-retention-policy, decisión 102, que
-- amplía la 064/076) — señal de demanda por zona. La web inserta SOLO
-- `zone_id` con `INSERT ... ON CONFLICT DO NOTHING`, que no necesita SELECT
-- ni UPDATE (sin `WHERE`, sin `RETURNING`, sin `DO UPDATE`). Ningún otro
-- privilegio sobre esta tabla: la lectura y la purga son del propietario
-- (`apps/ingestion`). `web_readonly` recibe SELECT por los privilegios por
-- defecto (abajo), lo cual es inocuo. El propietario debe volver a ejecutar
-- este fichero tras aplicar la migración 0013.
GRANT INSERT ON TABLE zone_query_signals TO web_coverage;

-- `web_coverage` (ROADMAP 3.4, decisión 255, que amplía la 064/076/102) — limitador de peticiones
-- COMPARTIDO de `apps/web/src/proxy.ts`. La sentencia atómica del limitador (purga acotada + upsert
-- con `RETURNING`) necesita SELECT (la subconsulta de la purga y el `RETURNING`), INSERT y UPDATE
-- (el upsert) y DELETE (la purga de ventanas vencidas). Ningún otro privilegio ni otra tabla. El
-- propietario debe volver a ejecutar este fichero tras aplicar la migración 0020.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE proxy_rate_limit TO web_coverage;

-- Privilegio por defecto para tablas FUTURAS creadas por el propietario:
-- sin esto, una tabla nueva de una migración posterior (por ejemplo,
-- `daily_request_budget`) no sería legible por `web_readonly` hasta
-- volver a ejecutar un GRANT explícito sobre ella.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO web_readonly;

-- JIT desactivado para las sesiones de la búsqueda (ROADMAP 2.4, decisión
-- 101). Cada búsqueda devuelve una página de 25 filas y nunca se beneficia
-- de compilar a código nativo; con 1M de filas, la estimación de coste de un
-- filtro geográfico amplio superaba los umbrales de JIT y la compilación
-- (~550 ms) dominaba una consulta de ~50 ms. Acotado al rol y a esta base de
-- datos: la ingesta y la deduplicación (propietario) conservan el JIT.
-- Idempotente: `ALTER ROLE ... SET` sustituye el valor previo.
-- Decisión 264 (enmienda la 101): un proveedor gestionado puede no permitir `ALTER ROLE ... SET` a
-- quien ejecuta el bootstrap; en ese caso se avisa y el despliegue aplica el respaldo a nivel de base
-- de datos y lo verifica (`SHOW jit` como `web_readonly`).
DO $$
BEGIN
  EXECUTE format('ALTER ROLE web_readonly IN DATABASE %I SET jit = off', current_database());
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'No se pudo fijar jit = off a nivel de rol (insufficient_privilege): requiere el respaldo a nivel de base de datos';
END
$$;

-- Registro MENSUAL de cuota de peticiones (ROADMAP 3.3, decisión 248, NF2): es solo del
-- propietario (`apps/ingestion`). Los `GRANT SELECT ON ALL TABLES` de arriba y los privilegios por
-- defecto de la línea anterior le darían SELECT a `web_readonly`, así que este REVOKE va SIEMPRE
-- DESPUÉS de ambos y hay que conservarlo ahí: moverlo antes lo anularía. Un REVOKE no es un GRANT
-- nuevo. `monthly_request_budget` aparece con la migración 0019; si el bootstrap corre antes,
-- no hay nada que revocar (la migración revoca al crearla).
DO $$
BEGIN
  IF to_regclass('public.monthly_request_budget') IS NOT NULL THEN
    REVOKE ALL ON TABLE monthly_request_budget FROM web_readonly, web_coverage;
  END IF;
END
$$;

-- Limitador de peticiones compartido (ROADMAP 3.4, decisión 255, D5b, R1.5): lo toca SOLO `web_coverage`
-- (SELECT/INSERT/UPDATE/DELETE, concedidos arriba). Por la misma razón que el registro mensual, los
-- `GRANT SELECT ON ALL TABLES` y los privilegios por defecto de más arriba le darían SELECT a
-- `web_readonly`, así que este REVOKE va SIEMPRE DESPUÉS de ambos, junto al anterior, y es el último
-- bloque del fichero. Solo se revoca a `web_readonly`: `web_coverage` conserva su S/I/U/D. La migración
-- 0020 hace el mismo REVOKE al crear la tabla; si el bootstrap corre antes, no hay nada que revocar.
DO $$
BEGIN
  IF to_regclass('public.proxy_rate_limit') IS NOT NULL THEN
    REVOKE ALL ON TABLE proxy_rate_limit FROM web_readonly;
  END IF;
END
$$;

-- Deduplicación duradera de avisos operativos (ROADMAP 3.4, decisión 259, D17, R7.3): tabla SOLO del propietario
-- (`apps/ingestion`). Mismo motivo que las dos anteriores: los `GRANT SELECT ON ALL TABLES` y los privilegios
-- por defecto de más arriba le darían SELECT a `web_readonly`, así que este REVOKE va SIEMPRE DESPUÉS de
-- ambos, junto a los anteriores, y es el último bloque del fichero. A diferencia del limitador, se revoca a
-- AMBOS roles web. La migración 0022 hace el mismo REVOKE al crear la tabla; si el bootstrap corre antes, no hay
-- nada que revocar.
DO $$
BEGIN
  IF to_regclass('public.alert_dispatch_log') IS NOT NULL THEN
    REVOKE ALL ON TABLE alert_dispatch_log FROM web_readonly, web_coverage;
  END IF;
END
$$;
