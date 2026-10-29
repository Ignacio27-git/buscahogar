// D.15 (F12, decisión 203) — gestión del foco en las fronteras de error. Al aparecer la página de
// error el foco no estaba en ningún sitio y el lector de pantalla no anunciaba nada (hallazgo de la
// pasada manual con Narrador, punto 11). El título recibe el foco al montarse; si la frontera se
// desmonta tras un reintento con éxito y el foco se perdió, vuelve a `main#contenido`.
// El entorno de vitest es `node` (sin DOM): los efectos se capturan sustituyendo `useEffect` y
// `useRef`, y `document` se sustituye por un doble mínimo.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Effect = () => (() => void) | undefined;

const harness = vi.hoisted(() => ({
  effects: [] as (() => (() => void) | undefined)[],
  heading: { focus: (): void => undefined },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: (): { current: { focus: () => void } } => ({ current: harness.heading }),
    useEffect: (effect: Effect): void => {
      harness.effects.push(effect);
    },
  };
});

import ErrorPage from '../src/app/error.js';
import GlobalError from '../src/app/global-error.js';
import { focusHeading, restoreFocusToMain } from '../src/lib/error-focus.js';
import { STANDALONE_PAGE_CSS } from '../src/lib/standalone-page.js';

const failure = Object.assign(new Error('boom'), { digest: 'd' });

interface FakeDocument {
  readonly activeElement: unknown;
  readonly body: unknown;
  readonly documentElement: unknown;
  getElementById: (id: string) => { focus: () => void } | null;
}

function fakeDocument(
  active: 'body' | 'html' | 'null' | 'link',
  withMain = true
): { readonly doc: FakeDocument; readonly main: { focus: ReturnType<typeof vi.fn> } } {
  const body = {};
  const documentElement = {};
  const link = {};
  const main = { focus: vi.fn() };
  const activeElement = { body, html: documentElement, null: null, link }[active];
  const doc: FakeDocument = {
    activeElement,
    body,
    documentElement,
    getElementById: (id) => (withMain && id === 'contenido' ? main : null),
  };
  return { doc, main };
}

afterEach(() => {
  harness.effects.length = 0;
  harness.heading = { focus: vi.fn() };
  vi.unstubAllGlobals();
});

describe('focusHeading', () => {
  it('da el foco al título', () => {
    const heading = { focus: vi.fn() };
    focusHeading(heading);
    expect(heading.focus).toHaveBeenCalledTimes(1);
  });

  it('no falla si el título aún no existe', () => {
    expect(() => {
      focusHeading(null);
    }).not.toThrow();
  });
});

describe('restoreFocusToMain', () => {
  it.each(['body', 'html', 'null'] as const)('mueve el foco a main#contenido si se perdió (%s)', (active) => {
    const { doc, main } = fakeDocument(active);
    restoreFocusToMain(doc);
    expect(main.focus).toHaveBeenCalledTimes(1);
  });

  it('no toca el foco si ya está en otro elemento', () => {
    const { doc, main } = fakeDocument('link');
    restoreFocusToMain(doc);
    expect(main.focus).not.toHaveBeenCalled();
  });

  it('no falla si main#contenido no existe', () => {
    const { doc } = fakeDocument('body', false);
    expect(() => {
      restoreFocusToMain(doc);
    }).not.toThrow();
  });
});

describe('error.tsx — foco al título', () => {
  it('el título es enfocable por programa (tabindex -1) y no muestra contorno propio', () => {
    const html = renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>No hemos podido cargar esta página<\/h1>/);
    expect(html).toMatch(/<h1[^>]*class="[^"]*focus-visible:outline-hidden/);
  });

  it('al montarse enfoca el título', () => {
    const focus = vi.fn();
    harness.heading = { focus };
    renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);

    expect(harness.effects).toHaveLength(1);
    harness.effects[0]?.();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('al desmontarse tras un reintento con foco perdido lo devuelve a main#contenido', () => {
    renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);
    const cleanup = harness.effects[0]?.();
    expect(typeof cleanup).toBe('function');

    const { doc, main } = fakeDocument('body');
    vi.stubGlobal('document', doc);
    (cleanup as () => void)();
    expect(main.focus).toHaveBeenCalledTimes(1);
  });

  it('al desmontarse con el foco en otro elemento (p. ej. navegación) no lo mueve', () => {
    renderToStaticMarkup(<ErrorPage error={failure} retry={vi.fn()} />);
    const cleanup = harness.effects[0]?.();

    const { doc, main } = fakeDocument('link');
    vi.stubGlobal('document', doc);
    (cleanup as () => void)();
    expect(main.focus).not.toHaveBeenCalled();
  });
});

describe('global-error.tsx — foco al título (solo al montarse)', () => {
  it('el CSS autónomo no pinta contorno en el título enfocado por programa (como main#contenido)', () => {
    expect(STANDALONE_PAGE_CSS).toMatch(/\.standalone h1\[tabindex="-1"\]:focus-visible\s*\{\s*outline:\s*none/);
  });

  it('el título es enfocable por programa (tabindex -1)', () => {
    const html = renderToStaticMarkup(<GlobalError error={failure} retry={vi.fn()} />);
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>Buscahogar no está disponible ahora mismo<\/h1>/);
  });

  it('al montarse enfoca el título y no registra limpieza (no hay main#contenido al que volver)', () => {
    const focus = vi.fn();
    harness.heading = { focus };
    renderToStaticMarkup(<GlobalError error={failure} retry={vi.fn()} />);

    expect(harness.effects).toHaveLength(1);
    const cleanup = harness.effects[0]?.();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(cleanup).toBeUndefined();
  });
});
