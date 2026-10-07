// Único sitio de `src/` con el host de teselas de OpenStreetMap (SMV-9,
// decisiones 112 y 179). Lo importan el lienzo interactivo y el mapa estático
// de la ficha. Un solo host, sin subdominios a/b/c. El navegador pide las
// teselas; el servidor solo construye URLs (R8).
export const OSM_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface OsmTile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

// Rellena la plantilla. RangeError si z no es un entero 0..19 o si x/y no son
// enteros dentro de [0, 2^z - 1].
export function osmTileUrl(tile: OsmTile): string {
  const { z, x, y } = tile;
  if (!Number.isInteger(z) || z < 0 || z > 19) {
    throw new RangeError(`zoom de tesela fuera de rango: ${String(z)}`);
  }
  const last = 2 ** z - 1;
  for (const axis of [x, y]) {
    if (!Number.isInteger(axis) || axis < 0 || axis > last) {
      throw new RangeError(`índice de tesela fuera de rango: ${String(axis)}`);
    }
  }
  return OSM_TILE_URL_TEMPLATE.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
