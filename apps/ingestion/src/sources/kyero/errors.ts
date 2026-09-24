// Paso 1.14 — taxonomía de errores del adaptador de Kyero (diseño D6/D7,
// tarea 2.2). Base común `KyeroSweepError`, mismo razonamiento que
// `IdealistaSweepError` (apps/ingestion/src/sources/idealista/errors.ts):
// un llamador futuro puede capturar con un único `catch (error) { if (error
// instanceof KyeroSweepError) ... }` sin enumerar cada subclase.
export class KyeroSweepError extends Error {}

// Root <kyero> ausente, XML mal formado, o cualquier otro fallo de
// parseFeed (spec "Feed Parsing and Root Validation"): nunca se produce una
// página parcial, siempre se lanza.
export class KyeroFeedParseError extends KyeroSweepError {
  readonly observation: string;

  constructor(observation: string) {
    super(`No se pudo parsear el feed de Kyero: ${observation}`);
    this.observation = observation;
  }
}

// Cursor malformado o ajeno a la consulta actual (diseño D11): nunca cae
// en silencio a la página 0.
export class KyeroInvalidCursorError extends KyeroSweepError {
  readonly received: string;
  readonly reason: string;

  constructor(received: string, reason: string) {
    super(`Cursor inválido "${received}": ${reason}`);
    this.received = received;
    this.reason = reason;
  }
}

// Tope duro de páginas por barrido superado (diseño D12): lanza con un
// cursor de reanudación, nunca trunca en silencio.
export class KyeroPageCapExceededError extends KyeroSweepError {
  readonly resumeCursor: string;

  constructor(resumeCursor: string) {
    super(`Tope de páginas por barrido alcanzado. Reanudar en el cursor: ${resumeCursor}.`);
    this.resumeCursor = resumeCursor;
  }
}

// Una instancia = una única área ligada (mismo principio que
// SweepAreaMismatchError de Idealista): una segunda área distinta en la
// misma instancia se rechaza, nunca se atiende en silencio.
export class KyeroAreaMismatchError extends KyeroSweepError {
  readonly expected: unknown;
  readonly received: unknown;

  constructor(expected: unknown, received: unknown) {
    super('La instancia del adaptador ya está ligada a otra área: una instancia = un barrido.');
    this.expected = expected;
    this.received = received;
  }
}

// Último rechazo del normalizador (diseño D7 caveat): moneda distinta de
// EUR llegando hasta aquí es un bug del filtro previo, no un dato a
// inventar (nunca convierte divisa).
export class KyeroNormalizationError extends KyeroSweepError {}
