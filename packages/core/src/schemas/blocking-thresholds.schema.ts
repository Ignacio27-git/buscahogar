// ROADMAP 1.8 — umbrales de bloqueo de candidatos. Frontera externa real:
// entra desde la CLI de calibración (apps/ingestion/scripts/calibrate-blocking.ts).
// z.strictObject, mismo motivo que areaQuerySchema (area-query.schema.ts):
// una clave mal escrita nunca debe caer en silencio en un valor por defecto,
// y aquí el radio determina qué pares llegan a la consulta.
import { z } from 'zod';

// Todos los umbrales son absolutos y en la unidad de su propia columna
// (diseño D-Q4): radiusMeters en metros, priceBandCents en céntimos (misma
// unidad que listing_versions.price_cents), surfaceToleranceM2 en metros
// cuadrados (misma unidad que listing_versions.surface_m2). Ningún campo es
// opcional ni tiene valor por defecto: un margen sustituido en silencio se
// leería como un valor medido.
export const blockingThresholdsSchema = z.strictObject({
  radiusMeters: z.number().positive(),
  priceBandCents: z.number().int().nonnegative(),
  surfaceToleranceM2: z.number().int().nonnegative(),
});

export type BlockingThresholds = z.infer<typeof blockingThresholdsSchema>;
