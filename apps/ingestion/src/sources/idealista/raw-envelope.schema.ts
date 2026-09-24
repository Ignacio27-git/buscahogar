// Paso 1.6 — esquema Zod del envelope crudo de página de Idealista (diseño
// D2). Mismo razonamiento looseObject que raw-element.schema.ts: una página
// ya pagada no se descarta por una clave nueva del vendor.
import { z } from 'zod';

// Cota de contención de blast-radius, no un techo documentado — la
// investigación de este cambio no encontró ninguno. No protege cuota (de
// eso se encarga budget.ts) — protege COBERTURA: un totalPages absurdo
// atraparía el barrido en el primer filtro y quemaría ahí todo el
// presupuesto de peticiones.
export const MAX_TRUSTED_TOTAL_PAGES = 1000;

export const rawEnvelopeSchema = z.looseObject({
  // Elemento a elemento se valida por separado con rawElementSchema (el
  // shell del adaptador construye `items`/`rejectedElements` a partir de
  // este array) — aquí solo se exige que sea un array.
  elementList: z.array(z.unknown()),
  totalPages: z.int().nonnegative().max(MAX_TRUSTED_TOTAL_PAGES),
  actualPage: z.int().positive(),
  itemsPerPage: z.int().positive(),
  total: z.number().optional(),
  paginable: z.boolean().optional(),
});

export type RawEnvelope = z.infer<typeof rawEnvelopeSchema>;
