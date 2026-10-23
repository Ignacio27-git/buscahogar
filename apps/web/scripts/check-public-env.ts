// ROADMAP 3.4 (decisión 263 parte C; D22; R12.3, NF2) — `pnpm check:public-env`: ninguna credencial puede
// exponerse como `NEXT_PUBLIC_*` (Next la incrustaría en el JavaScript de cada navegador). Comprueba
//   1. los NOMBRES del entorno del proceso, y
//   2. el contenido de los ficheros versionados (`git ls-files`), SIN abrir nunca un `.env*`.
// El patrón y la exclusión viven en `src/lib/public-env.ts` (probados en `test/public-env.test.ts`).
//
// Imprime ficheros, líneas y nombres; nunca el texto que rodea al nombre ni valores del entorno.
// Códigos de salida: 0 limpio · 1 hay credenciales NEXT_PUBLIC_* · 2 no se pudo listar el repositorio.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { forbiddenPublicEnvNames, scanFilesForPublicEnv } from '../src/lib/public-env';

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Texto del fichero, o `null` si es binario (contiene NUL) o no se puede leer (borrado, enlace roto).
function readText(root: string, path: string): string | null {
  try {
    const buffer = readFileSync(join(root, path));
    return buffer.includes(0) ? null : buffer.toString('utf8');
  } catch {
    return null;
  }
}

export function main(env: Readonly<Record<string, string | undefined>>): number {
  let root: string;
  let paths: string[];
  try {
    root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
    paths = git(['ls-files', '-z'], root)
      .split('\0')
      .filter((path) => path !== '');
  } catch {
    process.stderr.write('check:public-env: no se pudo listar los ficheros versionados (git ls-files).\n');
    return 2;
  }

  const envNames = forbiddenPublicEnvNames(Object.keys(env));
  const findings = scanFilesForPublicEnv(paths, (path) => readText(root, path));

  for (const name of envNames) {
    process.stdout.write(`ERROR  entorno  ${name}\n`);
  }
  for (const finding of findings) {
    process.stdout.write(`ERROR  ${finding.file}:${String(finding.line)}  ${finding.name}\n`);
  }
  if (envNames.length > 0 || findings.length > 0) {
    process.stdout.write(
      'check:public-env: una variable NEXT_PUBLIC_* con nombre de credencial acabaría en el navegador de cada visitante.\n'
    );
    return 1;
  }
  process.stdout.write(
    `check:public-env: sin credenciales NEXT_PUBLIC_* (${String(paths.length)} ficheros versionados y el entorno).\n`
  );
  return 0;
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.env);
}
