// ROADMAP 3.4 (decisión 259, D17; R7.2, R7.5) — comprobaciones PURAS de los avisos operativos. Reciben una
// FOTO del estado (la compone `apps/ingestion`, que es quien lee la base de datos) y devuelven los avisos
// candidatos: clave de deduplicación, gravedad, texto en español y enfriamiento. No leen reloj ni red, y no
// deciden si un aviso se envía: eso es `throttle.ts` (enfriamiento persistido, tope por tick, resumen).
//
// Los textos NO llevan secretos, URL, direcciones IP ni identificadores de job: solo cifras agregadas (R7.5).
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AlertCandidate {
  // Clave de deduplicación. Las que dependen del día o del mes lo llevan dentro (`quota-80:2026-10`), de modo
  // que un día o mes nuevo es otra clave aunque el enfriamiento no haya vencido.
  readonly dedupKey: string;
  readonly severity: AlertSeverity;
  readonly text: string;
  // Tiempo mínimo entre dos envíos de la MISMA clave.
  readonly cooldownMs: number;
}

export interface AlertQuotaState {
  readonly totalCap: number;
  readonly searchRequests: number;
}

export interface AlertSnapshot {
  readonly now: Date;
  // Jobs `failed` cuyo fin cae dentro de la ventana configurada.
  readonly failedJobs: number;
  // Recuperación de jobs atascados observada desde el último tick (el evento del driver: `alertKey` incluida).
  readonly staleReclaim: { readonly count: number; readonly alertKey: string } | undefined;
  // Cuota mensual del mes en curso; `null` = ninguna fila utilizable (`monthly-missing`).
  readonly quota: AlertQuotaState | null;
  // Reservas de cuota denegadas hoy (UTC) por este proceso.
  readonly deniedReservations: number;
  // Primera evaluación tras arrancar el proceso.
  readonly workerStarted: boolean;
}

export interface AlertCheckConfig {
  readonly failedJobsThreshold: number;
  readonly failedJobsWindowMs: number;
  readonly failedJobsCooldownMs: number;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
// Enfriamiento del aviso de arranque: un reinicio en bucle no inunda el canal (a lo sumo uno por hora).
export const WORKER_STARTED_COOLDOWN_MS = HOUR_MS;
// Las claves llevan el día o el mes: el enfriamiento solo debe cubrir ese periodo completo.
export const DAILY_ALERT_COOLDOWN_MS = 24 * HOUR_MS;
export const MONTHLY_ALERT_COOLDOWN_MS = 32 * 24 * HOUR_MS;

const QUOTA_WARNING_PERCENT = 80;

function formatWindow(windowMs: number): string {
  return windowMs % HOUR_MS === 0
    ? `${String(windowMs / HOUR_MS)} h`
    : `${String(Math.round(windowMs / MINUTE_MS))} min`;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function utcMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function quotaCandidates(quota: AlertQuotaState | null, now: Date): readonly AlertCandidate[] {
  const month = utcMonth(now);
  if (quota === null) {
    return [
      {
        dedupKey: `quota-missing:${month}`,
        severity: 'critical',
        text: 'No hay cuota mensual de Idealista utilizable: el worker no gasta peticiones hasta que se fije con set-monthly-quota.',
        cooldownMs: MONTHLY_ALERT_COOLDOWN_MS,
      },
    ];
  }
  const { totalCap, searchRequests } = quota;
  if (searchRequests >= totalCap) {
    return [
      {
        dedupKey: `quota-100:${month}`,
        severity: 'critical',
        text: `Cuota mensual de Idealista agotada: ${String(searchRequests)} de ${String(totalCap)} peticiones de búsqueda. El worker no gastará más este mes.`,
        cooldownMs: MONTHLY_ALERT_COOLDOWN_MS,
      },
    ];
  }
  // Comparación entera (sin flotantes): usado/total >= 80 / 100.
  if (searchRequests * 100 >= totalCap * QUOTA_WARNING_PERCENT) {
    const percent = Math.floor((searchRequests * 100) / totalCap);
    return [
      {
        dedupKey: `quota-80:${month}`,
        severity: 'warning',
        text: `Cuota mensual de Idealista al ${String(percent)} % (${String(searchRequests)} de ${String(totalCap)} peticiones de búsqueda).`,
        cooldownMs: MONTHLY_ALERT_COOLDOWN_MS,
      },
    ];
  }
  return [];
}

export function evaluateAlertChecks(snapshot: AlertSnapshot, config: AlertCheckConfig): readonly AlertCandidate[] {
  const candidates: AlertCandidate[] = [];

  if (snapshot.failedJobs >= config.failedJobsThreshold) {
    candidates.push({
      dedupKey: 'failed-jobs',
      severity: 'warning',
      text: `Fallos de cobertura: ${String(snapshot.failedJobs)} jobs han fallado en las últimas ${formatWindow(config.failedJobsWindowMs)} (umbral ${String(config.failedJobsThreshold)}).`,
      cooldownMs: config.failedJobsCooldownMs,
    });
  }

  if (snapshot.staleReclaim !== undefined) {
    candidates.push({
      dedupKey: snapshot.staleReclaim.alertKey,
      severity: 'critical',
      text: `Jobs atascados recuperados: ${String(snapshot.staleReclaim.count)} job(s) en curso se han marcado como fallidos porque su arrendamiento caducó (worker interrumpido sin cierre ordenado).`,
      cooldownMs: DAILY_ALERT_COOLDOWN_MS,
    });
  }

  candidates.push(...quotaCandidates(snapshot.quota, snapshot.now));

  if (snapshot.deniedReservations > 0) {
    candidates.push({
      dedupKey: `denied-reservations:${utcDay(snapshot.now)}`,
      severity: 'warning',
      text: `Reservas de cuota denegadas hoy: ${String(snapshot.deniedReservations)}. El worker no ha podido gastar peticiones de búsqueda.`,
      cooldownMs: DAILY_ALERT_COOLDOWN_MS,
    });
  }

  if (snapshot.workerStarted) {
    candidates.push({
      dedupKey: 'worker-started',
      severity: 'info',
      text: 'El worker de cobertura se ha iniciado.',
      cooldownMs: WORKER_STARTED_COOLDOWN_MS,
    });
  }

  return candidates;
}
