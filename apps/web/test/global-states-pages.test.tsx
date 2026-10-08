// D.14 (decisiones 186 y 187) — marcado de las páginas de estado global: not-found, error y
// global-error. Se renderizan con `renderToStaticMarkup`; el error de verdad no se puede
// provocar en e2e sin un gancho de pruebas en el producto, y la spec lo prohíbe.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from '../src/app/error.js';
import GlobalError from '../src/app/global-error.js';
import * as globalErrorModule from '../src/app/global-error.js';
import NotFound from '../src/app/not-found.js';
import * as notFoundModule from '../src/app/not-found.js';
import { STANDALONE_PAGE_CSS } from '../src/lib/standalone-page.js';

const APP_DIR = fileURLToPath(new URL('../src/app/', import.meta.url));
const TECHNICAL = /stack|digest|Error:|undefined|null|NEXT_|5432|refused|\b404\b|\b500\b|status/i;
const IMPERSONAL = /\bSe (ha|han|pudo|produjo)\b/;

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

  it('ofrece Reintentar y la salida a la búsqueda, en tuteo', () => {
    const html = renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);

    expect(text(html)).toContain('No hemos podido cargar esta página');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Reintentar<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Ir a la búsqueda<\/a>/);
    expect(text(html)).not.toMatch(IMPERSONAL);
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

  it('no aplica clase de tema ni exporta metadata', () => {
    expect(html).not.toMatch(/<(html|body)[^>]*class=/);
    expect(html).not.toMatch(/class="[^"]*\b(dark|light)\b/);
    expect('metadata' in globalErrorModule).toBe(false);
    expect('generateMetadata' in globalErrorModule).toBe(false);
  });

  it('incrusta STANDALONE_PAGE_CSS, con su esquema oscuro', () => {
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('--surface: #ffffff');
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
