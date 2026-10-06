// ROADMAP 3.1 (decisión 123) — caja de búsqueda en lenguaje natural. Server
// Component puro: un GET HTML a `/` con el único campo `q`. Sin JavaScript de
// cliente (la lista de `'use client'` no crece) y presente en TODOS los modos
// de la página, no solo en la rama `?q=`.
//
// D.7 (decisión 158): el botón dice lo que hace («Convertir en filtros») y el
// ejemplo es un texto de ayuda persistente enlazado con `aria-describedby`, no
// un placeholder (desaparece al escribir y no es un nombre accesible).
import type { ReactElement } from 'react';

export function SearchTextForm({ value }: { readonly value: string }): ReactElement {
  return (
    <form role="search" method="get" action="/" className="search-text">
      <label htmlFor="search-text">Describe lo que buscas</label>
      <p id="search-text-help" className="search-text__help">
        Por ejemplo: «Piso en alquiler en Getafe hasta 900 € con 2 habitaciones»
      </p>
      <input
        id="search-text"
        type="search"
        name="q"
        defaultValue={value}
        maxLength={200}
        aria-describedby="search-text-help"
      />
      <button type="submit">Convertir en filtros</button>
    </form>
  );
}
