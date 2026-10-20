// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 103) — planificador PURO
// del mantenimiento de zonas de un tick: qué zonas se purgan y cuáles se
// vuelven a barrer. La purga va PRIMERO (una zona purgable nunca se refresca)
// y está acotada por pasada (RP-4); el refresco no tiene tope propio porque
// gastar cuota ya está acotado por el ledger (techo de la fracción de
// refresco).
import type { OperationType } from '../types/operation-type.js';
import { classifyZoneCadence, isRefreshDue } from './policy.js';

// Purgas de zona por pasada (S-RP-10). Cada purga es una transacción propia.
export const MAX_ZONE_PURGES_PER_PASS = 20;

// Foto de un job de cobertura de una zona (una por zona y operación, decisión
// 250), resuelta por la capa SQL con el reloj de Postgres. `refreshEligible` la
// calcula esa capa: la operación está cubierta (`last_completed_at`) y su job
// está `done`, o `failed` con los reintentos agotados (ZRS-8). Un job
// `pending`/`running`/`failed` con reintentos nunca se vuelve a encolar.
// `secondsSinceLastSweep` es el de ESA operación.
export interface ZoneLifecycleSnapshot {
  readonly zoneId: string;
  readonly operation: OperationType;
  readonly daysSinceLastDemand: number;
  readonly secondsSinceLastSweep: number | null;
  readonly refreshEligible: boolean;
}

// Unidad de refresco: el job de una operación de una zona.
export interface RefreshTarget {
  readonly zoneId: string;
  readonly operation: OperationType;
}

// La purga es de la ZONA (se deduplica por zona); el refresco es por (zona,
// operación): cada operación vence según su propio último barrido.
export interface ZoneMaintenancePlan {
  readonly purge: readonly string[];
  readonly refresh: readonly RefreshTarget[];
}

export function planZoneMaintenance(zones: readonly ZoneLifecycleSnapshot[]): ZoneMaintenancePlan {
  const purge: string[] = [];
  const refresh: RefreshTarget[] = [];
  const purgeSeen = new Set<string>();
  const refreshSeen = new Set<string>();

  for (const zone of zones) {
    const cadence = classifyZoneCadence(zone.daysSinceLastDemand);
    if (cadence === 'purge') {
      if (!purgeSeen.has(zone.zoneId) && purge.length < MAX_ZONE_PURGES_PER_PASS) {
        purgeSeen.add(zone.zoneId);
        purge.push(zone.zoneId);
      }
      continue;
    }
    const key = `${zone.zoneId}:${zone.operation}`;
    if (zone.refreshEligible && isRefreshDue(cadence, zone.secondsSinceLastSweep) && !refreshSeen.has(key)) {
      refreshSeen.add(key);
      refresh.push({ zoneId: zone.zoneId, operation: zone.operation });
    }
  }

  return { purge, refresh };
}
