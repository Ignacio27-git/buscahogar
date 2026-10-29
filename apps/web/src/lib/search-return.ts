// D.9 (decisión 171) — enlace de vuelta a los resultados, solo servidor. La
// ficha recibe los parámetros de la búsqueda en su propia URL y NO se fía de
// ellos: los revalida con los mismos esquemas que la búsqueda. Todo o nada: si
// cualquier valor de la lista blanca falla (valor inválido, clave repetida,
// cadena vacía, fallo entre campos) el enlace entero cae a `/`, porque una
// búsqueda reconstruida a medias sería otra búsqueda. El destino es siempre `/`
// o `/?…` construido con `URLSearchParams`: nunca puede apuntar a otro sitio.
import { searchQuerySchema, searchViewSchema } from '@buscahogar/core';

import { toHref } from './search-href';
import type { RawSearchParams } from './search-href';
import { RETURN_KEYS, pickSearchReturnParams } from './search-return-params';

export interface SearchReturnLink {
  readonly href: string;
  readonly label: string;
}

const FALLBACK: SearchReturnLink = { href: '/', label: 'Volver a la búsqueda' };

export function resolveSearchReturnLink(params: RawSearchParams): SearchReturnLink {
  // Se valida lo recibido tal cual (arrays incluidos, para que el esquema los
  // rechace), no lo que `pickSearchReturnParams` conservaría.
  const raw: Record<string, string | string[]> = {};
  for (const key of [...RETURN_KEYS, 'page']) {
    const value = params[key];
    if (value !== undefined) {
      raw[key] = value;
    }
  }
  if (Object.keys(raw).length === 0) {
    return FALLBACK;
  }
  if (!searchQuerySchema.safeParse(raw).success || !searchViewSchema.safeParse(raw.view).success) {
    return FALLBACK;
  }
  const query = new URLSearchParams();
  for (const [key, value] of pickSearchReturnParams(raw, { includePage: true })) {
    query.append(key, value);
  }
  return { href: toHref(query), label: 'Volver a los resultados' };
}
