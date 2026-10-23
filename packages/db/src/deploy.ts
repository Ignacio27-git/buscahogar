// ROADMAP 3.4 (decisión 257, D9; R5.1-R5.8, R2.3) — orquestación del despliegue. Pasos, en orden, contra la
// URL DIRECTA del propietario (nunca un pooler: DDL y sesión estable, decisión 256):
//   1. connect   — la base responde (exit 3 si no).
//   2. migrate   — migraciones por programa, sin drizzle-kit (`migrate.ts`).
//   3. roles     — crea/rota los dos roles web con verificadores SCRAM (`provision-roles.ts`).
//   4. grants    — bootstrap de privilegios con el REVOKE al final y huella antes/después.
//   5. catalogue — catálogo municipal (y la fuente `idealista`), idempotente.
//   6. quota     — cuota mensual SOLO si el registro de la fuente está vacío y hay configuración.
//   7. verify    — jit apagado para `web_readonly` (decisión 264) y matriz final de privilegios (exit 4).
// La cuota se siembra DESPUÉS del catálogo (no antes, como numeraba R5.1): necesita el id de la fuente
// `idealista`, que crea la siembra del catálogo.
// Todo paso es repetible: un fallo en uno deja lo ya aplicado intacto y la repetición lo reconoce
// (R5.7, R5.8). Una segunda ejecución sin cambios informa «0 migrations, roles unchanged, privileges
// unchanged, seeds skipped». Los secretos no aparecen en ningún registro ni mensaje de error.
// Este módulo no lee `process.env` (decisión 024): solo `apps/ingestion/scripts/deploy.ts` lo hace.
import { eq, sql } from 'drizzle-orm';

import { seedMonthlyQuotaIfEmpty } from './budget-ledger.js';
import { createDb } from './db.js';
import { DeployCheckError, checkPrivilegeMatrix, ensureJitOff } from './deploy-verify.js';
import type { JitStrategy } from './deploy-verify.js';
import { silentLogger } from './deploy-log.js';
import type { DeployLogger } from './deploy-log.js';
import { runMigrations } from './migrate.js';
import { applyBootstrapGrants, DEFAULT_ROLE_NAMES } from './privilege-fingerprint.js';
import type { RoleNames } from './privilege-fingerprint.js';
import { provisionRoles, RoleConfigError, RoleProvisionError, roleLoginUrl } from './provision-roles.js';
import type { RoleOutcome } from './provision-roles.js';
import { seedReferenceDataIfNeeded } from './seed.js';
import type { MunicipalitySeed } from './seed-data.js';
import { sources } from './tables.js';

// Tabla de códigos de salida del despliegue (diseño D15, «Exit codes»).
export const EXIT_CODES = { ok: 0, step: 1, config: 2, unreachable: 3, check: 4 } as const;

export type DeployExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type DeployStep = 'config' | 'connect' | 'migrate' | 'roles' | 'grants' | 'catalogue' | 'quota' | 'verify';

export class DeployError extends Error {
  constructor(
    readonly step: DeployStep,
    readonly exitCode: DeployExitCode,
    message: string
  ) {
    super(message);
    this.name = 'DeployError';
  }
}

export interface QuotaSeedConfig {
  readonly totalCap: number;
  readonly reserve: number;
}

export interface DeployConfig {
  // URL DIRECTA del propietario (la que migra y crea roles).
  readonly ownerUrl: string;
  // Por defecto `web_readonly` y `web_coverage`; solo se cambian para dos entornos en un mismo servidor
  // (los roles son globales al servidor) o en pruebas.
  readonly roleNames?: RoleNames;
  readonly passwords: { readonly readonly: string; readonly coverage: string };
  // `null` = sin configuración de siembra de cuota (aviso si el registro está vacío; nunca se inventa una cifra).
  readonly quotaSeed: QuotaSeedConfig | null;
  // Solo para pruebas; por defecto, el catálogo completo del paquete.
  readonly catalogue?: readonly MunicipalitySeed[];
}

export interface DeployReport {
  readonly migrations: number;
  readonly roles: Readonly<Record<string, RoleOutcome>>;
  readonly privilegesChanged: boolean;
  readonly catalogue: 'seeded' | 'skipped';
  readonly quota: 'seeded' | 'skipped' | 'not-configured';
  readonly jit: JitStrategy;
  readonly summary: string;
}

const REDACTION = '***';

// Sustituye cada secreto (y su forma codificada en URL) por `***`. Defensa en profundidad: ningún paso
// incluye secretos en sus mensajes, pero los errores de librerías no son nuestros.
export function redactSecrets(text: string, secrets: readonly string[]): string {
  const variants = secrets
    .filter((secret) => secret !== '')
    .flatMap((secret) => [secret, encodeURIComponent(secret)])
    .sort((a, b) => b.length - a.length);
  return variants.reduce((current, secret) => current.split(secret).join(REDACTION), text);
}

function ownerPassword(url: string): string {
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return '';
  }
}

function validateConfig(config: DeployConfig): void {
  if (config.passwords.readonly.trim() === '' || config.passwords.coverage.trim() === '') {
    throw new DeployError('config', EXIT_CODES.config, 'Falta el secreto de un rol web (vacío o en blanco).');
  }
  const seed = config.quotaSeed;
  if (seed !== null) {
    const valid =
      Number.isInteger(seed.totalCap) && Number.isInteger(seed.reserve) && seed.totalCap > 0 && seed.reserve >= 0 && seed.reserve < seed.totalCap;
    if (!valid) {
      throw new DeployError(
        'config',
        EXIT_CODES.config,
        'La siembra de cuota exige un total entero > 0 y una reserva entera >= 0 y menor que el total.'
      );
    }
  }
}

function describeRoles(roles: Readonly<Record<string, RoleOutcome>>): string {
  const changed = [...new Set(Object.values(roles).filter((outcome) => outcome !== 'unchanged'))].sort();
  return changed.length === 0 ? 'unchanged' : changed.join('/');
}

export async function runDeploy(config: DeployConfig, log: DeployLogger = silentLogger): Promise<DeployReport> {
  validateConfig(config);
  const names = config.roleNames ?? DEFAULT_ROLE_NAMES;
  const secrets = [config.passwords.readonly, config.passwords.coverage, ownerPassword(config.ownerUrl), config.ownerUrl];
  const safe = (text: string): string => redactSecrets(text, secrets);

  // Convierte cualquier error no tipificado en un DeployError del paso con el mensaje redactado.
  async function inStep<T>(step: DeployStep, failure: DeployExitCode, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof DeployError) {
        throw error;
      }
      const message = safe(error instanceof Error ? error.message : String(error));
      if (error instanceof RoleConfigError) {
        throw new DeployError(step, EXIT_CODES.config, message);
      }
      if (error instanceof RoleProvisionError || error instanceof DeployCheckError) {
        throw new DeployError(step, EXIT_CODES.check, message);
      }
      throw new DeployError(step, failure, message);
    }
  }

  const { db, pool } = createDb(config.ownerUrl);
  try {
    await inStep('connect', EXIT_CODES.unreachable, async () => {
      await pool.query('select 1');
    });
    log({ level: 'info', step: 'connect', msg: 'database reachable' });

    const migrated = await inStep('migrate', EXIT_CODES.step, () => runMigrations(db));
    log({ level: 'info', step: 'migrate', msg: 'migrations applied', applied: migrated.applied });

    const roles = await inStep('roles', EXIT_CODES.step, () =>
      provisionRoles(
        pool,
        config.ownerUrl,
        [
          { name: names.readonly, password: config.passwords.readonly },
          { name: names.coverage, password: config.passwords.coverage },
        ],
        { log }
      )
    );

    const grants = await inStep('grants', EXIT_CODES.step, () => applyBootstrapGrants(pool, names));
    log({ level: 'info', step: 'grants', msg: grants.changed ? 'privileges changed' : 'privileges unchanged' });

    const catalogue = await inStep('catalogue', EXIT_CODES.step, () => seedReferenceDataIfNeeded(db, config.catalogue));
    log({ level: 'info', step: 'catalogue', msg: `catalogue ${catalogue}` });

    const quota = await inStep('quota', EXIT_CODES.step, async (): Promise<DeployReport['quota']> => {
      const [source] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, 'idealista'));
      if (!source) {
        throw new Error('La fuente `idealista` no existe tras sembrar el catálogo.');
      }
      if (config.quotaSeed !== null) {
        const seeded = await seedMonthlyQuotaIfEmpty(db, source.id, config.quotaSeed);
        log({ level: 'info', step: 'quota', msg: seeded.seeded ? 'monthly quota seeded' : 'monthly quota already set' });
        return seeded.seeded ? 'seeded' : 'skipped';
      }
      const { rows } = await db.execute<{ present: boolean }>(
        sql`select exists (select 1 from monthly_request_budget where source_id = ${source.id}) as present`
      );
      if (rows[0]?.present === true) {
        return 'skipped';
      }
      log({
        level: 'warn',
        step: 'quota',
        msg:
          'monthly quota registry is empty and SEED_MONTHLY_QUOTA_TOTAL / SEED_MONTHLY_QUOTA_RESERVE are not set: ' +
          'the worker stays fail-closed until set-monthly-quota is run',
      });
      return 'not-configured';
    });

    const jit = await inStep('verify', EXIT_CODES.step, async () => {
      const strategy = await ensureJitOff(pool, roleLoginUrl(config.ownerUrl, names.readonly, config.passwords.readonly), names.readonly, log);
      const failures = await checkPrivilegeMatrix(pool, names);
      if (failures.length > 0) {
        throw new DeployCheckError('privileges', `Matriz de privilegios incorrecta: ${failures.join('; ')}`);
      }
      return strategy;
    });

    const seedsApplied = catalogue === 'seeded' || quota === 'seeded';
    const summary =
      `${String(migrated.applied)} migrations, roles ${describeRoles(roles)}, ` +
      `privileges ${grants.changed ? 'changed' : 'unchanged'}, seeds ${seedsApplied ? 'applied' : 'skipped'}`;
    log({ level: 'info', step: 'deploy', msg: 'deploy complete', summary });
    return { migrations: migrated.applied, roles, privilegesChanged: grants.changed, catalogue, quota, jit, summary };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export { DEFAULT_ROLE_NAMES } from './privilege-fingerprint.js';
export type { RoleNames } from './privilege-fingerprint.js';
export type { DeployLogEvent, DeployLogger } from './deploy-log.js';
export { parseExpectedRowCounts, RESTORE_CHECKS, runRestoreChecks } from './restore-verify.js';
export type { RestoreCheckName, RestoreCheckResult } from './restore-verify.js';
export { DeployCheckError, OWNER_ONLY_TABLES } from './deploy-verify.js';
