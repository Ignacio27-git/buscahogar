// ROADMAP 3.1 (decisión 120) — importes con aritmética decimal EXACTA sobre
// cadenas. En coma flotante 1.1 * 1000 da 1100.0000000000002, y un importe
// así acabaría en la URL: por eso los multiplicadores (k, mil, millón)
// desplazan la coma decimal como texto, nunca multiplican.

export interface Decimal {
  readonly int: string;
  readonly frac: string;
}

const THOUSANDS_GROUPS = /^[1-9]\d{0,2}(\.\d{3})+$/;
const NUMBER_SHAPE = /^\d+(?:[.,]\d+)*$/;

function normalise(int: string, frac: string): Decimal {
  return { int: int.replace(/^0+(?=\d)/, '') || '0', frac: frac.replace(/0+$/, '') };
}

// Convención española: la coma es el separador decimal; el punto es de
// millares solo si va seguido de exactamente tres dígitos en cada grupo
// ("1.200" = 1200) y, si no, se lee como decimal ("1.5"). Todo lo demás
// ("1.20.0", "1,2,3") es ambiguo y devuelve null: no se adivina.
export function parseSpanishNumber(value: string): Decimal | null {
  if (!NUMBER_SHAPE.test(value)) {
    return null;
  }
  const commaParts = value.split(',');
  if (commaParts.length > 2) {
    return null;
  }
  if (commaParts.length === 2) {
    const before = commaParts[0] ?? '';
    const after = commaParts[1] ?? '';
    if (before.includes('.') && !THOUSANDS_GROUPS.test(before)) {
      return null;
    }
    if (after.includes('.')) {
      return null;
    }
    return normalise(before.replaceAll('.', ''), after);
  }
  if (!value.includes('.')) {
    return normalise(value, '');
  }
  if (THOUSANDS_GROUPS.test(value)) {
    return normalise(value.replaceAll('.', ''), '');
  }
  const dotParts = value.split('.');
  if (dotParts.length !== 2) {
    return null;
  }
  return normalise(dotParts[0] ?? '', dotParts[1] ?? '');
}

// Multiplica por 10^places moviendo la coma sobre la cadena de dígitos.
export function shiftDecimal(value: Decimal, places: number): Decimal {
  const digits = value.int + value.frac;
  const point = value.int.length + places;
  const padded = point > digits.length ? digits.padEnd(point, '0') : digits;
  return normalise(padded.slice(0, point), padded.slice(point));
}

export function formatDecimal(value: Decimal): string {
  return value.frac === '' ? value.int : `${value.int}.${value.frac}`;
}
