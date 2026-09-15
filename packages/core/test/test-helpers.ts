import { listingSchema, type Listing } from '../src/schemas/listing.schema.js';

// Utilidad compartida entre suites de test de esquemas. Existe para evitar
// desestructurar-y-descartar una variable (`const { x: _x, ...rest } = obj`),
// que el linter compartido marca como no-unused-vars: `argsIgnorePattern`
// solo perdona parámetros de función, no variables desestructuradas.
export function withoutField<T extends Record<string, unknown>>(
  obj: T,
  field: keyof T
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => key !== field));
}

let sequence = 0;

// Fábrica de `Listing` para el corpus etiquetado de ROADMAP 1.9
// (dedup-corpus.ts) y para los tests de `rule-based-strategy`/`signals`.
// Pasa SIEMPRE por `listingSchema.parse`, nunca por un cast — así ningún
// `Listing` inválido puede colarse en el corpus, que es exactamente la
// garantía que `makeListing` existe para dar (CLAUDE.md: la validación de
// dominio no se salta ni siquiera en fixtures de test). `sourceId`/
// `externalId` se generan con un contador de módulo para que dos llamadas
// sin overrides produzcan `Listing`s distintos, nunca duplicados
// accidentales por defecto.
export function makeListing(overrides: Partial<Listing> = {}): Listing {
  sequence += 1;
  const id = sequence.toString();

  return listingSchema.parse({
    sourceId: 'idealista',
    externalId: `listing-${id}`,
    url: `https://example.com/listing-${id}`,
    operation: 'sale',
    propertyType: 'flat',
    priceCents: 200_000_00,
    ...overrides,
  });
}
