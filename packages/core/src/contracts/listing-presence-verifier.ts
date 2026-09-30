import type { Coordinates } from '../types/coordinates.js';
import type { OperationType } from '../types/operation-type.js';

// ROADMAP 2.5 (S3; decisión 105) — veredicto de presencia de UN anuncio:
// - `present`: la fuente lo devolvió, sigue publicado.
// - `absent`: desaparición confirmada (solo cuando la evidencia de la fuente lo
//   permite; ver `DELISTED_OMISSION_CONFIRMED` en apps/ingestion).
// - `ambiguous`: no se puede afirmar nada; el anuncio NO cambia de estado.
export type PresenceVerdict = 'present' | 'absent' | 'ambiguous';

// Un lote de ids de UNA misma zona, operación y filtro de la fuente. `groupKey`
// es opaco para el core: lo interpreta cada implementación (en Idealista es el
// filtro `propertyType` de la petición).
export interface PresenceBatch {
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly operation: OperationType;
  readonly groupKey: string;
  readonly externalIds: readonly string[];
}

// Capacidad SEPARADA de `PropertySource` (segregación de interfaces): barrer
// una zona y comprobar si unos anuncios concretos siguen publicados son cosas
// distintas, con coste y garantías distintos. `verifyBatch` no lanza: cualquier
// fallo de transporte o de envelope devuelve todos los ids como `ambiguous`.
export interface ListingPresenceVerifier {
  verifyBatch(batch: PresenceBatch): Promise<ReadonlyMap<string, PresenceVerdict>>;
}
