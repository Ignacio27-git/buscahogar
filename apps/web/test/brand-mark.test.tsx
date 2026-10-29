// D.22 (decisión 266) — marca «casa encontrada»: la geometría vive en un único módulo puro
// (`lib/brand-mark.ts`) y la reutilizan el componente, las páginas autónomas y `icon.svg`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BrandMark } from '../src/components/brand-mark.js';
import { BRAND_MARK, brandMarkSvg } from '../src/lib/brand-mark.js';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('BRAND_MARK — geometría aprobada (BM-1)', () => {
  it('fija el encuadre, la lupa, el mango y la casa con la puerta recortada', () => {
    expect(BRAND_MARK.viewBox).toBe('0 0 32 32');
    expect(BRAND_MARK.lens).toEqual({ cx: 13.5, cy: 13.5, r: 10, strokeWidth: 3 });
    expect(BRAND_MARK.handle).toEqual({ d: 'M21 21l7.5 7.5', strokeWidth: 4 });
    expect(BRAND_MARK.house.d).toBe('M13.5 7.5 18.5 12v6.5h-10V12Zm-1 6.5h2v4.5h-2Z');
  });

  it('brandMarkSvg() es un único <svg> con la lupa, el mango y la casa evenodd', () => {
    const svg = brandMarkSvg();
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('<circle cx="13.5" cy="13.5" r="10"');
    expect(svg).toContain('d="M21 21l7.5 7.5"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('class="brand-mark__house"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain(`d="${BRAND_MARK.house.d}"`);
  });

  it('no lleva ningún literal de color: la tinta es currentColor y la casa la pinta el CSS (BM-3)', () => {
    const svg = brandMarkSvg();
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(|hsla?\(/i);
  });

  it('el módulo es puro: sin imports de ningún tipo (lo alcanza el proxy fuera del grafo de servidor)', () => {
    const source = read('../src/lib/brand-mark.ts');
    expect(source).not.toMatch(/^\s*(import|export \* from)/m);
  });
});

describe('<BrandMark /> (BM-1, BM-2)', () => {
  it('renderiza exactamente lo que brandMarkSvg() (paridad React / cadena)', () => {
    expect(renderToStaticMarkup(<BrandMark />)).toBe(brandMarkSvg());
  });

  it('es decorativo: aria-hidden, focusable=false, sin rol, título ni nombre', () => {
    const html = renderToStaticMarkup(<BrandMark />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toMatch(/\brole=|aria-label|<title|<desc/);
  });

  it('es un componente de servidor (sin "use client")', () => {
    expect(read('../src/components/brand-mark.tsx')).not.toMatch(/^\s*['"]use client['"]/m);
  });
});
