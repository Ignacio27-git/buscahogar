// Distancia de Hamming pura entre dos hashes perceptuales de 64 bits
// (ROADMAP 2.3, decisión 095). Los hashes llegan siempre como 16 caracteres
// hexadecimales (8 bytes) — nunca BigInt: se parte cada hash en dos mitades
// de 32 bits, se calcula el XOR por mitad y se cuentan los bits a 1 con un
// popcount SWAR (Sideways Addition), la técnica estándar para contar bits
// sin depender de un tipo de 64 bits nativo. Los operadores bit a bit de
// JavaScript ya operan en enteros de 32 bits con signo (ToInt32), así que
// una mitad como 0xffffffff se reinterpreta en negativo pero conserva el
// patrón de bits exacto — el popcount trabaja sobre ese patrón, nunca sobre
// el valor con signo.
const HEX64_PATTERN = /^[0-9a-fA-F]{16}$/;

function assertHex64(hash: string): void {
  if (!HEX64_PATTERN.test(hash)) {
    throw new RangeError(
      `hammingDistance64: hash malformado, se esperan exactamente 16 caracteres hexadecimales, recibido "${hash}".`
    );
  }
}

function parseHalf(hex8: string): number {
  // parseInt puede devolver hasta 0xffffffff (4294967295); `| 0` lo
  // reinterpreta como entero de 32 bits con signo preservando el patrón de
  // bits exacto (ToInt32), sin BigInt.
  return parseInt(hex8, 16) | 0;
}

// Popcount SWAR de 32 bits: suma por pares, luego por cuartetos, luego
// colapsa con una multiplicación y desplaza el byte alto — constante
// clásica, sin bucle, sin tabla de consulta.
function popcount32(bits: number): number {
  let x = bits - ((bits >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

export function hammingDistance64(a: string, b: string): number {
  assertHex64(a);
  assertHex64(b);

  const highA = parseHalf(a.slice(0, 8));
  const lowA = parseHalf(a.slice(8, 16));
  const highB = parseHalf(b.slice(0, 8));
  const lowB = parseHalf(b.slice(8, 16));

  return popcount32(highA ^ highB) + popcount32(lowA ^ lowB);
}
