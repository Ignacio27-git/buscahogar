// D.16 (decisión 206) — pan y zoom instantáneos con el teclado de Leaflet. Las opciones del mapa
// (`zoomAnimation`, `fadeAnimation`, `markerZoomAnimation`) no alcanzan al desplazamiento de las
// flechas ni al zoom de +/-: el manejador de teclado de Leaflet llama a `map.panBy(offset)` y a
// `map.setZoom(zoom)` sin opciones, y eso anima. Para pasar `animate: false` solo en esa llamada se
// envuelve su manejador privado `_onKeyDown`. Módulo sin DOM ni `'use client'` (type-only de
// Leaflet), para poder probarlo en Node con un doble. Depende de la API privada de Leaflet 1.9.4,
// por eso la versión está fijada y `map-instant-keyboard.test.ts` comprueba ese contrato.
//
// Autopan de popups, inercia del arrastre y `fitBounds` quedan como los trae Leaflet: no son
// acciones repetidas con el teclado.
import type { Map as LeafletMap } from 'leaflet';

type KeyHandler = (event: KeyboardEvent) => void;
type MotionMethod = (arg: unknown, options?: Record<string, unknown>) => unknown;

/** Miembros privados de `map.keyboard` que usa el parche. */
interface KeyboardInternals {
  _onKeyDown: unknown;
  _addHooks: () => void;
  _focused?: boolean;
  enabled: () => boolean;
  enable: () => unknown;
  disable: () => unknown;
}

const MOTION_METHODS = ['panBy', 'setZoom'] as const;

/** Restablece una propiedad propia a como estaba: su descriptor, o fuera si no existía. */
function restoreOwn(target: object, name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) Reflect.deleteProperty(target, name);
  else Object.defineProperty(target, name, descriptor);
}

/**
 * Envuelve el manejador de teclado del mapa para que el pan y el zoom no se animen. Devuelve la
 * limpieza que lo deshace. Sin `map.keyboard` o sin manejador privado no hace nada (el mapa sigue
 * funcionando, solo que animado) y la limpieza es una función vacía.
 */
export function makeKeyboardInstant(map: LeafletMap): () => void {
  const keyboard = (map as unknown as { keyboard?: KeyboardInternals }).keyboard;
  if (keyboard === undefined || typeof keyboard._onKeyDown !== 'function') return () => undefined;

  const originalHandler = keyboard._onKeyDown as KeyHandler;
  const handlerDescriptor = Object.getOwnPropertyDescriptor(keyboard, '_onKeyDown');
  const target = map as unknown as Record<string, MotionMethod>;

  const instantHandler: KeyHandler = (event) => {
    const saved = MOTION_METHODS.map((name) => Object.getOwnPropertyDescriptor(map, name));
    try {
      MOTION_METHODS.forEach((name) => {
        const current = target[name];
        if (current === undefined) return;
        Object.defineProperty(map, name, {
          configurable: true,
          writable: true,
          value: (arg: unknown, options?: Record<string, unknown>): unknown =>
            current.call(map, arg, { ...options, animate: false }),
        });
      });
      originalHandler.call(keyboard, event);
    } finally {
      MOTION_METHODS.forEach((name, index) => {
        restoreOwn(map, name, saved[index]);
      });
    }
  };

  // Leaflet enlaza el manejador a la página con la referencia que tenga en ese momento, así que
  // se sustituye con el teclado deshabilitado y se vuelve a habilitar después. `enable()` no
  // enlaza a la página: eso lo hace el evento de foco, y si el mapa ya está enfocado (el foco
  // llegó antes del montaje) hay que enlazar a mano.
  const rebind = (): void => {
    if (keyboard._focused === true) keyboard._addHooks();
  };
  const swap = (replace: () => void): void => {
    const wasEnabled = keyboard.enabled();
    if (wasEnabled) keyboard.disable();
    replace();
    if (wasEnabled) {
      keyboard.enable();
      rebind();
    }
  };

  swap(() => {
    Object.defineProperty(keyboard, '_onKeyDown', {
      configurable: true,
      writable: true,
      value: instantHandler,
    });
  });

  let restored = false;
  return (): void => {
    if (restored) return;
    restored = true;
    swap(() => {
      restoreOwn(keyboard, '_onKeyDown', handlerDescriptor);
    });
  };
}
