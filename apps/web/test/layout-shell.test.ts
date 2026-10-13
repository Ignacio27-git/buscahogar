// Paso D.5 (specs app-shell R1-R6 y page-metadata R1, diseño decisiones 147-150) —
// el layout es el único dueño del marco de página: enlace de salto, cabecera
// (banner), `<main id="contenido">` y pie (contentinfo). RootLayout sigue siendo
// síncrono y estático. Las pruebas renderizan en servidor y leen el código fuente
// para las reglas que el HTML no deja ver (sin sticky, un solo `<main` en `src/`).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout, { metadata } from '../src/app/layout.js';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const MARKER = 'MARCADOR-DE-HIJOS';
const html = renderToStaticMarkup(RootLayout({ children: MARKER }));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry) ? [path] : [];
  });
}

const read = (path: string): string => readFileSync(path, 'utf8');
const count = (text: string, needle: string): number => text.split(needle).length - 1;

describe('RootLayout — enlace de salto y orden de landmarks (R1, R2)', () => {
  it('el cuerpo abre con el enlace de salto, antes de la cabecera', () => {
    const body = html.slice(html.indexOf('<body'));
    const skip = '<a href="#contenido" class="skip-link">Saltar al contenido</a>';
    expect(body.indexOf(skip)).toBeGreaterThan(-1);
    expect(body.indexOf(skip)).toBeLessThan(body.indexOf('<header'));
    expect(body.slice(body.indexOf('>') + 1).startsWith(skip)).toBe(true);
  });

  it('el script de tema sigue en <head>', () => {
    expect(html.indexOf('<script')).toBeGreaterThan(html.indexOf('<head>'));
    expect(html.indexOf('<script')).toBeLessThan(html.indexOf('</head>'));
  });

  it('hay exactamente una cabecera, un main#contenido tabindex=-1 y un pie, en ese orden', () => {
    expect(count(html, '<header')).toBe(1);
    expect(count(html, '<main')).toBe(1);
    expect(count(html, '<footer')).toBe(1);
    expect(html).toContain('<main id="contenido" tabindex="-1"');
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main'));
    expect(html.indexOf('<main')).toBeLessThan(html.indexOf('<footer'));
  });

  it('main envuelve a los hijos y el layout no pinta ningún h1', () => {
    const mainOpen = html.indexOf('<main');
    expect(html.indexOf(MARKER)).toBeGreaterThan(mainOpen);
    expect(html.indexOf(MARKER)).toBeLessThan(html.indexOf('</main>'));
    expect(html).not.toContain('<h1');
  });

  it('RootLayout es síncrono', () => {
    expect(RootLayout({ children: 'x' })).not.toBeInstanceOf(Promise);
  });
});

describe('Cabecera (R3)', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));

  it('lleva el nombre como enlace a / y la navegación Principal con Buscar', () => {
    expect(header).toMatch(/<a href="\/"[^>]*>Buscahogar<\/a>/);
    expect(header).toMatch(/<nav aria-label="Principal">[\s\S]*<a href="\/"[^>]*>Buscar<\/a>[\s\S]*<\/nav>/);
    expect(count(header, '<nav')).toBe(1);
  });

  it('contiene el selector de tema', () => {
    expect(header).toContain('<form');
  });

  it('no es sticky ni fixed (ni en el código ni en el HTML)', () => {
    const source = read(join(SRC_DIR, 'components', 'site-header.tsx'));
    expect(source).not.toMatch(/sticky|fixed|position:/);
    expect(header.slice(0, header.indexOf('>'))).not.toMatch(/sticky|fixed/);
  });
});

describe('Pie (R4)', () => {
  it('no contiene el selector de tema', () => {
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    expect(footer).not.toContain('<form');
    expect(footer).not.toContain('<button');
  });
});

describe('Contenedor (R6)', () => {
  it('cabecera, main y pie comparten max-w-page', () => {
    expect(count(html, 'max-w-page')).toBe(3);
  });
});

describe('Metadatos raíz (page-metadata R1)', () => {
  it('el título es exactamente default + plantilla', () => {
    expect(metadata.title).toEqual({ default: 'Buscahogar', template: '%s · Buscahogar' });
  });

  it('la descripción existe, cabe en 160 caracteres y no usa el nombre antiguo', () => {
    const description = metadata.description ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).not.toContain('Agregador');
  });
});

describe('Escaneo estático de src/ (R2, R5)', () => {
  const files = sourceFiles(SRC_DIR);

  // D.14: `global-error.tsx` y la página 429 (`rate-limit-page.ts`) son las excepciones: cada una
  // es un documento propio, fuera del layout raíz, y dueña de su `main`.
  it('solo layout.tsx y los documentos propios (global-error.tsx, rate-limit-page.ts) contienen <main', () => {
    const owners = files.filter((file) => read(file).includes('<main'));
    expect(owners.map((file) => file.split(/[\\/]/).pop()).sort()).toEqual([
      'global-error.tsx',
      'layout.tsx',
      'rate-limit-page.ts',
    ]);
  });

  it('no queda texto de esqueleto, nombre antiguo ni WEB_VERSION', () => {
    for (const needle of ['Agregador inmobiliario', 'Esqueleto del monorepo', 'WEB_VERSION']) {
      expect(files.filter((file) => read(file).includes(needle)), needle).toEqual([]);
    }
  });

  it('src/version.ts ya no existe', () => {
    expect(existsSync(join(SRC_DIR, 'version.ts'))).toBe(false);
  });
});

// D.17 (decisión 200) — el convenio de la cabecera es de 40 px (2.5rem) en todos los anchos: ningún
// enlace ni botón de la cabecera baja de `min-h-10`, tampoco bajo 30rem.
describe('Cabecera: objetivos de 40 px a todos los anchos (decisión 200)', () => {
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const targets = [...header.matchAll(/<(?:a|button)\b[^>]*>/g)].map((match) => match[0]);

  it('hay enlaces y botones, y todos llevan min-h-10', () => {
    expect(targets).toHaveLength(5);
    for (const target of targets) {
      expect(target).toMatch(/class="[^"]*\bmin-h-10\b/);
    }
  });

  it('ningún objetivo reduce su alto con una variante de ancho (max-[…]:min-h-*, max-[…]:h-*)', () => {
    for (const target of targets) {
      expect(target).not.toMatch(/max-\[[^\]]+\]:(?:min-h|h)-/);
    }
    const source = readFileSync(join(SRC_DIR, 'components', 'site-header.tsx'), 'utf8');
    expect(source).not.toMatch(/max-\[[^\]]+\]:(?:min-h|h)-/);
  });
});
