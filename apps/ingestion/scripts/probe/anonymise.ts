// Sonda de la API de Idealista (paso 1.5) — anonimizador de la fixture.
//
// Recorrido único recursivo que deniega por defecto dentro de una "zona PII"
// (contactInfo, owner, seller...) y detecta email/teléfono en texto libre
// fuera de ella. Ver docs/DECISIONS.md y el diseño de la fase para el
// razonamiento completo: una lista de claves a mantener falla en abierto el
// día que la fuente añada un campo nuevo; una lista de claves a redactar
// falla en cerrado. El coste —perder un campo que el paso 1.6 quería— es
// recuperable desde la copia cruda local; una fuga de PII en el historial de
// git no lo es.

export type Json = string | number | boolean | null | Json[] | { readonly [key: string]: Json };

export interface RedactionFinding {
  readonly path: string;
  readonly kind: 'phone' | 'email';
  readonly action: 'rewritten' | 'review-required';
}

export interface AnonymiseReport {
  readonly redactedLeaves: number;
  readonly keptKeyPaths: readonly string[];
  readonly findings: readonly RedactionFinding[];
}

// Una clave que coincida abre una zona PII heredada por todos los
// descendientes (nunca se cierra). Coincide por patrón, no por literal, para
// que un campo renombrado o nuevo (`sellerContact`, `agencyDetails`) entre en
// la zona automáticamente.
const ZONE_KEY_RE = /contact|user|owner|agenc|seller|vendedor|phone|tel|email|mail/i;

// Dentro de una zona, solo estas claves reciben tratamiento especial de
// cadena (enmascarado de dígitos) en lugar del `[REDACTED]` por defecto.
const PHONE_KEY_RE = /phone|tel/i;

// Único campo mantenido verbatim dentro de una zona: la señal
// agencia-vs-particular que el paso 1.6 necesita de verdad.
const KEPT_KEY_INSIDE_ZONE = 'userType';

// Campos de texto libre donde un teléfono se reescribe siempre, sin importar
// la longitud del valor.
const FREE_TEXT_KEYS = new Set(['description', 'title', 'subtitle']);

// Por debajo de este umbral de longitud, un patrón de teléfono en un campo
// que no es texto libre se considera probablemente un identificador (p. ej.
// `propertyCode`) y no se reescribe automáticamente.
const FREE_TEXT_LENGTH_THRESHOLD = 40;

const EMAIL_PATTERN = String.raw`[\w.+-]+@[\w-]+\.[\w.-]+`;
// El separador tras el prefijo internacional solo se consume junto con el
// propio prefijo: si el patrón se abriera a `[\s.-]?` de forma incondicional,
// "Llamar al 612345678" perdería el espacio anterior al número dentro de la
// coincidencia y la reescritura pegaría la palabra previa a `[REDACTED_PHONE]`.
const PHONE_PATTERN = String.raw`(?:(?:\+34|0034)[\s.-]?)?[6-9]\d{2}(?:[\s.-]?\d{2}){3}`;

// Se construye una expresión regular nueva en cada llamada para no reutilizar
// el estado de `lastIndex` de una instancia global entre distintas cadenas:
// `RegExp.prototype.test` con la marca `g` no lo reinicia y encadenar
// llamadas sobre valores distintos produciría falsos negativos silenciosos.
function containsEmail(value: string): boolean {
  return new RegExp(EMAIL_PATTERN).test(value);
}

function rewriteEmail(value: string): string {
  return value.replace(new RegExp(EMAIL_PATTERN, 'g'), '[REDACTED_EMAIL]');
}

function containsPhone(value: string): boolean {
  return new RegExp(PHONE_PATTERN).test(value);
}

function rewritePhone(value: string): string {
  return value.replace(new RegExp(PHONE_PATTERN, 'g'), '[REDACTED_PHONE]');
}

function maskDigits(value: string): string {
  return value.replace(/\d/g, '0');
}

// Sustituye cada índice de array por `[]` para que `keptKeyPaths` sea una
// lista corta y revisable por un humano en lugar de una entrada por cada uno
// de los 50 elementos de `elementList`.
function normalisePath(path: string): string {
  return path.replace(/\[\d+\]/g, '[]');
}

interface WalkState {
  redactedLeaves: number;
  readonly keptKeyPaths: Set<string>;
  readonly findings: RedactionFinding[];
}

export function isJsonObject(value: Json): value is { readonly [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Trata una hoja escalar dentro de una zona PII. `key` es la clave propia de
// la hoja (o, para elementos de un array, la clave del propio array), nunca
// la clave que abrió la zona en un ancestro más lejano.
function redactZoneLeaf(key: string, value: string | number | boolean | null, state: WalkState): Json {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (key === KEPT_KEY_INSIDE_ZONE) return value;
  if (typeof value === 'number') {
    state.redactedLeaves += 1;
    return 0;
  }
  state.redactedLeaves += 1;
  if (PHONE_KEY_RE.test(key)) return maskDigits(value);
  return '[REDACTED]';
}

// Trata una hoja de tipo cadena fuera de una zona PII: detección global de
// email/teléfono, reescritura acotada. Los valores que no son cadena pasan
// intactos fuera de zona.
function sweepFreeTextLeaf(key: string, path: string, value: string, state: WalkState): string {
  let result = value;
  let touched = false;

  if (containsEmail(value)) {
    result = rewriteEmail(result);
    state.findings.push({ path, kind: 'email', action: 'rewritten' });
    touched = true;
  }

  if (containsPhone(value)) {
    const shouldRewrite = FREE_TEXT_KEYS.has(key) || value.length >= FREE_TEXT_LENGTH_THRESHOLD;
    if (shouldRewrite) {
      result = rewritePhone(result);
      state.findings.push({ path, kind: 'phone', action: 'rewritten' });
    } else {
      // El valor detectado nunca se registra: solo la ruta y el tipo de
      // patrón, para que el propio hallazgo no reintroduzca el dato sensible
      // en la consola o en un artefacto.
      state.findings.push({ path, kind: 'phone', action: 'review-required' });
    }
    touched = true;
  }

  if (!touched) {
    state.keptKeyPaths.add(normalisePath(path));
  }

  return result;
}

function walkNode(key: string, value: Json, path: string, inZone: boolean, state: WalkState): Json {
  const zoneHere = inZone || ZONE_KEY_RE.test(key);

  if (Array.isArray(value)) {
    return value.map((item, index) => walkNode(key, item, `${path}[${String(index)}]`, zoneHere, state));
  }

  if (isJsonObject(value)) {
    const result: Record<string, Json> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = walkNode(childKey, childValue, `${path}.${childKey}`, zoneHere, state);
    }
    return result;
  }

  if (zoneHere) {
    return redactZoneLeaf(key, value, state);
  }

  if (typeof value === 'string') {
    return sweepFreeTextLeaf(key, path, value, state);
  }

  // number | boolean | null fuera de zona: no son texto libre, pasan intactos.
  return value;
}

function walkRoot(input: Json, state: WalkState): Json {
  if (Array.isArray(input)) {
    return input.map((item, index) => walkNode('', item, `[${String(index)}]`, false, state));
  }

  if (isJsonObject(input)) {
    const result: Record<string, Json> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = walkNode(key, value, key, false, state);
    }
    return result;
  }

  if (typeof input === 'string') {
    return sweepFreeTextLeaf('', '', input, state);
  }

  return input;
}

export function anonymise(input: Json): { readonly document: Json; readonly report: AnonymiseReport } {
  const state: WalkState = { redactedLeaves: 0, keptKeyPaths: new Set(), findings: [] };
  const document = walkRoot(input, state);

  return {
    document,
    report: {
      redactedLeaves: state.redactedLeaves,
      keptKeyPaths: [...state.keptKeyPaths].sort(),
      findings: state.findings,
    },
  };
}
