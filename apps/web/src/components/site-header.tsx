import type { ReactElement } from 'react';

import { BrandMark } from './brand-mark';
import { Icon } from './icon';
import type { IconName } from './icon';
import { SHELL_CONTAINER } from './shell-container';

// D.17 (B7): bajo 30rem la cabecera se compacta solo en el relleno y el hueco entre filas. Los
// objetivos siguen midiendo 40 px (decisión 200) a todos los anchos; un test lo fija.
const HEADER_LINK = 'inline-flex min-h-10 items-center';
// D.18 (decisión 223): botón de icono de 40 × 40. `relative` ancla la barra `::before` del activo.
const THEME_BUTTON = 'relative inline-flex min-h-10 min-w-10 items-center justify-center px-2 text-heading-3';

const THEME_OPTIONS: readonly { readonly value: string; readonly name: string; readonly icon: IconName }[] = [
  { value: 'light', name: 'Claro', icon: 'sun' },
  { value: 'dark', name: 'Oscuro', icon: 'moon' },
  { value: 'system', name: 'Sistema', icon: 'monitor' },
];

// Selector de tema (D.4, decisión 144; movido aquí en D.5). Server Component sin
// JavaScript: un formulario POST a `/theme` que guarda la cookie y vuelve a la
// página. El estado actual lo pinta solo el CSS según la clase de `<html>`.
// D.18 (decisión 223): tres botones de icono. El nombre accesible es el texto de un span `sr-only`
// (`theme-selector__name`); el CSS le añade «, activo» al del tema vigente (enmienda la 195). La
// leyenda «Tema» queda oculta a la vista y el selector va siempre a la derecha (`ml-auto`).
function ThemeSelector(): ReactElement {
  return (
    <form method="post" action="/theme" className="theme-selector ml-auto">
      <fieldset>
        <legend className="sr-only">Tema</legend>
        {THEME_OPTIONS.map((option) => (
          <button key={option.value} type="submit" name="theme" value={option.value} className={THEME_BUTTON}>
            <Icon name={option.icon} />
            <span className="sr-only theme-selector__name">{option.name}</span>
          </button>
        ))}
      </fieldset>
    </form>
  );
}

// Cabecera de la aplicación (D.5, decisión 147): el landmark `banner`. Estática,
// no fija al desplazarse, y sin buscador propio: la búsqueda vive en la página.
// D.18 (decisión 223): sin `<nav>` ni «Buscar»; el nombre es el enlace a «/». A 320 px el nombre y
// los tres botones caben en una fila; el orden del DOM es el visual.
// D.22 (decisión 266): el enlace lleva la marca «casa encontrada» (decorativa, `aria-hidden`) delante del
// texto, a todos los anchos; el nombre accesible sigue siendo el texto en vivo «Buscahogar». La marca mide
// 1.75rem (`.brand-mark`) y cabe en la fila de 40 px.
// Enlaces con `<a href>` normal, nunca `next/link` (convención de toda la app): `Link`
// añadiría JavaScript de cliente y prefetch, y la cabecera debe seguir siendo estática.
/* eslint-disable @next/next/no-html-link-for-pages */
export function SiteHeader(): ReactElement {
  return (
    <header className="border-b border-rule">
      <div
        className={`${SHELL_CONTAINER} flex flex-wrap items-center gap-x-6 gap-y-2 py-3 max-[30rem]:gap-x-3 max-[30rem]:gap-y-0 max-[30rem]:py-2`}
      >
        <a href="/" className={`${HEADER_LINK} gap-2 text-heading-3 text-ink no-underline`}>
          <BrandMark />
          Buscahogar
        </a>
        <ThemeSelector />
      </div>
    </header>
  );
}
