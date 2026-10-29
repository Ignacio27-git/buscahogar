// ROADMAP 2.6 (decisión 114) y D.8b (decisión 169) — reductor puro del control
// de dibujo personalizado: sin DOM, sin Leaflet, testable en node. Un clic o el
// centro del mapa añaden un vértice; no hay edición de vértices (el usuario
// redibuja). Al cerrar valida con el core y, si el anillo es inválido, NO
// completa: avisa en español y la URL no se toca.
//
// `message` es la única fuente de la región `role="status"`: guarda cada
// anuncio y cada error (SMV-24). Los avisos de cierre y cancelación se quedan
// en el estado inactivo hasta el siguiente `start`.
import { POLYGON_MAX_VERTICES, validatePolygonRing } from '@buscahogar/core';
import type { PolygonIssueCode, PolygonVertex } from '@buscahogar/core';

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

// Copia en español por código del core, sin el prefijo `polygon: ` de sus
// mensajes. El `Record` exhaustivo hace fallar el typecheck si el core añade un
// código nuevo.
export const DRAW_ISSUE_COPY: Readonly<Record<PolygonIssueCode, string>> = {
  'too-few': 'Una zona necesita al menos 3 vértices.',
  'duplicate-vertex': 'Hay un vértice repetido. Deshaz el último o redibuja la zona.',
  degenerate: 'Los vértices están alineados: la zona no tiene área.',
  'self-intersecting': 'Los lados de la zona se cruzan. Deshaz el último vértice o redibuja.',
  'too-large': 'La zona supera el área máxima de 2500 km².',
  'out-of-range': 'Hay una coordenada fuera de rango.',
  'too-many': `Una zona admite como máximo ${String(POLYGON_MAX_VERTICES)} vértices.`,
  'too-long': 'La zona no es válida.',
  malformed: 'La zona no es válida.',
};

const MESSAGE_START = 'Dibujo iniciado. Mueve el mapa con las flechas y pulsa Añadir vértice.';
const MESSAGE_CANCELLED = 'Dibujo cancelado.';
const MESSAGE_CLOSED = 'Zona cerrada. Actualizando resultados.';
const MESSAGE_NO_VERTICES = 'No quedan vértices.';
const MESSAGE_DUPLICATE_LAST = 'Ese punto ya es el último vértice. Mueve el mapa antes de añadir otro.';

export function formatVertexCount(count: number): string {
  return count === 1 ? '1 vértice' : `${String(count)} vértices`;
}

// DAS-3: la UI redondea a 5 decimales; el servidor nunca redondea.
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  switch (action.type) {
    case 'start':
      return { active: true, vertices: [], message: MESSAGE_START, completed: null };
    case 'add': {
      if (!state.active) {
        return state;
      }
      if (state.vertices.length >= POLYGON_MAX_VERTICES) {
        return { ...state, message: DRAW_ISSUE_COPY['too-many'] };
      }
      const vertex: PolygonVertex = { lat: round5(action.lat), lon: round5(action.lon) };
      const last = state.vertices[state.vertices.length - 1];
      if (last !== undefined && last.lat === vertex.lat && last.lon === vertex.lon) {
        return { ...state, message: MESSAGE_DUPLICATE_LAST };
      }
      const vertices = [...state.vertices, vertex];
      return { ...state, vertices, message: `Vértice añadido. Llevas ${formatVertexCount(vertices.length)}.` };
    }
    case 'undo': {
      if (!state.active || state.vertices.length === 0) {
        return state;
      }
      const vertices = state.vertices.slice(0, -1);
      const message =
        vertices.length === 0
          ? MESSAGE_NO_VERTICES
          : `Último vértice eliminado. Quedan ${formatVertexCount(vertices.length)}.`;
      return { ...state, vertices, message };
    }
    case 'close': {
      if (!state.active) {
        return state;
      }
      const problem = validatePolygonRing(state.vertices);
      if (problem !== null) {
        return { ...state, message: DRAW_ISSUE_COPY[problem.code] };
      }
      return { active: false, vertices: [], message: MESSAGE_CLOSED, completed: state.vertices };
    }
    case 'cancel':
      if (!state.active) {
        return state;
      }
      return { ...INITIAL_DRAW_STATE, message: MESSAGE_CANCELLED };
  }
}
