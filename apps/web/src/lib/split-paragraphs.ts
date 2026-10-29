// D.9 (decisión 174) — parte la descripción en párrafos: normaliza los saltos
// de línea (CRLF y CR), separa por rachas de saltos, recorta y descarta los
// bloques vacíos. Sin descripción devuelve una lista vacía.
export function splitParagraphs(text: string | null): readonly string[] {
  if (text === null) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}
