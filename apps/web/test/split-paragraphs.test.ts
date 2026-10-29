// D.9 (decisión 174) — la descripción se parte en párrafos por los saltos de
// línea. Función pura: sin red ni base de datos.
import { describe, expect, it } from 'vitest';

import { splitParagraphs } from '../src/lib/split-paragraphs.js';

describe('splitParagraphs — D.9', () => {
  it('parte por una línea en blanco', () => {
    expect(splitParagraphs('Uno\n\nDos')).toEqual(['Uno', 'Dos']);
  });

  it('normaliza CRLF y CR', () => {
    expect(splitParagraphs('Uno\r\n\r\nDos\rTres')).toEqual(['Uno', 'Dos', 'Tres']);
  });

  it('colapsa rachas de saltos y recorta espacios', () => {
    expect(splitParagraphs('  Uno  \n\n\n\n   Dos \n')).toEqual(['Uno', 'Dos']);
  });

  it('descarta bloques vacíos', () => {
    expect(splitParagraphs('\n  \n')).toEqual([]);
    expect(splitParagraphs('')).toEqual([]);
  });

  it('null da lista vacía', () => {
    expect(splitParagraphs(null)).toEqual([]);
  });
});
