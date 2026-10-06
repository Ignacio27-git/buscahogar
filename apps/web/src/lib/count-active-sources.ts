// D.9 (decisión 176) — número de fuentes que muestra la ficha: fuentes DISTINTAS
// (`sourceKey`) con al menos un anuncio activo. Un anuncio retirado o inactivo
// no cuenta, y dos anuncios activos de la misma fuente cuentan como una.
import type { PropertyDetailSource } from '@buscahogar/db';

export function countActiveSources(sources: readonly Pick<PropertyDetailSource, 'sourceKey' | 'status'>[]): number {
  const active = new Set<string>();
  for (const source of sources) {
    if (source.status === 'active') {
      active.add(source.sourceKey);
    }
  }
  return active.size;
}
