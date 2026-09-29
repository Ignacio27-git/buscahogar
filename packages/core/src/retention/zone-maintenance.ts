// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 103) — planificador PURO
// del mantenimiento de zonas de un tick: qué zonas se purgan y cuáles se
// vuelven a barrer. La purga va PRIMERO (una zona purgable nunca se refresca)
// y está acotada por pasada (RP-4); el refresco no tiene tope propio porque
// gastar cuota ya está acotado por el ledger (techo de la fracción de
// refresco).
import { classifyZoneCadence, isRefreshDue } from './policy.js';

// Purgas de zona por pasada (S-RP-10). Cada purga es una transacción propia.
export const MAX_ZONE_PURGES_PER_PASS = 20;

// Foto de una zona con trabajo de cobertura, resuelta por la capa SQL con el
// reloj de Postgres. `refreshEligible` la calcula esa capa: zona `covered`
// cuyo job está `done`, o `failed` con los reintentos agotados (ZRS-8). Un job
// `pending`/`running`/`failed` con reintentos nunca se vuelve a encolar.
export interface ZoneLifecycleSnapshot {
  readonly zoneId: string;
  readonly daysSinceLastDemand: number;
  readonly secondsSinceLastSweep: number | null;
  readonly refreshEligible: boolean;
}

export interface ZoneMaintenancePlan {
  readonly purge: readonly string[];
  readonly refresh: readonly string[];
}

export function planZoneMaintenance(zones: readonly ZoneLifecycleSnapshot[]): ZoneMaintenancePlan {
  const purge: string[] = [];
  const refresh: string[] = [];

  for (const zone of zones) {
    const cadence = classifyZoneCadence(zone.daysSinceLastDemand);
    if (cadence === 'purge') {
      if (purge.length < MAX_ZONE_PURGES_PER_PASS) {
        purge.push(zone.zoneId);
      }
      continue;
    }
    if (zone.refreshEligible && isRefreshDue(cadence, zone.secondsSinceLastSweep)) {
      refresh.push(zone.zoneId);
    }
  }

  return { purge, refresh };
}
