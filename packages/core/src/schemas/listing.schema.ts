// Esquema Zod para la salida del normalizador: la única forma que cruza la
// frontera entre un adaptador de fuente y el resto del dominio. Deriva su
// tipo con z.infer (convención mixta, D2 del diseño) porque aquí la deriva
// entre tipo y validación es cara — ver src/index.ts para el razonamiento
// completo.
//
// Objeto no estricto (por defecto en Zod 4): una clave extra que un
// adaptador arrastre por error se elimina, no se rechaza. Es la forma
// correcta de aplicar D6 (nada específico de una fuente sobrevive a la
// frontera), no una tolerancia accidental — un rechazo aquí solo convertiría
// un bug interno del adaptador en un crash, sin proteger nada más.
import { z } from 'zod';

import { OPERATION_TYPES } from '../types/operation-type.js';
import { PROPERTY_TYPES } from '../types/property-type.js';
import { appliedFeatureSchema, coordinatesSchema, locationSchema } from './area-query.schema.js';

export const listingSchema = z.object({
  sourceId: z.string(),
  externalId: z.string(),
  url: z.string(),
  operation: z.enum(OPERATION_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  // z.int(), no z.number().int(): esta última está marcada legacy en
  // zod@4.5.4 y no acota el rango de entero seguro. z.int() es
  // ZodNumberFormat<"safeint"> y sí lo hace — el límite del que depende la
  // decisión 021 para céntimos como number.
  priceCents: z.int().positive(),

  surfaceM2: z.number().optional(),
  rooms: z.number().optional(),
  bathrooms: z.number().optional(),
  floor: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  coordinates: coordinatesSchema.optional(),
  location: locationSchema.optional(),
  // Tri-estado deliberado (decisión 026): `undefined` significa "sin señal
  // fiable", nunca se infiere como `false`.
  coordinatesObfuscated: z.boolean().optional(),
  // ROADMAP 1.11 — .optional(), nunca .nullable(): cero nulos JSON en el
  // campo `thumbnail` de las fixtures reales (docs/DECISIONS.md, decisión
  // 059).
  thumbnailUrl: z.string().optional(),

  features: z.array(appliedFeatureSchema).readonly().default([]),
});

export type Listing = z.infer<typeof listingSchema>;
