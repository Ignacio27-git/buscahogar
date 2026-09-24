// Pesos, umbrales y piso de evidencia mínima de la primera DedupStrategy
// (ROADMAP 1.9). Constantes `as const`, no Zod: no cruzan ninguna frontera
// externa real — nada externo las suministra en este cambio, y bajo la
// decisión 020 nada debe hacerlo nunca (docs/DECISIONS.md, decisión 049).
// Retunarlas es un cambio de `version`, nunca un parámetro en tiempo de
// ejecución (packages/core/src/index.ts:19-25 razona el mismo criterio para
// Zod-solo-en-fronteras-externas).

// Las siete señales que se acumulan en el score ponderado (RDS-3). Excluye
// deliberadamente las dos claves de veto (`propertyTypeMatch`,
// `operationMatch`), que viven siempre a peso 0 (decisión 048) y nunca
// entran en esta unión ni en el piso de evidencia.
export type AccumulatedSignalKey =
  | 'distance'
  | 'price'
  | 'surface'
  | 'addressExact'
  | 'addressZone'
  | 'rooms'
  | 'bathrooms';

// Peso de cada señal acumulada cuando SÍ se evalúa. `addressExact` usa este
// valor (25) solo en el caso de coincidencia fuerte (ADX-2); el caso de
// desacuerdo (ADX-4) reutiliza deliberadamente WEIGHTS.addressZone (8), la
// misma banda débil que ADX-3 — no existe una tercera constante para esa
// magnitud (decisión 047).
export const WEIGHTS = {
  distance: 25,
  price: 15,
  surface: 15,
  addressExact: 25,
  addressZone: 8,
  rooms: 20,
  bathrooms: 10,
} as const satisfies Record<AccumulatedSignalKey, number>;

// Suma de todos los pesos máximos configurados (25+15+15+25+20+10 = 110).
// NO se usa para normalizar `score` — decisión 049 lo prohíbe expresamente:
// dividir por este total introduce el sesgo `premises`-vs-`homes` que la
// normalización por peso efectivo existe para evitar. Su único uso es
// documental/de test, como cota superior de referencia.
export const MAX_TOTAL_WEIGHT = 110;

// Umbrales de banda (decisión 048), versión 1.0.0. Frontera inclusiva a su
// banda exterior respectiva: exactamente en T_LOW rechaza, exactamente en
// T_HIGH (con el piso satisfecho) acepta.
export const T_HIGH = 0.82;
export const T_LOW = 0.45;

// Piso de evidencia mínima (decisión 049): antes de aceptar, hacen falta al
// menos MIN_EVALUATED_SIGNALS señales evaluadas (peso > 0, contando solo
// las siete claves acumuladas, nunca las dos de veto) Y al menos
// MIN_EFFECTIVE_WEIGHT unidades de peso efectivo acumulado. 55 es
// exactamente distance(25) + price(15) + surface(15) — el conjunto base que
// el propio texto de ROADMAP 1.9 nombra, así que `accept` empieza a ser
// alcanzable justo donde esa evidencia nombrada está presente.
export const MIN_EVALUATED_SIGNALS = 3;
export const MIN_EFFECTIVE_WEIGHT = 55;

export const STRATEGY_VERSION = '1.0.0';
