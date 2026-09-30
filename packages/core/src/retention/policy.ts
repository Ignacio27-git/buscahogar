// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 103) — política PURA de
// cadencia de refresco. Cero DB, cero red, cero reloj: el llamador (la capa
// SQL del worker, con el reloj de Postgres) entrega enteros ya resueltos,
// mismo principio que `evaluateFixedWindow` (rate-limit/fixed-window.ts).
//
// `d` = días completos entre el último día de demanda de la zona y hoy. La
// demanda es una búsqueda real de un usuario sobre la zona (o, sin señales,
// la fecha de `coverage_jobs.requested_at`): mide interés, no oferta.
//
// Todos los números de la política viven aquí como constantes con nombre
// (ZRS-7); ningún otro módulo puede repetirlos.
export type ZoneCadence = 'weekly' | 'monthly' | 'on-hold' | 'purge';

// d <= 30 -> semanal.
export const WEEKLY_MAX_DEMAND_AGE_DAYS = 30;
// 31 <= d <= 90 -> mensual.
export const MONTHLY_MAX_DEMAND_AGE_DAYS = 90;
// d >= 180 -> purga. Entre 91 y 179 la zona queda en espera (nunca vence).
export const PURGE_DEMAND_AGE_DAYS = 180;

// Retención de `zone_query_signals` (RP-12, A6): una señal con `day < hoy - 180`
// caduca. Coincide con el horizonte de purga de zona a propósito: pasado ese
// punto la zona ya no cuenta como con demanda. La purga de un tick está
// acotada (nunca borra sin límite).
export const SIGNAL_RETENTION_DAYS = PURGE_DEMAND_AGE_DAYS;
export const SIGNAL_PURGE_MAX_ROWS_PER_TICK = 5_000;

// Intervalos mínimos entre barridos completos.
export const WEEKLY_REFRESH_INTERVAL_DAYS = 7;
export const MONTHLY_REFRESH_INTERVAL_DAYS = 30;

const SECONDS_PER_DAY = 86_400;

export function classifyZoneCadence(daysSinceLastDemand: number): ZoneCadence {
  if (daysSinceLastDemand <= WEEKLY_MAX_DEMAND_AGE_DAYS) {
    return 'weekly';
  }
  if (daysSinceLastDemand <= MONTHLY_MAX_DEMAND_AGE_DAYS) {
    return 'monthly';
  }
  if (daysSinceLastDemand < PURGE_DEMAND_AGE_DAYS) {
    return 'on-hold';
  }
  return 'purge';
}

// Vence cuando el último barrido tiene AL MENOS el intervalo de su cadencia
// (exactamente 7 días ya vence; 6d23h no — S-ZRS-2). `null` = la zona nunca
// registró un barrido completo: vence de inmediato si su cadencia refresca.
// `on-hold` y `purge` nunca vencen: no se gasta cuota en zonas sin demanda.
export function isRefreshDue(cadence: ZoneCadence, secondsSinceLastSweep: number | null): boolean {
  const intervalDays = refreshIntervalDays(cadence);
  if (intervalDays === null) {
    return false;
  }
  return secondsSinceLastSweep === null || secondsSinceLastSweep >= intervalDays * SECONDS_PER_DAY;
}

function refreshIntervalDays(cadence: ZoneCadence): number | null {
  switch (cadence) {
    case 'weekly':
      return WEEKLY_REFRESH_INTERVAL_DAYS;
    case 'monthly':
      return MONTHLY_REFRESH_INTERVAL_DAYS;
    case 'on-hold':
    case 'purge':
      return null;
  }
}

// ROADMAP 2.5 (S3; decisión 105) — verificación de presencia por `adIds`.
// Idealista admite hasta 50 anuncios por petición (`maxItems`), así que un lote
// nunca pasa de 50 ids. Un resultado ambiguo reintenta a los 7 días y, tras 3
// intentos, la fila de la cola se descarta SIN cambiar el estado del anuncio.
export const PRESENCE_BATCH_SIZE = 50;
export const PRESENCE_RETRY_BACKOFF_DAYS = 7;
export const PRESENCE_MAX_CHECK_ATTEMPTS = 3;
