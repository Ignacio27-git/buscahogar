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

describe('ContourMotif (S1.1)', () => {
  const html = renderToStaticMarkup(<ContourMotif />);

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

  it('usa la caja 240×48 recortada y centrada, sin relleno', () => {
    expect(html).toContain('class="contour-motif"');
    expect(html).toContain('viewBox="0 0 240 48"');
    expect(html).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(html).toContain('fill="none"');
  });

  it('dibuja cinco anillos cerrados y anidados, y el tercero es la curva índice', () => {
    const paths = [...html.matchAll(/<path ([^>]*)>/g)].map((match) => match[1] ?? '');
    expect(paths).toHaveLength(5);
    expect(paths[2]).toContain('class="contour-motif__index"');
    paths.forEach((attributes, index) => {
      if (index !== 2) expect(attributes).not.toContain('class=');
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
  it('únicamente (search)/page.tsx importa el componente', () => {
    const importers = sourceFiles(SRC_DIR)
      .filter((file) => !file.endsWith('contour-motif.tsx'))
      .filter((file) => /from\s+['"][^'"]*contour-motif['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_DIR, file).split(sep).join('/'));
    expect(importers).toEqual(['app/(search)/page.tsx']);
  });
});
