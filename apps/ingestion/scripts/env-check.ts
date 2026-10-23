// ROADMAP 3.4 (decisión 263 parte C; D22; R12.2) — `pnpm env:check [--target local|production] [--service
// worker|deploy]`: comprueba el ENTORNO DEL PROCESO contra las mismas reglas Zod que el runtime y sale con 0/1.
//
//   --service worker   (por defecto) el entorno de `scripts/coverage-worker.ts` (`readEnv`).
//   --service deploy   el del despliegue (`readDeployConfig`): sin `DIRECT_DATABASE_URL` sale 1 y la nombra.
//   --target local     (por defecto) sale 1 solo si hay errores.
//   --target production sale 1 con errores Y con avisos de producción (latido, Telegram): son los mismos avisos
//                      que el worker registra al arrancar (`src/ops/env-warnings.ts`).
//
// Reglas del proyecto: imprime NOMBRES de variable y motivos fijos, jamás valores; no lee ni escribe ningún
// `.env*` (solo inspecciona `process.env`; para comprobar un fichero, cárgalo tú en el entorno con
// `node --env-file=<fichero> --import tsx scripts/env-check.ts`: lo lee Node, no este script). Las copias de
// seguridad y el simulacro (shell) validan su propio entorno y salen con 2.
//
// Códigos de salida: 0 sin problemas bloqueantes · 1 hay problemas · 2 uso incorrecto (argumentos).
import { fileURLToPath } from 'node:url';

import { readDeployConfig } from '../src/deploy/deploy-env.js';
import { classifyEnv, envCheckExitCode, parseEnvCheckArgs, renderEnvReport } from '../src/ops/env-classifier.js';
import type { EnvReaders } from '../src/ops/env-classifier.js';
import { readEnv } from './coverage-worker.js';

const READERS: EnvReaders = {
  worker: (env) => {
    readEnv(env);
  },
  deploy: (env) => {
    const result = readDeployConfig(env);
    return result.ok ? [] : result.issues;
  },
};

export interface EnvCheckOutput {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function main(
  env: Readonly<Record<string, string | undefined>>,
  argv: readonly string[],
  output: EnvCheckOutput
): number {
  const args = parseEnvCheckArgs(argv);
  if (args === null) {
    output.stderr('uso: env:check [--target local|production] [--service worker|deploy]');
    return 2;
  }
  const issues = classifyEnv(env, args.target, args.service, READERS);
  output.stdout(renderEnvReport(issues, args.target, args.service));
  return envCheckExitCode(issues, args.target);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env, process.argv.slice(2), {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  });
}
