// ROADMAP 3.1 (decisión 120) — tokenización con posiciones sobre el texto
// ORIGINAL. Cada token lleva `text` (tal como lo escribió el usuario, útil
// para distinguir "M" de millones de "m" de metros) y `norm` (sin acentos y
// en minúsculas, la forma con la que se compara el vocabulario).
import { normalizeSearchName } from '../normalize-search-name.js';

export interface Token {
  readonly text: string;
  readonly norm: string;
  readonly start: number;
  readonly end: number;
  // Había una coma, punto, punto y coma, dos puntos o signo de cierre justo
  // detrás: corta las ristras de texto (lugar, fragmentos no reconocidos).
  readonly punctAfter: boolean;
}

const LEADING_NOISE = /^[¿¡("'«]+/;
const TRAILING_NOISE = /[,.;:!?…)"'»]+$/;
const BREAKING_PUNCT = /[,.;:!?…]/;
// Número (con separadores de millares/decimales) con un sufijo pegado.
const NUMBER_WITH_SUFFIX = /^(\d+(?:[.,]\d+)*)([^\d.,].*)$/;
// Ordinales pegados (2º, 3ª): son un único token, no un número y un sufijo.
const ORDINAL_SUFFIX = /^[ºª°]$/;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const raw = match[0];
    const rawStart = match.index;
    const leading = LEADING_NOISE.exec(raw)?.[0].length ?? 0;
    const withoutLeading = raw.slice(leading);
    const trailingMatch = TRAILING_NOISE.exec(withoutLeading);
    const core = trailingMatch === null ? withoutLeading : withoutLeading.slice(0, trailingMatch.index);
    const punct = trailingMatch !== null && BREAKING_PUNCT.test(trailingMatch[0]);
    if (core === '') {
      // Un signo suelto ("," entre espacios) cierra el token anterior.
      const previous = tokens[tokens.length - 1];
      if (punct && previous !== undefined) {
        tokens[tokens.length - 1] = { ...previous, punctAfter: true };
      }
      continue;
    }
    const coreStart = rawStart + leading;
    const pieces = splitPieces(core, coreStart);
    pieces.forEach((piece, index) => {
      tokens.push({
        text: piece.text,
        norm: normalizeSearchName(piece.text),
        start: piece.start,
        end: piece.start + piece.text.length,
        punctAfter: punct && index === pieces.length - 1,
      });
    });
  }
  return tokens;
}

interface Piece {
  readonly text: string;
  readonly start: number;
}

// "900€/mes" → "900", "€", "mes"; "80m2" → "80", "m2"; "2º" se queda entero.
function splitPieces(core: string, coreStart: number): Piece[] {
  const match = NUMBER_WITH_SUFFIX.exec(core);
  if (match === null) {
    return [{ text: core, start: coreStart }];
  }
  const numberText = match[1] ?? '';
  const rest = match[2] ?? '';
  if (ORDINAL_SUFFIX.test(rest)) {
    return [{ text: core, start: coreStart }];
  }
  const pieces: Piece[] = [{ text: numberText, start: coreStart }];
  let offset = coreStart + numberText.length;
  for (const part of rest.split('/')) {
    if (part !== '') {
      pieces.push({ text: part, start: offset });
    }
    offset += part.length + 1;
  }
  return pieces;
}
