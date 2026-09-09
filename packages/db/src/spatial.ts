// Único punto donde se expresa una distancia geográfica (docs/DECISIONS.md,
// decisión 019). Si `CHK-GEOG-STORED` fallara y hubiera que aplicar
// `FB-GEOG-EXPR`, el cambio se limita al cuerpo de esta función: los sitios
// que la llaman no cambian.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { listings } from './schema/listings';

// `ST_DWithin` sobre una columna `geometry` mide en las unidades del SRS: en
// SRID 4326 eso son grados, no metros. Por eso el predicado se aplica sobre
// `location_geography` (tipo `geography`), donde `ST_DWithin` sí mide en
// metros. Las coordenadas se ligan como parámetros, nunca se interpolan en
// la cadena SQL: ese es el límite frente a inyección (design.md, Threat
// Matrix — la única superficie de inyección real de este esquema).
export function withinMeters(lon: number, lat: number, meters: number): SQL {
  return sql`ST_DWithin(${listings.locationGeography},
    ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${meters})`;
}
