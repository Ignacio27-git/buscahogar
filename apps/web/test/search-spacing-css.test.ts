// D.18 (pulido tras el gate G-D) — ritmo vertical de la cabecera de la búsqueda. Lee `globals.css`
// como texto, sin navegador: la barra de herramientas separa sus filas con el mismo 1rem que el resto
// de la cabecera, y el aviso de cobertura deja 1rem antes de los resultados (también con el estado vacío).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declarations, findBlock, parseCss, type CssNode } from './helpers/css-tokens';

const CSS = readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8');
const components = (): CssNode => findBlock(parseCss(CSS), '@layer components');

describe('ritmo vertical de la cabecera (pulido D.18)', () => {
  it('la barra de herramientas separa las filas con 1rem, el hueco de la cabecera', () => {
    const toolbar = declarations(findBlock(components(), '.search-toolbar'));
    expect(toolbar.get('gap')).toMatch(/^1rem\b/);
    expect(declarations(findBlock(components(), '.search-header')).get('gap')).toBe('1rem');
  });

  // P8 (pulido de D.21): el aviso de cobertura ya no es hijo de la cabecera sino del envoltorio de avisos
  // de la rejilla de resultados; sigue sin margen propio (el hueco lo da el envoltorio).
  it('el aviso de cobertura del envoltorio de avisos no lleva margen propio', () => {
    const notice = declarations(findBlock(components(), '.search-results__notices > .coverage-notice'));
    expect(notice.get('margin')).toBe('0');
  });

  it('la rejilla con avisos se separa 1rem de la cabecera y el envoltorio apila sus hijos con 1rem', () => {
    const results = declarations(findBlock(components(), '.search-results:has(> .search-results__notices)'));
    expect(results.get('margin-block-start')).toBe('1rem');
    expect(declarations(findBlock(components(), '.search-results__notices')).get('gap')).toBe('1rem');
  });
});
