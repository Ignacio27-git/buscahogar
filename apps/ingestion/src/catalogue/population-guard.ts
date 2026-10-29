// ROADMAP 3.3 (decisión 249, diseño D14) — guarda de deriva de la población.
// Una celda inválida suelta es población desconocida (`ngmep-parse.ts`) y no
// aborta; pero si menos del 90 % de las filas trae población, lo más probable
// es que el formato del fichero haya cambiado (separador de miles, otra
// columna...) y la prebúsqueda no tendría nada fiable que ordenar. En ese
// caso el importador aborta ANTES de escribir el catálogo generado.
export const MIN_POPULATION_COVERAGE = 0.9;

export class PopulationDriftError extends Error {
  constructor(withPopulation: number, total: number) {
    super(
      `Solo ${String(withPopulation)} de ${String(total)} filas del NGMEP traen POBLACION_MUNI válida ` +
        `(mínimo ${String(MIN_POPULATION_COVERAGE * 100)} %). Es probable que el formato del fichero haya ` +
        'cambiado: se aborta antes de escribir el catálogo.'
    );
  }
}

export function assertPopulationCoverage(rows: readonly { readonly population: number | null }[]): void {
  const withPopulation = rows.filter((row) => row.population !== null).length;
  // División (correctamente redondeada) y no `rows.length * 0.9`: así una
  // proporción exactamente del 90 % nunca cae por error de coma flotante.
  if (rows.length > 0 && withPopulation / rows.length < MIN_POPULATION_COVERAGE) {
    throw new PopulationDriftError(withPopulation, rows.length);
  }
}
