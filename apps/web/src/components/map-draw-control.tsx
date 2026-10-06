// ROADMAP 2.6 (decisión 114; SMV-8) — control de dibujo personalizado. Un
// clic en el mapa añade un vértice; no hay edición de vértices (se redibuja).
// La lógica vive en el reductor puro `draw-polygon-state.ts`; aquí solo se
// conecta con Leaflet y con la navegación. Sin `'use client'` (código de
// cliente por el grafo de imports).
import type { LatLngTuple } from 'leaflet';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { CircleMarker, Polyline, useMap, useMapEvents } from 'react-leaflet';

import { buildClearAreaHref, buildDrawnAreaHref } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';

import { INITIAL_DRAW_STATE, drawReducer } from './draw-polygon-state';

export function MapDrawControl({
  baseParams,
  hasPolygon,
}: {
  readonly baseParams: RawSearchParams;
  readonly hasPolygon: boolean;
}): ReactElement {
  const map = useMap();
  const router = useRouter();
  const [state, dispatch] = useReducer(drawReducer, INITIAL_DRAW_STATE);

  // `add` se ignora en el reductor mientras no se está dibujando.
  useMapEvents({
    click(event) {
      dispatch({ type: 'add', lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });

  // Mientras se dibuja: cursor de cruz (clase de la hoja del mapa, sin estilo en
  // línea) y sin zoom por doble clic (un doble clic añadiría dos vértices casi
  // idénticos).
  useEffect(() => {
    map.getContainer().classList.toggle('map-canvas--drawing', state.active);
    if (state.active) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [map, state.active]);

  // Cierre válido: navegación con push (Atrás restaura la zona anterior) y
  // sin saltar al inicio de la página. El servidor vuelve a validar.
  useEffect(() => {
    if (state.completed !== null) {
      router.push(buildDrawnAreaHref(baseParams, state.completed), { scroll: false });
    }
    // `baseParams` solo se lee al cerrar; se omite a propósito para no repetir
    // la navegación si los parámetros cambian después de ella.
  }, [state.completed]);

  const path = state.vertices.map((vertex): LatLngTuple => [vertex.lat, vertex.lon]);

  // La barra va en el marco, como hermana del contenedor de Leaflet: dentro de él
  // sus paneles (400-700) taparían cualquier z-index de la hoja (decisión 165).
  const frame = map.getContainer().parentElement;
  const toolbar = (
    <div className="map-draw-toolbar">
      {state.active ? (
        <>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'undo' });
            }}
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'close' });
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'cancel' });
            }}
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'start' });
          }}
        >
          Dibujar zona
        </button>
      )}
      {hasPolygon && !state.active ? (
        <button
          type="button"
          onClick={() => {
            router.push(buildClearAreaHref(baseParams), { scroll: false });
          }}
        >
          Quitar zona
        </button>
      ) : null}
      {state.message !== null ? <p role="status">{state.message}</p> : null}
    </div>
  );

  return (
    <>
      {path.length >= 2 ? (
        <Polyline positions={path} pathOptions={{ className: 'map-draw-path' }} />
      ) : null}
      {path.map((position, index) => (
        <CircleMarker
          key={`${String(index)}:${String(position[0])}:${String(position[1])}`}
          center={position}
          radius={4}
          pathOptions={{ className: 'map-draw-vertex' }}
        />
      ))}
      {frame !== null ? createPortal(toolbar, frame) : null}
    </>
  );
}
