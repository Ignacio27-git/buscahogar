// Paso 1.6 — taxonomía de errores del barrido de Idealista (diseño D5).
//
// Base común `IdealistaSweepError` para que un llamador (ROADMAP 1.7) pueda
// capturar con un único `catch (error) { if (error instanceof
// IdealistaSweepError) ... }` sin enumerar cada subclase. Uniforme y
// resumible: TODO fallo de barrido lanza, nunca devuelve una página vacía
// con el mismo cursor — eso reintroduciría exactamente el "spin" que A6
// prohíbe. Por eso incluso un fallo de transporte no-2xx lanza en lugar de
// devolver una SourcePage vacía.
//
// Nota de fichero: este módulo se escribe completo desde el principio de la
// fase 2 (en vez de esperar a la tarea 2.12 del checklist) porque cursor.ts
// (2.4), budget.ts (2.6) y sweep-planner.ts (2.11) necesitan importar estas
// clases antes de esa tarea. El checklist original lista las tareas en el
// orden de especificación, no el orden físico de creación de ficheros — ver
// la nota de desviación en el informe de esta fase.
export class IdealistaSweepError extends Error {}

export class InvalidCursorError extends IdealistaSweepError {
  readonly received: string;
  readonly reason: string;

  constructor(received: string, reason: string) {
    super(`Cursor inválido "${received}": ${reason}`);
    this.received = received;
    this.reason = reason;
  }
}

export class SweepAreaMismatchError extends IdealistaSweepError {
  readonly expected: unknown;
  readonly received: unknown;

  constructor(expected: unknown, received: unknown) {
    super('La instancia del adaptador ya está ligada a otra área: una instancia = un barrido.');
    this.expected = expected;
    this.received = received;
  }
}

export interface BudgetSnapshotLike {
  readonly search: number;
  readonly token: number;
}

export class SweepBudgetExhaustedError extends IdealistaSweepError {
  readonly resumeCursor: string;
  readonly spent: BudgetSnapshotLike;

  constructor(resumeCursor: string, spent: BudgetSnapshotLike) {
    super(`Tope de peticiones alcanzado. Reanudar en el cursor: ${resumeCursor}.`);
    this.resumeCursor = resumeCursor;
    this.spent = spent;
  }
}

export class UntrustworthyEnvelopeError extends IdealistaSweepError {
  readonly field: string;
  readonly received: unknown;
  readonly resumeCursor: string;

  constructor(field: string, received: unknown, resumeCursor: string) {
    super(`Envelope no fiable: el campo "${field}" no supera la validación. Reanudar en: ${resumeCursor}.`);
    this.field = field;
    this.received = received;
    this.resumeCursor = resumeCursor;
  }
}

export class SweepTransportError extends IdealistaSweepError {
  readonly kind: string;
  readonly status?: number;
  readonly resumeCursor: string;
  readonly observation: string;

  constructor(kind: string, resumeCursor: string, observation: string, status?: number) {
    super(`Fallo de transporte (${kind}) al pedir la página. Reanudar en: ${resumeCursor}.`);
    this.kind = kind;
    this.resumeCursor = resumeCursor;
    this.observation = observation;
    this.status = status;
  }
}
