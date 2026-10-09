// ROADMAP 3.1 (decisión 123) — caja de búsqueda en lenguaje natural. Server
// Component puro: un GET HTML a `/` con el único campo `q`. Sin JavaScript de
// cliente (la lista de `'use client'` no crece) y presente en TODOS los modos
// de la página, no solo en la rama `?q=`.
//
// D.7 (decisión 158): el botón dice lo que hace («Convertir en filtros») y el
// ejemplo es un texto de ayuda persistente enlazado con `aria-describedby`, no
// un placeholder (desaparece al escribir y no es un nombre accesible).
import type { ReactElement } from 'react';

// D.15 (F4, decisión 196): con `errorId` la caja de texto se declara inválida y, además de su
// ayuda, la describe la alerta que explica el rechazo.
export function SearchTextForm({
  value,
  errorId,
}: {
  readonly value: string;
  readonly errorId?: string | undefined;
}): ReactElement {
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
        aria-describedby={errorId === undefined ? 'search-text-help' : `search-text-help ${errorId}`}
        aria-invalid={errorId === undefined ? undefined : true}
      />
      <button type="submit">Convertir en filtros</button>
    </form>
  );
}
