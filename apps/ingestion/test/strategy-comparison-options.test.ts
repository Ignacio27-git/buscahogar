// ROADMAP 2.2 — parseComparisonArgs (decisión 091). Mismo patrón de tres
// pasos que blocking/options.ts (paso 1.8, read-only): parseArgs
// ({strict:true}) rechaza un flag desconocido por sí solo; Zod comprueba
// presencia/forma nombrando el flag; el split final a números nombra el
// flag Y el elemento ofensivo. A diferencia de la calibración de bloqueo,
// TODOS los flags son opcionales aquí (D6: sin .env ni base de datos).
import { describe, expect, it } from 'vitest';

import { ComparisonOptionsError, parseComparisonArgs } from '../src/strategy-comparison/options.js';

describe('parseComparisonArgs — CLI de comparación de estrategias (ROADMAP 2.2, decisión 091)', () => {
  it('un flag no reconocido se rechaza por nombre', () => {
    expect(() => parseComparisonArgs(['--formato', 'json'])).toThrow(/formato/);
  });

  it('sin ningún flag, usa format=json y high/low ausentes (DEFAULT_SWEEP se resuelve en grid.ts)', () => {
    const options = parseComparisonArgs([]);
    expect(options.format).toBe('json');
    expect(options.high).toBeUndefined();
    expect(options.low).toBeUndefined();
    expect(options.output).toBeUndefined();
  });

  it('--format acepta markdown/json/csv', () => {
    expect(parseComparisonArgs(['--format', 'markdown']).format).toBe('markdown');
    expect(parseComparisonArgs(['--format', 'csv']).format).toBe('csv');
  });

  it('--format con un valor no reconocido se rechaza', () => {
    expect(() => parseComparisonArgs(['--format', 'xml'])).toThrow(ComparisonOptionsError);
  });

  it('--high sin --low se rechaza (deben darse juntos o ambos ausentes)', () => {
    expect(() => parseComparisonArgs(['--high', '0.9'])).toThrow(ComparisonOptionsError);
  });

  it('--low sin --high se rechaza', () => {
    expect(() => parseComparisonArgs(['--low', '0.5'])).toThrow(ComparisonOptionsError);
  });

  it('--high/--low juntos se parsean en listas de números', () => {
    const options = parseComparisonArgs(['--high', '0.8,0.9', '--low', '0.4,0.5']);
    expect(options.high).toEqual([0.8, 0.9]);
    expect(options.low).toEqual([0.4, 0.5]);
  });

  it('un elemento no numérico de --high se rechaza nombrando el flag y el elemento ofensivo', () => {
    expect(() => parseComparisonArgs(['--high', '0.8,abc', '--low', '0.4,0.5'])).toThrow(/--high.*abc/);
  });

  it('lanza ComparisonOptionsError, no un Error genérico', () => {
    expect(() => parseComparisonArgs(['--formato', 'json'])).toThrow(ComparisonOptionsError);
  });

  it('--output se acepta como ruta de fichero opcional', () => {
    const options = parseComparisonArgs(['--output', 'reporte.md']);
    expect(options.output).toBe('reporte.md');
  });
});
