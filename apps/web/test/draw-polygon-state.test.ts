// ROADMAP 2.6 (decisión 114) — reductor puro del control de dibujo: sin DOM.
import { describe, expect, it } from 'vitest';

import { POLYGON_MAX_VERTICES } from '@buscahogar/core';

import {
  INITIAL_DRAW_STATE,
  drawReducer,
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
    const fifty: DrawAction[] = [{ type: 'start' }];
    for (let i = 0; i < POLYGON_MAX_VERTICES; i += 1) {
      fifty.push(click(40 + i * 0.001, -3 + (i % 2) * 0.001));
    }
    const full = run(fifty);
    expect(full.vertices).toHaveLength(POLYGON_MAX_VERTICES);
    const blocked = drawReducer(full, click(41, -3));
    expect(blocked.vertices).toHaveLength(POLYGON_MAX_VERTICES);
    expect(blocked.message).toMatch(/50/);
  });

  it('undo quita el último vértice y limpia el mensaje; sin vértices no hace nada', () => {
    const state = run([...SQUARE, { type: 'undo' }]);
    expect(state.vertices).toHaveLength(3);
    expect(state.message).toBeNull();
    expect(run([{ type: 'start' }, { type: 'undo' }]).vertices).toHaveLength(0);
  });

  it('close con menos de 3 vértices no completa y explica por qué', () => {
    const state = run([{ type: 'start' }, click(1, 1), click(2, 2), { type: 'close' }]);
    expect(state.completed).toBeNull();
    expect(state.active).toBe(true);
    expect(state.message).not.toBeNull();
  });

  it('close con un anillo válido completa, desactiva y vacía los vértices', () => {
    const state = run([...SQUARE, { type: 'close' }]);
    expect(state.completed).toEqual([
      { lat: 40.4, lon: -3.7 },
      { lat: 40.4, lon: -3.6 },
      { lat: 40.5, lon: -3.6 },
      { lat: 40.5, lon: -3.7 },
    ]);
    expect(state.active).toBe(false);
    expect(state.vertices).toEqual([]);
    expect(state.message).toBeNull();
  });

  it('close con aristas cruzadas NO completa (no navega) y muestra el mensaje del core', () => {
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

  it('cancel vuelve al estado inicial descartando los vértices', () => {
    expect(run([...SQUARE, { type: 'cancel' }])).toEqual(INITIAL_DRAW_STATE);
  });

  it('un mensaje de error se limpia al añadir un vértice válido', () => {
    const failed = run([{ type: 'start' }, click(1, 1), { type: 'close' }]);
    expect(failed.message).not.toBeNull();
    expect(drawReducer(failed, click(2, 2)).message).toBeNull();
  });

  it('start tras completar borra el resultado anterior (redibujar reemplaza)', () => {
    const done = run([...SQUARE, { type: 'close' }]);
    const again = drawReducer(done, { type: 'start' });
    expect(again.completed).toBeNull();
    expect(again.active).toBe(true);
  });
});
