import type { NlParamKey } from '../nl-search/types.js';

// ROADMAP 3.1 (decisión 124) — corpus etiquetado para medir el intérprete de
// lenguaje natural. Las frases son DATOS en español. El resultado esperado de
// cada una se escribió a partir de lo que un usuario razonable quiere decir,
// NO copiando la salida del intérprete: donde el intérprete discrepa, es un
// fallo medido y se contabiliza como tal (no se retoca el corpus ni el
// intérprete para que coincidan).
//
// Reparto `dev` / `holdout`: las frases `holdout` se redactaron antes de ver
// cómo las trata el intérprete y no se usan para ajustarlo; la tasa de
// aciertos que cuenta para la memoria es la de `holdout`.
export type NlCorpusSplit = 'dev' | 'holdout';

// `hard-negative`: la frase contiene algo que el intérprete NO debe convertir
// en criterio (función no soportada, negación, distancia, conflicto...). El
// requisito es cero criterios equivocados o espurios; que se pierda alguno
// legítimo es un fallo, pero no una falsedad.
export type NlCorpusCategory = 'basic' | 'combined' | 'hard-negative';

export type NlExpectedField = NlParamKey | 'place';

export interface NlCorpusEntry {
  readonly id: string;
  readonly split: NlCorpusSplit;
  readonly category: NlCorpusCategory;
  readonly text: string;
  // Criterios esperados, con la forma de los search params (importes en euros).
  readonly params: Readonly<Partial<Record<NlParamKey, string>>>;
  // Texto de lugar esperado; el intérprete solo lo extrae, resolverlo contra
  // las zonas es cosa de la capa web.
  readonly placeText: string | null;
  // `false` cuando los criterios correctos no pasan `searchQuerySchema`
  // (p. ej. mínimo mayor que máximo): el esquema los rechaza con un mensaje.
  readonly schemaValid: boolean;
  readonly rationale: string;
}

function entry(
  id: string,
  split: NlCorpusSplit,
  category: NlCorpusCategory,
  text: string,
  params: Readonly<Partial<Record<NlParamKey, string>>>,
  placeText: string | null,
  rationale: string,
  schemaValid = true
): NlCorpusEntry {
  return { id, split, category, text, params, placeText, schemaValid, rationale };
}

export const nlSearchCorpus: readonly NlCorpusEntry[] = [
  // ------------------------------------------------------------------ holdout
  entry(
    'ho-1-atico-venta-menos-de',
    'holdout',
    'combined',
    'Busco un ático en venta en Sevilla por menos de 400.000 euros',
    { operation: 'sale', propertyType: 'penthouse', maxPrice: '400000' },
    'Sevilla',
    'Frase natural con tipo, operación, lugar y tope de precio con punto de miles.'
  ),
  entry(
    'ho-2-chalet-mas-de-habitaciones',
    'holdout',
    'combined',
    'chalet en Pozuelo con más de 4 habitaciones',
    { propertyType: 'house', minRooms: '5' },
    'Pozuelo',
    '"Más de 4" es estrictamente mayor: al menos 5 habitaciones.'
  ),
  entry(
    'ho-3-estudio-cerca-de',
    'holdout',
    'combined',
    'estudio en alquiler cerca de Sol hasta 700 euros',
    { operation: 'rent', propertyType: 'studio', maxPrice: '700' },
    'Sol',
    '"Cerca de" es un disparador de lugar equivalente a "en".'
  ),
  entry(
    'ho-4-precio-suelto-con-simbolo',
    'holdout',
    'basic',
    'alquiler de piso en Alcalá de Henares 850€',
    { operation: 'rent', propertyType: 'flat', maxPrice: '850' },
    'Alcalá de Henares',
    'Importe suelto con símbolo de moneda: presupuesto máximo (decisión de diseño). Lugar con preposición interna.'
  ),
  entry(
    'ho-5-superficie-minima',
    'holdout',
    'combined',
    'piso de al menos 80 m2 en Leganés',
    { propertyType: 'flat', minSurface: '80' },
    'Leganés',
    '"Al menos" expresa un mínimo.'
  ),
  entry(
    'ho-6-lugar-inexistente',
    'holdout',
    'hard-negative',
    'casa en venta en Atlantis',
    { operation: 'sale', propertyType: 'house' },
    'Atlantis',
    'Lugar que no existe: el intérprete solo extrae el texto; resolverlo es de la capa web.'
  ),
  entry(
    'ho-7-funcion-no-soportada-y-negacion',
    'holdout',
    'hard-negative',
    'local comercial en alquiler sin ascensor en Alcobendas',
    { operation: 'rent', propertyType: 'commercial' },
    'Alcobendas',
    '"Sin ascensor" no es un criterio soportado ni debe afectar al lugar posterior.'
  ),
  entry(
    'ho-8-habitaciones-y-banos',
    'holdout',
    'combined',
    'dúplex con 3 habitaciones y 2 baños en Fuenlabrada',
    { propertyType: 'duplex', minRooms: '3', minBathrooms: '2' },
    'Fuenlabrada',
    'El número exacto de habitaciones se interpreta como mínimo; tipo dúplex.'
  ),
  entry(
    'ho-9-distancia-no-es-lugar',
    'holdout',
    'hard-negative',
    'viviendas a 500 metros del metro en Getafe',
    {},
    'Getafe',
    '"500 metros del metro" es una distancia, no una superficie; el lugar es Getafe.'
  ),
  entry(
    'ho-10-mil-decimal-sin-preposicion-de-lugar',
    'holdout',
    'hard-negative',
    'alquiler piso Madrid hasta 1,5 mil euros',
    { operation: 'rent', propertyType: 'flat', maxPrice: '1500' },
    'Madrid',
    '"1,5 mil" son 1.500 euros. El lugar viene sin preposición: un usuario real lo escribe así.'
  ),
  entry(
    'ho-11-orden-mas-barato',
    'holdout',
    'combined',
    'piso más barato en Getafe',
    { propertyType: 'flat', sort: 'price', dir: 'asc' },
    'Getafe',
    '"Más barato" pide orden ascendente por precio.'
  ),
  entry(
    'ho-12-venta-y-alquiler',
    'holdout',
    'hard-negative',
    'venta y alquiler de pisos en Madrid',
    { propertyType: 'flat' },
    'Madrid',
    'Operaciones contradictorias: no se elige ninguna.'
  ),
  entry(
    'ho-13-entre-y-mil',
    'holdout',
    'combined',
    'casa entre 200 y 300 mil euros en Toledo',
    { propertyType: 'house', minPrice: '200000', maxPrice: '300000' },
    'Toledo',
    'Rango con multiplicador solo en el segundo extremo.'
  ),
  entry(
    'ho-14-plaza-de-garaje',
    'holdout',
    'basic',
    'plaza de garaje en alquiler en Leganés',
    { operation: 'rent', propertyType: 'garage' },
    'Leganés',
    'Tipo compuesto "plaza de garaje".'
  ),

  // ---------------------------------------------------------------------- dev
  entry(
    'dev-1-frase-completa',
    'dev',
    'combined',
    'piso en alquiler en Getafe hasta 900 € con 2 habitaciones',
    { operation: 'rent', propertyType: 'flat', maxPrice: '900', minRooms: '2' },
    'Getafe',
    'Escenario canónico de la especificación.'
  ),
  entry(
    'dev-2-solo-tipo',
    'dev',
    'basic',
    'casa',
    { propertyType: 'house' },
    null,
    'Una sola palabra de tipo.'
  ),
  entry(
    'dev-3-solo-operacion',
    'dev',
    'basic',
    'quiero comprar',
    { operation: 'sale' },
    null,
    '"Comprar" es operación de venta; "quiero" es relleno.'
  ),
  entry('dev-4-solo-lugar', 'dev', 'basic', 'en Vallecas', {}, 'Vallecas', 'Solo un lugar.'),
  entry(
    'dev-5-rango-precio',
    'dev',
    'basic',
    'piso entre 600 y 800 euros',
    { propertyType: 'flat', minPrice: '600', maxPrice: '800' },
    null,
    'Rango con moneda en el segundo extremo.'
  ),
  entry(
    'dev-6-desde-precio',
    'dev',
    'basic',
    'apartamento desde 1.000 euros al mes',
    { propertyType: 'flat', minPrice: '1000' },
    null,
    '"Apartamento" equivale a piso; "1.000" es mil con punto de miles; "al mes" no es criterio.'
  ),
  entry(
    'dev-7-precio-presupuesto-suelto',
    'dev',
    'hard-negative',
    'alquiler 900 €',
    { operation: 'rent', maxPrice: '900' },
    null,
    'Importe suelto con moneda: presupuesto máximo (el diseño lo registra como dato).'
  ),
  entry(
    'dev-8-miles-con-punto-y-decimal-con-coma',
    'dev',
    'hard-negative',
    'alquiler hasta 1.200 euros',
    { operation: 'rent', maxPrice: '1200' },
    null,
    '"1.200" son mil doscientos euros.'
  ),
  entry(
    'dev-9-decimal-con-coma-millones',
    'dev',
    'hard-negative',
    'casa hasta 1,2 millones de euros',
    { propertyType: 'house', maxPrice: '1200000' },
    null,
    '"1,2 millones" son 1.200.000, no 1,2.'
  ),
  entry(
    'dev-10-k',
    'dev',
    'hard-negative',
    'piso en venta hasta 300k euros',
    { operation: 'sale', propertyType: 'flat', maxPrice: '300000' },
    null,
    '"k" multiplica por mil.'
  ),
  entry(
    'dev-11-menos-de-mil',
    'dev',
    'combined',
    'piso en venta por menos de 250 mil euros en Móstoles',
    { operation: 'sale', propertyType: 'flat', maxPrice: '250000' },
    'Móstoles',
    '"Mil" multiplica; "por menos de" es un comparador máximo.'
  ),
  entry(
    'dev-12-minimo-habitaciones',
    'dev',
    'basic',
    'piso con mínimo 3 habitaciones',
    { propertyType: 'flat', minRooms: '3' },
    null,
    '"Mínimo 3" es un mínimo.'
  ),
  entry(
    'dev-13-mas-de-habitaciones',
    'dev',
    'hard-negative',
    'piso con más de 2 habitaciones',
    { propertyType: 'flat', minRooms: '3' },
    null,
    '"Más de 2" es estrictamente mayor: 3.'
  ),
  entry(
    'dev-14-hasta-habitaciones',
    'dev',
    'hard-negative',
    'piso hasta 3 hab.',
    { propertyType: 'flat' },
    null,
    'Un máximo de habitaciones no existe como filtro: no debe convertirse en un mínimo.'
  ),
  entry(
    'dev-15-entre-habitaciones',
    'dev',
    'hard-negative',
    'piso entre 2 y 3 habitaciones',
    { propertyType: 'flat', minRooms: '2' },
    null,
    'El máximo no existe como filtro, pero el límite inferior sí es la intención del usuario.'
  ),
  entry(
    'dev-16-terraza-ascensor',
    'dev',
    'hard-negative',
    'piso con terraza y ascensor en Getafe',
    { propertyType: 'flat' },
    'Getafe',
    'Terraza y ascensor no son criterios soportados; el lugar sigue siendo Getafe.'
  ),
  entry(
    'dev-17-sin-ascensor',
    'dev',
    'hard-negative',
    'piso sin ascensor',
    { propertyType: 'flat' },
    null,
    'La negación no debe producir un criterio.'
  ),
  entry(
    'dev-18-no-quiero-atico',
    'dev',
    'hard-negative',
    'no quiero ático, busco piso en alquiler',
    { operation: 'rent', propertyType: 'flat' },
    null,
    'Negación explícita de un tipo: ático no es criterio.'
  ),
  entry(
    'dev-19-metros-del-metro',
    'dev',
    'hard-negative',
    'piso a 300 metros del metro',
    { propertyType: 'flat' },
    null,
    'Distancia, no superficie.'
  ),
  entry(
    'dev-20-superficie-metros-cuadrados',
    'dev',
    'basic',
    'piso con más de 90 metros cuadrados',
    { propertyType: 'flat', minSurface: '90' },
    null,
    '"Metros cuadrados" con comparador es superficie.'
  ),
  entry(
    'dev-21-minimo-mayor-que-maximo',
    'dev',
    'hard-negative',
    'piso desde 1500 € hasta 800 €',
    { propertyType: 'flat', minPrice: '1500', maxPrice: '800' },
    null,
    'El intérprete respeta lo escrito; el esquema de búsqueda es quien rechaza el mínimo mayor que el máximo.',
    false
  ),
  entry(
    'dev-22-venta-y-alquiler-conflicto',
    'dev',
    'hard-negative',
    'piso en venta o en alquiler en Getafe',
    { propertyType: 'flat' },
    'Getafe',
    'Operaciones contradictorias: no se elige ninguna.'
  ),
  entry(
    'dev-23-cifra-sin-unidad',
    'dev',
    'hard-negative',
    'piso hasta 900',
    { propertyType: 'flat', maxPrice: '900' },
    null,
    'Quien escribe "hasta 900" casi seguro habla de euros, pero la especificación deja el número sin unidad como no reconocido: es un fallo medido por prudencia.'
  ),
  entry(
    'dev-24-con-garaje',
    'dev',
    'hard-negative',
    'piso con garaje',
    { propertyType: 'flat' },
    null,
    '"Con garaje" es una prestación, no el tipo de inmueble.'
  ),
  entry(
    'dev-25-casa-de-dos-pisos',
    'dev',
    'hard-negative',
    'casa de dos pisos',
    { propertyType: 'house' },
    null,
    '"Dos pisos" describe la casa; el tipo es casa.'
  ),
  entry(
    'dev-26-orden-por-superficie',
    'dev',
    'combined',
    'pisos en Leganés ordenados por superficie',
    { propertyType: 'flat', sort: 'surface' },
    'Leganés',
    'Orden por superficie sin dirección explícita.'
  ),
  entry(
    'dev-27-casa-de-campo',
    'dev',
    'hard-negative',
    'piso cerca de la Casa de Campo',
    { propertyType: 'flat' },
    'Casa de Campo',
    '"Casa de Campo" es un lugar, no el tipo casa.'
  ),
  entry(
    'dev-28-pagina',
    'dev',
    'hard-negative',
    'piso en Getafe página 3',
    { propertyType: 'flat' },
    'Getafe',
    'La paginación nunca se deduce de un texto libre.'
  ),
];
