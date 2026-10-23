// ROADMAP 3.4 (decisión 263 parte C; D22; R12.2) — clasificador de entorno de apps/ingestion: UNA lista de
// problemas, con dos severidades, que comparten el arranque del worker y `pnpm env:check`.
//
//   error               la configuración es inválida o falta una variable obligatoria. Se obtiene con los MISMOS
//                       lectores Zod que el runtime (`readEnv` del worker, `readDeployConfig` del despliegue), que
//                       llegan INYECTADOS (`EnvReaders`): este módulo vive en `src/` y los lectores del worker
//                       están en `scripts/`; `scripts/env-check.ts` los cablea.
//   production-warning  el servicio funciona, pero en producción conviene configurarlo (latido, Telegram). Las
//                       reglas son las de `env-warnings.ts` (`classifyWorkerEnv`), que el worker ya registra al
//                       arrancar: una sola definición, así que `env:check --target production` nombra
//                       exactamente lo que el worker avisaría. Solo el servicio `worker` y solo con destino
//                       `production`.
//
// Solo NOMBRES de variable y motivos FIJOS: ni un valor ni el mensaje de un lector (que podría citar una URL, un
// token o un secreto). Función pura: no lee `process.env` ni ficheros `.env*`.
import { ENV_MANIFEST } from './env-manifest.js';
import type { EnvService } from './env-manifest.js';
import { classifyWorkerEnv } from './env-warnings.js';

export type { EnvService } from './env-manifest.js';
export type EnvTarget = 'local' | 'production';
export type EnvSeverity = 'error' | 'production-warning';
export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface EnvIssue {
  readonly name: string;
  readonly severity: EnvSeverity;
  readonly reason: string;
}

// Los lectores reales, inyectados. `worker` lanza (cualquier `Error`) si el entorno es inválido; `deploy`
// devuelve los mensajes de sus problemas (vacío = válido).
export interface EnvReaders {
  readonly worker: (env: EnvSource) => void;
  readonly deploy: (env: EnvSource) => readonly string[];
}

// Servicios que `env:check` sabe comprobar. Las copias de seguridad y el simulacro validan su propio entorno
// (shell, salen con 2); su inventario está en el manifiesto y en `docs/DEPLOYMENT.md`.
export const CHECKABLE_SERVICES = ['worker', 'deploy'] as const satisfies readonly EnvService[];
export type CheckableService = (typeof CHECKABLE_SERVICES)[number];

const MISSING = 'falta o está en blanco';
const INVALID = 'valor inválido (el valor no se muestra)';

// Solo este mensaje de `readEnv` no nombra la variable (nombra el campo de core). Los tres umbrales.
const BLOCKING_VARIABLES = ['BLOCKING_RADIUS_METERS', 'BLOCKING_PRICE_BAND_CENTS', 'BLOCKING_SURFACE_TOLERANCE_M2'];
// `OPERATION` ya no es una variable: `readEnv` la rechaza por su nombre (decisión 252).
const RETIRED_VARIABLES = ['OPERATION'];

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function error(name: string, reason: string): EnvIssue {
  return { name, severity: 'error', reason };
}

function mentions(message: string, name: string): boolean {
  return new RegExp(`(?<![A-Z0-9_])${name}(?![A-Z0-9_])`).test(message);
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : '';
}

function manifestNames(service: EnvService): string[] {
  return ENV_MANIFEST[service].map((spec) => spec.name);
}

function workerErrors(env: EnvSource, readers: EnvReaders): EnvIssue[] {
  const missing = ENV_MANIFEST.worker
    .filter((spec) => spec.required === 'sí' && isBlank(env[spec.name]))
    .map((spec) => error(spec.name, MISSING));
  if (missing.length > 0) {
    return missing;
  }
  try {
    readers.worker(env);
    return [];
  } catch (caught) {
    const message = messageOf(caught);
    // Todas las variables que el mensaje nombra, en el orden del inventario (un mensaje puede nombrar un par).
    const named = [...manifestNames('worker'), ...RETIRED_VARIABLES].filter((name) => mentions(message, name));
    return (named.length > 0 ? named : BLOCKING_VARIABLES).map((name) => error(name, INVALID));
  }
}

function deployErrors(env: EnvSource, readers: EnvReaders): EnvIssue[] {
  const messages = readers.deploy(env);
  const candidates = manifestNames('deploy');
  const issues: EnvIssue[] = [];
  for (const message of messages) {
    // El sujeto de un mensaje es la primera variable que nombra (algunos mencionan una segunda como contexto).
    const subject = candidates
      .map((name) => ({ name, at: message.search(new RegExp(`(?<![A-Z0-9_])${name}(?![A-Z0-9_])`)) }))
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (subject !== undefined && !issues.some((issue) => issue.name === subject.name)) {
      issues.push(error(subject.name, isBlank(env[subject.name]) ? MISSING : INVALID));
    }
  }
  if (issues.length === 0 && messages.length > 0) {
    issues.push(error('DIRECT_DATABASE_URL', INVALID));
  }
  return issues;
}

export function classifyEnv(
  env: EnvSource,
  target: EnvTarget,
  service: CheckableService,
  readers: EnvReaders
): readonly EnvIssue[] {
  const errors = service === 'worker' ? workerErrors(env, readers) : deployErrors(env, readers);
  if (target !== 'production' || service !== 'worker') {
    return errors;
  }
  return [...errors, ...classifyWorkerEnv(env)];
}

// `local`: solo los errores hacen fallar. `production`: también los avisos (D22: «mismo listado, mismos nombres»).
export function envCheckExitCode(issues: readonly EnvIssue[], target: EnvTarget): 0 | 1 {
  const failing = issues.some((issue) => issue.severity === 'error' || target === 'production');
  return failing ? 1 : 0;
}

export function renderEnvReport(issues: readonly EnvIssue[], target: EnvTarget, service: CheckableService): string {
  const scope = `${target}, ${service}`;
  if (issues.length === 0) {
    return `env:check (${scope}): sin problemas.`;
  }
  const lines = issues.map((issue) => {
    const label = issue.severity === 'error' ? 'ERROR' : 'AVISO DE PRODUCCIÓN';
    return `${label}  ${issue.name}  ${issue.reason}`;
  });
  return [`env:check (${scope}): ${String(issues.length)} problema(s).`, ...lines].join('\n');
}

export interface EnvCheckArgs {
  readonly target: EnvTarget;
  readonly service: CheckableService;
}

function isTarget(value: string | undefined): value is EnvTarget {
  return value === 'local' || value === 'production';
}

function isService(value: string | undefined): value is CheckableService {
  return (CHECKABLE_SERVICES as readonly (string | undefined)[]).includes(value);
}

// `--target local|production` y `--service worker|deploy`, cada uno con `--x valor` o `--x=valor`. Por defecto
// `local` y `worker`. Cualquier otra cosa devuelve `null`: un argumento mal escrito no se adivina (sale 2).
export function parseEnvCheckArgs(argv: readonly string[]): EnvCheckArgs | null {
  const args = argv.filter((arg) => arg !== '--');
  let target: EnvTarget = 'local';
  let service: CheckableService = 'worker';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const value = inline ?? args[index + 1];
    if (inline === undefined) {
      index += 1;
    }
    if (flag === '--target' && isTarget(value)) {
      target = value;
    } else if (flag === '--service' && isService(value)) {
      service = value;
    } else {
      return null;
    }
  }
  return { target, service };
}
