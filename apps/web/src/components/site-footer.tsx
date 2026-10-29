import type { ReactElement } from 'react';

import { SHELL_CONTAINER } from './shell-container';

// ROADMAP 3.4 (decisión 263; R10.1) — pie del sitio: los enlaces a las tres páginas legales y la atribución
// CC-BY del IGN/CNIG, en el único landmark `contentinfo` de toda página.
//
// La atribución (ROADMAP 1.13, diseño A-3, DD-24) es una obligación legal bajo la Orden FOM/2807/2015, no
// una cortesía: vive aquí porque los datos derivados del CNIG (centroides de `locations`) influyen en TODA
// página que compone resultados, y el Server Component no cuesta JavaScript. La atribución de las teselas
// (ODbL) va junto a cada mapa (decisión 261), no aquí.
//
// Los enlaces son una lista simple, sin `<nav>`: la app no tiene landmark de navegación (D.18,
// decisión 223) y el pie ya es un landmark. Objetivos de 40 px como el resto de lo que se pulsa
// (decisión 200). Enlaces normales y no `next/link` (convención de la app): `Link` añadiría JavaScript de
// cliente y prefetch, y el pie debe seguir siendo estático.
const LEGAL_LINKS: readonly { readonly href: string; readonly name: string }[] = [
  { href: '/legal/privacy', name: 'Política de privacidad' },
  { href: '/legal/cookies', name: 'Política de cookies' },
  { href: '/legal/notice', name: 'Aviso legal' },
];

export function SiteFooter(): ReactElement {
  return (
    <footer className="border-t border-rule bg-surface-sunken">
      <div className={`${SHELL_CONTAINER} flex flex-col gap-2 py-4 text-dense text-ink-muted`}>
        <ul className="flex flex-wrap gap-x-6">
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="inline-flex min-h-10 items-center">
                {link.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="max-w-prose">
          Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de
          Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información
          Geográfica (CNIG), bajo licencia CC-BY 4.0.
        </p>
      </div>
    </footer>
  );
}
