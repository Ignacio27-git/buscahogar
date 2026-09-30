// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105) — clasificador PURO
// de la respuesta de una verificación por `adIds`. Nunca toca la red ni la base
// de datos.
//
// Principio rector: ante CUALQUIER duda el lote ENTERO es `ambiguous` y ningún
// anuncio cambia de estado. Un falso "ausente" esconde una vivienda real de la
// búsqueda; un falso "ambiguo" solo cuesta un reintento.
//
// Lote ambiguo entero si:
//   - hubo error de transporte, cuerpo no JSON o envelope inválido;
//   - `totalPages > 1` (la respuesta no cabe en una página: no es un lote
//     acotado por `adIds`);
//   - algún elemento no tiene `propertyCode` utilizable;
//   - la respuesta contiene un id que NO se pidió (la fuente ignoró `adIds`, y
//     entonces no se puede concluir nada de las omisiones).
//
// Si la respuesta es fiable y respeta `adIds`: un id devuelto es `present`; un id
// pedido y OMITIDO es `absent` SOLO cuando `omissionConfirmed` es true (la sonda
// demostró que la API responde así a un anuncio dado de baja, U2); si no, es
// `ambiguous`.
import type { PresenceVerdict } from '@buscahogar/core';
import { z } from 'zod';

import type { TransportOutcome } from './ports.js';
import { rawEnvelopeSchema } from './raw-envelope.schema.js';

const returnedElementSchema = z.looseObject({
  propertyCode: z.union([z.string().min(1), z.number()]),
});

// Ids devueltos por una respuesta FIABLE de una sola página; `null` si no lo es
// (envelope inválido, `totalPages > 1` o algún elemento sin `propertyCode`
// utilizable). Compartida con la sonda de `adIds` (scripts/probe/adids-evidence.ts)
// para que la sonda y producción interpreten una respuesta exactamente igual.
export function readReturnedIds(body: unknown): ReadonlySet<string> | null {
  const envelope = rawEnvelopeSchema.safeParse(body);
  if (!envelope.success || envelope.data.totalPages > 1) {
    return null;
  }
  const returned = new Set<string>();
  for (const element of envelope.data.elementList) {
    const parsed = returnedElementSchema.safeParse(element);
    if (!parsed.success) {
      return null;
    }
    returned.add(String(parsed.data.propertyCode));
  }
  return returned;
}

function allWith(ids: Iterable<string>, verdict: PresenceVerdict): Map<string, PresenceVerdict> {
  return new Map([...ids].map((id): [string, PresenceVerdict] => [id, verdict]));
}

export function classifyPresence(
  requestedIds: readonly string[],
  outcome: TransportOutcome,
  omissionConfirmed: boolean
): ReadonlyMap<string, PresenceVerdict> {
  const requested = new Set(requestedIds);
  const ambiguous = (): ReadonlyMap<string, PresenceVerdict> => allWith(requested, 'ambiguous');

  if (requested.size === 0) {
    return new Map();
  }
  if (outcome.kind !== 'ok') {
    return ambiguous();
  }

  const returned = readReturnedIds(outcome.body);
  if (returned === null) {
    return ambiguous();
  }

  // Un id devuelto que no se pidió: la fuente no respetó `adIds`.
  for (const id of returned) {
    if (!requested.has(id)) {
      return ambiguous();
    }
  }

  // Corrección S3 (desviación de LR-4): con 2+ ids pedidos, que NINGUNO vuelva no
  // distingue "todos dados de baja" de "la API ignoró adIds o filtró mal (zona sin
  // stock)": lote ambiguo. Un lote de un solo id conserva la regla de omisión.
  if (requested.size >= 2 && ![...requested].some((id) => returned.has(id))) {
    return ambiguous();
  }

  const omittedVerdict: PresenceVerdict = omissionConfirmed ? 'absent' : 'ambiguous';
  return new Map(
    [...requested].map((id): [string, PresenceVerdict] => [id, returned.has(id) ? 'present' : omittedVerdict])
  );
}
