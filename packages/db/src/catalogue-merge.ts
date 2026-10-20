// ROADMAP 1.13 (diseño DD-2, arbitraje CR-15) — fusión PURA del catálogo
// hand-cited y el catálogo importado, ejecutada ANTES de la transacción de
// siembra (`seed.ts`). `seedReferenceData` sigue recibiendo exactamente UNA
// lista; su `onConflictDoNothing({target: locations.ineCode})` (`:62`)
// permanece byte-idéntico y sigue sirviendo solo para la idempotencia del
// re-seed — nunca como mecanismo de fusión (distinción de CR-3, que es una
// tabla distinta, `coverage_jobs`).
//
// Regla de precedencia, explícita y testeada, nunca un accidente de orden
// de inserción (`ON CONFLICT DO NOTHING` nunca actualiza, así que sembrar
// una lista u otra primero pierde algo en cualquier orden — ver
// docs/DECISIONS.md, decisión 066):
//   - identidad (nombre, provincia, comunidad autónoma) y la CITA de fuente
//     vienen SIEMPRE de la entrada hand-cited — es la evidencia verificada
//     de que el código INE no se ha fabricado (P5, COVERAGE-8);
//   - centroide/radio se RELLENAN desde el importado SOLO si el hand-cited
//     no trae ya uno propio — nunca se sobrescribe un valor hand-cited
//     existente;
//   - la población (3.3, decisión 249) solo la trae el importado: se RELLENA
//     si el hand-cited no tiene una propia; si ninguno la trae queda sin
//     clave (desconocida), nunca 0;
//   - la fuente fusionada nombra AMBAS procedencias, para que la fusión
//     misma quede auditable.
import type { MunicipalitySeed } from './seed-data.js';

export function mergeCatalogues(
  handCited: readonly MunicipalitySeed[],
  imported: readonly MunicipalitySeed[]
): readonly MunicipalitySeed[] {
  const importedByIneCode = new Map(imported.map((entry) => [entry.ineCode, entry]));

  const merged = handCited.map((entry): MunicipalitySeed => {
    const match = importedByIneCode.get(entry.ineCode);
    if (!match) {
      return entry;
    }
    importedByIneCode.delete(entry.ineCode);

    const population = entry.population ?? match.population;

    return {
      ...entry,
      ...(population === undefined ? {} : { population }),
      centroid: entry.centroid ?? match.centroid,
      sweepRadiusM: entry.sweepRadiusM ?? match.sweepRadiusM,
      source: `${entry.source} + ${match.source}`,
    };
  });

  return [...merged, ...importedByIneCode.values()];
}
