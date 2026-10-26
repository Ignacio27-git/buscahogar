// D.20 (decisión 235, spec «search-header-motif» S1.1 y R1.2) — el motivo de curvas de nivel es un
// SVG en línea, decorativo y sin color propio: el trazo lo pone el CSS con un token.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContourMotif } from '../src/components/contour-motif';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Atributos de una etiqueta de apertura, con el nombre tal como lo imprime React. */
function attributesOf(tag: string): Map<string, string> {
  return new Map([...tag.matchAll(/([A-Za-z-]+)="([^"]*)"/g)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

describe('ContourMotif (S1.1)', () => {
  const html = renderToStaticMarkup(<ContourMotif />);

  /** Caja de cada anillo a partir de los números de su trazado (pares x, y). */
  function ringBoxes(): Array<{ x0: number; x1: number; y0: number; y1: number }> {
    return [...html.matchAll(/ d="([^"]+)"/g)].map((match) => {
      const numbers = [...(match[1] ?? '').matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0]));
      const xs = numbers.filter((_, i) => i % 2 === 0);
      const ys = numbers.filter((_, i) => i % 2 === 1);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
  }

  it('es un svg decorativo: aria-hidden, sin foco, sin rol, título, descripción ni estilo', () => {
    expect(html).toMatch(/^<svg /);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('<title');
    expect(html).not.toContain('<desc');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('tabindex');
  });

  it('no lleva ningún color literal ni atributo de trazo: el trazo lo pone el CSS', () => {
    expect(html).not.toMatch(/\sstroke[a-z-]*=/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/rgb|hsl|oklch/i);
  });

  it('el svg exterior no lleva viewBox: sus unidades son los píxeles de la caja, sin relleno (D.21, M7)', () => {
    const outer = attributesOf(/^<svg [^>]*>/.exec(html)?.[0] ?? '');
    expect(outer.get('class')).toBe('contour-motif');
    expect(outer.get('fill')).toBe('none');
    expect(outer.has('viewBox')).toBe(false);
  });

  it('el svg interior encuadra los anillos en una caja 5:1 centrada, recortada con slice', () => {
    const inner = attributesOf(/<svg [^>]*viewBox[^>]*>/.exec(html)?.[0] ?? '');
    expect(inner.get('viewBox')).toBe('-40 -7 330 66');
    expect(inner.get('preserveAspectRatio')).toBe('xMidYMid slice');
    expect(inner.get('width')).toBe('100%');
    expect(inner.get('height')).toBe('100%');
  });

  it('ningún anillo queda cortado en plano: cada uno cabe en el viewBox con al menos 1 unidad de margen', () => {
    const [x0 = 0, y0 = 0, width = 0, height = 0] = '-40 -7 330 66'.split(' ').map(Number);
    const boxes = ringBoxes();
    expect(boxes).toHaveLength(5);
    for (const [index, box] of boxes.entries()) {
      expect(box.x0, `anillo ${String(index)} por la izquierda`).toBeGreaterThanOrEqual(x0 + 1);
      expect(box.y0, `anillo ${String(index)} por arriba`).toBeGreaterThanOrEqual(y0 + 1);
      expect(box.x1, `anillo ${String(index)} por la derecha`).toBeLessThanOrEqual(x0 + width - 1);
      expect(box.y1, `anillo ${String(index)} por abajo`).toBeLessThanOrEqual(y0 + height - 1);
    }
  });

  it('el desvanecido de los bordes es una máscara de alfa en línea y radial: degradado, máscara y rect (D.21, M7, P1)', () => {
    // P1: un degradado lineal horizontal dejaba los anillos exteriores como arcos sueltos; el radial
    // (elipse inscrita en la caja) apaga cada anillo por igual por todos sus lados.
    expect(html).not.toContain('<linearGradient');
    const gradient = /<radialGradient [^>]*>([\s\S]*?)<\/radialGradient>/.exec(html);
    expect(gradient).not.toBeNull();
    const gradientAttributes = attributesOf(/<radialGradient [^>]*>/.exec(html)?.[0] ?? '');
    expect(gradientAttributes.get('id')).toBe('contour-motif-fade');
    expect(gradientAttributes.has('gradientUnits')).toBe(false);
    const stops = [...(gradient?.[1] ?? '').matchAll(/<stop [^>]*>/g)].map((match) => attributesOf(match[0]));
    expect(stops.map((stop) => [stop.get('offset'), stop.get('stop-opacity')])).toEqual([
      ['0', '1'],
      ['0.5', '1'],
      ['1', '0'],
    ]);

    const mask = attributesOf(/<mask [^>]*>/.exec(html)?.[0] ?? '');
    expect(mask.get('id')).toBe('contour-motif-mask');
    expect(mask.get('class')).toBe('contour-motif__mask');
    expect(mask.get('maskUnits')).toBe('userSpaceOnUse');
    expect([mask.get('x'), mask.get('y'), mask.get('width'), mask.get('height')]).toEqual(['0', '0', '100%', '100%']);

    const fade = attributesOf(/<rect [^>]*>/.exec(html)?.[0] ?? '');
    expect(fade.get('class')).toBe('contour-motif__fade');
    expect(fade.get('fill')).toBe('url(#contour-motif-fade)');
    expect([fade.get('width'), fade.get('height')]).toEqual(['100%', '100%']);

    expect(attributesOf(/<g [^>]*>/.exec(html)?.[0] ?? '').get('mask')).toBe('url(#contour-motif-mask)');
  });

  it('solo hay referencias url(#contour-motif-*), ids únicos y ningún color: el alfa basta', () => {
    const references = [...html.matchAll(/url\(([^)]*)\)/g)].map((match) => match[1]);
    expect(references).toHaveLength(2);
    for (const reference of references) expect(reference).toMatch(/^#contour-motif-(fade|mask)$/);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(['contour-motif-fade', 'contour-motif-mask']);
    expect(html).not.toContain('stop-color');
    expect(html).not.toMatch(/<(circle|line|polygon|polyline|ellipse)[\s/>]/);
  });

  it('dibuja cinco anillos cerrados y anidados, y el tercero es la curva índice', () => {
    const paths = [...html.matchAll(/<path ([^>]*)>/g)].map((match) => match[1] ?? '');
    expect(paths).toHaveLength(5);
    expect(paths[2]).toContain('class="contour-motif__index"');
    paths.forEach((attributes, index) => {
      // P1: los dos anillos exteriores llevan una clase para poder retirarlos en pantallas estrechas.
      // Segunda revisión (F3): el segundo anillo lleva otra, para ser la curva gruesa cuando el tercero
      // queda como borde (bajo 25rem).
      if (index === 0) expect(attributes).not.toContain('class=');
      if (index === 1) expect(attributes).toContain('class="contour-motif__narrow-index"');
      if (index > 2) expect(attributes).toContain('class="contour-motif__outer"');
      expect(attributes).toMatch(/^d="M[\d.]+ [\d.]+(C[-\d. ]+)+Z"/);
    });
  });

  it('los anillos crecen alrededor de una misma cima: la caja de cada uno contiene la del anterior', () => {
    const boxes = [...html.matchAll(/ d="([^"]+)"/g)].map((match) => {
      const numbers = [...(match[1] ?? '').matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0]));
      const xs = numbers.filter((_, i) => i % 2 === 0);
      const ys = numbers.filter((_, i) => i % 2 === 1);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    expect(boxes).toHaveLength(5);
    boxes.slice(1).forEach((outer, index) => {
      const inner = boxes[index];
      expect(inner).toBeDefined();
      if (inner === undefined) return;
      expect(outer.x0).toBeLessThan(inner.x0);
      expect(outer.x1).toBeGreaterThan(inner.x1);
      expect(outer.y0).toBeLessThan(inner.y0);
      expect(outer.y1).toBeGreaterThan(inner.y1);
    });
  });
});

describe('ContourMotif (R1.2) — solo en la cabecera de la búsqueda', () => {
  // D.22 (decisión 268): la portada pinta el motivo desde su franja de bienvenida, que la página rinde.
  it('únicamente (search)/page.tsx y la franja de la portada importan el componente', () => {
    const importers = sourceFiles(SRC_DIR)
      .filter((file) => !file.endsWith('contour-motif.tsx'))
      .filter((file) => /from\s+['"][^'"]*contour-motif['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_DIR, file).split(sep).join('/'));
    expect(importers.sort()).toEqual(['app/(search)/page.tsx', 'components/home-hero.tsx']);
  });
});
