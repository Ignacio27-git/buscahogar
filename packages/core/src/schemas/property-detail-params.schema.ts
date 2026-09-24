// ROADMAP 1.12 (diseño D2; docs/DECISIONS.md, decisión 061) — límite Zod del
// parámetro de ruta `listingId` de `/properties/[listingId]`. Un uuid
// malformado describe NINGÚN recurso (a diferencia de un filtro de búsqueda
// con typo, que sigue describiendo una página que existe): la página lo
// trata como `notFound()`, nunca como un rechazo nombrado en línea
// (diferencia deliberada con `search-query.schema.ts`, diseño D2).
import { z } from 'zod';

// `z.uuid()`, no `z.string().uuid()`: esta última está marcada legacy en
// zod@4.5.4 (mismo criterio que `z.int()` en `listing.schema.ts`, decisión
// 021).
export const propertyDetailParamsSchema = z.object({
  listingId: z.uuid(),
});

export type PropertyDetailParams = z.infer<typeof propertyDetailParamsSchema>;
