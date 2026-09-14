// Paso 1.6 — planNext: las cinco condiciones de terminación del barrido
// (diseño, "Data flow"), pura y sin I/O.
//
// Condiciones cubiertas aquí: (1) actualPage/página >= totalPages → avanza
// al siguiente filtro, página 1; (2) los cinco filtros agotados → nextCursor
// omitido; (4) envelope no fiable → lanza (Reconciliación #1 de las tareas,
// obs #106: SIN avance silencioso, resumeCursor = la MISMA página); (5)
// elementListLength < itemsPerPage → filtro agotado sin importar totalPages
// (D3 del diseño). La condición 3 (presupuesto) NO vive aquí: se aplica
// antes de la petición, en budget.spend() — ver idealista-source.ts.
//
// `planNext` valida el envelope internamente (envuelve la frontera del
// esquema, tal y como permite la tarea 2.7: "planNext (o la frontera de
// esquema que envuelve)"): recibe `rawEnvelope: unknown`, nunca un tipo ya
// validado, para que la condición 4 sea comprobable directamente sobre esta
// función con un objeto sintético corrupto.
//
// `elementListLength` es SIEMPRE un parámetro explícito, nunca derivado de
// `items` (que ni siquiera se recibe aquí) — esta firma hace estructuralmente
// imposible la reintroducción del bug latente de D3 (comparar items.length,
// ya filtrado por rawElementSchema, en vez de elementList.length crudo).
import { encodeCursor, type SweepPosition } from './cursor.js';
import { UntrustworthyEnvelopeError } from './errors.js';
import { IDEALISTA_FILTERS } from './filters.js';
import { rawEnvelopeSchema } from './raw-envelope.schema.js';

export interface PlanResult {
  readonly nextCursor?: string;
}

function describeEnvelopeFailure(rawEnvelope: unknown, issuePath: readonly PropertyKey[]): { field: string; received: unknown } {
  const field = issuePath.length > 0 ? issuePath.map(String).join('.') : '(raíz)';
  const received =
    typeof rawEnvelope === 'object' && rawEnvelope !== null && issuePath.length > 0 && typeof issuePath[0] === 'string'
      ? (rawEnvelope as Record<string, unknown>)[issuePath[0]]
      : rawEnvelope;
  return { field, received };
}

export function planNext(position: SweepPosition, rawEnvelope: unknown, elementListLength: number): PlanResult {
  const parsed = rawEnvelopeSchema.safeParse(rawEnvelope);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const { field, received } = describeEnvelopeFailure(rawEnvelope, firstIssue?.path ?? []);
    throw new UntrustworthyEnvelopeError(field, received, encodeCursor(position));
  }

  const envelope = parsed.data;
  const filterExhausted = position.page >= envelope.totalPages || elementListLength < envelope.itemsPerPage;

  if (!filterExhausted) {
    return { nextCursor: encodeCursor({ filter: position.filter, page: position.page + 1 }) };
  }

  const currentIndex = IDEALISTA_FILTERS.indexOf(position.filter);
  const nextFilter = IDEALISTA_FILTERS[currentIndex + 1];

  if (nextFilter === undefined) {
    return {}; // condición 2: los cinco filtros agotados, barrido completo.
  }

  return { nextCursor: encodeCursor({ filter: nextFilter, page: 1 }) };
}
