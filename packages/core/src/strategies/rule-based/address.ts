// Pipeline de normalización y puntuación de direcciones (ADX-1..ADX-5,
// decisión 047). Operacionaliza "dirección exacta" (decisión 006) sin
// tocar la decisión original: exige un token de nivel de calle además de
// la igualdad de cadena, porque la igualdad literal sola colisiona sobre
// el 20% de los anuncios reales medidos en un único barrio-cadena (obs
// #143, "Piso en Trafalgar, Madrid", 10/50 anuncios, 45 pares).
import type { SignalScore } from '../../types/similarity.js';
import { WEIGHTS } from './weights.js';

// Medidos en los dos fixtures reales comprometidos (2×50 anuncios,
// apps/ingestion/test/fixtures/idealista/search-{homes,premises}-2026-09-10.json).
export const STREET_TOKENS_OBSERVED = ['calle', 'cl', 'glorieta', 'plaza'] as const;

// Convención española estándar, NO observada todavía en ninguna fuente
// real comprometida. Re-medir cuando llegue una segunda fuente (ROADMAP
// 1.14) — el versionado de la estrategia (decisión 020) hace de ese
// re-medido un bump obligatorio, no una ampliación silenciosa.
export const STREET_TOKENS_CONVENTIONAL = [
  'avenida',
  'avda',
  'av',
  'paseo',
  'ronda',
  'travesia',
  'camino',
  'carretera',
  'ctra',
  'callejon',
  'cuesta',
  'costanilla',
  'pasaje',
  'rambla',
  'bulevar',
  'gran via',
  'c/',
  'pza',
  'pl',
] as const;

const STREET_TOKENS: readonly string[] = [...STREET_TOKENS_OBSERVED, ...STREET_TOKENS_CONVENTIONAL];

const EN_ANCHOR = ' en ';

// NFD (descomposición canónica) → plegado de diacríticos → minúsculas →
// colapso de espacios → recorte. El plegado de diacríticos se hace sobre
// la forma NFD porque ahí cada tilde es un carácter combinante propio
// (rango U+0300-U+036F) que un simple `replace` puede eliminar sin tocar
// la letra base.
export function normalise(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Recorta el prefijo "<Tipo> en " anclando en el ÚLTIMO " en " que aparece
// ANTES de la primera coma — nunca en el primero. El fixture de `premises`
// contiene direcciones reales con un doble " en " ("Local en rentabilidad
// en Calle del León, ..."), donde anclar en el primero habría dejado
// "rentabilidad en calle del leon" como head, perdiendo la clasificación
// de nivel de calle (ADX-1b). Sin ningún " en " en esa región, body es la
// cadena normalizada completa — degradación sin excepción, nunca un
// lanzamiento.
export function body(raw: string): string {
  const normalised = normalise(raw);
  const commaIndex = normalised.indexOf(',');
  const searchRegion = commaIndex === -1 ? normalised : normalised.slice(0, commaIndex);
  const lastEnIndex = searchRegion.lastIndexOf(EN_ANCHOR);

  return lastEnIndex === -1 ? normalised : normalised.slice(lastEnIndex + EN_ANCHOR.length);
}

// Primer segmento de `body`, hasta la primera coma — es donde, en las 100
// direcciones reales inspeccionadas en el diseño de este cambio, vive el
// token de nivel de calle cuando existe.
export function head(raw: string): string {
  const bodyValue = body(raw);
  const commaIndex = bodyValue.indexOf(',');

  return commaIndex === -1 ? bodyValue : bodyValue.slice(0, commaIndex);
}

function startsWithToken(text: string, token: string): boolean {
  if (!text.startsWith(token)) {
    return false;
  }

  const boundary = text.charAt(token.length);
  return boundary === ' ' || boundary === '.' || boundary === '/';
}

// `head(s)` es una función pura de `s`, así que dos direcciones cuyo
// `body` normalizado coincide comparten exactamente el mismo resultado
// aquí (ADX-1a): la presencia del token nunca puede darse "en un lado sí,
// en el otro no" para un par ya considerado igual.
export function isStreetLevel(raw: string): boolean {
  const headValue = head(raw);
  return STREET_TOKENS.some((token) => startsWithToken(headValue, token));
}

function absent(detail: string): SignalScore {
  return { value: 0, weight: 0, detail };
}

export interface AddressSignals {
  readonly addressExact: SignalScore;
  readonly addressZone: SignalScore;
}

// La escalera de cuatro filas de ADX-2..ADX-5. `addressExact` y
// `addressZone` son mutuamente excluyentes por construcción — nunca las dos
// a la vez con valor positivo — porque `isStreetLevel` es una función total
// de la cadena compartida (ADX-1a), así que este `if` nunca deja un caso
// sin cubrir.
export function scoreAddress(addressA: string | undefined, addressB: string | undefined): AddressSignals {
  if (addressA === undefined || addressB === undefined) {
    // ADX-5: una dirección ausente en cualquiera de los dos lados marca AMBAS
    // claves como ausentes, nunca como desacuerdo — no hay evidencia que
    // comparar, así que no puede haber evidencia EN CONTRA.
    return {
      addressExact: absent('dirección ausente en uno de los dos anuncios'),
      addressZone: absent('dirección ausente en uno de los dos anuncios'),
    };
  }

  const bodyA = body(addressA);
  const bodyB = body(addressB);

  if (bodyA !== bodyB) {
    // ADX-4: banda débil (el mismo peso que ADX-3), nunca la fuerte y nunca
    // peso 0 — dos portales rutinariamente deletrean distinto la misma
    // dirección, así que el desacuerdo es evidencia débil en contra, no
    // ausencia de evidencia. Por diseño, una dirección ausente (peso 0)
    // puntúa MÁS alto que una en desacuerdo (peso 8, valor 0).
    return {
      addressExact: { value: 0, weight: WEIGHTS.addressZone, detail: 'direcciones normalizadas distintas' },
      addressZone: absent('direcciones distintas; no aplica la banda de zona'),
    };
  }

  if (isStreetLevel(addressA)) {
    // ADX-2: cuerpos iguales y con token de nivel de calle — banda fuerte.
    return {
      addressExact: {
        value: 1,
        weight: WEIGHTS.addressExact,
        detail: 'misma dirección normalizada, con token de nivel de calle',
      },
      addressZone: absent('coincidencia fuerte ya cubierta por addressExact'),
    };
  }

  // ADX-3: cuerpos iguales, SIN token de nivel de calle — banda débil de
  // zona. Es exactamente el caso de "Piso en Trafalgar, Madrid" (obs #143):
  // 10/50 anuncios reales comparten esta cadena y no son la misma vivienda.
  return {
    addressExact: absent('coincidencia sin token de nivel de calle; solo cuenta como zona'),
    addressZone: {
      value: 1,
      weight: WEIGHTS.addressZone,
      detail: 'misma dirección normalizada, sin token de nivel de calle',
    },
  };
}
