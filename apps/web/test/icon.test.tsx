// D.13b (decisión 185) — conjunto de iconos dibujados: sustituye a los glifos ×, ↗, + y −.
// Las constantes del zoom de Leaflet son cadenas de confianza (Leaflet las inserta con innerHTML):
// el test de igualdad prueba que no llevan datos y que son el mismo marcado que el componente.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Icon,
  ZOOM_IN_MARKUP,
  ZOOM_OUT_MARKUP,
  type IconName,
} from '../src/components/icon';

const NAMES: readonly IconName[] = ['close', 'external-link', 'plus', 'minus'];

describe('Icon (server-compatible, trazo 2 con currentColor)', () => {
  it.each(NAMES)('%s es un svg 24×24 decorativo de trazo 2 y currentColor', (name) => {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toMatch(/^<svg class="icon" viewBox="0 0 24 24" /);
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<path d="[^"]+"><\/path><\/svg>$/);
  });

  it('cada icono dibuja un trazo distinto', () => {
    const paths = NAMES.map((name) => /<path d="([^"]+)"/.exec(renderToStaticMarkup(<Icon name={name} />))?.[1]);
    expect(new Set(paths).size).toBe(NAMES.length);
  });

  it('añade la clase recibida a la clase base', () => {
    expect(renderToStaticMarkup(<Icon name="close" className="text-ink-muted" />)).toMatch(
      /^<svg class="icon text-ink-muted" /
    );
  });
});

describe('marcado del zoom de Leaflet', () => {
  it('ZOOM_IN_MARKUP y ZOOM_OUT_MARKUP son exactamente el render de plus y minus', () => {
    expect(ZOOM_IN_MARKUP).toBe(renderToStaticMarkup(<Icon name="plus" />));
    expect(ZOOM_OUT_MARKUP).toBe(renderToStaticMarkup(<Icon name="minus" />));
    expect(ZOOM_IN_MARKUP).not.toBe(ZOOM_OUT_MARKUP);
  });
});
