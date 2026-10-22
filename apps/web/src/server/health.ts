// ROADMAP 3.4 (decisión 263, D8; R4.1-R4.3) — lógica de `/api/health`, separada de la ruta porque un
// fichero `route.ts` de Next solo puede exportar los manejadores y la configuración de segmento.
//
// El cuerpo es EXACTAMENTE `{status:"ok"}` o `{status:"degraded"}`: nada de versión, entorno, host ni
// mensaje de error (R4.2). Una sonda lenta, que lanza o cuya credencial falta cuenta igual: `degraded`.

// Plazo de la sonda: una base que tarda más de 1 s para `select 1` ya no está sana.
export const HEALTH_TIMEOUT_MS = 1000;

export type HealthStatus = 'ok' | 'degraded';

export async function runHealthCheck(probe: () => Promise<unknown>, timeoutMs: number): Promise<HealthStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<HealthStatus>((resolve) => {
    timer = setTimeout(() => {
      resolve('degraded');
    }, timeoutMs);
  });
  const attempt = (async (): Promise<HealthStatus> => {
    try {
      await probe();
      return 'ok';
    } catch {
      return 'degraded';
    }
  })();
  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function buildHealthResponse(status: HealthStatus): Response {
  return Response.json(
    { status },
    { status: status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
