// ROADMAP 3.4 (decisión 263 parte C; D22; R12.2) — `pnpm env:check [--target local|production]`: comprueba el
// ENTORNO DEL PROCESO contra las mismas reglas Zod que el runtime (`server/env-classifier.ts`) y sale con 0/1.
//
//   local        (por defecto) sale 1 solo si hay errores.
//   production   sale 1 con errores Y con avisos de producción (identidad del titular, teselas por defecto).
//
// Reglas del proyecto: imprime NOMBRES de variable y motivos fijos, jamás valores; no lee ni escribe ningún
// `.env*` (solo inspecciona `process.env`; si quieres comprobar un fichero, cárgalo tú en el entorno:
// `node --env-file=<fichero> --import tsx scripts/env-check.ts`, y Node —no este script— lo lee).
//
// Códigos de salida: 0 sin problemas bloqueantes · 1 hay problemas · 2 uso incorrecto (argumentos).
import { fileURLToPath } from 'node:url';

import { classifyEnv, envCheckExitCode, parseEnvTarget, renderEnvReport } from '../src/server/env-classifier';

export interface EnvCheckOutput {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function main(
  env: Readonly<Record<string, string | undefined>>,
  argv: readonly string[],
  output: EnvCheckOutput
): number {
  const target = parseEnvTarget(argv);
  if (target === null) {
    output.stderr('uso: env:check [--target local|production]');
    return 2;
  }
  const issues = classifyEnv(env, target);
  output.stdout(renderEnvReport(issues, target));
  return envCheckExitCode(issues, target);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env, process.argv.slice(2), {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  });
}
