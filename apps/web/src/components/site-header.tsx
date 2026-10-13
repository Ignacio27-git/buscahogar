import type { ReactElement } from 'react';

import { SHELL_CONTAINER } from './shell-container';

// D.17 (B7): bajo 30rem la cabecera se compacta solo en el relleno y el hueco entre filas. Los
// objetivos siguen midiendo 40 px (decisión 200) a todos los anchos; un test lo fija.
const THEME_BUTTON = 'min-h-10 text-dense';
const HEADER_LINK = 'inline-flex min-h-10 items-center';

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
