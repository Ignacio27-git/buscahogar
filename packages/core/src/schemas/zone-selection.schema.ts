// ROADMAP 1.13 (diseño §5 interfaces, decisión 057) — Zod para la selección
// de zona (A-11): dos fronteras externas distintas, dos esquemas distintos.
//
// `zoneSelectionSchema` valida el CÓDIGO INE resuelto (`?zone=`), el mismo
// patrón nombrado (regex explícita, nunca `z.coerce`) que
// `search-query.schema.ts` ya usa para `zone` (decisión 057). Rechazo por
// forma (esto), distinto del "zona desconocida" (código bien formado pero
// sin fila en `locations`) — ese segundo caso solo puede resolverse tras
// una consulta a base de datos y no es responsabilidad de este esquema.
//
// `zoneQuerySchema` valida el TEXTO LIBRE de autocompletado (`?zoneQuery=`),
// nunca construye geografía por sí mismo (DD-21): recortado y acotado en
// longitud para que una cadena sin límite nunca llegue a la consulta de
// prefijo de `locations.search_name`.
import { z } from 'zod';

import { REPEATED_VALUE } from './param-messages.js';

const INE_CODE_PATTERN = /^\d{5}$/;

export const zoneSelectionSchema = z
  .string({ error: REPEATED_VALUE })
  .regex(INE_CODE_PATTERN, 'el municipio del enlace no es válido; escribe su nombre en el buscador.');

export const zoneQuerySchema = z.string().trim().min(2).max(64);
