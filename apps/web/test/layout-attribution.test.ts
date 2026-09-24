// ROADMAP 1.13 (diseño A-3, DD-24) — atribución CC-BY/IGN obligatoria por
// Orden FOM/2807/2015: visible al usuario en la MISMA unidad que la primera
// coordenada derivada de CNIG (delivery `exception-ok`, unidad única — no
// puede llegar en una porción posterior a los datos que cubre). Vive en el
// footer de `layout.tsx` porque las coordenadas influyen en TODA página, no
// solo en la de selección de zona; es un Server Component, así que no
// cuesta JavaScript.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from '../src/app/layout.js';

describe('RootLayout — atribución CC-BY/IGN (A-3, DD-24)', () => {
  it('el markup renderizado en servidor nombra IGN o CNIG', () => {
    const html = renderToStaticMarkup(RootLayout({ children: 'contenido de prueba' }));
    expect(html).toMatch(/IGN|CNIG/);
  });

  it('el markup renderizado en servidor nombra la licencia CC-BY', () => {
    const html = renderToStaticMarkup(RootLayout({ children: 'contenido de prueba' }));
    expect(html).toContain('CC-BY');
  });

  it('el contenido de la página sigue presente junto a la atribución (footer, no reemplazo)', () => {
    const html = renderToStaticMarkup(RootLayout({ children: 'contenido de prueba' }));
    expect(html).toContain('contenido de prueba');
  });
});
