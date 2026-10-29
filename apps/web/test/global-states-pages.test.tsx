// D.14 (decisiones 186 y 187) — marcado de las páginas de estado global: not-found, error y
// global-error. Se renderizan con `renderToStaticMarkup`; el error de verdad no se puede
// provocar en e2e sin un gancho de pruebas en el producto, y la spec lo prohíbe.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Estas pruebas invocan error/global-error como funciones, fuera de un renderizado de React. Desde
// D.15 (decisión 203) usan `useRef`/`useEffect` para el foco; aquí se neutralizan (el foco se
// prueba en `error-focus.test.tsx`).
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: (): { current: null } => ({ current: null }),
  useEffect: (): undefined => undefined,
}));

import ErrorPage from '../src/app/error.js';
import GlobalError from '../src/app/global-error.js';
import * as globalErrorModule from '../src/app/global-error.js';
import NotFound from '../src/app/not-found.js';
import * as notFoundModule from '../src/app/not-found.js';
import { brandMarkSvg } from '../src/lib/brand-mark.js';
import { STANDALONE_PAGE_CSS } from '../src/lib/standalone-page.js';
import { stateIllustrationSvg } from '../src/lib/state-illustrations.js';

const APP_DIR = fileURLToPath(new URL('../src/app/', import.meta.url));
const TECHNICAL = /stack|digest|Error:|undefined|null|NEXT_|5432|refused|\b404\b|\b500\b|status/i;
const IMPERSONAL = /\bSe (ha|han|pudo|produjo)\b/;

// D.22 (N7): solo cuentan los elementos con la receta primaria; el enlace de texto secundario no.
function primaryActions(html: string): string[] {
  return [
    ...html.matchAll(/<(?:a|button) [^>]*class="[^"]*\bstate-action\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|button)>/g),
  ].map((match) => text(match[1] ?? ''));
}

function text(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ClickableElement {
  readonly props: { readonly onClick?: () => void };
}

// Busca el primer elemento React `<tag>` del árbol que devuelve un componente síncrono.
function findElement(node: ReactNode, tag: string): ClickableElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = findElement(child, tag);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return undefined;
  if (node.type === tag) return node;
  return findElement(node.props.children, tag);
}

describe('not-found.tsx', () => {
  const html = renderToStaticMarkup(<NotFound />);

  it('dice en tuteo que la página no existe y ofrece la salida a la búsqueda', () => {
    expect(html).toContain('<h1');
    expect(text(html)).toContain('No encontramos esta página');
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Ir a la búsqueda<\/a>/);
  });

  it('D.22: ilustración «not-found» y una única acción principal «Ir a la búsqueda»', () => {
    expect(html).toContain(stateIllustrationSvg('not-found'));
    expect(primaryActions(html)).toEqual(['Ir a la búsqueda']);
    expect(html).toContain('<a class="state-action" href="/">Ir a la búsqueda</a>');
  });

  it('explica la causa sin decir «dirección» (podría leerse como domicilio)', () => {
    expect(text(html)).toContain(
      'Puede que el enlace esté mal escrito o que el anuncio ya no esté publicado. Desde la búsqueda puedes seguir mirando viviendas.'
    );
    expect(text(html)).not.toMatch(/dirección/i);
  });

  it('no contiene texto técnico ni formas impersonales', () => {
    expect(text(html)).not.toMatch(TECHNICAL);
    expect(text(html)).not.toMatch(IMPERSONAL);
  });

  it('titula la pestaña «Página no encontrada» con metadata estática', () => {
    expect(notFoundModule.metadata).toEqual({ title: 'Página no encontrada' });
  });
});

describe('error.tsx', () => {
  const failure = Object.assign(new Error('connection refused to db:5432'), { digest: 'abc123digest' });

  it('llama a retry una sola vez al pulsar Reintentar', () => {
    const retry = vi.fn();
    const button = findElement(ErrorPage({ error: failure, retry }), 'button');

    expect(button).toBeDefined();
    button?.props.onClick?.();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('no pinta el mensaje, la traza ni el digest del error', () => {
    const html = renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);

    expect(html).not.toContain('connection refused');
    expect(html).not.toContain('5432');
    expect(html).not.toContain('abc123digest');
    expect(text(html)).not.toMatch(TECHNICAL);
  });

  it('no promete filtros que la ficha no tiene ni habla de «dirección»', () => {
    const html = renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);

    expect(text(html)).toContain(
      'Algo ha fallado al prepararla; no has hecho nada mal. Vuelve a intentarlo en un momento.'
    );
    expect(text(html)).not.toMatch(/filtros|dirección/i);
  });

  it('ofrece Reintentar y la salida a la búsqueda, en tuteo', () => {
    const html = renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);

    expect(text(html)).toContain('No hemos podido cargar esta página');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Reintentar<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Ir a la búsqueda<\/a>/);
    expect(text(html)).not.toMatch(IMPERSONAL);
  });

  it('D.22 (N7): ilustración «unavailable», «Reintentar» es la única acción principal y el enlace sigue como texto', () => {
    const html = renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);

    expect(html).toContain(stateIllustrationSvg('unavailable'));
    expect(primaryActions(html)).toEqual(['Reintentar']);
    expect(html).toMatch(/<button[^>]*class="state-action"[^>]*>Reintentar<\/button>/);
    expect(html).toContain('<a href="/">Ir a la búsqueda</a>');
  });
});

describe('global-error.tsx', () => {
  const failure = Object.assign(new Error('connection refused to db:5432'), { digest: 'abc123digest' });
  const html = renderToStaticMarkup(<GlobalError error={failure} retry={vi.fn()} />);

  it('es un documento propio: html lang es, body y title', () => {
    expect(html).toMatch(/^<html lang="es"/);
    expect(html).toContain('<body');
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it('lleva la marca en un <header> con enlace a / fuera de <main>; el h1 abre <main> (D.18)', () => {
    // D.22 (decisión 266): la marca decorativa va dentro del enlace, delante del nombre en vivo.
    expect(html).toContain(
      `<header class="standalone-header"><a class="standalone-header__brand" href="/">${brandMarkSvg()}Buscahogar</a></header>`
    );
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('<main'));
    // D.22: la ilustración decorativa (aria-hidden) precede al h1, que sigue siendo lo primero con significado.
    expect(html).toContain(`<main class="standalone">${stateIllustrationSvg('unavailable')}<h1`);
    expect(html.match(/<header/g)).toHaveLength(1);
  });

  it('no aplica clase de tema ni exporta metadata', () => {
    expect(html).not.toMatch(/<(html|body)[^>]*class=/);
    expect(html).not.toMatch(/class="[^"]*\b(dark|light)\b/);
    expect('metadata' in globalErrorModule).toBe(false);
    expect('generateMetadata' in globalErrorModule).toBe(false);
  });

  it('incrusta STANDALONE_PAGE_CSS, con su esquema oscuro', () => {
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('--surface: #faf8f3');
  });

  it('llama a retry una sola vez y no pinta texto técnico', () => {
    const retry = vi.fn();
    const button = findElement(GlobalError({ error: failure, retry }), 'button');
    button?.props.onClick?.();

    expect(button).toBeDefined();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(html).not.toContain('connection refused');
    expect(html).not.toContain('abc123digest');
    expect(text(html)).toContain('Buscahogar no está disponible ahora mismo');
    expect(text(html)).not.toMatch(IMPERSONAL);
    expect(STANDALONE_PAGE_CSS).toContain('--surface');
  });

  it('D.22: copia cálida y «Reintentar» como única acción principal, sin script ni recursos externos', () => {
    expect(text(html)).toContain(
      'Algo ha fallado al cargar la página; no has hecho nada mal. Puedes reintentarlo o volver a la búsqueda.'
    );
    expect(primaryActions(html)).toEqual(['Reintentar']);
    expect(html).toContain('<a href="/">Ir a la búsqueda</a>');
    expect(html).not.toMatch(/<script|<link|url\(|https?:\/\//);
  });
});

describe('server components y sin ganchos de prueba', () => {
  it('not-found.tsx no declara "use client"', () => {
    expect(readFileSync(`${APP_DIR}not-found.tsx`, 'utf8')).not.toMatch(/^\s*['"]use client['"]/m);
  });

  it('error.tsx y global-error.tsx son componentes de cliente', () => {
    for (const file of ['error.tsx', 'global-error.tsx']) {
      expect(readFileSync(`${APP_DIR}${file}`, 'utf8')).toMatch(/^\s*['"]use client['"]/m);
    }
  });

  it('src/app no tiene rutas ni condiciones que lancen errores a propósito', () => {
    const files = readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file));

    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(`${APP_DIR}${file}`, 'utf8');
      expect(source, file).not.toMatch(/throw new Error\(|process\.env\.(E2E|TEST)/);
    }
    expect(existsSync(`${APP_DIR}boom`)).toBe(false);
  });
});
