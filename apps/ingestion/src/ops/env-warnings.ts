// ROADMAP 3.4 (decisión 258 parte; D22) — avisos de PRODUCCIÓN del worker: configuración que no impide arrancar
// (no es un error: el worker corre) pero que en producción conviene tener. Función PURA que devuelve solo
// NOMBRES de variable y motivos fijos, nunca valores; el worker los registra UNA vez al arrancar como `warn`
// JSON. Es la base del clasificador compartido de S8 (`env:check --target production` usará la misma lista).
export interface EnvIssue {
  readonly name: string;
  readonly severity: 'production-warning';
  readonly reason: string;
}

export function classifyWorkerEnv(env: Readonly<Record<string, string | undefined>>): readonly EnvIssue[] {
  const issues: EnvIssue[] = [];
  if ((env['HEARTBEAT_URL'] ?? '').trim() === '') {
    issues.push({
      name: 'HEARTBEAT_URL',
      severity: 'production-warning',
      reason: "sin latido (dead-man's-switch) nadie se entera de que el worker ha dejado de funcionar",
    });
  }
  return issues;
}
