// ROADMAP 3.1 (decisión 123) — caja de búsqueda en lenguaje natural. Server
// Component puro: un GET HTML a `/` con el único campo `q`. Sin JavaScript de
// cliente (la lista de `'use client'` no crece) y presente en TODOS los modos
// de la página, no solo en la rama `?q=`.
import type { ReactElement } from 'react';

export function SearchTextForm({ value }: { readonly value: string }): ReactElement {
  return (
    <form role="search" method="get" action="/">
      <label htmlFor="search-text">Describe lo que buscas</label>{' '}
      <input id="search-text" type="search" name="q" defaultValue={value} maxLength={200} />{' '}
      <button type="submit">Interpretar</button>
    </form>
  );
}
