// ROADMAP 1.13 Unit D (diseño DD-14/CR-4; docs/DECISIONS.md, decisión 066
// — "nunca un número mágico") — `resolveNewZonesDailyCap()` nunca inventa
// el tope de zonas nuevas por día: falla alto y nombrado cuando
// `NEW_ZONES_DAILY_CAP` está ausente o no es un entero positivo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MissingNewZonesDailyCapError, resolveNewZonesDailyCap } from '../src/server/coverage.js';

describe('resolveNewZonesDailyCap — nunca fabrica el tope (DD-14, decisión 066)', () => {
  const original = process.env.NEW_ZONES_DAILY_CAP;

  beforeEach(() => {
    delete process.env.NEW_ZONES_DAILY_CAP;
  });

  afterEach(() => {
    if (original !== undefined) {
      process.env.NEW_ZONES_DAILY_CAP = original;
    } else {
      delete process.env.NEW_ZONES_DAILY_CAP;
    }
  });

  it('lanza MissingNewZonesDailyCapError cuando la variable está ausente', () => {
    expect(() => resolveNewZonesDailyCap()).toThrow(MissingNewZonesDailyCapError);
  });

  it('lanza cuando el valor no es un entero (p. ej. "abc" o "3.5")', () => {
    process.env.NEW_ZONES_DAILY_CAP = 'abc';
    expect(() => resolveNewZonesDailyCap()).toThrow(MissingNewZonesDailyCapError);
    process.env.NEW_ZONES_DAILY_CAP = '3.5';
    expect(() => resolveNewZonesDailyCap()).toThrow(MissingNewZonesDailyCapError);
  });

  it('lanza cuando el valor es 0 o negativo', () => {
    process.env.NEW_ZONES_DAILY_CAP = '0';
    expect(() => resolveNewZonesDailyCap()).toThrow(MissingNewZonesDailyCapError);
    process.env.NEW_ZONES_DAILY_CAP = '-5';
    expect(() => resolveNewZonesDailyCap()).toThrow(MissingNewZonesDailyCapError);
  });

  it('devuelve el entero cuando la variable es válida', () => {
    process.env.NEW_ZONES_DAILY_CAP = '25';
    expect(resolveNewZonesDailyCap()).toBe(25);
  });
});
