// Paso 1.6 — esquema Zod del elemento crudo de Idealista (diseño D2).
//
// `looseObject`, no strict ni strip: una clave nueva del vendor es asunto
// suyo (silent-accept no cuesta nada); un rechazo aquí descartaría una
// página YA PAGADA que no se puede volver a pedir gratis (silent-reject
// cuesta dinero). Precedente en el repo: `TokenResponseSchema` en
// `scripts/probe-idealista.ts:63` usa el mismo razonamiento.
//
// `.optional()` por defecto; `.nullable()` solo si una fixture commiteada
// muestra un `null` literal, citado por línea. Verificado este paso: cero
// nulos JSON en 100 elementos de ambas fixtures — de ahí que ningún campo
// use `.nullable()`.
import { z } from 'zod';

import { OPERATION_TYPES } from '@buscahogar/core';

export const rawElementSchema = z.looseObject({
  propertyCode: z.union([z.string(), z.number()]),
  price: z.number().positive(),
  // NO es un enum: el vocabulario de respuesta no está cerrado (R2). El mapa
  // fuente→dominio vive en property-type-map.ts y degrada a "other".
  propertyType: z.string(),
  operation: z.enum(OPERATION_TYPES),
  url: z.string(),
  size: z.number().optional(),
  // Ausente en premises (verificado: 0/50 elementos de la fixture de
  // premises tienen esta clave) — nunca `.nullable()`.
  rooms: z.number().optional(),
  bathrooms: z.number().optional(),
  // Cadena, no número: valores observados incluyen "bj" (bajo) y "en"
  // (entresuelo), no solo dígitos.
  floor: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  description: z.string().optional(),
  suggestedTexts: z.looseObject({ title: z.string().optional() }).optional(),
  // ROADMAP 1.11 — tipa la miniatura para que el normalizador pueda leerla
  // (docs/DECISIONS.md, decisión 059). Cero nulos JSON en 100/100 elementos
  // de ambas fixtures, de ahí `.optional()`, nunca `.nullable()`.
  thumbnail: z.string().optional(),
  // ROADMAP 1.12 — recuento de fotos del anuncio (docs/DECISIONS.md, decisión
  // 062). Presente en 100/100 elementos de ambas fixtures, `.optional()`,
  // nunca `.nullable()`, mismo criterio que `thumbnail` arriba.
  numPhotos: z.number().int().nonnegative().optional(),
});

export type IdealistaElement = z.infer<typeof rawElementSchema>;
