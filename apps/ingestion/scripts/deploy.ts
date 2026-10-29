// ROADMAP 3.4 (decisión 257, D9) — composition root del despliegue: migraciones, roles, privilegios, semillas
// y comprobaciones contra la URL DIRECTA del propietario (`DIRECT_DATABASE_URL`). ÚNICO lector de
// `process.env` de esta herramienta; los pasos viven en `packages/db` (`@buscahogar/db/deploy`). Sin test
// de unidad propio (mismo precedente que `set-monthly-quota.ts`): la validación del entorno se prueba en
// `test/deploy-env.test.ts` y el comportamiento extremo a extremo (exit codes, idempotencia, sin secretos en
// el registro) en `test/db/deploy-script.db.test.ts`, que ejecuta este script como proceso.
//
// Una línea JSON por evento en la salida estándar (errores en la de error): `{ts, component, level, step,
// msg, ...}`. Nunca contiene contraseñas, verificadores ni URL de conexión.
//
// Códigos de salida: 0 hecho (incluida una ejecución sin cambios) · 1 un paso falló (nombrado) · 2 configuración
// inválida o secreto ausente, antes de cualquier cambio · 3 base inaccesible · 4 comprobación posterior fallida
// (inicio de sesión de un rol, jit, matriz de privilegios).
//
// Uso local (tras `pnpm --filter @buscahogar/db build`): `node --import tsx scripts/deploy.ts`; en producción,
// el JS compilado: `node dist-runtime/scripts/deploy.js` (`pnpm --filter @buscahogar/ingestion build:runtime`).
import { fileURLToPath } from 'node:url';

import { DeployError, EXIT_CODES, runDeploy } from '@buscahogar/db/deploy';
import type { DeployLogEvent } from '@buscahogar/db/deploy';

import { readDeployConfig } from '../src/deploy/deploy-env.js';

export interface DeployOutput {
  stdout(line: string): void;
  stderr(line: string): void;
}

function emit(output: DeployOutput, event: DeployLogEvent): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), component: 'deploy', ...event });
  if (event.level === 'error') {
    output.stderr(line);
  } else {
    output.stdout(line);
  }
}

// Devuelve el código de salida; `main` no llama a `process.exit` (el pool lo cierra `runDeploy`).
export async function main(
  env: Readonly<Record<string, string | undefined>>,
  output: DeployOutput
): Promise<number> {
  const config = readDeployConfig(env);
  if (!config.ok) {
    for (const issue of config.issues) {
      emit(output, { level: 'error', step: 'config', msg: issue });
    }
    return EXIT_CODES.config;
  }

  try {
    await runDeploy(config.config, (event) => {
      emit(output, event);
    });
    return EXIT_CODES.ok;
  } catch (error) {
    if (error instanceof DeployError) {
      emit(output, { level: 'error', step: error.step, msg: error.message, exit_code: error.exitCode });
      return error.exitCode;
    }
    // Un error no tipificado no debería escapar de `runDeploy`; si lo hace, no se imprime su contenido.
    emit(output, { level: 'error', step: 'deploy', msg: 'unexpected failure', exit_code: EXIT_CODES.step });
    return EXIT_CODES.step;
  }
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main(process.env, {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  }).then((code) => {
    process.exitCode = code;
  });
}
