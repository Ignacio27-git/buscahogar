// ROADMAP 2.5 (refresh-retention-policy, S1) — planificador puro del
// mantenimiento de zonas: purga primero, refresco después, con tope de purgas
// por pasada.
import { describe, expect, it } from 'vitest';

import { MAX_ZONE_PURGES_PER_PASS, planZoneMaintenance } from '../src/retention/zone-maintenance.js';
import type { ZoneLifecycleSnapshot } from '../src/retention/zone-maintenance.js';

const DAY_SECONDS = 86_400;

function snapshot(overrides: Partial<ZoneLifecycleSnapshot> & { zoneId: string }): ZoneLifecycleSnapshot {
  return {
    operation: 'rent',
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

    expect(plan.refresh).toEqual([{ zoneId: 'due', operation: 'rent' }]);
    expect(plan.purge).toEqual([]);
  });

  it('una zona mensual (d = 60) barrida hace 29 días no vence; hace 31 días sí', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'young', daysSinceLastDemand: 60, secondsSinceLastSweep: 29 * DAY_SECONDS }),
      snapshot({ zoneId: 'old', daysSinceLastDemand: 60, secondsSinceLastSweep: 31 * DAY_SECONDS }),
    ]);

    expect(plan.refresh).toEqual([{ zoneId: 'old', operation: 'rent' }]);
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
    expect(plan.refresh).toEqual([{ zoneId: 'live', operation: 'rent' }]);
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

// ROADMAP 3.3 (prescan-top-cities, PR2; decisión 250) — una zona tiene un job por
// operación, así que llega una foto por (zona, operación). La purga es de la
// ZONA (se deduplica por zona); el refresco es por (zona, operación).
describe('planZoneMaintenance — una foto por (zona, operación) (R9, R11)', () => {
  it('una zona con fotos de sale y rent y sin demanda reciente se purga UNA sola vez', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'gone', operation: 'sale', daysSinceLastDemand: 200 }),
      snapshot({ zoneId: 'gone', operation: 'rent', daysSinceLastDemand: 200 }),
    ]);

    expect(plan.purge).toEqual(['gone']);
    expect(plan.refresh).toEqual([]);
  });

  it('el tope de purgas por pasada cuenta ZONAS distintas, no fotos: 25 zonas x 2 operaciones -> 20 zonas', () => {
    const zones = Array.from({ length: 25 }, (_, index) => [
      snapshot({ zoneId: `z${String(index)}`, operation: 'sale', daysSinceLastDemand: 200 }),
      snapshot({ zoneId: `z${String(index)}`, operation: 'rent', daysSinceLastDemand: 200 }),
    ]).flat();

    const plan = planZoneMaintenance(zones);

    expect(plan.purge).toHaveLength(MAX_ZONE_PURGES_PER_PASS);
    expect(plan.purge[0]).toBe('z0');
    expect(plan.purge[19]).toBe('z19');
  });

  it('solo se re-encola la operación VENCIDA: sale barrida hace 2 días no vence aunque rent (hace 9) sí', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'z', operation: 'sale', secondsSinceLastSweep: 2 * DAY_SECONDS }),
      snapshot({ zoneId: 'z', operation: 'rent', secondsSinceLastSweep: 9 * DAY_SECONDS }),
    ]);

    expect(plan.refresh).toEqual([{ zoneId: 'z', operation: 'rent' }]);
  });

  it('si las dos operaciones vencen, se planifica una por (zona, operación) y sin duplicados', () => {
    const plan = planZoneMaintenance([
      snapshot({ zoneId: 'z', operation: 'sale', secondsSinceLastSweep: 9 * DAY_SECONDS }),
      snapshot({ zoneId: 'z', operation: 'rent', secondsSinceLastSweep: 9 * DAY_SECONDS }),
      snapshot({ zoneId: 'z', operation: 'rent', secondsSinceLastSweep: 9 * DAY_SECONDS }),
    ]);

    expect(plan.refresh).toEqual([
      { zoneId: 'z', operation: 'sale' },
      { zoneId: 'z', operation: 'rent' },
    ]);
  });
});
