// ROADMAP 3.4 (decisión 263 parte C; D22; R10.4, R12.2) — clasificador de entorno de apps/web: UNA lista de
// problemas, con dos severidades, que comparten el arranque (`instrumentation.ts`, avisos de producción) y
// `pnpm env:check` (`scripts/env-check.ts`).
//
//   error               la configuración es inválida o falta una variable obligatoria. Usa los MISMOS lectores
//                       Zod que el runtime (`server/env.ts`, `lib/tile-config.ts`, `lib/site-indexing.ts`,
//                       `server/legal-identity.ts`), recibiendo el entorno como parámetro: el clasificador no
//                       puede aceptar lo que el runtime rechaza.
//   production-warning  la aplicación funciona, pero en producción conviene configurarlo: identidad del titular
//                       (`LEGAL_OWNER_*`) y proveedor de teselas propio (`TILE_URL_TEMPLATE`). Solo con destino
//                       `production`.
//
// Solo NOMBRES de variable y motivos FIJOS: ni un valor, ni el mensaje de un error de Zod (que podría citar
// una URL o una clave). Es una función pura; no lee `process.env` ni ficheros `.env*`.
//
// Paridad con el worker (`apps/ingestion/src/ops/env-classifier.ts`): mismo tipo de problema, mismo informe, el
// mismo código de salida; las listas de cada app son las suyas porque las apps no se importan entre sí.
import { InvalidSiteIndexingError } from '../lib/site-indexing';
import { DEFAULT_TILE_URL_TEMPLATE, InvalidTileConfigError } from '../lib/tile-config';
import { forbiddenPublicEnvNames } from '../lib/public-env';
import {
  invalidClientLimitVariables,
  readNewZonesDailyCap,
  readSiteIndexing,
  readTileConfig,
} from './env';
import type { EnvSource } from './env';
import { InvalidLegalIdentityError, legalIdentityStartupWarning, parseLegalIdentity } from './legal-identity';

export type EnvTarget = 'local' | 'production';
export type EnvSeverity = 'error' | 'production-warning';

export interface EnvIssue {
  readonly name: string;
  readonly severity: EnvSeverity;
  readonly reason: string;
}

const MISSING = 'falta o está en blanco';
const INVALID = 'valor inválido (el valor no se muestra)';
const PUBLIC_CREDENTIAL =
  'variable NEXT_PUBLIC_* con nombre de credencial: Next la incrustaría en el JavaScript de cada navegador';
const LEGAL_IDENTITY_MISSING =
  'sin definir: las páginas legales muestran el marcador «[Pendiente de configurar: …]» en lugar de la identidad del titular (decisión 263)';
const DEFAULT_TILES =
  'proveedor de teselas por defecto (OpenStreetMap): su política de uso no ampara el tráfico de una web en ' +
  'producción; define TILE_URL_TEMPLATE y TILE_ATTRIBUTION de un proveedor con acuerdo (decisión 261)';

const TILE_VARIABLES = ['TILE_URL_TEMPLATE', 'TILE_ATTRIBUTION'] as const;
const SITE_VARIABLES = ['SITE_INDEXING', 'SITE_URL'] as const;
const LEGAL_VARIABLES = ['LEGAL_OWNER_NAME', 'LEGAL_OWNER_TAX_ID', 'LEGAL_OWNER_ADDRESS', 'LEGAL_OWNER_EMAIL'] as const;

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function error(name: string, reason: string): EnvIssue {
  return { name, severity: 'error', reason };
}

// Los mensajes de error de los lectores nombran la variable afectada: se conservan solo los nombres conocidos
// que aparecen en el mensaje (en el orden fijo de `candidates`), nunca el mensaje.
function namedIn(message: string, candidates: readonly string[]): string[] {
  return candidates.filter((name) => message.includes(name));
}

function presenceError(env: EnvSource, name: string, read: () => unknown): EnvIssue[] {
  if (isBlank(env[name])) {
    return [error(name, MISSING)];
  }
  try {
    read();
    return [];
  } catch {
    return [error(name, INVALID)];
  }
}

function configurationErrors(env: EnvSource): EnvIssue[] {
  const issues: EnvIssue[] = [];
  issues.push(...presenceError(env, 'DATABASE_URL', () => undefined));
  issues.push(...presenceError(env, 'WEB_COVERAGE_DATABASE_URL', () => undefined));
  issues.push(...presenceError(env, 'NEW_ZONES_DAILY_CAP', () => readNewZonesDailyCap(env)));

  for (const name of invalidClientLimitVariables(env)) {
    issues.push(error(name, isBlank(env[name]) ? MISSING : INVALID));
  }

  try {
    readTileConfig(env);
  } catch (caught) {
    if (caught instanceof InvalidTileConfigError) {
      issues.push(...namedIn(caught.message, TILE_VARIABLES).map((name) => error(name, INVALID)));
    }
  }
  try {
    readSiteIndexing(env);
  } catch (caught) {
    if (caught instanceof InvalidSiteIndexingError) {
      issues.push(...namedIn(caught.message, SITE_VARIABLES).map((name) => error(name, INVALID)));
    }
  }
  try {
    parseLegalIdentity(env);
  } catch (caught) {
    if (caught instanceof InvalidLegalIdentityError) {
      issues.push(...namedIn(caught.message, LEGAL_VARIABLES).map((name) => error(name, INVALID)));
    }
  }

  for (const name of forbiddenPublicEnvNames(Object.keys(env))) {
    issues.push(error(name, PUBLIC_CREDENTIAL));
  }
  return issues;
}

// Avisos de producción: solo cuando la configuración es válida (si una variable es inválida, el error ya la
// nombra). Orden estable: identidad del titular y, por último, teselas.
function productionWarnings(env: EnvSource): EnvIssue[] {
  const warnings: EnvIssue[] = [];
  try {
    const identity = parseLegalIdentity(env);
    // `legalIdentityStartupWarning` (decisión 263 parte B) decide SI hay aviso (producción con la identidad
    // incompleta); aquí se desglosa por variable, con un motivo corto, para que cada línea del registro sea
    // independiente y el informe de `env:check` no repita la misma frase cuatro veces.
    if (legalIdentityStartupWarning(identity, 'production') !== null) {
      warnings.push(
        ...identity.missing.map((name) => ({ name, severity: 'production-warning' as const, reason: LEGAL_IDENTITY_MISSING }))
      );
    }
  } catch {
    // Identidad inválida: ya es un error nombrado.
  }
  const template = env['TILE_URL_TEMPLATE'];
  if (isBlank(template) || template?.trim() === DEFAULT_TILE_URL_TEMPLATE) {
    warnings.push({ name: 'TILE_URL_TEMPLATE', severity: 'production-warning', reason: DEFAULT_TILES });
  }
  return warnings;
}

export function classifyEnv(env: EnvSource, target: EnvTarget): readonly EnvIssue[] {
  const errors = configurationErrors(env);
  return target === 'production' ? [...errors, ...productionWarnings(env)] : errors;
}

// `local`: solo los errores hacen fallar. `production`: también los avisos (D22: «mismo listado, mismos nombres»).
export function envCheckExitCode(issues: readonly EnvIssue[], target: EnvTarget): 0 | 1 {
  const failing = issues.some((issue) => issue.severity === 'error' || target === 'production');
  return failing ? 1 : 0;
}

export function renderEnvReport(issues: readonly EnvIssue[], target: EnvTarget): string {
  if (issues.length === 0) {
    return `env:check (${target}): sin problemas.`;
  }
  const lines = issues.map((issue) => {
    const label = issue.severity === 'error' ? 'ERROR' : 'AVISO DE PRODUCCIÓN';
    return `${label}  ${issue.name}  ${issue.reason}`;
  });
  return [`env:check (${target}): ${String(issues.length)} problema(s).`, ...lines].join('\n');
}

// `--target local|production` (también `--target=production`). Sin argumento, `local`. Cualquier otra cosa
// devuelve `null`: un destino mal escrito no se adivina (el llamador sale con 2).
export function parseEnvTarget(argv: readonly string[]): EnvTarget | null {
  const args = argv.filter((arg) => arg !== '--');
  if (args.length === 0) {
    return 'local';
  }
  const first = args[0] ?? '';
  const value = first === '--target' ? args[1] : first.startsWith('--target=') ? first.slice('--target='.length) : undefined;
  return args.length <= 2 && (value === 'local' || value === 'production') ? value : null;
}
