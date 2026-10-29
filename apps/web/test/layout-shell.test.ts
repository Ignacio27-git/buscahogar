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

import RootLayout, { generateMetadata } from '../src/app/layout.js';

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

  // D.20 (decisión 237): el pie es una superficie rebajada neutra, con filete superior.
  it('el pie lleva el filete superior y la superficie rebajada', () => {
    expect(html).toContain('<footer class="border-t border-rule bg-surface-sunken">');
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

  // D.18 (decisión 223, enmienda la 147): la cabecera pierde `<nav>` y «Buscar»; el nombre sigue
  // siendo el enlace a «/». El tema pasa a tres botones de icono con nombre accesible oculto.
  it('lleva el nombre como enlace a / y ninguna navegación ni «Buscar»', () => {
    // D.22 (decisión 266): el enlace lleva la marca decorativa (aria-hidden) delante del texto en vivo.
    expect(header).toMatch(/<a href="\/"[^>]*><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>Buscahogar<\/a>/);
    expect(count(header, '<nav')).toBe(0);
    expect(header).not.toContain('Buscar<');
    expect(count(header, '<a ')).toBe(1);
  });

  it('el selector de tema son tres botones de icono con el nombre en un span sr-only', () => {
    const names = [...header.matchAll(/<button\b[^>]*value="(light|dark|system)"[^>]*>(.*?)<\/button>/g)];
    expect(names.map((match) => match[1])).toEqual(['light', 'dark', 'system']);
    expect(names.map((match) => match[2]?.replace(/<svg.*?<\/svg>/, ''))).toEqual([
      '<span class="sr-only theme-selector__name">Claro</span>',
      '<span class="sr-only theme-selector__name">Oscuro</span>',
      '<span class="sr-only theme-selector__name">Sistema</span>',
    ]);
    // Un icono distinto y decorativo por botón.
    const icons = names.map((match) => /<path d="([^"]+)"/.exec(match[2] ?? '')?.[1]);
    expect(new Set(icons).size).toBe(3);
    for (const match of names) {
      expect(match[2]).toMatch(/^<svg class="icon"[^>]*aria-hidden="true"/);
    }
  });

  it('la leyenda «Tema» sigue en el DOM pero oculta a la vista (sr-only), y el selector va a la derecha', () => {
    expect(header).toContain('<legend class="sr-only">Tema</legend>');
    expect(header).toMatch(/<form[^>]*class="theme-selector ml-auto"/);
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
  // ROADMAP 3.4 (decisión 262): los metadatos son función porque `robots` depende de `SITE_INDEXING`.
  const metadata = generateMetadata();

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

  it('hay un enlace y tres botones, y todos llevan min-h-10; los botones también min-w-10', () => {
    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target).toMatch(/class="[^"]*\bmin-h-10\b/);
    }
    const buttons = targets.filter((target) => target.startsWith('<button'));
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toMatch(/class="[^"]*\bmin-w-10\b/);
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
