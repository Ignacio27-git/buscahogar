// Paso D.4 — script de tema en <head> y selector de tema en el pie del layout.
// RootLayout debe seguir siendo síncrono y estático: sin cookies() ni headers()
// (decisión 144, opción (a)). El estado actual se pinta solo con CSS.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from '../src/app/layout.js';
import { THEME_INIT_SCRIPT } from '../src/server/theme-preference.js';

const render = (): string => renderToStaticMarkup(RootLayout({ children: 'contenido' }));

describe('RootLayout — tema (D.4)', () => {
  it('es síncrono: devuelve un elemento, no una promesa', () => {
    expect(RootLayout({ children: 'x' })).not.toBeInstanceOf(Promise);
  });

  it('html lleva lang="es" y suppressHydrationWarning no rompe el marcado', () => {
    const el = RootLayout({ children: 'x' });
    expect(el.props).toMatchObject({ lang: 'es', suppressHydrationWarning: true });
  });

  it('el script inline va dentro de <head>, antes de <body>', () => {
    const html = render();
    const head = html.indexOf('<head>');
    const script = html.indexOf(THEME_INIT_SCRIPT);
    expect(head).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(head);
    expect(html.indexOf('</head>')).toBeGreaterThan(script);
    expect(script).toBeLessThan(html.indexOf('<body'));
  });

  it('el formulario envía por POST a /theme con legend "Tema"', () => {
    const html = render();
    expect(html).toMatch(/<form[^>]*method="post"[^>]*action="\/theme"|<form[^>]*action="\/theme"[^>]*method="post"/);
    expect(html).toMatch(/<fieldset[^>]*><legend[^>]*>Tema<\/legend>/);
  });

  it('hay exactamente tres botones submit name=theme: light, dark, system', () => {
    const buttons = [...render().matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(3);
    const values = buttons.map((b) => /value="([^"]+)"/.exec(b)?.[1]);
    expect(values).toEqual(['light', 'dark', 'system']);
    for (const b of buttons) {
      expect(b).toContain('type="submit"');
      expect(b).toContain('name="theme"');
    }
    expect(render()).not.toContain('aria-pressed');
  });

  it('layout.tsx no importa next/headers ni lee cookies()/headers()', () => {
    const src = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/next\/headers/);
    expect(src).not.toMatch(/\b(?:cookies|headers)\s*\(/);
  });

  // Turbopack no resuelve el sufijo `.js` en rutas relativas hacia ficheros `.ts`
  // (falló `next build` en el e2e): el resto de `src/app` importa con el alias `@/`.
  it('layout.tsx importa el helper del tema con el alias @/ y sin sufijo .js', () => {
    const src = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
    expect(src).toContain("from '@/server/theme-preference'");
    expect(src).not.toMatch(/from '\.{1,2}\/[^']*\.js'/);
  });
});
