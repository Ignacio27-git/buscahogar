// ROADMAP 2.6 (decisión 114) — reductor puro del control de dibujo
// personalizado: sin DOM, sin Leaflet, testable en node. Un clic añade un
// vértice; no hay edición de vértices (el usuario redibuja). Al cerrar valida
// con el core y, si el anillo es inválido, NO completa: muestra el mensaje del
// core y la URL no se toca.
import { POLYGON_MAX_VERTICES, validatePolygonRing } from '@buscahogar/core';
import type { PolygonVertex } from '@buscahogar/core';

export interface DrawState {
  readonly active: boolean;
  readonly vertices: readonly PolygonVertex[];
  readonly message: string | null;
  // Anillo válido listo para navegar; solo lo rellena `close`.
  readonly completed: readonly PolygonVertex[] | null;
}

export type DrawAction =
  | { readonly type: 'start' }
  | { readonly type: 'add'; readonly lat: number; readonly lon: number }
  | { readonly type: 'undo' }
  | { readonly type: 'close' }
  | { readonly type: 'cancel' };

export const INITIAL_DRAW_STATE: DrawState = {
  active: false,
  vertices: [],
  message: null,
  completed: null,
};

// DAS-3: la UI redondea a 5 decimales; el servidor nunca redondea.
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  switch (action.type) {
    case 'start':
      return { active: true, vertices: [], message: null, completed: null };
    case 'add': {
      if (!state.active) {
        return state;
      }
      if (state.vertices.length >= POLYGON_MAX_VERTICES) {
        return { ...state, message: `Una zona admite como máximo ${String(POLYGON_MAX_VERTICES)} vértices.` };
      }
      const vertex: PolygonVertex = { lat: round5(action.lat), lon: round5(action.lon) };
      return { ...state, vertices: [...state.vertices, vertex], message: null };
    }
    case 'undo':
      if (!state.active || state.vertices.length === 0) {
        return state;
      }
      return { ...state, vertices: state.vertices.slice(0, -1), message: null };
    case 'close': {
      if (!state.active) {
        return state;
      }
      const problem = validatePolygonRing(state.vertices);
      if (problem !== null) {
        return { ...state, message: problem.message };
      }
      return { active: false, vertices: [], message: null, completed: state.vertices };
    }
    case 'cancel':
      return INITIAL_DRAW_STATE;
  }
}
