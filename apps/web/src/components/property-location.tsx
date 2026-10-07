// D.11 (decisión 179) — sección «Ubicación» de la ficha. Server Component síncrono, sin
// `'use client'`, sin JavaScript, sin atributos `style` (la CSP no los admite) y sin
// zoom ni arrastre. El servidor solo calcula URLs de teselas y un círculo (`planStaticMap`,
// en `packages/core`): las teselas las pide el navegador (R8). Excepción acotada a R2: este
// es el único fichero con la etiqueta nativa de imagen, y solo para teselas de OSM.
// Sin punto, cruz ni marca en el centro: el radio de 500 m es lo que dice la verdad.
import type { ReactElement } from 'react';

import { APPROXIMATE_LOCATION_RADIUS_M, planStaticMap } from '@buscahogar/core';
import type { PropertyDetailHeader } from '@buscahogar/db';

import { osmTileUrl } from '@/lib/osm-tiles';

export interface PropertyLocationProps {
  readonly property: Pick<PropertyDetailHeader, 'lat' | 'lon' | 'municipality'>;
}

const ZOOM = 14;
const COLUMNS = 2;
const ROWS = 2;
const HATCH_ID = 'location-map-hatch';

function mapLabel(municipality: string | null): string {
  const place = municipality === null ? '' : ` en ${municipality}`;
  return `Mapa con el área aproximada de la vivienda: un círculo de unos ${String(APPROXIMATE_LOCATION_RADIUS_M)} m de radio${place}.`;
}

export function PropertyLocation({ property }: PropertyLocationProps): ReactElement | null {
  const { lat, lon, municipality } = property;
  const hasPoint = lat !== null && lon !== null;
  if (!hasPoint && municipality === null) {
    return null;
  }

  const plan = hasPoint
    ? planStaticMap({
        center: { latitude: lat, longitude: lon },
        radiusMetres: APPROXIMATE_LOCATION_RADIUS_M,
        zoom: ZOOM,
        columns: COLUMNS,
        rows: ROWS,
      })
    : null;

  return (
    <section className="property-location" aria-labelledby="ubicacion">
      <h2 id="ubicacion">Ubicación</h2>
      {municipality !== null ? <p className="property-location__municipality">{municipality}</p> : null}
      {plan !== null ? (
        <figure className="location-map">
          <div className="location-map__frame" role="img" aria-label={mapLabel(municipality)}>
            <div className="location-map__tiles">
              {plan.tiles.map((tile) => {
                return (
                  // eslint-disable-next-line @next/next/no-img-element -- decisión 179: teselas OSM pedidas por el navegador (R8)
                  <img
                    key={`${String(tile.x)}/${String(tile.y)}`}
                    src={osmTileUrl(tile)}
                    alt=""
                    width={256}
                    height={256}
                    loading="lazy"
                    decoding="async"
                  />
                );
              })}
            </div>
            <svg
              className="location-map__overlay"
              viewBox={`0 0 ${String(plan.widthPx)} ${String(plan.heightPx)}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
                  <rect className="location-map__hatch-casing" x={0} y={0} width={4} height={8} />
                  <rect className="location-map__hatch-stripe" x={1} y={0} width={2} height={8} />
                </pattern>
              </defs>
              <circle className="location-map__area-casing" cx={plan.area.cx} cy={plan.area.cy} r={plan.area.r} />
              <circle
                className="location-map__area"
                cx={plan.area.cx}
                cy={plan.area.cy}
                r={plan.area.r}
                fill={`url(#${HATCH_ID})`}
              />
            </svg>
          </div>
          <figcaption className="location-map__caption">
            <svg className="location-map__swatch" width={16} height={16} aria-hidden="true" focusable="false">
              <rect width={16} height={16} fill={`url(#${HATCH_ID})`} />
            </svg>
            <span>Ubicación aproximada</span>
            <span>
              © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
            </span>
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}
