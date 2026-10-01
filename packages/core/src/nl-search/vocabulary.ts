// ROADMAP 3.1 (decisión 120) — vocabulario del intérprete. Todo está en la
// forma normalizada (sin acentos, minúsculas) porque se compara contra
// `Token.norm`. Las frases de varias palabras se emparejan de la más larga a
// la más corta, así que "local comercial" gana a "local" y "plaza de garaje"
// a "garaje".
import type { OperationType } from '../types/operation-type.js';
import type { PropertyType } from '../types/property-type.js';

export interface PhraseEntry<T> {
  readonly words: readonly string[];
  readonly value: T;
}

// Compila una tabla "frase → valor" ordenada de la frase más larga a la más
// corta.
export function phraseTable<T>(entries: readonly (readonly [string, T])[]): readonly PhraseEntry<T>[] {
  return entries
    .map(([phrase, value]) => ({ words: phrase.split(' '), value }))
    .sort((a, b) => b.words.length - a.words.length);
}

export const OPERATIONS = phraseTable<OperationType>([
  ['venta', 'sale'],
  ['en venta', 'sale'],
  ['de venta', 'sale'],
  ['comprar', 'sale'],
  ['compra', 'sale'],
  ['para comprar', 'sale'],
  ['alquiler', 'rent'],
  ['en alquiler', 'rent'],
  ['de alquiler', 'rent'],
  ['alquilar', 'rent'],
  ['para alquilar', 'rent'],
  ['renta', 'rent'],
  ['en renta', 'rent'],
]);

export const PROPERTY_TYPE_PHRASES = phraseTable<PropertyType>([
  ['piso', 'flat'],
  ['pisos', 'flat'],
  ['apartamento', 'flat'],
  ['apartamentos', 'flat'],
  ['casa', 'house'],
  ['casas', 'house'],
  ['chalet', 'house'],
  ['chalets', 'house'],
  ['adosado', 'house'],
  ['adosada', 'house'],
  ['adosados', 'house'],
  ['adosadas', 'house'],
  ['atico', 'penthouse'],
  ['aticos', 'penthouse'],
  ['duplex', 'duplex'],
  ['estudio', 'studio'],
  ['estudios', 'studio'],
  ['loft', 'studio'],
  ['lofts', 'studio'],
  ['terreno', 'land'],
  ['terrenos', 'land'],
  ['solar', 'land'],
  ['solares', 'land'],
  ['parcela', 'land'],
  ['parcelas', 'land'],
  ['local', 'commercial'],
  ['locales', 'commercial'],
  ['local comercial', 'commercial'],
  ['locales comerciales', 'commercial'],
  ['garaje', 'garage'],
  ['garajes', 'garage'],
  ['parking', 'garage'],
  ['plaza de garaje', 'garage'],
  ['plazas de garaje', 'garage'],
  ['plaza de parking', 'garage'],
  ['trastero', 'storage_room'],
  ['trasteros', 'storage_room'],
  ['edificio', 'building'],
  ['edificios', 'building'],
]);

// Comparadores de rango. `strict` solo importa para los conteos: "más de 2
// habitaciones" son 3, mientras que "al menos 2" son 2. Para importes y
// superficies, "más de X" se lee como cota inferior X (decisión 120).
export interface Comparator {
  readonly bound: 'min' | 'max';
  readonly strict: boolean;
}

export const COMPARATORS = phraseTable<Comparator>([
  ['hasta', { bound: 'max', strict: false }],
  ['maximo', { bound: 'max', strict: false }],
  ['como maximo', { bound: 'max', strict: false }],
  ['menos de', { bound: 'max', strict: true }],
  ['por debajo de', { bound: 'max', strict: true }],
  ['inferior a', { bound: 'max', strict: true }],
  ['desde', { bound: 'min', strict: false }],
  ['minimo', { bound: 'min', strict: false }],
  ['como minimo', { bound: 'min', strict: false }],
  ['a partir de', { bound: 'min', strict: false }],
  ['al menos', { bound: 'min', strict: false }],
  ['mas de', { bound: 'min', strict: true }],
  ['superior a', { bound: 'min', strict: true }],
  ['por encima de', { bound: 'min', strict: true }],
]);

export const CURRENCY_WORDS: ReadonlySet<string> = new Set(['€', 'eur', 'euro', 'euros']);
export const SURFACE_UNIT_WORDS: ReadonlySet<string> = new Set(['m2', 'm²', 'mts', 'metro', 'metros']);

// Multiplicadores en número de posiciones decimales. La "M" mayúscula (con
// la `text` original) es millones; la "m" minúscula sola es ambigua
// (metros/millones) y no figura aquí.
export const MULTIPLIER_SHIFTS: Readonly<Record<string, number>> = {
  k: 3,
  mil: 3,
  millon: 6,
  millones: 6,
};

export const ROOM_NOUNS: ReadonlySet<string> = new Set([
  'habitacion',
  'habitaciones',
  'hab',
  'habs',
  'dormitorio',
  'dormitorios',
  'dorm',
]);
export const BATHROOM_NOUNS: ReadonlySet<string> = new Set(['bano', 'banos', 'aseo', 'aseos']);

export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

export const ORDINAL_WORDS: ReadonlySet<string> = new Set([
  'primer',
  'primero',
  'primera',
  'segundo',
  'segunda',
  'tercer',
  'tercero',
  'tercera',
  'cuarto',
  'cuarta',
  'quinto',
  'quinta',
  'sexto',
  'sexta',
  'septimo',
  'octavo',
  'noveno',
  'decimo',
  'ultimo',
  'ultima',
]);

export interface SortChoice {
  readonly sort: 'price' | 'surface' | 'updated';
  readonly dir?: 'asc' | 'desc';
}

const SORT_ENTRIES: (readonly [string, SortChoice])[] = [
  ['mas barato', { sort: 'price', dir: 'asc' }],
  ['mas baratos', { sort: 'price', dir: 'asc' }],
  ['mas barata', { sort: 'price', dir: 'asc' }],
  ['mas baratas', { sort: 'price', dir: 'asc' }],
  ['mas caro', { sort: 'price', dir: 'desc' }],
  ['mas caros', { sort: 'price', dir: 'desc' }],
  ['mas cara', { sort: 'price', dir: 'desc' }],
  ['mas caras', { sort: 'price', dir: 'desc' }],
  ['mas grande', { sort: 'surface', dir: 'desc' }],
  ['mas grandes', { sort: 'surface', dir: 'desc' }],
  ['mas pequeno', { sort: 'surface', dir: 'asc' }],
  ['mas pequenos', { sort: 'surface', dir: 'asc' }],
  ['mas pequena', { sort: 'surface', dir: 'asc' }],
  ['mas pequenas', { sort: 'surface', dir: 'asc' }],
  ['mas reciente', { sort: 'updated', dir: 'desc' }],
  ['mas recientes', { sort: 'updated', dir: 'desc' }],
  ['mas nuevo', { sort: 'updated', dir: 'desc' }],
  ['mas nuevos', { sort: 'updated', dir: 'desc' }],
  ['de menor a mayor precio', { sort: 'price', dir: 'asc' }],
  ['de mayor a menor precio', { sort: 'price', dir: 'desc' }],
  ['de menor a mayor superficie', { sort: 'surface', dir: 'asc' }],
  ['de mayor a menor superficie', { sort: 'surface', dir: 'desc' }],
];

const ORDER_PREFIXES = ['ordenado por', 'ordenados por', 'ordenada por', 'ordenadas por', 'ordenar por'] as const;
const ORDER_CRITERIA: readonly (readonly [string, SortChoice['sort']])[] = [
  ['precio', 'price'],
  ['superficie', 'surface'],
  ['tamano', 'surface'],
  ['fecha', 'updated'],
  ['actualizacion', 'updated'],
];
for (const prefix of ORDER_PREFIXES) {
  for (const [noun, sort] of ORDER_CRITERIA) {
    SORT_ENTRIES.push([`${prefix} ${noun}`, { sort }]);
  }
}

export const SORT_PHRASES = phraseTable<SortChoice>(SORT_ENTRIES);
export const DIRECTION_WORDS: Readonly<Record<string, 'asc' | 'desc'>> = {
  ascendente: 'asc',
  descendente: 'desc',
};

// Palabras que introducen un lugar ("cerca de X" equivale a "en X").
export const PLACE_TRIGGERS = phraseTable<true>([
  ['en', true],
  ['en la zona de', true],
  ['cerca de', true],
  ['zona de', true],
  ['zona', true],
]);

// Palabras de las que un lugar nunca forma parte: cortan la ristra que sigue
// al disparador.
export const PLACE_STOP_WORDS: ReadonlySet<string> = new Set([
  'con',
  'sin',
  'que',
  'para',
  'y',
  'o',
  'e',
  'no',
  'pero',
  'hasta',
  'desde',
  'entre',
  'por',
  'ordenado',
  'ordenados',
  'ordenada',
  'ordenadas',
  'minimo',
  'maximo',
  'cerca',
  'zona',
]);

// Palabras de relleno: se descartan en los bordes de un fragmento no
// reconocido ("busco un piso" no deja "busco" ni "un" como no entendidos). Ni
// `con` ni `sin` lo son: "con terraza" se informa entero.
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  'un',
  'una',
  'unos',
  'unas',
  'el',
  'la',
  'los',
  'las',
  'lo',
  'me',
  'quiero',
  'queremos',
  'quisiera',
  'busco',
  'buscamos',
  'buscando',
  'necesito',
  'necesitamos',
  'gustaria',
  'mejor',
  'primero',
  'primeros',
  'vivienda',
  'viviendas',
  'inmueble',
  'inmuebles',
  'propiedad',
  'propiedades',
]);

// Conectores que, además de ser relleno, separan dos fragmentos distintos
// ("con terraza y ascensor" son dos cosas no entendidas).
export const SEPARATOR_WORDS: ReadonlySet<string> = new Set(['y', 'o', 'e']);

// Antecedentes que niegan el criterio siguiente.
export const NEGATION_WORDS: ReadonlySet<string> = new Set(['no', 'sin']);
export const NEGATION_VERBS: ReadonlySet<string> = new Set([
  'quiero',
  'busco',
  'necesito',
  'queremos',
  'buscamos',
  'necesitamos',
  'deseo',
]);
