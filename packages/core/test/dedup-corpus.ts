import type { Coordinates } from '../src/types/coordinates.js';
import type { Listing } from '../src/schemas/listing.schema.js';
import { makeListing } from './test-helpers.js';

// Corpus de pares etiquetados (CORP-1) para la primera DedupStrategy
// (ROADMAP 1.9). Cada entrada lleva SIEMPRE una `rationale` no vacía
// (CORP-1a) — es la evidencia que ROADMAP 1.9 pide revisar a mano, y un
// `expected` sin motivo no se puede revisar.
//
// `expected` usa la misma unión literal que `SimilarityBand`
// (strategies/rule-based/classify.ts) sin importarla: este módulo se creó
// en la fase B1 (corpus + score), antes de que `classify` existiera en la
// fase C — la unión es idéntica por construcción, así que no hace falta
// una dependencia hacia delante para que el corpus tipe correctamente
// contra `classify(strategy.score(a, b))` en dedup-corpus.test.ts.
export type ExpectedBand = 'accept' | 'undecided' | 'reject';

export interface CorpusEntry {
  readonly id: string;
  readonly a: Listing;
  readonly b: Listing;
  readonly expected: ExpectedBand;
  readonly rationale: string;
}

const MADRID_CENTER: Coordinates = { latitude: 40.4168, longitude: -3.7038 };
const EARTH_RADIUS_METERS = 6_371_000;

// Desplaza `base` hacia el norte una distancia aproximada en metros,
// reutilizando la fórmula reducida de Haversine sobre un mismo meridiano
// (Δ = R · Δlat_rad). Solo construye datos de fixture con una separación
// aproximadamente conocida; la distancia real que ve la estrategia la
// calcula siempre `haversineDistanceMeters` en producción.
function metersNorth(base: Coordinates, meters: number): Coordinates {
  const deltaLatitudeDegrees = (meters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  return { latitude: base.latitude + deltaLatitudeDegrees, longitude: base.longitude };
}

// ---------------------------------------------------------------------------
// Verdaderos positivos (CORP-2): el mismo anuncio publicado dos veces.
// ---------------------------------------------------------------------------

const truePositives: CorpusEntry[] = [
  {
    id: 'tp-1-mismo-anuncio-cerca',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 5),
      priceCents: 196_000_00,
      surfaceM2: 88,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'accept',
    rationale:
      'Mismo piso publicado dos veces: coordenadas casi idénticas (5 m), precio y superficie a menos de un 3% de diferencia, misma dirección de nivel de calle, mismas habitaciones y baños.',
  },
  {
    id: 'tp-2-otra-fuente-otro-sourceId',
    a: makeListing({
      sourceId: 'idealista',
      coordinates: MADRID_CENTER,
      priceCents: 250_000_00,
      surfaceM2: 100,
      rooms: 4,
      bathrooms: 2,
      address: 'Piso en Calle de Fuencarral, Trafalgar, Madrid',
    }),
    b: makeListing({
      sourceId: 'fotocasa',
      coordinates: metersNorth(MADRID_CENTER, 8),
      priceCents: 243_000_00,
      surfaceM2: 97,
      rooms: 4,
      bathrooms: 2,
      address: 'Piso en Calle de Fuencarral, Trafalgar, Madrid',
    }),
    expected: 'accept',
    rationale:
      'Mismo piso anunciado en dos fuentes distintas (idealista y fotocasa, sourceId distinto — CORP-2 exige al menos un caso así). Coordenadas, precio, superficie y dirección coinciden dentro de margen.',
  },
  {
    id: 'tp-3-superficie-ausente-un-lado',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 300_000_00,
      surfaceM2: 120,
      rooms: 5,
      bathrooms: 3,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 6),
      priceCents: 291_000_00,
      surfaceM2: undefined,
      rooms: 5,
      bathrooms: 3,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'accept',
    rationale:
      'CORP-2a: superficie ausente en un lado, pero el resto de señales (distancia, precio, dirección, habitaciones, baños) siguen evaluándose a peso completo — RDS-3 exige que ninguna señal ausente penalice a las demás.',
  },
  {
    id: 'tp-4-premises-sin-rooms-bathrooms',
    a: makeListing({
      propertyType: 'commercial',
      coordinates: MADRID_CENTER,
      priceCents: 180_000_00,
      surfaceM2: 60,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Local en Calle de la Reina, Chueca-Justicia, Madrid',
    }),
    b: makeListing({
      propertyType: 'commercial',
      coordinates: metersNorth(MADRID_CENTER, 4),
      priceCents: 175_000_00,
      surfaceM2: 58,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Local en Calle de la Reina, Chueca-Justicia, Madrid',
    }),
    expected: 'accept',
    rationale:
      'RDS-3a: par `premises` sin habitaciones ni baños (dato estructuralmente ausente en ese tipo de inmueble). La normalización por peso efectivo evita que la ausencia penalice: distancia, precio, superficie y dirección de nivel de calle bastan para aceptar.',
  },
  {
    id: 'tp-5-distancia-mayor-resto-fuerte',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 220_000_00,
      surfaceM2: 80,
      rooms: 3,
      bathrooms: 1,
      address: 'Piso en Calle de Carranza, Malasaña-Universidad, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 40),
      priceCents: 218_000_00,
      surfaceM2: 79,
      rooms: 3,
      bathrooms: 1,
      address: 'Piso en Calle de Carranza, Malasaña-Universidad, Madrid',
    }),
    expected: 'accept',
    rationale:
      'Distancia mayor que en el resto de positivos (40 m, aún dentro del radio típico de bloqueo), compensada por precio, superficie, dirección de nivel de calle y habitaciones/baños casi idénticos.',
  },
  {
    id: 'tp-6-direccion-en-desacuerdo-resto-fuerte',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 210_000_00,
      surfaceM2: 92,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 5),
      priceCents: 208_000_00,
      surfaceM2: 91,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Trafalgar, Trafalgar, Madrid',
    }),
    expected: 'accept',
    rationale:
      'Dos portales deletrean la dirección de forma distinta (evidencia débil en contra, peso 8 — decisión 047), pero coordenadas, precio, superficie, habitaciones y baños casi idénticos bastan para aceptar igualmente.',
  },
];

// ---------------------------------------------------------------------------
// Negativos fáciles (CORP-4): viviendas inequívocamente distintas, y los
// dos pares de veto (propertyType / operation) a puntuación alta.
// ---------------------------------------------------------------------------

const easyNegatives: CorpusEntry[] = [
  {
    id: 'en-1-lejos-y-distinto',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 150_000_00,
      surfaceM2: 60,
      rooms: 2,
      bathrooms: 1,
      address: 'Piso en Calle de Manuela Malasaña, Malasaña-Universidad, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 5_000),
      priceCents: 600_000_00,
      surfaceM2: 250,
      rooms: 6,
      bathrooms: 4,
      address: 'Ático en Glorieta de Ruiz Giménez, Malasaña-Universidad, Madrid',
    }),
    expected: 'reject',
    rationale:
      'Viviendas inequívocamente distintas: 5 km de distancia, precio y superficie con márgenes enormes, direcciones y habitaciones/baños distintos.',
  },
  {
    id: 'en-2-precio-y-superficie-muy-distintos',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 120_000_00,
      surfaceM2: 45,
      rooms: 1,
      bathrooms: 1,
      address: 'Piso en Calle de Serrano Anguita, Chueca-Justicia, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 300),
      priceCents: 700_000_00,
      surfaceM2: 300,
      rooms: 6,
      bathrooms: 5,
      address: 'Local en Plaza de Pedro Zerolo, Chueca-Justicia, Madrid',
    }),
    expected: 'reject',
    rationale: 'Precio y superficie separados por márgenes muy por encima del punto de corte (10% relativo).',
  },
  {
    id: 'en-3-veto-tipo-de-inmueble',
    a: makeListing({
      propertyType: 'flat',
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      propertyType: 'commercial',
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'reject',
    rationale:
      'CORP-4a: coordenadas, precio y superficie IDÉNTICOS (score acumulado alto), pero `propertyType` distinto (flat vs. commercial). El veto (BAND-2) fuerza `reject` a pesar del score alto.',
  },
  {
    id: 'en-4-veto-operacion',
    a: makeListing({
      operation: 'sale',
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      operation: 'rent',
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'reject',
    rationale:
      'Mismas coordenadas, precio y superficie, pero `operation` distinta (sale vs. rent — probablemente el mismo piso en venta y en alquiler, no la misma transacción). El veto fuerza `reject`.',
  },
  {
    id: 'en-5-rooms-bathrooms-coinciden-resto-no',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de San Andrés, Malasaña-Universidad, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 1_000),
      priceCents: 320_000_00,
      surfaceM2: 130,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en San Andres, Malasaña-Universidad, Madrid',
    }),
    expected: 'reject',
    rationale:
      'Habitaciones y baños coinciden, pero distancia (1 km), precio y superficie están muy por encima del punto de corte — coincidencia parcial que no basta.',
  },
  {
    id: 'en-6-distinto-en-casi-todo',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 140_000_00,
      surfaceM2: 55,
      rooms: 2,
      bathrooms: 1,
      address: 'Piso en Calle de Alberto Aguilera, Arapiles, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 800),
      priceCents: 480_000_00,
      surfaceM2: 210,
      rooms: 5,
      bathrooms: 3,
      address: 'Piso en Malasaña-Universidad, Madrid',
    }),
    expected: 'reject',
    rationale: 'Distintos en distancia, precio, superficie, dirección, habitaciones y baños simultáneamente.',
  },
];

// ---------------------------------------------------------------------------
// Negativos difíciles, mismo bloque (CORP-3): distancia corta, precio y
// superficie comparables, viviendas DISTINTAS — salvo la última entrada,
// que es idéntica en todo lo que la estrategia evalúa y por eso acepta por
// construcción (RDS-7, el falso positivo irreducible).
// ---------------------------------------------------------------------------

const hardNegatives: CorpusEntry[] = [
  {
    id: 'hn-1-trafalgar-street-less-rooms-distintos',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 80,
      rooms: 2,
      bathrooms: 1,
      address: 'Piso en Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 10),
      priceCents: 216_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 1,
      address: 'Piso en Trafalgar, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'CORP-3a: mismo bloque, comparten la cadena street-less "Piso en Trafalgar, Madrid" (obs #143, 10/50 anuncios reales, 45 pares) — degrada a addressZone (peso 8), nunca addressExact. Habitaciones distintas y precio/superficie con margen moderado: viviendas distintas del mismo edificio, nunca `accept`.',
  },
  {
    id: 'hn-2-trafalgar-street-less-bathrooms-distintos',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 210_000_00,
      surfaceM2: 85,
      rooms: 3,
      bathrooms: 1,
      address: 'Piso en Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 15),
      priceCents: 200_000_00,
      surfaceM2: 81,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Trafalgar, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'Mismo bloque, misma cadena street-less "Piso en Trafalgar, Madrid" degradada a addressZone. Mismas habitaciones pero baños distintos, precio/superficie cercanos: parecido, pero no concluyente — nunca `accept`.',
  },
  {
    id: 'hn-3-trafalgar-street-less-precio-superficie-lejos',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 80,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 25),
      priceCents: 230_000_00,
      surfaceM2: 96,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Trafalgar, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'Misma cadena street-less degradada a zona; mismas habitaciones/baños, pero precio y superficie separados por un margen amplio: evidencia mixta, nunca `accept`.',
  },
  {
    id: 'hn-4-trafalgar-street-less-casi-todo-distinto',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 80,
      rooms: 2,
      bathrooms: 1,
      address: 'Piso en Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 40),
      priceCents: 250_000_00,
      surfaceM2: 96,
      rooms: 4,
      bathrooms: 2,
      address: 'Piso en Trafalgar, Madrid',
    }),
    expected: 'reject',
    rationale:
      'Misma cadena street-less degradada a zona, pero habitaciones, baños, precio y superficie distintos simultáneamente: la única prueba de similitud real es la zona — insuficiente, `reject`.',
  },
  {
    id: 'hn-5-street-level-igual-rooms-distintos',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 2,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta, Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 10),
      priceCents: 210_000_00,
      surfaceM2: 95,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta, Trafalgar, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'Misma dirección de NIVEL DE CALLE (addressExact, peso 25 — evidencia fuerte), pero habitaciones distintas: dos pisos distintos del mismo edificio con el mismo portal. La dirección fuerte sola no basta para aceptar (RDS-4, el piso de evidencia).',
  },
  {
    id: 'hn-6-street-level-otra-calle-rooms-distintos',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 220_000_00,
      surfaceM2: 88,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Fuencarral, Trafalgar, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 20),
      priceCents: 222_000_00,
      surfaceM2: 92,
      rooms: 4,
      bathrooms: 2,
      address: 'Piso en Calle de Fuencarral, Trafalgar, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'Segunda pareja con dirección de nivel de calle igual pero habitaciones distintas, en una calle distinta a hn-5, para no depender de una sola cadena de dirección.',
  },
  {
    id: 'hn-7-misma-direccion-mismas-rooms-necesita-floor',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 5),
      priceCents: 226_000_00,
      surfaceM2: 104,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'Misma dirección de nivel de calle Y mismas habitaciones/baños — probablemente el mismo edificio y el mismo tipo de piso, pero precio y superficie difieren lo bastante como para no ser concluyentes. Distinguir de verdad este caso (¿mismo piso, otro anuncio con precio desactualizado, o piso distinto en otra planta?) necesita la señal `floor`, fuera de alcance en ROADMAP 1.9 (texto libre sin normalizador todavía) — documentado como limitación, no resuelto aquí.',
  },
  {
    id: 'hn-8-identico-en-todo-falso-positivo-irreducible',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'accept',
    rationale:
      'RDS-7: idéntico en TODOS los campos estructurados que la estrategia evalúa (coordenadas, precio, superficie, dirección de nivel de calle, habitaciones, baños). Bajo la normalización por peso efectivo (decisión 049), esto normaliza a score EXACTAMENTE 1.0 por construcción — ninguna regla puede bajarlo sin inventar evidencia que no existe. Es el falso positivo IRREDUCIBLE de una estrategia solo de datos estructurados: distinguir "el mismo piso publicado dos veces" de "dos viviendas distintas que comparten por casualidad cada campo estructurado" exigiría una señal de imagen, diferida por decisión 006. Documentado como límite conocido, NO como negativo difícil superado.',
  },
];

// ---------------------------------------------------------------------------
// Datos ausentes (CORP-5): ejercitan el piso de evidencia y la
// normalización por peso efectivo bajo distintas combinaciones de ausencia.
// ---------------------------------------------------------------------------

const missingData: CorpusEntry[] = [
  {
    id: 'md-1-premises-sin-rooms-bathrooms',
    a: makeListing({
      propertyType: 'commercial',
      coordinates: MADRID_CENTER,
      priceCents: 180_000_00,
      surfaceM2: 70,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Local en Calle de Pizarro, Malasaña-Universidad, Madrid',
    }),
    b: makeListing({
      propertyType: 'commercial',
      coordinates: metersNorth(MADRID_CENTER, 5),
      priceCents: 175_000_00,
      surfaceM2: 68,
      rooms: undefined,
      bathrooms: undefined,
      address: 'Local en Calle de Pizarro, Malasaña-Universidad, Madrid',
    }),
    expected: 'accept',
    rationale:
      'CORP-5 / RDS-3a: par `premises` sin habitaciones ni baños en ninguno de los dos lados (dato estructuralmente ausente para ese tipo). El resto de señales evaluadas (distancia, precio, superficie, dirección de nivel de calle) bastan para aceptar — la ausencia no penaliza sistemáticamente.',
  },
  {
    id: 'md-2-coordenadas-ausentes-un-lado',
    a: makeListing({
      coordinates: undefined,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    b: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 216_000_00,
      surfaceM2: 99,
      rooms: 3,
      bathrooms: 2,
      address: 'Piso en Calle de Sagasta 12, Madrid',
    }),
    expected: 'undecided',
    rationale:
      'CORP-5: coordenadas ausentes en un lado (fuente sin geolocalización en ese anuncio concreto) — `distance` queda marcada ausente, peso 0, excluida del denominador. El resto de señales, con margen moderado, deja el par en zona de revisión, no de aceptación automática.',
  },
  {
    id: 'md-3-direccion-ausente-ambos-lados',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      address: undefined,
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 5),
      priceCents: 196_000_00,
      surfaceM2: 88,
      rooms: 3,
      bathrooms: 2,
      address: undefined,
    }),
    expected: 'accept',
    rationale:
      'ADX-5 / CORP-5: dirección ausente en los dos lados (ninguna fuente la aportó) — addressExact y addressZone quedan marcadas ausentes, peso 0, excluidas del denominador. Por diseño, la ausencia no arrastra el score hacia abajo como lo haría un desacuerdo (decisión 047): el resto de señales, todas fuertes, basta para aceptar.',
  },
  {
    id: 'md-4-solo-dos-senales-evaluables',
    a: makeListing({
      coordinates: MADRID_CENTER,
      priceCents: 200_000_00,
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: undefined,
    }),
    b: makeListing({
      coordinates: metersNorth(MADRID_CENTER, 5),
      priceCents: 204_000_00,
      surfaceM2: undefined,
      rooms: undefined,
      bathrooms: undefined,
      address: undefined,
    }),
    expected: 'undecided',
    rationale:
      'CORP-5a / RDS-4: solo `distance` y `price` son evaluables (peso efectivo máximo 25+15=40, por debajo del piso de 55) — aunque ambas coincidan casi al máximo, el piso de evidencia mínima (RDS-4) impide `accept` con solo dos señales. Nunca alcanza `accept`.',
  },
];

export const dedupCorpus: CorpusEntry[] = [...truePositives, ...easyNegatives, ...hardNegatives, ...missingData];
