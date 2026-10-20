// ROADMAP 3.3 (decisión 253; R2, R5) — planificador PURO del presweep de las ciudades más pobladas.
// Sin E/S: recibe las ciudades candidatas con el estado de sus dos unidades y devuelve el orden en que
// se barrerán. La consulta SQL (`packages/db/src/presweep.ts`) aporta los datos; el bucle de ejecución
// (`apps/ingestion/src/presweep`) los consume.
//
// Una UNIDAD es (ciudad, operación). Cada ciudad seleccionada produce dos: venta y alquiler, en ese
// orden. El corte `top` cuenta CIUDADES, no unidades pendientes: una ciudad ya cubierta ocupa su plaza
// y no se sustituye por la siguiente, para que `--top 100` signifique siempre «las 100 mayores».
import type { OperationType } from '../types/operation-type.js';

// Estado de una unidad según su job de cobertura: `completed` = tiene `last_completed_at`
// (cubierta); `running` = otro proceso la está barriendo; `pending` = sin job, o job pendiente,
// parcial o fallido (todos se barren o reanudan por su cursor).
export type PresweepUnitState = 'pending' | 'running' | 'completed';

export interface PresweepCityCandidate {
  // Id estable de la ciudad (código INE): desempata el corte.
  readonly id: string;
  // Población municipal; null = desconocida (nunca se selecciona).
  readonly population: number | null;
  readonly units: Readonly<Record<OperationType, PresweepUnitState>>;
}

export interface PresweepUnit {
  readonly cityId: string;
  readonly operation: OperationType;
}

export interface PresweepSkippedUnit extends PresweepUnit {
  readonly why: 'completed' | 'running';
}

export interface PresweepPlan {
  // Ciudades seleccionadas, por población DESC.
  readonly cities: readonly string[];
  // Unidades a barrer, venta y luego alquiler por ciudad.
  readonly units: readonly PresweepUnit[];
  readonly skipped: readonly PresweepSkippedUnit[];
}

// Venta primero: es el orden fijado por el diseño (D13).
const PLAN_OPERATIONS: readonly OperationType[] = ['sale', 'rent'];

interface KnownPopulationCity extends PresweepCityCandidate {
  readonly population: number;
}

function hasKnownPopulation(city: PresweepCityCandidate): city is KnownPopulationCity {
  return city.population !== null;
}

// Población DESC y, a igual población, id ASC. Comparación de cadenas por unidades de código (no por
// locale): el id es el código INE de 5 dígitos y el orden no debe depender de la configuración regional.
function byPopulationThenId(a: KnownPopulationCity, b: KnownPopulationCity): number {
  if (a.population !== b.population) {
    return b.population - a.population;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

export function planPresweep(candidates: readonly PresweepCityCandidate[], top: number): PresweepPlan {
  const selected = candidates.filter(hasKnownPopulation).sort(byPopulationThenId).slice(0, Math.max(0, top));

  const units: PresweepUnit[] = [];
  const skipped: PresweepSkippedUnit[] = [];
  for (const city of selected) {
    for (const operation of PLAN_OPERATIONS) {
      const state = city.units[operation];
      if (state === 'pending') {
        units.push({ cityId: city.id, operation });
      } else {
        skipped.push({ cityId: city.id, operation, why: state });
      }
    }
  }

  return { cities: selected.map((city) => city.id), units, skipped };
}
