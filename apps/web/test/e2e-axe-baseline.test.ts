// Paso D.1b (spec a11y-baseline R12/R13, S13.1-S13.4; diseño A7, decisión 138) —
// lógica PURA de la línea base de axe: huella, comparación y fusión. Vive en
// `apps/web/test` (vitest) y no importa `@playwright/test` ni axe, así que se
// prueba sin navegador. Los fallos «nueva» y «obsoleta» son ambos fallos: una
// entrada obsoleta enmascararía que la violación vuelva a aparecer.
import { describe, expect, it } from 'vitest';

import {
  AXE_TAGS,
  compareToBaseline,
  fingerprintViolations,
  formatComparisonFailure,
  mergeBaseline,
  normalizeTarget,
  serializeBaseline,
  type AxeBaseline,
} from '../e2e/axe-baseline';

const TAGS = [...AXE_TAGS];

function baselineWith(entries: AxeBaseline['entries'], tags: string[] = TAGS): AxeBaseline {
  return { schemaVersion: 1, tags, entries };
}

describe('normalizeTarget', () => {
  it('devuelve el selector tal cual cuando es un único segmento', () => {
    expect(normalizeTarget(['#main > a.link'])).toBe('#main > a.link');
  });

  it('aplana marcos y shadow DOM con « >>> » y conserva el orden', () => {
    expect(normalizeTarget(['iframe#f', ['x-card', 'button']])).toBe(
      'iframe#f >>> x-card >>> button'
    );
  });

  it('colapsa los espacios en blanco repetidos y los saltos de línea', () => {
    expect(normalizeTarget(['ul   >\n  li'])).toBe('ul > li');
  });
});

describe('fingerprintViolations', () => {
  it('combina regla y objetivo, y devuelve el resultado ordenado y sin duplicados', () => {
    const fingerprints = fingerprintViolations([
      { id: 'region', nodes: [{ target: ['p'] }, { target: ['h1'] }, { target: ['p'] }] },
      { id: 'color-contrast', nodes: [{ target: ['a'] }] },
    ]);

    expect(fingerprints).toEqual(['color-contrast|a', 'region|h1', 'region|p']);
  });

  it('no cambia con el orden de entrada (S13.4)', () => {
    const a = fingerprintViolations([
      { id: 'b', nodes: [{ target: ['x'] }, { target: ['y'] }] },
      { id: 'a', nodes: [{ target: ['z'] }] },
    ]);
    const b = fingerprintViolations([
      { id: 'a', nodes: [{ target: ['z'] }] },
      { id: 'b', nodes: [{ target: ['y'] }, { target: ['x'] }] },
    ]);

    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });
});

describe('compareToBaseline', () => {
  const baseline = baselineWith({ home: { 'w320-light': ['color-contrast|a', 'region|p'] } });

  it('S13.2 pasa cuando las huellas coinciden', () => {
    const result = compareToBaseline(
      baseline,
      'home',
      'w320-light',
      ['color-contrast|a', 'region|p'],
      TAGS
    );

    expect(result).toEqual({ ok: true });
  });

  it('S13.4 pasa con las mismas huellas en otro orden', () => {
    const result = compareToBaseline(
      baseline,
      'home',
      'w320-light',
      ['region|p', 'color-contrast|a'],
      TAGS
    );

    expect(result).toEqual({ ok: true });
  });

  it('S13.1 falla y lista la huella nueva', () => {
    const result = compareToBaseline(
      baseline,
      'home',
      'w320-light',
      ['color-contrast|a', 'region|p', 'label|input'],
      TAGS
    );

    expect(result).toEqual({
      ok: false,
      reason: 'drift',
      newFingerprints: ['label|input'],
      staleFingerprints: [],
    });
  });

  it('S13.3 falla y lista la huella obsoleta (ya no se reproduce)', () => {
    const result = compareToBaseline(baseline, 'home', 'w320-light', ['region|p'], TAGS);

    expect(result).toEqual({
      ok: false,
      reason: 'drift',
      newFingerprints: [],
      staleFingerprints: ['color-contrast|a'],
    });
  });

  it('lista nuevas y obsoletas por separado cuando hay ambas', () => {
    const result = compareToBaseline(
      baseline,
      'home',
      'w320-light',
      ['region|p', 'label|input'],
      TAGS
    );

    expect(result).toEqual({
      ok: false,
      reason: 'drift',
      newFingerprints: ['label|input'],
      staleFingerprints: ['color-contrast|a'],
    });
  });

  it('falla si falta la clave (ruta, proyecto), aunque no haya violaciones', () => {
    expect(compareToBaseline(baseline, 'detail', 'w320-light', [], TAGS)).toEqual({
      ok: false,
      reason: 'missing-key',
    });
    expect(compareToBaseline(baseline, 'home', 'w768-dark', [], TAGS)).toEqual({
      ok: false,
      reason: 'missing-key',
    });
  });

  it('falla si no hay fichero de línea base', () => {
    expect(compareToBaseline(null, 'home', 'w320-light', [], TAGS)).toEqual({
      ok: false,
      reason: 'missing-key',
    });
  });

  it('falla si las etiquetas de la línea base no coinciden con las de la ejecución', () => {
    const other = baselineWith({ home: { 'w320-light': [] } }, ['wcag2a']);

    expect(compareToBaseline(other, 'home', 'w320-light', [], TAGS)).toEqual({
      ok: false,
      reason: 'tag-mismatch',
    });
  });

  it('una clave presente con lista vacía es válida y pasa sin violaciones', () => {
    const clean = baselineWith({ home: { 'w320-light': [] } });

    expect(compareToBaseline(clean, 'home', 'w320-light', [], TAGS)).toEqual({ ok: true });
  });
});

describe('formatComparisonFailure', () => {
  it('menciona las huellas nuevas y obsoletas y la orden test:e2e:update', () => {
    const message = formatComparisonFailure('home', 'w320-light', {
      ok: false,
      reason: 'drift',
      newFingerprints: ['label|input'],
      staleFingerprints: ['region|p'],
    });

    expect(message).toContain('home');
    expect(message).toContain('w320-light');
    expect(message).toContain('label|input');
    expect(message).toContain('region|p');
    expect(message).toContain('test:e2e:update');
  });

  it('explica la clave ausente y la discrepancia de etiquetas', () => {
    expect(
      formatComparisonFailure('home', 'w320-light', { ok: false, reason: 'missing-key' })
    ).toContain('test:e2e:update');
    expect(
      formatComparisonFailure('home', 'w320-light', { ok: false, reason: 'tag-mismatch' })
    ).toContain('etiquetas');
  });
});

describe('mergeBaseline', () => {
  it('reemplaza por completo las claves preparadas y descarta las huellas obsoletas', () => {
    const existing = baselineWith({ home: { 'w320-light': ['color-contrast|a', 'region|p'] } });

    const merged = mergeBaseline(
      existing,
      [{ route: 'home', project: 'w320-light', fingerprints: ['region|p'] }],
      TAGS
    );

    expect(merged.entries).toEqual({ home: { 'w320-light': ['region|p'] } });
  });

  it('conserva las claves no preparadas (ejecución parcial) y añade las nuevas', () => {
    const existing = baselineWith({ home: { 'w320-light': ['region|p'] } });

    const merged = mergeBaseline(
      existing,
      [{ route: 'detail', project: 'w768-dark', fingerprints: ['label|input'] }],
      TAGS
    );

    expect(merged.entries).toEqual({
      home: { 'w320-light': ['region|p'] },
      detail: { 'w768-dark': ['label|input'] },
    });
  });

  it('parte de cero sin línea base previa y fija etiquetas y versión del esquema', () => {
    const merged = mergeBaseline(
      null,
      [{ route: 'home', project: 'w320-light', fingerprints: ['b|y', 'a|x'] }],
      TAGS
    );

    expect(merged).toEqual({
      schemaVersion: 1,
      tags: TAGS,
      entries: { home: { 'w320-light': ['a|x', 'b|y'] } },
    });
  });
});

describe('serializeBaseline', () => {
  it('ordena rutas, proyectos y huellas, con 2 espacios, LF y salto final', () => {
    const text = serializeBaseline(
      baselineWith({
        map: { 'w768-dark': ['z|b', 'a|c'], 'w320-light': [] },
        home: { 'w320-light': ['r|p'] },
      })
    );

    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('\r');
    const parsed = JSON.parse(text) as AxeBaseline;
    expect(Object.keys(parsed.entries)).toEqual(['home', 'map']);
    expect(Object.keys(parsed.entries.map ?? {})).toEqual(['w320-light', 'w768-dark']);
    expect(parsed.entries.map?.['w768-dark']).toEqual(['a|c', 'z|b']);
    expect(text).toContain('\n  "schemaVersion": 1');
  });
});
