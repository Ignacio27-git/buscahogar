// Adaptación al NGMEP real (paso 1.13 continuado) — el fichero real de
// MUNICIPIOS.csv usa coma decimal para coordenadas y superficie
// (`-2,512507724`). `parseFloat`/`Number` de JavaScript NO entienden la
// coma como separador decimal: `parseFloat('-2,512507724')` devuelve `-2`
// SIN avisar (se detiene en la coma, como si fuera un separador de miles) —
// cada centroide aterrizaría a cientos de kilómetros de su municipio real, y
// la caja delimitadora de España (sanity.ts) seguiría pasando, porque
// "-2, 42" también cae dentro de España. Esta función PURA es el único
// punto del conversor que decide qué es un decimal válido: nunca trunca en
// silencio, nunca hace un "mejor esfuerzo" — una entrada ambigua o corrupta
// (más de un separador, texto no numérico, cadena vacía) falla ruidoso,
// nombrando el valor exacto visto.
export class MalformedDecimalError extends Error {
  constructor(raw: string) {
    super(
      `Valor "${raw}" no es un decimal válido (coma o punto, un único separador). ` +
        `Nunca se trunca en silencio en la coma — ver AI-NOTES sobre parseFloat('-2,512507724') → -2.`
    );
  }
}

// Como mucho un separador decimal (coma o punto), nunca ambos ni varios —
// eso es exactamente lo que distingue un dato real de uno corrupto aquí.
const DECIMAL_PATTERN = /^-?\d+([.,]\d+)?$/;

export function parseCommaDecimal(raw: string): number {
  const trimmed = raw.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new MalformedDecimalError(raw);
  }
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value)) {
    throw new MalformedDecimalError(raw);
  }
  return value;
}
