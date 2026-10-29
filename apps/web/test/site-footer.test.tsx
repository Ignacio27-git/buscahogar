// ROADMAP 3.4 (decisión 263; R10.1) — el pie del sitio enlaza las tres páginas legales en TODAS las
// páginas, y conserva la atribución CC-BY del IGN/CNIG (D.5, decisión 150) dentro del único `<footer>`.
// Estático: enlaces normales, sin formularios ni botones (decisión 147) y sin landmark `navigation`
// (decisión 223, D.18: la app no tiene ninguno).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RootLayout from '../src/app/layout.js';
import { SiteFooter } from '../src/components/site-footer.js';

const LEGAL_LINKS = [
  { href: '/legal/privacy', name: 'Política de privacidad' },
  { href: '/legal/cookies', name: 'Política de cookies' },
  { href: '/legal/notice', name: 'Aviso legal' },
] as const;

function footerOf(html: string): string {
  return html.slice(html.indexOf('<footer'), html.indexOf('</footer>') + '</footer>'.length);
}

describe('SiteFooter', () => {
  const html = renderToStaticMarkup(<SiteFooter />);

  it('enlaza las tres páginas legales con su nombre, en este orden', () => {
    const links = Array.from(html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g), (m) => ({
      href: m[1],
      name: m[2],
    }));
    expect(links).toEqual(LEGAL_LINKS.map((link) => ({ href: link.href, name: link.name })));
  });

  it('los enlaces van en una lista (cada uno en su elemento) y no hay landmark de navegación', () => {
    expect(html.match(/<li[ >]/g)).toHaveLength(3);
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('role="navigation"');
  });

  it('conserva la atribución CC-BY del IGN/CNIG con su medida de lectura', () => {
    expect(html.match(/<footer/g)).toHaveLength(1);
    expect(html).toMatch(/<p class="max-w-prose">Datos geográficos derivados del Nomenclátor/);
    expect(html.replace(/\s+/g, ' ')).toContain(
      'Datos geográficos derivados del Nomenclátor Geográfico de Municipios y Entidades de Población (NGMEP), Instituto Geográfico Nacional (IGN) / Centro Nacional de Información Geográfica (CNIG), bajo licencia CC-BY 4.0.'
    );
  });

  it('sigue siendo estático: sin formularios, botones ni scripts', () => {
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<script');
  });
});

describe('RootLayout — el pie con enlaces legales está en toda página (R10.1)', () => {
  const html = renderToStaticMarkup(RootLayout({ children: 'contenido de prueba' }));
  const footer = footerOf(html);

  it('hay un único pie, después del contenido, con los tres enlaces', () => {
    expect(html.match(/<footer/g)).toHaveLength(1);
    expect(html.indexOf('contenido de prueba')).toBeLessThan(html.indexOf('<footer'));
    for (const link of LEGAL_LINKS) {
      expect(footer).toContain(`<a href="${link.href}"`);
      expect(footer).toContain(link.name);
    }
  });

  it('los enlaces legales no aparecen fuera del pie (la cabecera sigue sin navegación)', () => {
    const outside = html.slice(0, html.indexOf('<footer'));
    expect(outside).not.toContain('/legal/');
  });
});
