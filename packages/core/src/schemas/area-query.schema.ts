// Esquemas anidados que Listing necesita (paso 2.1), más areaQuerySchema
// (paso 3), añadido una vez que PropertyType/OperationType (Fase 1) ya
// existen y antes de que las tres interfaces de contratos (Fase 4)
// referencien AreaQuery.
import { z } from 'zod';

import { OPERATION_TYPES } from '../types/operation-type.js';

export const coordinatesSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const locationSchema = z.object({
  ineCode: z.string(),
  municipality: z.string(),
  province: z.string(),
  provinceCode: z.string(),
  autonomousCommunity: z.string(),
});

export const appliedFeatureSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
});

// Frontera externa real: entra desde la CLI de ingesta (ROADMAP 1.7) y desde
// los search params de la búsqueda web (ROADMAP 1.13). z.strictObject(), no
// z.object(): a diferencia de Listing (interno, generado por nuestro propio
// adaptador), AreaQuery lo construye un llamador externo y editable. Aceptar
// en silencio una clave mal escrita (p. ej. `radiusMeter`) entregaría un
// radio por defecto sin avisar — en un sistema con cuota limitada, el radio
// determina peticiones facturables, así que el fallo silencioso es el caro.
// z.strictObject() lo convierte en un rechazo nombrado.
//
// Sin coerción: los valores llegan como string desde search params, pero
// ese paso (1.13) posee la conversión string→number antes de parsear aquí.
// z.coerce.number() aceptaría '' → 0 y true → 1, reintroduciendo exactamente
// el fallo silencioso que la estrictura existe para evitar.
//
// Sin propertyType (DECISIONS 027, no solo alcance): el vocabulario de
// petición y el de respuesta no coinciden, así que un propertyType aquí
// necesitaría una retro-traducción N:M con pérdida. operation sí es
// obligatorio porque sale/rent es el mismo vocabulario en ambos lados y
// particiona genuinamente la cobertura de un barrido.
export const areaQuerySchema = z.strictObject({
  center: coordinatesSchema,
  // Sin .finite(): en zod@4.5.4 z.number() ya rechaza Infinity/NaN por
  // defecto (verificado contra el paquete instalado) y .finite() está
  // marcado deprecated como no-op.
  radiusMeters: z.number().positive(),
  operation: z.enum(OPERATION_TYPES),
});

export type AreaQuery = z.infer<typeof areaQuerySchema>;
