import type { ReactElement } from 'react';

import { SHELL_CONTAINER } from './shell-container';

// D.17 (B7): bajo 30rem la cabecera se compacta. A 320 px el selector pasa a una segunda fila y con
// objetivos de 40 px la cabecera medía ~112 px en todas las páginas; con 32 px (por encima del mínimo
// de 24 de WCAG 2.5.8) y menos relleno vertical mide ~80 px. Desde 30rem, 40 px como siempre.
const THEME_BUTTON = 'min-h-10 text-dense max-[30rem]:min-h-8 max-[30rem]:py-1';
const HEADER_LINK = 'inline-flex min-h-10 items-center max-[30rem]:min-h-8';

// Selector de tema (D.4, decisión 144; movido aquí en D.5). Server Component sin
// JavaScript: un formulario POST a `/theme` que guarda la cookie y vuelve a la
// página. El estado actual lo pinta solo el CSS según la clase de `<html>`.
function ThemeSelector(): ReactElement {
  return (
    <form method="post" action="/theme" className="theme-selector sm:ml-auto">
      <fieldset>
        <legend>Tema</legend>
        <button type="submit" name="theme" value="light" className={THEME_BUTTON}>
          Claro
        </button>
        <button type="submit" name="theme" value="dark" className={THEME_BUTTON}>
          Oscuro
        </button>
        <button type="submit" name="theme" value="system" className={THEME_BUTTON}>
          Sistema
        </button>
      </fieldset>
    </form>
  );
}

// Cabecera de la aplicación (D.5, decisión 147): el landmark `banner`. Estática,
// no fija al desplazarse, y sin buscador propio: la búsqueda vive en la página.
// En 320 px el selector pasa a una segunda fila; el orden del DOM es el visual.
// Enlaces con `<a href>` normal, nunca `next/link` (convención de toda la app): `Link`
// añadiría JavaScript de cliente y prefetch, y la cabecera debe seguir siendo estática.
/* eslint-disable @next/next/no-html-link-for-pages */
export function SiteHeader(): ReactElement {
  return (
    <header className="border-b border-rule">
      <div
        className={`${SHELL_CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-2 py-3 max-[30rem]:gap-y-0 max-[30rem]:py-2`}
      >
        <a href="/" className={`${HEADER_LINK} text-heading-3 text-ink no-underline`}>
          Buscahogar
        </a>
        <nav aria-label="Principal">
          <ul className="flex gap-4">
            <li>
              <a href="/" className={HEADER_LINK}>
                Buscar
              </a>
            </li>
          </ul>
        </nav>
        <ThemeSelector />
      </div>
    </header>
  );
}
