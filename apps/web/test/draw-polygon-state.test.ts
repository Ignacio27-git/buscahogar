// ROADMAP 2.6 (decisión 114) y D.8b (decisión 169) — reductor puro del control
// de dibujo: sin DOM.
import { describe, expect, it } from 'vitest';

import { POLYGON_MAX_VERTICES } from '@buscahogar/core';
import type { PolygonIssueCode } from '@buscahogar/core';

import {
  DRAW_ISSUE_COPY,
  INITIAL_DRAW_STATE,
  drawReducer,
  formatVertexCount,
  type DrawAction,
  type DrawState,
} from '../src/components/draw-polygon-state.js';

function run(actions: readonly DrawAction[], from: DrawState = INITIAL_DRAW_STATE): DrawState {
  return actions.reduce(drawReducer, from);
}

const click = (lat: number, lon: number): DrawAction => ({ type: 'add', lat, lon });

const SQUARE: readonly DrawAction[] = [
  { type: 'start' },
  click(40.4, -3.7),
  click(40.4, -3.6),
  click(40.5, -3.6),
  click(40.5, -3.7),
];

const START_MESSAGE = 'Dibujo iniciado. Mueve el mapa con las flechas y pulsa Añadir vértice.';
const CAP_MESSAGE = 'Una zona admite como máximo 50 vértices.';

function fiftyVertices(): DrawState {
  const actions: DrawAction[] = [{ type: 'start' }];
  for (let i = 0; i < POLYGON_MAX_VERTICES; i += 1) {
    actions.push(click(40 + i * 0.001, -3 + (i % 2) * 0.001));
  }
  return run(actions);
}

describe('drawReducer — decisión 114', () => {
  it('estado inicial: inactivo, sin vértices ni resultado', () => {
    expect(INITIAL_DRAW_STATE).toEqual({ active: false, vertices: [], message: null, completed: null });
  });

  it('un clic sin haber pulsado "Dibujar zona" se ignora', () => {
    expect(run([click(1, 2)])).toEqual(INITIAL_DRAW_STATE);
  });

  it('start activa el dibujo y añade vértices en orden', () => {
    const state = run(SQUARE);
    expect(state.active).toBe(true);
    expect(state.vertices).toHaveLength(4);
    expect(state.vertices[0]).toEqual({ lat: 40.4, lon: -3.7 });
  });

  it('redondea a 5 decimales al añadir', () => {
    const state = run([{ type: 'start' }, click(40.1234567, -3.9876543)]);
    expect(state.vertices[0]).toEqual({ lat: 40.12346, lon: -3.98765 });
  });

  it('bloquea el vértice 51 con un mensaje y no lo añade', () => {
    const full = fiftyVertices();
    expect(full.vertices).toHaveLength(POLYGON_MAX_VERTICES);
    const blocked = drawReducer(full, click(41, -3));
    expect(blocked.vertices).toHaveLength(POLYGON_MAX_VERTICES);
    expect(blocked.message).toMatch(/50/);
  });

  it('undo quita el último vértice y lo anuncia; sin vértices no hace nada', () => {
    const state = run([...SQUARE, { type: 'undo' }]);
    expect(state.vertices).toHaveLength(3);
    expect(state.message).toBe('Último vértice eliminado. Quedan 3 vértices.');
    expect(run([{ type: 'start' }, { type: 'undo' }]).vertices).toHaveLength(0);
  });

  it('close con menos de 3 vértices no completa y explica por qué', () => {
    const state = run([{ type: 'start' }, click(1, 1), click(2, 2), { type: 'close' }]);
    expect(state.completed).toBeNull();
    expect(state.active).toBe(true);
    expect(state.message).not.toBeNull();
  });

  it('close con un anillo válido completa, desactiva, vacía los vértices y lo anuncia', () => {
    const state = run([...SQUARE, { type: 'close' }]);
    expect(state.completed).toEqual([
      { lat: 40.4, lon: -3.7 },
      { lat: 40.4, lon: -3.6 },
      { lat: 40.5, lon: -3.6 },
      { lat: 40.5, lon: -3.7 },
    ]);
    expect(state.active).toBe(false);
    expect(state.vertices).toEqual([]);
    expect(state.message).toBe('Zona cerrada. Actualizando resultados.');
  });

  it('close con aristas cruzadas NO completa (no navega) y muestra el aviso', () => {
    const bowTie = run([
      { type: 'start' },
      click(0, 0),
      click(1, 1),
      click(0, 1),
      click(1, 0),
      { type: 'close' },
    ]);
    expect(bowTie.completed).toBeNull();
    expect(bowTie.active).toBe(true);
    expect(bowTie.vertices).toHaveLength(4);
    expect(bowTie.message).not.toBeNull();
  });

  it('close con un vértice repetido tras el redondeo NO completa', () => {
    const state = run([
      { type: 'start' },
      click(40.1234561, -3.1),
      click(40.5, -3.5),
      click(40.1234562, -3.1),
      { type: 'close' },
    ]);
    expect(state.completed).toBeNull();
    expect(state.message).not.toBeNull();
  });

  it('cancel descarta los vértices y deja el aviso de cancelación', () => {
    expect(run([...SQUARE, { type: 'cancel' }])).toEqual({
      ...INITIAL_DRAW_STATE,
      message: 'Dibujo cancelado.',
    });
  });

  it('un mensaje de error se sustituye al añadir un vértice válido', () => {
    const failed = run([{ type: 'start' }, click(1, 1), { type: 'close' }]);
    expect(failed.message).not.toBeNull();
    expect(drawReducer(failed, click(2, 2)).message).toBe('Vértice añadido. Llevas 2 vértices.');
  });

  it('start tras completar borra el resultado anterior (redibujar reemplaza)', () => {
    const done = run([...SQUARE, { type: 'close' }]);
    const again = drawReducer(done, { type: 'start' });
    expect(again.completed).toBeNull();
    expect(again.active).toBe(true);
  });
});

describe('drawReducer — avisos por acción (SMV-24)', () => {
  it('start anuncia cómo dibujar', () => {
    expect(run([{ type: 'start' }]).message).toBe(START_MESSAGE);
  });

  it('add usa singular con 1 vértice y plural con 2', () => {
    const one = run([{ type: 'start' }, click(1, 1)]);
    expect(one.message).toBe('Vértice añadido. Llevas 1 vértice.');
    expect(drawReducer(one, click(2, 2)).message).toBe('Vértice añadido. Llevas 2 vértices.');
  });

  it('undo anuncia las restantes; al llegar a 0 dice que no quedan', () => {
    const two = run([{ type: 'start' }, click(1, 1), click(2, 2)]);
    const one = drawReducer(two, { type: 'undo' });
    expect(one.message).toBe('Último vértice eliminado. Quedan 1 vértice.');
    expect(drawReducer(one, { type: 'undo' }).message).toBe('No quedan vértices.');
  });

  it('formatVertexCount concuerda en número', () => {
    expect(formatVertexCount(1)).toBe('1 vértice');
    expect(formatVertexCount(0)).toBe('0 vértices');
    expect(formatVertexCount(7)).toBe('7 vértices');
  });

  it('el aviso de cierre o de cancelación persiste inactivo hasta el siguiente start', () => {
    const closed = run([...SQUARE, { type: 'close' }]);
    expect(closed.active).toBe(false);
    expect(closed.message).toBe('Zona cerrada. Actualizando resultados.');
    expect(drawReducer(closed, { type: 'start' }).message).toBe(START_MESSAGE);
    const cancelled = run([...SQUARE, { type: 'cancel' }]);
    expect(cancelled.message).toBe('Dibujo cancelado.');
    expect(drawReducer(cancelled, { type: 'start' }).message).toBe(START_MESSAGE);
  });
});

describe('drawReducer — guarda de duplicados y tope (SMV-23)', () => {
  it('rechaza un vértice igual al último tras redondear, con aviso', () => {
    const one = run([{ type: 'start' }, click(40.1234561, -3.1)]);
    const again = drawReducer(one, click(40.1234562, -3.1));
    expect(again.vertices).toEqual(one.vertices);
    expect(again.message).toBe('Ese punto ya es el último vértice. Mueve el mapa antes de añadir otro.');
  });

  it('un punto igual a uno anterior (no al último) se añade; close lo reporta', () => {
    const state = run([{ type: 'start' }, click(1, 1), click(2, 2), click(1, 1)]);
    expect(state.vertices).toHaveLength(3);
    expect(drawReducer(state, { type: 'close' }).message).toBe(DRAW_ISSUE_COPY['duplicate-vertex']);
  });

  it('el tope de 50 se aplica igual a un clic y a un centro repetido del último', () => {
    const full = fiftyVertices();
    const clicked = drawReducer(full, click(41, -3));
    expect(clicked.vertices).toHaveLength(POLYGON_MAX_VERTICES);
    expect(clicked.message).toBe(CAP_MESSAGE);
    const last = full.vertices[POLYGON_MAX_VERTICES - 1];
    expect(last).toBeDefined();
    const centre = drawReducer(full, click(last?.lat ?? 0, last?.lon ?? 0));
    expect(centre.vertices).toHaveLength(POLYGON_MAX_VERTICES);
    expect(centre.message).toBe(CAP_MESSAGE);
  });
});

describe('drawReducer — cancel inerte (SMV-23)', () => {
  it('sin dibujo activo no cambia el estado ni crea mensaje', () => {
    expect(drawReducer(INITIAL_DRAW_STATE, { type: 'cancel' })).toBe(INITIAL_DRAW_STATE);
    const closed = run([...SQUARE, { type: 'close' }]);
    expect(drawReducer(closed, { type: 'cancel' })).toBe(closed);
  });
});

describe('DRAW_ISSUE_COPY y avisos de cierre (SMV-24)', () => {
  const EXPECTED: Readonly<Record<PolygonIssueCode, string>> = {
    'too-few': 'Una zona necesita al menos 3 vértices.',
    'duplicate-vertex': 'Hay un vértice repetido. Deshaz el último o redibuja la zona.',
    degenerate: 'Los vértices están alineados: la zona no tiene área.',
    'self-intersecting': 'Los lados de la zona se cruzan. Deshaz el último vértice o redibuja.',
    'too-large': 'La zona supera el área máxima de 2500 km².',
    'out-of-range': 'Hay una coordenada fuera de rango.',
    'too-many': 'Una zona admite como máximo 50 vértices.',
    'too-long': 'La zona no es válida.',
    malformed: 'La zona no es válida.',
  };

  it('cubre los 9 códigos con la copia exacta y sin prefijo "polygon:"', () => {
    expect(Object.keys(DRAW_ISSUE_COPY).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [code, copy] of Object.entries(EXPECTED)) {
      expect(DRAW_ISSUE_COPY[code as PolygonIssueCode]).toBe(copy);
      expect(DRAW_ISSUE_COPY[code as PolygonIssueCode]).not.toContain('polygon:');
    }
  });

  const failures: ReadonlyArray<readonly [PolygonIssueCode, readonly DrawAction[]]> = [
    ['too-few', [click(1, 1), click(2, 2)]],
    ['duplicate-vertex', [click(1, 1), click(2, 2), click(3, 1), click(2, 2)]],
    ['degenerate', [click(0, 0), click(1, 1), click(2, 2)]],
    ['self-intersecting', [click(0, 0), click(1, 1), click(0, 1), click(1, 0)]],
  ];

  it.each(failures)('close con %s mantiene el dibujo y muestra la copia en español', (code, clicks) => {
    const before = run([{ type: 'start' }, ...clicks]);
    const state = drawReducer(before, { type: 'close' });
    expect(state.message).toBe(EXPECTED[code]);
    expect(state.active).toBe(true);
    expect(state.completed).toBeNull();
    expect(state.vertices).toEqual(before.vertices);
  });
});
