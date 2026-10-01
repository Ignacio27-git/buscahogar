import { describe, expect, it } from 'vitest';

import { tokenize } from '../src/nl-search/tokenize.js';

// ROADMAP 3.1 — la tokenización conserva posiciones sobre el texto original
// y separa los sufijos pegados al número (900€, 300k, 80m2).
describe('tokenize', () => {
  const norms = (text: string): string[] => tokenize(text).map((token) => token.norm);

  it('separa por espacios y pliega acentos y mayúsculas', () => {
    expect(norms('Ático  en Málaga')).toEqual(['atico', 'en', 'malaga']);
  });

  it('conserva los límites de cada token en el texto original', () => {
    const text = 'piso en Getafe';
    const [, , last] = tokenize(text);
    expect(text.slice(last?.start, last?.end)).toBe('Getafe');
  });

  it('separa el sufijo de un importe pegado: 900€, 300k, 80m2, 1,5M', () => {
    expect(norms('900€')).toEqual(['900', '€']);
    expect(norms('300k')).toEqual(['300', 'k']);
    expect(norms('80m2')).toEqual(['80', 'm2']);
    expect(norms('1,5M')).toEqual(['1,5', 'm']);
  });

  it('separa el "/mes" de un importe: 900€/mes', () => {
    expect(norms('900€/mes')).toEqual(['900', '€', 'mes']);
  });

  it('quita la puntuación final y la marca en el token', () => {
    const tokens = tokenize('ático, mejor piso.');
    expect(tokens.map((token) => token.norm)).toEqual(['atico', 'mejor', 'piso']);
    expect(tokens[0]?.punctAfter).toBe(true);
    expect(tokens[1]?.punctAfter).toBe(false);
    expect(tokens[2]?.punctAfter).toBe(true);
  });

  it('un número con punto de millar y coma final conserva el número entero', () => {
    const tokens = tokenize('hasta 1.200, piso');
    expect(tokens[1]?.norm).toBe('1.200');
    expect(tokens[1]?.punctAfter).toBe(true);
  });

  it('un ordinal pegado (2º) es un único token', () => {
    expect(norms('2º piso')).toEqual(['2º', 'piso']);
  });

  it('texto vacío o solo espacios no produce tokens', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});
