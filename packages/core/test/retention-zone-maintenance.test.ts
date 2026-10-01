// ROADMAP 2.5 (refresh-retention-policy, S1) — planificador puro del
// mantenimiento de zonas: purga primero, refresco después, con tope de purgas
// por pasada.
import { describe, expect, it } from 'vitest';

import { MAX_ZONE_PURGES_PER_PASS, planZoneMaintenance } from '../src/retention/zone-maintenance.js';
import type { ZoneLifecycleSnapshot } from '../src/retention/zone-maintenance.js';

const DAY_SECONDS = 86_400;

function snapshot(overrides: Partial<ZoneLifecycleSnapshot> & { zoneId: string }): ZoneLifecycleSnapshot {
  return {
    daysSinceLastDemand: 0,
    secondsSinceLastSweep: 10 * DAY_SECONDS,
    refreshEligible: true,
    ...overrides,
  };
}

describe('planZoneMaintenance — refresco (S-ZRS-2..5)', () => {
  it('una zona semanal vencida y elegible se planifica para refresco; una no vencida no', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'due', secondsSinceLastSweep: 8 * DAY_SECONDS }),
      snapshot({ zoneId: 'fresh', secondsSinceLastSweep: 2 * DAY_SECONDS }),
    ]);

    expect(plan.refresh).toEqual(['due']);
    expect(plan.purge).toEqual([]);
  });

  it('una zona mensual (d = 60) barrida hace 29 días no vence; hace 31 días sí', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'young', daysSinceLastDemand: 60, secondsSinceLastSweep: 29 * DAY_SECONDS }),
      snapshot({ zoneId: 'old', daysSinceLastDemand: 60, secondsSinceLastSweep: 31 * DAY_SECONDS }),
    ]);

    expect(plan.refresh).toEqual(['old']);
  });

  it('una zona en espera (d = 120) nunca se refresca, aunque lleve 400 días sin barrer (S-ZRS-4)', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'hold', daysSinceLastDemand: 120, secondsSinceLastSweep: 400 * DAY_SECONDS }),
    ]);

    expect(plan.refresh).toEqual([]);
    expect(plan.purge).toEqual([]);
  });

  it('una zona vencida pero NO elegible (job pending/running/fallo con reintentos) no se planifica (S-ZRS-8)', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'busy', secondsSinceLastSweep: 20 * DAY_SECONDS, refreshEligible: false }),
    ]);

    expect(plan.refresh).toEqual([]);
  });
});

describe('planZoneMaintenance — purga primero, con tope por pasada (S-RP-10)', () => {
  it('una zona con d >= 180 se planifica para purga y NUNCA también para refresco', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'gone', daysSinceLastDemand: 180, secondsSinceLastSweep: 400 * DAY_SECONDS }),
      snapshot({ zoneId: 'live', daysSinceLastDemand: 5, secondsSinceLastSweep: 9 * DAY_SECONDS }),
    ]);

    expect(plan.purge).toEqual(['gone']);
    expect(plan.refresh).toEqual(['live']);
  });

  it('con 25 zonas purgables solo se devuelven MAX_ZONE_PURGES_PER_PASS (20), en orden de entrada', () => {
    const zones = Array.from({ length: 25 }, (_, index) =>
      snapshot({ zoneId: `z${String(index)}`, daysSinceLastDemand: 200 })
    );

    const plan = planZoneMaintenance(zones);

    expect(MAX_ZONE_PURGES_PER_PASS).toBe(20);
    expect(plan.purge).toHaveLength(20);
    expect(plan.purge[0]).toBe('z0');
    expect(plan.purge[19]).toBe('z19');
  });

  it('una zona purgable no elegible para refresco igualmente se purga (la purga no depende del job)', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'gone', daysSinceLastDemand: 300, refreshEligible: false }),
    ]);

    expect(plan.purge).toEqual(['gone']);
  });
});
