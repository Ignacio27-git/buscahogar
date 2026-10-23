// ROADMAP 3.4 (decisión 260, D18; R8.4) — comprobaciones del simulacro de restauración contra la URL DIRECTA de
// la base restaurada (`DIRECT_DATABASE_URL`). Lo invoca `ops/backup/restore-drill.sh` DESPUÉS de restaurar la
// copia y de repetir el aprovisionamiento (`deploy.ts`); la lógica vive en `@buscahogar/db/deploy`
// (`runRestoreChecks`) y reutiliza la matriz de privilegios del despliegue, no una copia. ÚNICO lector de
// `process.env` de esta herramienta.
//
// Una línea JSON por comprobación en la salida estándar: `{ts, component, level, step, check, ok, msg}`; los fallos
// además en la de error. Nunca contiene contraseñas ni la URL de conexión.
//
// Códigos de salida: 0 todas las comprobaciones pasan · 2 configuración inválida · 3 base inaccesible ·
// 4 alguna comprobación falló (se nombran en el mensaje final, p. ej. `failed checks: privilege-matrix`).
//
// En producción: `node dist-runtime/scripts/restore-verify.js`.
import { fileURLToPath } from 'node:url';

import { createDb } from '@buscahogar/db';
import { runRestoreChecks } from '@buscahogar/db/deploy';

import { readRestoreVerifyConfig } from '../src/deploy/restore-verify-env.js';

export interface VerifyOutput {
  stdout(line: string): void;
  stderr(line: string): void;
}

const EXIT = { ok: 0, config: 2, unreachable: 3, check: 4 } as const;

function emit(output: VerifyOutput, level: 'info' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), component: 'restore-verify', level, step: 'verify', ...fields });
  if (level === 'error') {
    output.stderr(line);
  } else {
    output.stdout(line);
  }
}

// Devuelve el código de salida; `main` no llama a `process.exit`.
export async function main(env: Readonly<Record<string, string | undefined>>, output: VerifyOutput): Promise<number> {
  const config = readRestoreVerifyConfig(env);
  if (!config.ok) {
    for (const issue of config.issues) {
      emit(output, 'error', { msg: issue });
    }
    return EXIT.config;
  }

  const { pool } = createDb(config.config.url);
  try {
    try {
      await pool.query('select 1');
    } catch {
      emit(output, 'error', { msg: 'database unreachable' });
      return EXIT.unreachable;
    }

    const results = await runRestoreChecks(pool, {
      names: config.config.names,
      expectedRowCounts: config.config.expectedRowCounts,
    });
    for (const result of results) {
      emit(output, result.ok ? 'info' : 'error', { check: result.check, ok: result.ok, msg: result.detail });
    }
    const failed = results.filter((result) => !result.ok).map((result) => result.check);
    if (failed.length > 0) {
      emit(output, 'error', { msg: `failed checks: ${failed.join(', ')}`, exit_code: EXIT.check });
      return EXIT.check;
    }
    emit(output, 'info', { msg: 'all restore checks passed' });
    return EXIT.ok;
  } catch {
    // Un error no previsto no imprime su contenido (podría arrastrar la URL).
    emit(output, 'error', { msg: 'unexpected failure', exit_code: EXIT.check });
    return EXIT.check;
  } finally {
    await pool.end().catch(() => undefined);
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
