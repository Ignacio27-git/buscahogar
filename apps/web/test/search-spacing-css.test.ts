// D.18 (pulido tras el gate G-D) — ritmo vertical de la cabecera de la búsqueda. Lee `globals.css`
// como texto, sin navegador: la barra de herramientas separa sus filas con el mismo 1rem que el resto
// de la cabecera, y el aviso de cobertura deja 1rem antes de los resultados (también con el estado vacío).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declarations, findBlock, findBlocks, parseCss, type CssNode } from './helpers/css-tokens';

const CSS = readFileSync(fileURLToPath(new URL('../src/app/globals.css', import.meta.url)), 'utf8');
const components = (): CssNode => findBlock(parseCss(CSS), '@layer components');

describe('ritmo vertical de la cabecera (pulido D.18)', () => {
  it('la barra de herramientas separa las filas con 1rem, el hueco de la cabecera', () => {
    const toolbar = declarations(findBlock(components(), '.search-toolbar'));
    expect(toolbar.get('gap')).toMatch(/^1rem\b/);
    expect(declarations(findBlock(components(), '.search-header')).get('gap')).toBe('1rem');
  });

  it('el aviso de cobertura de la cabecera no lleva margen propio (el hueco lo da la cabecera)', () => {
    const notice = declarations(findBlock(components(), '.search-header > .coverage-notice'));
    expect(notice.get('margin')).toBe('0');
  });

  // El conmutador de vista (visible bajo 64rem) ya separa el aviso de los resultados: el margen extra
  // solo vale en el diseño ancho, donde no hay conmutador.
  it('tras una cabecera con aviso de cobertura, los resultados dejan 1rem solo desde 64rem', () => {
    const selector = '.search-header:has(> .coverage-panel, > .coverage-notice) + .search-results';
    const wide = findBlocks(components()).filter((node) => node.prelude.replace(/\s+/g, ' ') === '@media (width >= 64rem)');
    const rules = wide.flatMap((media) => media.children.filter((child) => child.prelude.replace(/\s+/g, ' ') === selector));
    expect(rules).toHaveLength(1);
    expect(declarations(rules[0] as CssNode).get('margin-block-start')).toBe('1rem');
    // Y ninguna regla suelta (sin media query) lo aplica a todos los anchos.
    const loose = components().children.filter((child) => child.prelude.replace(/\s+/g, ' ') === selector);
    expect(loose).toHaveLength(0);
  });
});
