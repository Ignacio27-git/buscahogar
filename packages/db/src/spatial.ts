// Único punto donde se expresa una distancia geográfica (docs/DECISIONS.md,
// decisión 019). Si `CHK-GEOG-STORED` fallara y hubiera que aplicar
// `FB-GEOG-EXPR`, el cambio se limita al cuerpo de esta función: los sitios
// que la llaman no cambian.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PolygonRing } from '@buscahogar/core';
import { listings } from './schema/listings.js';

// `ST_DWithin` sobre una columna `geometry` mide en las unidades del SRS: en
// SRID 4326 eso son grados, no metros. Por eso el predicado se aplica sobre
// una columna `geography` (`location_geography`), donde `ST_DWithin` sí
// mide en metros. Las coordenadas se ligan como parámetros, nunca se
// interpolan en la cadena SQL: ese es el límite frente a inyección
// (design.md, Threat Matrix — la única superficie de inyección real de
// este esquema).
//
// ROADMAP 1.11 (diseño D4) — generalizada para aceptar cualquier columna
// `geography` (la búsqueda filtra `properties.location_geography`, no
// `listings.location_geography`). `withinMeters()` (abajo) delega aquí con
// la columna de `listings` para no romper ninguno de sus llamadores
// existentes (decisión 019: «el cambio se limita al cuerpo de esta
// función»).
export function pointWithinMeters(column: AnyPgColumn, lon: number, lat: number, meters: number): SQL {
  return sql`ST_DWithin(${column},
    ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${meters})`;
}

export function withinMeters(lon: number, lat: number, meters: number): SQL {
  return pointWithinMeters(listings.locationGeography, lon, lat, meters);
}

// ROADMAP 1.8 — hermana fila-a-fila de `withinMeters` (decisión 019:
// localidad de la expresión de distancia — ambas viven en este único
// fichero). El bloqueo de candidatos (blocking.ts) compara dos filas de
// `listings` entre sí, no una fila contra un punto fijo; las columnas se
// ligan como parámetros de tipo, nunca como valores interpolados.
export function rowsWithinMeters(left: AnyPgColumn, right: AnyPgColumn, meters: number): SQL {
  return sql`ST_DWithin(${left}, ${right}, ${meters})`;
}

// ROADMAP 1.13 (diseño DD-1) — `locations.centroid` es una `geographyPoint()`
// escrita directamente (a diferencia de `listings.location`/
// `properties.location`, que son `geometry` y derivan su columna
// `geography` mediante `generatedAlwaysAs`): aquí no existe una columna
// geometry origen, el propio catálogo importado ES la fuente de la
// coordenada. El tipo `geography` de PostGIS acepta WKT como entrada
// (`POINT(lon lat)`); x = longitud, y = latitud — mismo orden que
// `listings.ts:34-35` para no invertir el eje (España aparecería en el
// océano Índico).
export function geographyPointWkt(coordinates: { readonly latitude: number; readonly longitude: number }): string {
  return `POINT(${String(coordinates.longitude)} ${String(coordinates.latitude)})`;
}

// ROADMAP 2.6 (decisión 116) — polígono dibujado por el usuario. El anillo de
// core es ABIERTO y en orden (lat, lon); el WKT lleva `lon lat` (x = longitud,
// mismo orden que `geographyPointWkt`) y CIERRA el anillo repitiendo el primer
// vértice. Solo emite números ya validados por core (regex de 5 decimales),
// pero aun así se liga SIEMPRE como parámetro: nunca se interpola en el SQL.
export function polygonWkt(ring: PolygonRing): string {
  const points = [...ring, ...ring.slice(0, 1)].map((vertex) => `${String(vertex.lon)} ${String(vertex.lat)}`);
  return `POLYGON((${points.join(', ')}))`;
}

// `ST_Covers` (no `ST_Contains`) incluye el borde; sobre `geography` usa el
// índice GiST `properties_location_geography_idx`, sin migración. Los bordes
// son geodésicos, no rectas planas (decisión 116).
export function polygonCovers(column: AnyPgColumn, ring: PolygonRing): SQL {
  return sql`ST_Covers(ST_GeogFromText(${polygonWkt(ring)}), ${column})`;
}
