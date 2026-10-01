import { listingSchema, type Listing } from '../schemas/listing.schema.js';

// Fábrica de `Listing` para el corpus etiquetado (ROADMAP 1.9; relocado
// junto al corpus a `src/evaluation/` en ROADMAP 2.2 — decisión 090) y para
// los tests de `rule-based-strategy`/`signals`/`winner`, que la alcanzan
// reexportada desde `test/test-helpers.ts`. Pasa SIEMPRE por
// `listingSchema.parse`, nunca por un cast — así ningún `Listing` inválido
// puede colarse en el corpus, que es exactamente la garantía que
// `makeListing` existe para dar (CLAUDE.md: la validación de dominio no se
// salta ni siquiera en fixtures de test). `sourceId`/`externalId` se generan
// con un contador de módulo para que dos llamadas sin overrides produzcan
// `Listing`s distintos, nunca duplicados accidentales por defecto.
let sequence = 0;

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
