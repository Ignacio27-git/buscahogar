// Evidencia de deduplicación (CLAUDE.md): SimilarityResult debe exponer
// siempre la puntuación total Y el desglose completo por señal, nunca solo
// una de las dos — es el dato que no se puede reconstruir después. Forma
// byte-idéntica al par escrito a mano en packages/db/src/types.ts, que el
// paso 7 sustituye por una reexportación de este mismo tipo.
//
// Una señal individual considerada por una DedupStrategy: su valor
// normalizado, el peso que tuvo en la puntuación final y un detalle legible
// opcional (p. ej. "misma dirección exacta").
export interface SignalScore {
  readonly value: number;
  readonly weight: number;
  readonly detail?: string;
}

// Desglose por señal, indexado por clave de señal abierta (no una struct con
// un campo fijo por señal): decisión 006 fija la acumulación de señales pero
// no la lista concreta, y la señal de imágenes queda explícitamente diferida
// sin que la forma la prohíba estructuralmente.
export type SignalBreakdown = Readonly<Record<string, SignalScore>>;

export interface SimilarityResult {
  // Rango fijado en ROADMAP 1.9 (docs/DECISIONS.md, decisión 048):
  // `score` es siempre un número en el intervalo cerrado [0, 1], normalizado
  // sobre el peso EFECTIVAMENTE aplicado (las señales evaluadas), nunca
  // sobre el peso máximo configurado — decisión 049 explica por qué.
  readonly score: number;
  readonly signals: SignalBreakdown;
}
