import type { ReactElement } from 'react';

import { SHELL_CONTAINER } from './shell-container';

// Selector de tema (D.4, decisión 144; movido aquí en D.5). Server Component sin
// JavaScript: un formulario POST a `/theme` que guarda la cookie y vuelve a la
// página. El estado actual lo pinta solo el CSS según la clase de `<html>`.
function ThemeSelector(): ReactElement {
  return (
    <form method="post" action="/theme" className="theme-selector sm:ml-auto">
      <fieldset>
        <legend>Tema</legend>
        <button type="submit" name="theme" value="light" className="min-h-10 px-3 text-dense">
          Claro
        </button>
        <button type="submit" name="theme" value="dark" className="min-h-10 px-3 text-dense">
          Oscuro
        </button>
        <button type="submit" name="theme" value="system" className="min-h-10 px-3 text-dense">
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
      <div className={`${SHELL_CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-2 py-3`}>
        <a href="/" className="inline-flex min-h-10 items-center text-heading-3 text-ink no-underline">
          Buscahogar
        </a>
        <nav aria-label="Principal">
          <ul className="flex gap-4">
            <li>
              <a href="/" className="inline-flex min-h-10 items-center">
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
