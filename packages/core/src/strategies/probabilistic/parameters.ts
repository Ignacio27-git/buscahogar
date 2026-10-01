// Parámetros m/u de la segunda DedupStrategy, Fellegi-Sunter con niveles
// graduados (ROADMAP 2.2, decisión 085). FIJADOS A PRIORI desde literatura y
// razonamiento — jamás ajustados ni derivados del corpus de pares
// etiquetados (decisión 085/086, spec "Parameters Fixed A Priori"): este
// módulo no importa ese corpus, y probabilistic-strategy.test.ts lo
// comprueba inspeccionando el propio fichero fuente.
//
// m = P(nivel | mismo par realmente duplicado); u = P(nivel | par candidato
// del bloqueo que NO es la misma vivienda) — condicionado a la población YA
// bloqueada (ROADMAP 1.8), donde vecinos del mismo bloque inflan u respecto
// a una población sin bloquear. bits(nivel) = log2(m/u) se calcula en
// levels.ts, nunca hardcodeado aquí, para que m/u sigan siendo la única
// fuente de verdad.
//
// Fundamento de los cortes de nivel: rule-based decae precio/superficie
// linealmente hasta 0 en un 10% de diferencia relativa
// (rule-based/signals.ts:16-17) y distancia hasta 0 en 100 m
// (rule-based/signals.ts:15) — los cortes "mid" de aquí (100 m, 10%)
// reutilizan esos mismos puntos ya medidos. Los cortes "near" (20 m, 2%) son
// elecciones a priori NUEVAS de esta estrategia, sin precedente en
// rule-based. C8: precio/superficie y distancia/dirección están
// correlacionados en la práctica (un mismo anuncio republicado suele
// coincidir o discrepar en varios campos a la vez); no hay datos en n=24
// para justificar un nivel conjunto 3x3, así que cada campo se trata
// independiente — limitación documentada en el reporte de la CLI, no
// resuelta aquí.
export interface MULevel {
  readonly m: number;
  readonly u: number;
}

export const DISTANCE_LEVELS = {
  near: { m: 0.7, u: 0.1 }, // ≤20 m
  mid: { m: 0.25, u: 0.4 }, // ≤100 m
  far: { m: 0.05, u: 0.5 }, // >100 m
} as const satisfies Record<string, MULevel>;

export const PRICE_LEVELS = {
  near: { m: 0.65, u: 0.1 }, // ≤2% de diferencia relativa
  mid: { m: 0.3, u: 0.45 }, // ≤10%
  far: { m: 0.05, u: 0.45 }, // >10%
} as const satisfies Record<string, MULevel>;

export const SURFACE_LEVELS = {
  near: { m: 0.7, u: 0.1 }, // ≤2% de diferencia relativa
  mid: { m: 0.25, u: 0.4 }, // ≤10%
  far: { m: 0.05, u: 0.5 }, // >10%
} as const satisfies Record<string, MULevel>;

export const ADDRESS_LEVELS = {
  streetLevelExact: { m: 0.4, u: 0.05 }, // mismo cuerpo normalizado, con token de nivel de calle
  zoneOnly: { m: 0.15, u: 0.15 }, // mismo cuerpo normalizado, sin token de nivel de calle
  different: { m: 0.45, u: 0.8 }, // cuerpos normalizados distintos
} as const satisfies Record<string, MULevel>;

export const ROOMS_LEVELS = {
  equal: { m: 0.9, u: 0.3 },
  different: { m: 0.1, u: 0.7 },
} as const satisfies Record<string, MULevel>;

export const BATHROOMS_LEVELS = {
  equal: { m: 0.9, u: 0.5 },
  different: { m: 0.1, u: 0.5 },
} as const satisfies Record<string, MULevel>;

// Prior de coincidencia (decisión 085): probabilidad a priori de que dos
// anuncios del mismo bloque de candidatos sean la misma vivienda, ANTES de
// observar ningún campo. `PRIOR_LOG_ODDS` es su log-odds en base 2
// (log2(λ/(1-λ))), sumado siempre a M — nunca condicionado a qué campos
// están evaluados, a diferencia de las señales.
export const PRIOR_LAMBDA = 0.1;
export const PRIOR_LOG_ODDS = Math.log2(PRIOR_LAMBDA / (1 - PRIOR_LAMBDA));
