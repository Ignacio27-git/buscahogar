// D.9 (decisión 174) — la descripción se parte en párrafos; sin descripción no hay sección
// y esa ausencia no provoca ningún aviso.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { PropertyDescription } from '../src/components/property-description.js';

describe('PropertyDescription (D.9)', () => {
  it('pinta un <p> por bloque, en orden', () => {
    const html = renderToStaticMarkup(<PropertyDescription description={'Primero.\n\nSegundo.'} />);

    expect(html).toContain('<h2>Descripción</h2>');
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html.indexOf('Primero.')).toBeLessThan(html.indexOf('Segundo.'));
  });

  it('sin descripción (nula, vacía o en blanco) no renderiza nada ni avisa', () => {
    for (const description of [null, '', '  \n ']) {
      expect(renderToStaticMarkup(<PropertyDescription description={description} />)).toBe('');
    }
  });
});
