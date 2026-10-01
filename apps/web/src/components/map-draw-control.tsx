// ROADMAP 2.6 (decisión 114; SMV-8) — control de dibujo personalizado. Un
// clic en el mapa añade un vértice; no hay edición de vértices (se redibuja).
// La lógica vive en el reductor puro `draw-polygon-state.ts`; aquí solo se
// conecta con Leaflet y con la navegación. Sin `'use client'` (código de
// cliente por el grafo de imports).
import L from 'leaflet';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef } from 'react';
import type { ReactElement } from 'react';
import { CircleMarker, Polyline, useMap, useMapEvents } from 'react-leaflet';

import { buildClearAreaHref, buildDrawnAreaHref } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';

import { INITIAL_DRAW_STATE, drawReducer } from './draw-polygon-state';

const TOOLBAR_STYLE = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 6,
  background: '#fff',
  borderRadius: 4,
  maxWidth: 240,
} as const;

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
  const toolbarRef = useRef<HTMLDivElement>(null);

  // `add` se ignora en el reductor mientras no se está dibujando.
  useMapEvents({
    click(event) {
      dispatch({ type: 'add', lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });

  // Los clics sobre la barra no deben añadir vértices al mapa.
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (toolbar !== null) {
      L.DomEvent.disableClickPropagation(toolbar);
      L.DomEvent.disableScrollPropagation(toolbar);
    }
  }, []);

  // Mientras se dibuja: cursor de cruz y sin zoom por doble clic (un doble
  // clic añadiría dos vértices casi idénticos).
  useEffect(() => {
    map.getContainer().style.cursor = state.active ? 'crosshair' : '';
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

  const path = state.vertices.map((vertex): L.LatLngTuple => [vertex.lat, vertex.lon]);

  return (
    <>
      {path.length >= 2 ? <Polyline positions={path} /> : null}
      {path.map((position, index) => (
        <CircleMarker
          key={`${String(index)}:${String(position[0])}:${String(position[1])}`}
          center={position}
          radius={4}
        />
      ))}
      <div ref={toolbarRef} style={TOOLBAR_STYLE}>
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
    </>
  );
}
