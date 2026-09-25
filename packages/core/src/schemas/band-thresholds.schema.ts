// ROADMAP 2.2 — umbrales de banda para evaluación offline (decisión 088).
// Frontera externa real: entra desde la CLI de comparación de estrategias
// (apps/ingestion/src/strategy-comparison/), nunca desde producción — el
// camino de reprocesamiento clasifica siempre con las constantes por
// defecto, nunca con un valor parseado por este esquema. z.strictObject,
// mismo motivo que blockingThresholdsSchema (blocking-thresholds.schema.ts):
// una clave mal escrita nunca debe caer en silencio en un valor por defecto.
import { z } from 'zod';

export const bandThresholdsSchema = z
  .strictObject({
    high: z.number().min(0).max(1),
    low: z.number().min(0).max(1),
  })
  .refine((thresholds) => thresholds.low < thresholds.high, { message: 'low must be < high' });

export type BandThresholds = z.infer<typeof bandThresholdsSchema>;
