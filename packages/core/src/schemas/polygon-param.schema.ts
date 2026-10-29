// ROADMAP 2.6 (map-view-search, decisión 115) — envoltorio Zod del códec puro
// `geo/polygon.ts`. Frontera externa real: `?polygon=` llega como
// `string | string[] | undefined`. Una clave repetida (array) es un rechazo
// de tipo que nombra `polygon`; cualquier otro fallo lleva el mensaje
// español del códec y su código nombrado en `params.polygonCode`.
import { z } from 'zod';

import { parsePolygonParam, type PolygonRing } from '../geo/polygon.js';
import { REPEATED_VALUE } from './param-messages.js';

export const polygonParamSchema = z
  .string({ error: REPEATED_VALUE })
  .transform((raw, ctx): PolygonRing => {
    const result = parsePolygonParam(raw);
    if (!result.ok) {
      ctx.issues.push({
        code: 'custom',
        message: result.message,
        input: raw,
        params: { polygonCode: result.code },
      });
      return z.NEVER;
    }
    return result.ring;
  });
