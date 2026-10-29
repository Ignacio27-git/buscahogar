// ROADMAP 1.12 (diseño D9, decisión 061) — construye el href de la página de
// detalle. Funciones puras, sin Next, para que el escenario "construir el href
// desde el listingId" sea falsificable sin renderizar nada.
//
// D.9 (decisión 171): una única regla de composición para las filas de la lista,
// los popups del mapa y los tests. Sin parámetros, la ruta se devuelve intacta.
import type { SearchReturnParams } from './search-return-params';

export function appendSearchReturn(path: string, params: SearchReturnParams): string {
  if (params.length === 0) {
    return path;
  }
  const query = new URLSearchParams();
  for (const [key, value] of params) {
    query.append(key, value);
  }
  return `${path}?${query.toString()}`;
}

export function buildPropertyDetailHref(listingId: string, params: SearchReturnParams = []): string {
  return appendSearchReturn(`/properties/${listingId}`, params);
}
