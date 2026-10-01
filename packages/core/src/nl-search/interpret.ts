// ROADMAP 3.1 (decisión 120) — intérprete determinista de español a criterios
// de búsqueda. PURO: sin red, sin Next, sin ORM, sin fecha ni azar.
//
// Una pasada por emparejadores en orden fijo (operación → orden → rangos →
// conteos → tipo → lugar) sobre los tokens aún no consumidos. Lo que ningún
// emparejador consume se devuelve como `unrecognised`: el intérprete prefiere
// no entender a adivinar, porque un criterio falso filtra mal en silencio.
// Nunca emite page, view, lat, lng, radius, polygon ni zone (`NL_PARAM_KEYS`).
import { normalizeSearchName } from '../normalize-search-name.js';
import { formatDecimal, parseSpanishNumber, shiftDecimal } from './amount.js';
import type { Decimal } from './amount.js';
import { tokenize } from './tokenize.js';
import type { Token } from './tokenize.js';
import { NL_PARAM_KEYS } from './types.js';
import type { NlConflict, NlParamKey, NlSearchInterpretation, RecognisedFragment } from './types.js';
import {
  BATHROOM_NOUNS,
  COMPARATORS,
  CURRENCY_WORDS,
  DIRECTION_WORDS,
  FILLER_WORDS,
  MULTIPLIER_SHIFTS,
  NEGATION_VERBS,
  NEGATION_WORDS,
  NUMBER_WORDS,
  OPERATIONS,
  ORDINAL_WORDS,
  PLACE_STOP_WORDS,
  PLACE_TRIGGERS,
  PROPERTY_TYPE_PHRASES,
  ROOM_NOUNS,
  SEPARATOR_WORDS,
  SORT_PHRASES,
  SURFACE_UNIT_WORDS,
} from './vocabulary.js';
import type { PhraseEntry } from './vocabulary.js';

type Field = NlParamKey | 'place';

// Tope del texto de lugar: el mismo que `zoneQuerySchema` (64).
const MAX_PLACE_LENGTH = 64;
// Un importe de más de 12 cifras enteras no es una búsqueda real y
// desbordaría el entero seguro al convertir a céntimos.
const MAX_INTEGER_DIGITS = 12;
const MAX_PRICE_DECIMALS = 2;

interface Claim {
  readonly field: Field;
  readonly value: string;
  readonly from: number;
  readonly to: number;
}

interface Context {
  readonly text: string;
  readonly tokens: readonly Token[];
  readonly used: boolean[];
  readonly claims: Claim[];
}

function isFree(ctx: Context, index: number): boolean {
  return index >= 0 && index < ctx.tokens.length && ctx.used[index] === false;
}

// El token `index` es libre y sigue sin puntuación de corte al anterior.
function isAdjacent(ctx: Context, index: number): boolean {
  return isFree(ctx, index) && ctx.tokens[index - 1]?.punctAfter !== true;
}

function claim(ctx: Context, from: number, to: number, entries: readonly (readonly [Field, string])[]): void {
  for (let index = from; index < to; index += 1) {
    ctx.used[index] = true;
  }
  for (const [field, value] of entries) {
    ctx.claims.push({ field, value, from, to });
  }
}

// Empareja la frase más larga de la tabla que empiece en `index` sobre
// tokens libres y sin puntuación de corte entre sus palabras.
function matchPhrase<T>(ctx: Context, index: number, table: readonly PhraseEntry<T>[]): { length: number; value: T } | null {
  for (const entry of table) {
    const length = entry.words.length;
    const fits = entry.words.every((word, offset) => {
      const token = ctx.tokens[index + offset];
      const insideBreak = offset < length - 1 && token?.punctAfter === true;
      return isFree(ctx, index + offset) && token?.norm === word && !insideBreak;
    });
    if (fits) {
      return { length, value: entry.value };
    }
  }
  return null;
}

// "no ático", "sin ascensor", "no quiero ático": el criterio no se aplica y
// sus tokens quedan sin consumir, es decir, se informan como no entendidos.
function isNegated(ctx: Context, index: number): boolean {
  const previous = ctx.tokens[index - 1];
  if (previous === undefined || previous.punctAfter) {
    return false;
  }
  if (NEGATION_WORDS.has(previous.norm)) {
    return true;
  }
  const beforeThat = ctx.tokens[index - 2];
  return (
    NEGATION_VERBS.has(previous.norm) && beforeThat?.norm === 'no' && !beforeThat.punctAfter
  );
}

// ---------------------------------------------------------------------------
// Cantidades

interface Quantity {
  readonly number: Decimal;
  readonly shift: number;
  readonly unit: 'price' | 'surface' | 'none';
  readonly hasCurrency: boolean;
  readonly from: number;
  readonly to: number;
}

// Lee `número [multiplicador] [moneda | unidad de superficie]` desde `index`.
function readQuantity(ctx: Context, index: number): Quantity | null {
  const first = ctx.tokens[index];
  if (first === undefined || !isFree(ctx, index)) {
    return null;
  }
  const number = parseSpanishNumber(first.norm);
  if (number === null) {
    return null;
  }
  let next = index + 1;
  let shift = 0;
  const multiplier = ctx.tokens[next];
  if (multiplier !== undefined && isAdjacent(ctx, next)) {
    if (multiplier.text === 'M') {
      shift = 6;
    } else {
      shift = MULTIPLIER_SHIFTS[multiplier.norm] ?? 0;
    }
    if (shift > 0) {
      next += 1;
      // "2 millones de euros"
      const preposition = ctx.tokens[next];
      const afterPreposition = ctx.tokens[next + 1];
      if (
        shift === 6 &&
        preposition?.norm === 'de' &&
        isAdjacent(ctx, next) &&
        afterPreposition !== undefined &&
        isAdjacent(ctx, next + 1) &&
        CURRENCY_WORDS.has(afterPreposition.norm)
      ) {
        next += 1;
      }
    }
  }
  const unitToken = ctx.tokens[next];
  if (unitToken !== undefined && isAdjacent(ctx, next) && CURRENCY_WORDS.has(unitToken.norm)) {
    next += 1;
    // "900 € al mes", "900 €/mes": informativo, nunca implica una operación.
    if (ctx.tokens[next]?.norm === 'al' && isAdjacent(ctx, next) && ctx.tokens[next + 1]?.norm === 'mes' && isAdjacent(ctx, next + 1)) {
      next += 2;
    } else if (ctx.tokens[next]?.norm === 'mes' && isAdjacent(ctx, next)) {
      next += 1;
    }
    return { number, shift, unit: 'price', hasCurrency: true, from: index, to: next };
  }
  if (unitToken !== undefined && isAdjacent(ctx, next) && shift === 0 && SURFACE_UNIT_WORDS.has(unitToken.norm)) {
    const following = ctx.tokens[next + 1];
    if (unitToken.norm === 'metros' && following?.norm === 'cuadrados' && isAdjacent(ctx, next + 1)) {
      return { number, shift, unit: 'surface', hasCurrency: false, from: index, to: next + 2 };
    }
    // "300 metros del metro" es una distancia, no una superficie.
    const isDistance =
      (unitToken.norm === 'metros' || unitToken.norm === 'metro') &&
      following !== undefined &&
      isAdjacent(ctx, next + 1) &&
      ['de', 'del', 'al', 'a'].includes(following.norm);
    if (!isDistance) {
      return { number, shift, unit: 'surface', hasCurrency: false, from: index, to: next + 1 };
    }
  }
  if (shift > 0) {
    return { number, shift, unit: 'price', hasCurrency: false, from: index, to: next };
  }
  return { number, shift, unit: 'none', hasCurrency: false, from: index, to: next };
}

// Valor final en la forma de la URL, o null si no es representable (más de
// dos decimales en un importe: nunca se redondea la intención del usuario).
function finalise(quantity: Quantity, unit: 'price' | 'surface', extraShift = 0): string | null {
  const value = shiftDecimal(quantity.number, quantity.shift === 0 ? extraShift : quantity.shift);
  if (value.int.length > MAX_INTEGER_DIGITS) {
    return null;
  }
  if (unit === 'price' && value.frac.length > MAX_PRICE_DECIMALS) {
    return null;
  }
  return formatDecimal(value);
}

function rangeField(bound: 'min' | 'max', unit: 'price' | 'surface'): NlParamKey {
  if (unit === 'price') {
    return bound === 'min' ? 'minPrice' : 'maxPrice';
  }
  return bound === 'min' ? 'minSurface' : 'maxSurface';
}

// ---------------------------------------------------------------------------
// Emparejadores

function matchOperations(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    const match = matchPhrase(ctx, index, OPERATIONS);
    if (match !== null && !isNegated(ctx, index)) {
      claim(ctx, index, index + match.length, [['operation', match.value]]);
    }
  }
}

function matchSort(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    const match = matchPhrase(ctx, index, SORT_PHRASES);
    if (match === null || isNegated(ctx, index)) {
      continue;
    }
    const end = index + match.length;
    const entries: (readonly [Field, string])[] = [['sort', match.value.sort]];
    if (match.value.dir !== undefined) {
      entries.push(['dir', match.value.dir]);
    }
    claim(ctx, index, end, entries);
    const direction = ctx.tokens[end];
    const dirValue = direction === undefined ? undefined : DIRECTION_WORDS[direction.norm];
    if (dirValue !== undefined && isAdjacent(ctx, end)) {
      claim(ctx, end, end + 1, [['dir', dirValue]]);
    }
  }
}

// "entre 600 y 900 euros", "entre 70 y 90 m2". La unidad (y el multiplicador
// de "entre 200 y 300 mil") puede ir solo en el segundo extremo.
function matchBetween(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    if (!isFree(ctx, index) || ctx.tokens[index]?.norm !== 'entre' || isNegated(ctx, index)) {
      continue;
    }
    const low = readQuantity(ctx, index + 1);
    if (low === null || ctx.tokens[low.to]?.norm !== 'y' || !isAdjacent(ctx, low.to)) {
      continue;
    }
    const conjunction = low.to;
    const high = readQuantity(ctx, conjunction + 1);
    if (high === null) {
      continue;
    }
    const unit = low.unit !== 'none' ? low.unit : high.unit;
    if (unit === 'none') {
      continue;
    }
    const shareShift = low.unit === 'none' && low.shift === 0 && unit === 'price' ? high.shift : 0;
    const lowValue = finalise(low, unit, shareShift);
    const highValue = finalise(high, unit);
    if (lowValue === null || highValue === null) {
      continue;
    }
    claim(ctx, index, low.to, [[rangeField('min', unit), lowValue]]);
    claim(ctx, conjunction, high.to, [[rangeField('max', unit), highValue]]);
  }
}

// "hasta 900 €", "más de 70 m2", "desde 500 euros". Sin unidad no hay
// criterio: el número queda sin reconocer.
function matchComparators(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    const match = matchPhrase(ctx, index, COMPARATORS);
    if (match === null || isNegated(ctx, index)) {
      continue;
    }
    const quantity = readQuantity(ctx, index + match.length);
    if (quantity === null || quantity.unit === 'none' || !isAdjacent(ctx, quantity.from)) {
      continue;
    }
    const value = finalise(quantity, quantity.unit);
    if (value !== null) {
      claim(ctx, index, quantity.to, [[rangeField(match.value.bound, quantity.unit), value]]);
    }
  }
}

// Un importe con moneda y sin comparador es un presupuesto máximo ("900 €"):
// expresión de uso, confirmada por el responsable de producto y registrada
// como dato en el corpus. Un importe sin moneda ("500") no se adivina.
function matchBareBudget(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    if (isNegated(ctx, index)) {
      continue;
    }
    const quantity = readQuantity(ctx, index);
    if (quantity === null || quantity.unit !== 'price' || !quantity.hasCurrency) {
      continue;
    }
    const value = finalise(quantity, 'price');
    if (value !== null) {
      claim(ctx, index, quantity.to, [['maxPrice', value]]);
    }
  }
}

interface Count {
  readonly amount: number;
  readonly field: 'minRooms' | 'minBathrooms';
  readonly to: number;
}

function readCount(ctx: Context, index: number): Count | null {
  const token = ctx.tokens[index];
  const noun = ctx.tokens[index + 1];
  if (token === undefined || noun === undefined || !isFree(ctx, index) || !isAdjacent(ctx, index + 1)) {
    return null;
  }
  let amount: number | undefined;
  if (/^\d{1,2}$/.test(token.norm)) {
    amount = Number(token.norm);
  } else {
    amount = NUMBER_WORDS[token.norm];
  }
  if (amount === undefined) {
    return null;
  }
  if (ROOM_NOUNS.has(noun.norm)) {
    return { amount, field: 'minRooms', to: index + 2 };
  }
  if (BATHROOM_NOUNS.has(noun.norm)) {
    return { amount, field: 'minBathrooms', to: index + 2 };
  }
  return null;
}

// Habitaciones y baños. "más de 2" son 3 (decisión 120); un máximo ("hasta
// 3 hab.") no existe en el modelo y no se convierte en mínimo.
function matchCounts(ctx: Context): void {
  const blocked = new Set<number>();
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    if (!isFree(ctx, index)) {
      continue;
    }
    const comparator = matchPhrase(ctx, index, COMPARATORS);
    if (comparator !== null) {
      const count = readCount(ctx, index + comparator.length);
      if (count === null) {
        continue;
      }
      if (comparator.value.bound === 'max') {
        blocked.add(index + comparator.length);
      } else if (!isNegated(ctx, index)) {
        const amount = count.amount + (comparator.value.strict ? 1 : 0);
        claim(ctx, index, count.to, [[count.field, String(amount)]]);
      }
      continue;
    }
    if (isNegated(ctx, index)) {
      continue;
    }
    // "con 2 habitaciones", "de 3 hab."
    const lead = ctx.tokens[index];
    if ((lead?.norm === 'con' || lead?.norm === 'de') && !lead.punctAfter) {
      const count = blocked.has(index + 1) ? null : readCount(ctx, index + 1);
      if (count !== null) {
        claim(ctx, index, count.to, [[count.field, String(count.amount)]]);
        continue;
      }
    }
    // "entre 2 y 3 habitaciones": el segundo extremo no es un mínimo.
    const isRangeEnd = ctx.tokens[index - 1]?.norm === 'y' && ctx.tokens[index - 3]?.norm === 'entre';
    const count = readCount(ctx, index);
    if (count !== null && !blocked.has(index) && !isRangeEnd) {
      claim(ctx, index, count.to, [[count.field, String(count.amount)]]);
    }
  }
}

function isCountOrOrdinal(token: Token): boolean {
  if (/^\d+$/.test(token.norm) || /^\d+[ºª°]$/.test(token.norm) || ORDINAL_WORDS.has(token.norm)) {
    return true;
  }
  return (NUMBER_WORDS[token.norm] ?? 0) >= 2;
}

// Un nombre de tipo no cuenta como tipo cuando: lo precede "con" ("con
// garaje"), un número u ordinal ("casa de dos pisos", "segundo piso") o un
// disparador de lugar ("en Casa de Campo").
function isTypeBlocked(ctx: Context, index: number): boolean {
  const previous = ctx.tokens[index - 1];
  if (previous === undefined || previous.punctAfter) {
    return false;
  }
  if (previous.norm === 'con' || isCountOrOrdinal(previous)) {
    return true;
  }
  const beforePrevious = ctx.tokens[index - 2];
  return (
    previous.norm === 'en' ||
    previous.norm === 'zona' ||
    (previous.norm === 'de' && (beforePrevious?.norm === 'zona' || beforePrevious?.norm === 'cerca'))
  );
}

function matchTypes(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    const match = matchPhrase(ctx, index, PROPERTY_TYPE_PHRASES);
    if (match !== null && !isNegated(ctx, index) && !isTypeBlocked(ctx, index)) {
      claim(ctx, index, index + match.length, [['propertyType', match.value]]);
    }
  }
}

// Lugar: el disparador ("en", "cerca de", "zona de") más la ristra máxima de
// tokens libres que sigue, cortada por un token ya consumido, puntuación, una
// cifra o una palabra de parada. El texto sale tal como lo escribió el
// usuario; resolverlo contra la base de datos es cosa de la web.
function matchPlaces(ctx: Context): void {
  for (let index = 0; index < ctx.tokens.length; index += 1) {
    const trigger = matchPhrase(ctx, index, PLACE_TRIGGERS);
    if (trigger === null) {
      continue;
    }
    const start = index + trigger.length;
    let end = start;
    while (end < ctx.tokens.length && ctx.tokens[end - 1]?.punctAfter !== true) {
      const token = ctx.tokens[end];
      if (token === undefined || !isFree(ctx, end) || PLACE_STOP_WORDS.has(token.norm) || /\d/.test(token.norm)) {
        break;
      }
      end += 1;
    }
    const first = ctx.tokens[start];
    const last = ctx.tokens[end - 1];
    if (end === start || first === undefined || last === undefined) {
      continue;
    }
    const placeText = ctx.text.slice(first.start, last.end);
    if (placeText.length > MAX_PLACE_LENGTH) {
      continue;
    }
    claim(ctx, index, end, [['place', placeText]]);
  }
}

// ---------------------------------------------------------------------------
// Ensamblado

function toFragment(ctx: Context, item: Claim): RecognisedFragment {
  const start = ctx.tokens[item.from]?.start ?? 0;
  const end = ctx.tokens[item.to - 1]?.end ?? start;
  return { field: item.field, value: item.value, text: ctx.text.slice(start, end), span: { start, end } };
}

function collectUnrecognised(ctx: Context): string[] {
  const result: string[] = [];
  let run: Token[] = [];
  const flush = (): void => {
    let from = 0;
    let to = run.length;
    while (from < to && FILLER_WORDS.has(run[from]?.norm ?? '')) {
      from += 1;
    }
    while (to > from && FILLER_WORDS.has(run[to - 1]?.norm ?? '')) {
      to -= 1;
    }
    const first = run[from];
    const last = run[to - 1];
    if (first !== undefined && last !== undefined) {
      result.push(ctx.text.slice(first.start, last.end));
    }
    run = [];
  };
  ctx.tokens.forEach((token, index) => {
    if (ctx.used[index] === true || SEPARATOR_WORDS.has(token.norm)) {
      flush();
      return;
    }
    run.push(token);
    if (token.punctAfter) {
      flush();
    }
  });
  flush();
  return result;
}

export function interpretSearchText(text: string): NlSearchInterpretation {
  const tokens = tokenize(text);
  const ctx: Context = { text, tokens, used: tokens.map(() => false), claims: [] };

  matchOperations(ctx);
  matchSort(ctx);
  matchBetween(ctx);
  matchComparators(ctx);
  matchBareBudget(ctx);
  matchCounts(ctx);
  matchTypes(ctx);
  matchPlaces(ctx);

  const params: Partial<Record<NlParamKey, string>> = {};
  const recognised: RecognisedFragment[] = [];
  const conflicts: NlConflict[] = [];
  let placeText: string | null = null;

  const fields: readonly Field[] = [...NL_PARAM_KEYS, 'place'];
  for (const field of fields) {
    const fragments = ctx.claims.filter((item) => item.field === field).map((item) => toFragment(ctx, item));
    if (fragments.length === 0) {
      continue;
    }
    const distinct = new Set(
      fragments.map((fragment) => (field === 'place' ? normalizeSearchName(fragment.value) : fragment.value))
    );
    if (distinct.size > 1) {
      conflicts.push({ field, fragments });
      continue;
    }
    recognised.push(...fragments);
    const value = fragments[0]?.value;
    if (value === undefined) {
      continue;
    }
    if (field === 'place') {
      placeText = value;
    } else {
      params[field] = value;
    }
  }
  recognised.sort((a, b) => a.span.start - b.span.start);

  return { params, placeText, recognised, conflicts, unrecognised: collectUnrecognised(ctx) };
}
