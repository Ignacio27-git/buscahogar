// ROADMAP 3.4 (decisión 258, D15; R6.4) — registro estructurado del worker: una línea JSON por evento con
// `ts`, `level`, `component` y `msg`, y NUNCA un secreto. Función pura sobre un `write` inyectado.
import { describe, expect, it } from 'vitest';

import { createJsonLogger, describeError } from '../src/ops/json-logger.js';

function capture(): { readonly lines: string[]; readonly write: (line: string) => void } {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string): void => {
      lines.push(line);
    },
  };
}

const FIXED_NOW = (): Date => new Date('2026-10-22T10:00:00.000Z');

describe('createJsonLogger — forma de la línea', () => {
  it('cada nivel emite UNA línea JSON con ts, level, component y msg', () => {
    const out = capture();
    const log = createJsonLogger({ component: 'coverage-worker', write: out.write, now: FIXED_NOW });

    log.info('worker-started');
    log.warn('env-warning');
    log.error('tick-failed');
    log.fatal('gave-up');

    expect(out.lines).toHaveLength(4);
    const parsed = out.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed.map((entry) => entry.level)).toEqual(['info', 'warn', 'error', 'fatal']);
    expect(parsed.map((entry) => entry.msg)).toEqual(['worker-started', 'env-warning', 'tick-failed', 'gave-up']);
    for (const entry of parsed) {
      expect(entry.ts).toBe('2026-10-22T10:00:00.000Z');
      expect(entry.component).toBe('coverage-worker');
    }
  });

  it('los campos extra viajan en la misma línea y no pueden pisar ts/level/component/msg', () => {
    const out = capture();
    const log = createJsonLogger({ component: 'coverage-worker', write: out.write, now: FIXED_NOW });

    log.error('crash', { attempt: 3, delay_ms: 4000, ts: 'forjado', level: 'info', component: 'otro', msg: 'otro' });

    const entry = JSON.parse(out.lines[0] ?? '') as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'error',
      component: 'coverage-worker',
      msg: 'crash',
      ts: '2026-10-22T10:00:00.000Z',
      attempt: 3,
      delay_ms: 4000,
    });
  });

  it('`line` convierte una línea libre (también multilínea) en UN evento info', () => {
    const out = capture();
    const log = createJsonLogger({ component: 'coverage-worker', write: out.write, now: FIXED_NOW });

    log.line('primera\nsegunda {\n  "a": 1\n}');

    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).not.toContain('\n');
    const entry = JSON.parse(out.lines[0] ?? '') as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'info', msg: 'primera\nsegunda {\n  "a": 1\n}' });
  });
});

describe('createJsonLogger — sin secretos', () => {
  it('sustituye los valores secretos registrados en el mensaje y en los campos de texto', () => {
    const out = capture();
    const log = createJsonLogger({
      component: 'coverage-worker',
      write: out.write,
      now: FIXED_NOW,
      redact: ['s3cr3t-api-key'],
    });
    log.redactValues(['https://hc-ping.example/uuid-privado']);

    log.error('fallo con s3cr3t-api-key', { url: 'https://hc-ping.example/uuid-privado', n: 1 });

    expect(out.lines[0]).not.toContain('s3cr3t-api-key');
    expect(out.lines[0]).not.toContain('uuid-privado');
    const entry = JSON.parse(out.lines[0] ?? '') as Record<string, unknown>;
    expect(entry.msg).toBe('fallo con [redacted]');
    expect(entry.url).toBe('[redacted]');
    expect(entry.n).toBe(1);
  });

  it('ignora valores vacíos (no convierte todo en [redacted])', () => {
    const out = capture();
    const log = createJsonLogger({ component: 'c', write: out.write, now: FIXED_NOW, redact: [''] });

    log.info('hola');

    expect((JSON.parse(out.lines[0] ?? '') as Record<string, unknown>).msg).toBe('hola');
  });
});

describe('describeError', () => {
  it('devuelve solo el mensaje de un Error, nunca la traza', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('no inventa detalle para valores que no son Error', () => {
    expect(describeError('texto')).toBe('texto');
    expect(describeError(42)).toBe('42');
  });

  it('elimina credenciales incrustadas en una URL de conexión', () => {
    const text = describeError(new Error('connect failed postgresql://owner:hunter2@db.internal:5432/app'));

    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('owner');
    expect(text).toContain('postgresql://***@db.internal:5432/app');
  });
});
