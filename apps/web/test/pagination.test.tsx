// D.6b (spec search-results-pagination, decisión 156) — paginador: oculto con
// una sola página, indicador «Página N» y el extremo no disponible como texto.
// `renderToStaticMarkup`: sin red ni base de datos.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Pagination } from '../src/components/pagination.js';

describe('Pagination — S12', () => {
  it('página 1 sin página siguiente: no renderiza nada', () => {
    expect(renderToStaticMarkup(<Pagination params={{}} page={1} hasNextPage={false} />)).toBe('');
  });
});

describe('Pagination — S13', () => {
  const html = renderToStaticMarkup(<Pagination params={{ operation: 'sale' }} page={1} hasNextPage />);

  it('indica la página y conserva el nombre accesible del nav', () => {
    expect(html).toContain('aria-label="Paginación de resultados"');
    expect(html).toContain('Página 1');
  });

  it('siguiente es un enlace que conserva los filtros', () => {
    expect(html).toContain('<a href="/?operation=sale&amp;page=2"');
    expect(html).toContain('Página siguiente</a>');
  });

  it('anterior es texto sin enlace y oculto a lectores', () => {
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<span [^>]*aria-hidden="true"[^>]*>Página anterior<\/span>/);
  });
});

describe('Pagination — S14', () => {
  const html = renderToStaticMarkup(<Pagination params={{ operation: 'rent', minRooms: '2' }} page={3} hasNextPage={false} />);

  it('anterior es un enlace con los filtros y la página previa', () => {
    expect(html).toContain('href="/?operation=rent&amp;minRooms=2&amp;page=2"');
    expect(html).toContain('Página anterior</a>');
  });

  it('siguiente es texto sin enlace y el indicador dice «Página 3»', () => {
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<span [^>]*aria-hidden="true"[^>]*>Página siguiente<\/span>/);
    expect(html).toContain('Página 3');
  });

  it('en una página intermedia hay los dos enlaces', () => {
    const middle = renderToStaticMarkup(<Pagination params={{}} page={2} hasNextPage />);
    expect(middle.match(/<a /g)).toHaveLength(2);
    expect(middle).toContain('href="/?page=1"');
    expect(middle).toContain('href="/?page=3"');
  });
});
