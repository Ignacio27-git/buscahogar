// ROADMAP 3.1 (decisión 120) — contrato del intérprete de lenguaje natural.
// La salida tiene la forma de los search params de la URL (cadenas), de modo
// que `params` se pasa tal cual a `searchQuerySchema`: no hay un segundo
// esquema de filtros. Este tipo es también la costura por la que, más
// adelante, podría entrar un intérprete distinto (p. ej. un LLM) sin tocar
// a los consumidores.

// Los únicos parámetros que el intérprete puede emitir. Deliberadamente NO
// incluye page, view, lat, lng, radius, polygon ni zone: la paginación, la
// vista y la geografía no se deducen nunca de un texto libre.
export const NL_PARAM_KEYS = [
  'operation',
  'propertyType',
  'minPrice',
  'maxPrice',
  'minSurface',
  'maxSurface',
  'minRooms',
  'minBathrooms',
  'sort',
  'dir',
] as const;

export type NlParamKey = (typeof NL_PARAM_KEYS)[number];

// Posición en UTF-16 sobre el texto ORIGINAL (`end` exclusivo).
export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export interface RecognisedFragment {
  readonly field: NlParamKey | 'place';
  readonly value: string;
  readonly text: string;
  readonly span: TextSpan;
}

// Mismo campo con valores distintos: no se elige ninguno.
export interface NlConflict {
  readonly field: NlParamKey | 'place';
  readonly fragments: readonly RecognisedFragment[];
}

export interface NlSearchInterpretation {
  // Importes en euros (hasta dos decimales); listo para `searchQuerySchema`.
  readonly params: Readonly<Partial<Record<NlParamKey, string>>>;
  readonly placeText: string | null;
  readonly recognised: readonly RecognisedFragment[];
  readonly conflicts: readonly NlConflict[];
  readonly unrecognised: readonly string[];
}
