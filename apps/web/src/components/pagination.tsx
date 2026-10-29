// D.6b (decisión 156) — paginador de la lista. Server Component puro, sin
// `'use client'`. No hay consulta de total: solo se sabe si hay página
// siguiente, así que el indicador dice «Página N» y nunca «de M».
//
// Con una sola página (la 1 y sin siguiente) no se pinta nada. En el resto de
// casos el extremo que no existe se pinta como texto, no como enlace
// deshabilitado, y oculto a lectores de pantalla: mantiene la maquetación
// estable sin ofrecer un destino falso. Los enlaces conservan los filtros con
// `buildPageHref`.
import type { ReactElement } from 'react';

import { buildPageHref } from '@/lib/search-href';
import type { RawSearchParams } from '@/lib/search-href';

export interface PaginationProps {
  readonly params: RawSearchParams;
  readonly page: number;
  readonly hasNextPage: boolean;
}

interface PagerEndProps {
  readonly href: string | null;
  readonly text: string;
  readonly area: 'prev' | 'next';
}

function PagerEnd({ href, text, area }: PagerEndProps): ReactElement {
  return href !== null ? (
    <a href={href} className={`pagination__${area}`}>
      {text}
    </a>
  ) : (
    <span aria-hidden="true" className={`pagination__edge pagination__${area}`}>
      {text}
    </span>
  );
}

export function Pagination({ params, page, hasNextPage }: PaginationProps): ReactElement | null {
  if (page === 1 && !hasNextPage) {
    return null;
  }

  return (
    <nav aria-label="Paginación de resultados" className="pagination">
      <PagerEnd area="prev" text="Página anterior" href={page > 1 ? buildPageHref(params, page - 1) : null} />
      <p className="pagination__indicator tabular-nums">Página {page}</p>
      <PagerEnd area="next" text="Página siguiente" href={hasNextPage ? buildPageHref(params, page + 1) : null} />
    </nav>
  );
}
