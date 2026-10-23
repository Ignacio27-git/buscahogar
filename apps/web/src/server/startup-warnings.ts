// ROADMAP 3.4 (decisión 263 parte C; D22; R10.4) — avisos de arranque de apps/web. Lo llama `register()` de
// `instrumentation.ts` (Next 16 lo invoca UNA vez al iniciar la instancia del servidor, antes de atender
// peticiones). Registra, como líneas JSON, el clasificador de entorno con destino `production`:
//
//   - `production-warning` → `console.warn`  `{ts, level:"warn",  component:"web", msg:"production-warning", name, reason}`
//   - `error`              → `console.error` `{ts, level:"error", component:"web", msg:"env-error", name, reason}`
//
// Un aviso NUNCA hace fallar el arranque (R10.4). Tampoco un error: apps/web mantiene su fallo perezoso y
// nombrado en el punto de uso (decisiones 066 y 078), y `pnpm env:check --target production` es la puerta previa
// al despliegue. Solo nombres y motivos fijos; jamás valores.
import { classifyEnv } from './env-classifier';
import type { EnvIssue } from './env-classifier';

let emitted = false;

// Solo para los tests: el proceso real emite una vez.
export function resetStartupWarningsForTests(): void {
  emitted = false;
}

function line(level: 'warn' | 'error', msg: string, issue: EnvIssue): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: 'web',
    msg,
    name: issue.name,
    reason: issue.reason,
  });
}

export function emitStartupWarnings(env: Readonly<Record<string, string | undefined>>): void {
  if (emitted) {
    return;
  }
  emitted = true;
  for (const issue of classifyEnv(env, 'production')) {
    if (issue.severity === 'error') {
      console.error(line('error', 'env-error', issue));
    } else {
      console.warn(line('warn', 'production-warning', issue));
    }
  }
}
