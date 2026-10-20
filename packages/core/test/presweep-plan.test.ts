// ROADMAP 3.3 (decisión 253; R2, R5; S2.1-S2.3, S5.2) — planificador PURO del presweep: las N ciudades
// con más población conocida, DESC, desempate por id estable (código INE), cada una con sus dos unidades
// (venta y alquiler). Las unidades completadas o en curso se omiten; las parciales se reanudan.
import { describe, expect, it } from 'vitest';

import { planPresweep } from '../src/presweep/plan.js';
import type { PresweepCityCandidate, PresweepUnitState } from '../src/presweep/plan.js';

function city(
  id: string,
  population: number | null,
  states: { readonly sale?: PresweepUnitState; readonly rent?: PresweepUnitState } = {}
): PresweepCityCandidate {
  return { id, population, units: { sale: states.sale ?? 'pending', rent: states.rent ?? 'pending' } };
}

describe('planPresweep — selección del top-N', () => {
  it('S2.1: con poblaciones A>B>C y N=2 se eligen A y B, cada una x {sale, rent} (4 unidades)', () => {
    const plan = planPresweep([city('30001', 100), city('20002', 300), city('10003', 200)], 2);

    expect(plan.cities).toEqual(['20002', '10003']);
    expect(plan.units).toEqual([
      { cityId: '20002', operation: 'sale' },
      { cityId: '20002', operation: 'rent' },
      { cityId: '10003', operation: 'sale' },
      { cityId: '10003', operation: 'rent' },
    ]);
  });

  it('S2.2: los empates en el corte se resuelven por id estable, con independencia del orden de entrada', () => {
    const a = city('28079', 500);
    const b = city('08019', 500);
    const c = city('41091', 500);

    const forward = planPresweep([a, b, c], 2);
    const reversed = planPresweep([c, b, a], 2);

    expect(forward.cities).toEqual(['08019', '28079']);
    expect(reversed.cities).toEqual(forward.cities);
  });

  it('S2.3: N mayor que las ciudades con población conocida selecciona solo esas, sin error', () => {
    const plan = planPresweep([city('11001', 10), city('11002', 20)], 50);

    expect(plan.cities).toEqual(['11002', '11001']);
    expect(plan.units).toHaveLength(4);
  });

  it('las ciudades de población desconocida (null) no se seleccionan nunca, ni siquiera para completar N', () => {
    const plan = planPresweep([city('11001', null), city('11002', 20), city('11003', null)], 3);

    expect(plan.cities).toEqual(['11002']);
    expect(plan.units).toEqual([
      { cityId: '11002', operation: 'sale' },
      { cityId: '11002', operation: 'rent' },
    ]);
  });

  it('sin ninguna ciudad con población conocida el plan está vacío', () => {
    const plan = planPresweep([city('11001', null)], 5);

    expect(plan.cities).toEqual([]);
    expect(plan.units).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });
});

describe('planPresweep — unidades ya cubiertas, en curso o parciales', () => {
  it('S5.2: una unidad completada se omite y se informa como omitida; la otra operación de la ciudad sigue en el plan', () => {
    const plan = planPresweep([city('11001', 900, { rent: 'completed' }), city('11002', 800)], 2);

    expect(plan.units).toEqual([
      { cityId: '11001', operation: 'sale' },
      { cityId: '11002', operation: 'sale' },
      { cityId: '11002', operation: 'rent' },
    ]);
    expect(plan.skipped).toEqual([{ cityId: '11001', operation: 'rent', why: 'completed' }]);
  });

  it('una unidad en curso (otro proceso la tiene) se omite con su motivo', () => {
    const plan = planPresweep([city('11001', 900, { sale: 'running' })], 1);

    expect(plan.units).toEqual([{ cityId: '11001', operation: 'rent' }]);
    expect(plan.skipped).toEqual([{ cityId: '11001', operation: 'sale', why: 'running' }]);
  });

  it('el corte N cuenta CIUDADES: las completadas ocupan plaza del top-N y no se sustituyen por la siguiente', () => {
    const plan = planPresweep(
      [city('11001', 900, { sale: 'completed', rent: 'completed' }), city('11002', 800), city('11003', 700)],
      2
    );

    expect(plan.cities).toEqual(['11001', '11002']);
    expect(plan.units.map((unit) => unit.cityId)).toEqual(['11002', '11002']);
    expect(plan.skipped).toHaveLength(2);
  });

  it('una unidad parcial (pendiente con cursor) sigue en el plan: la reanudación la decide el cursor persistido', () => {
    const plan = planPresweep([city('11001', 900, { sale: 'pending', rent: 'pending' })], 1);

    expect(plan.units).toHaveLength(2);
    expect(plan.skipped).toEqual([]);
  });

  it('N = 0 no selecciona nada', () => {
    expect(planPresweep([city('11001', 900)], 0).units).toEqual([]);
  });
});
