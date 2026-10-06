// ROADMAP 2.6 (decisión 114; SMV-8) — control de dibujo personalizado. Un
// clic en el mapa añade un vértice; no hay edición de vértices (se redibuja).
// La lógica vive en el reductor puro `draw-polygon-state.ts`; aquí solo se
// conecta con Leaflet y con la navegación. Sin `'use client'` (código de
// cliente por el grafo de imports).
// D.8b (SMV-23 a SMV-25; decisiones 168-170) — dibujo por teclado: mira fija en el
// centro, «Añadir vértice» y Enter añaden `map.getCenter()`, Backspace deshace y
// Escape cancela, solo con el contenedor del mapa enfocado y mientras se dibuja.
import type { LatLngTuple } from 'leaflet';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';
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
  const startButton = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);
  // Estado de la ventana emergente por la API de eventos de Leaflet (`popupopen` y
  // `popupclose`), no por una consulta al DOM.
  const popupOpen = useRef(false);
  // Anfitrión de la barra y la mira, antepuesto al marco (B7).
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  // `add` se ignora en el reductor mientras no se está dibujando.
  useMapEvents({
    click(event) {
      dispatch({ type: 'add', lat: event.latlng.lat, lon: event.latlng.lng });
    },
    popupopen() {
      popupOpen.current = true;
    },
    popupclose() {
      popupOpen.current = false;
    },
  });

  // El anfitrión va ANTES del contenedor de Leaflet: la barra precede al mapa en el
  // orden de foco (con Mayús+Tab desde el mapa se llega a «Cerrar» sin cruzar marcadores,
  // WCAG 2.4.3) y sigue fuera de los paneles de Leaflet (decisión 165). El marco lo
  // pinta el servidor: se antepone el nodo y se retira al desmontar, sin tocar el
  // resto de sus hijos.
  useEffect(() => {
    const parent = map.getContainer().parentElement;
    if (parent === null) {
      return;
    }
    const element = document.createElement('div');
    element.className = 'map-draw-host';
    parent.prepend(element);
    setHost(element);
    return (): void => {
      element.remove();
      setHost(null);
    };
  }, [map]);

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

  // Teclado: un único `keydown` en el contenedor, SOLO mientras se dibuja. Un marcador, un
  // enlace de la ventana emergente o un botón de la barra no son el contenedor, así que su
  // comportamiento nativo no se toca; con Ctrl/Alt/Meta (atajos del navegador) tampoco.
  useEffect(() => {
    if (!state.active) {
      return;
    }
    const container = map.getContainer();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.target !== container || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      if (event.key === 'Escape' && popupOpen.current) {
        // Leaflet 1.9.4 (Map.Keyboard.js:133 y :168) escucha `keydown` en `document` y
        // cierra la ventana con Escape; ese escuchador corre DESPUÉS de este, con la
        // ventana todavía abierta. Un solo Escape no debe cerrarla y además descartar
        // los vértices: aquí se cede a Leaflet.
        return;
      }
      if (event.key !== 'Enter' && event.key !== 'Backspace' && event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      // Una tecla mantenida no repite la acción (inundaría el reductor).
      if (event.repeat) {
        return;
      }
      if (event.key === 'Enter') {
        const center = map.getCenter();
        dispatch({ type: 'add', lat: center.lat, lon: center.lng });
      } else if (event.key === 'Backspace') {
        dispatch({ type: 'undo' });
      } else {
        dispatch({ type: 'cancel' });
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return (): void => {
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [map, state.active]);

  // Foco (SMV-25): al empezar, cierra cualquier ventana y lo lleva al mapa; al terminar
  // (cancelar o cerrar) vuelve a «Dibujar zona». `preventScroll` evita el salto de página.
  useEffect(() => {
    if (state.active && !wasActive.current) {
      map.closePopup();
      map.getContainer().focus({ preventScroll: true });
    } else if (!state.active && wasActive.current) {
      startButton.current?.focus({ preventScroll: true });
    }
    wasActive.current = state.active;
  }, [map, state.active]);

  const path = state.vertices.map((vertex): LatLngTuple => [vertex.lat, vertex.lon]);

  // La barra va en el marco, como hermana del contenedor de Leaflet: dentro de él
  // sus paneles (400-700) taparían cualquier z-index de la hoja (decisión 165).
  const toolbar = (
    <div className="map-draw-toolbar">
      {state.active ? (
        <>
          <button
            type="button"
            onClick={() => {
              const center = map.getCenter();
              dispatch({ type: 'add', lat: center.lat, lon: center.lng });
            }}
          >
            Añadir vértice
          </button>
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
          ref={startButton}
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
      <p role="status" className="map-draw-status">
        {state.message}
      </p>
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
      {host !== null
        ? createPortal(
            <>
              {toolbar}
              {state.active ? <div className="map-draw-crosshair" aria-hidden="true" /> : null}
            </>,
            host
          )
        : null}
    </>
  );
}
