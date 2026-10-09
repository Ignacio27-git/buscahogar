// Paso D.15 (R2, R3, R10; decisiones 197 y 201) — estados dinámicos de accesibilidad. Sin capturas ni
// línea base: aquí un fallo es un fallo. El escaneo axe de `a11y.spec.ts` solo ve las rutas en su
// estado inicial; este fichero abre lo que ese escaneo no alcanza (bandeja de filtros, rechazos,
// interpretación de `?q=`, sugerencias de zona, página 2, ventana del mapa, 429 y páginas de error)
// y exige CERO violaciones con las mismas etiquetas WCAG. Además comprueba WCAG 1.4.12 (F5) y el
// tamaño mínimo de objetivo de «Ver mapa» y «Ver lista» (2.5.8).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ErrorPage from '../src/app/error';
import GlobalError from '../src/app/global-error';
import { buildRateLimitResponse } from '../src/server/rate-limit-page';

import { AXE_TAGS, fingerprintViolations } from './axe-baseline';
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';
import { openFilterTray } from './tray';

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

function onlyProject(name: string): void {
  test.skip(test.info().project.name !== name, `solo ${name}`);
}

// Los tres anchos: el proyecto se llama `w320-light`, `w1280-dark`...
function projectWidth(): string {
  return test.info().project.name.split('-')[0] ?? '';
}

// Playwright transpila los `.tsx` con SU runtime JSX (fija `jsxImportSource` en el runner), así que
// un componente de la app devuelve nodos `{ __pw_type: 'jsx', ... }` y no elementos de React. Las dos
// páginas de error solo usan etiquetas HTML: este puente reconstruye elementos de React con el mismo
// árbol para que `renderToStaticMarkup` dé el marcado REAL de `error.tsx` y `global-error.tsx`
// (decisión 201; desviación registrada: no hay ruta de error solo para pruebas).
interface PlaywrightJsxNode {
  readonly __pw_type: 'jsx';
  readonly type: unknown;
  readonly props: Readonly<Record<string, unknown>>;
  readonly key?: string | null;
}

function isPlaywrightJsxNode(value: unknown): value is PlaywrightJsxNode {
  return typeof value === 'object' && value !== null && '__pw_type' in value;
}

function toReactNode(value: unknown): ReactNode {
  if (Array.isArray(value)) return createElement(Fragment, null, ...value.map(toReactNode));
  if (!isPlaywrightJsxNode(value)) return typeof value === 'string' ? value : null;
  if (typeof value.type !== 'string') throw new Error('el puente JSX solo admite etiquetas HTML');
  const { children, ...props } = value.props;
  return createElement(
    value.type,
    { ...props, key: value.key ?? undefined },
    ...(children === undefined ? [] : [toReactNode(children)])
  );
}

// El componente se invoca dentro de un renderizado real de React (un componente envoltorio), porque
// desde D.15 (decisión 203) usa `useRef`/`useEffect` para el foco y los ganchos necesitan
// despachador. Devuelve el árbol de Playwright, que el puente convierte.
function renderErrorPage(component: (props: ErrorBoundaryProps) => unknown): string {
  const props: ErrorBoundaryProps = { error: new Error('prueba'), retry: () => undefined };
  return renderToStaticMarkup(createElement(() => toReactNode(component(props))));
}

interface ErrorBoundaryProps {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}

// Hard-zero: las huellas legibles (`regla|objetivo`) son el mensaje del fallo.
async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  expect(fingerprintViolations(results.violations)).toEqual([]);
}

// WCAG 1.4.12 (espaciado del texto): las cuatro sustituciones mínimas que una persona puede aplicar sin
// que el contenido pierda información ni funcionalidad. Con `!important` para ganar a la hoja propia.
const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

// Una etiqueta no recorta su texto si su contenido cabe en su caja en los dos ejes.
async function clippedLabels(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight
      )
      .map((element) => element.textContent.trim())
  );
}

test.describe('espaciado del texto sin recorte (WCAG 1.4.12, F5)', () => {
  test('las etiquetas de precio del mapa caben en su caja a 1280 px', async ({ page }) => {
    onlyProject('w1280-light');
    await openRoute(page, route('map'));
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
    // Sin etiquetas, el `[]` de abajo no probaría nada.
    expect(await page.locator('.map-price').count()).toBeGreaterThan(0);
    expect(await clippedLabels(page, '.map-price')).toEqual([]);
  });

  test('las direcciones de la lista caben en su caja a 320 px', async ({ page }) => {
    onlyProject('w320-light');
    await openRoute(page, route('home'));
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
    expect(await page.locator('.result-row__address').count()).toBeGreaterThan(0);
    expect(await clippedLabels(page, '.result-row__address')).toEqual([]);
  });
});

test.describe('axe en estados dinámicos (R2, decisión 201)', () => {
  test('bandeja de filtros abierta', async ({ page }) => {
    test.skip(projectWidth() === 'w1280', 'desde 64rem la bandeja no se pliega');
    await openRoute(page, route('home'));
    await openFilterTray(page);
    await expect(page.locator('details.filter-tray')).toHaveJSProperty('open', true);
    await expect(page.getByRole('group').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('parámetros rechazados con la alerta y los campos marcados', async ({ page }) => {
    await page.goto('/?minPrice=abc&view=x');
    const alert = page.locator('#filters-alert');
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('«?q=» vacío: campo de texto con su alerta', async ({ page }) => {
    await page.goto('/?q=');
    await expect(page.locator('#search-text-alert')).toHaveText(/El campo está vacío/u);
    await expectNoViolations(page);
  });

  test('«?q=» con varias zonas posibles: grupo para elegir zona', async ({ page }) => {
    // La siembra no repite prefijos: «Geta» solo casa con Getafe, pero un prefijo (no el nombre
    // exacto) es siempre la rama `choose` de `classifyPlaceMatches`, con su grupo de opciones.
    await page.goto(`/?q=${encodeURIComponent('piso en Geta')}`);
    await expect(page.getByRole('group', { name: /Elige la zona para/u })).toBeVisible();
    await expect(page.getByRole('radio').first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('sugerencias de zona con «?zoneQuery=»', async ({ page }) => {
    await page.goto('/?zoneQuery=Get');
    await expect(page.getByRole('link', { name: /Getafe/u }).first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('página 2 con el paginador', async ({ page }) => {
    await page.goto('/?page=2');
    await expect(page.getByRole('navigation', { name: 'Paginación de resultados' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('ventana del mapa abierta', async ({ page }) => {
    test.skip(projectWidth() !== 'w1280', 'el mapa y la lista conviven solo desde 64rem');
    await openRoute(page, route('map'));
    await page.locator('.leaflet-marker-icon[title^="Vivienda, "]').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.leaflet-popup.map-popup')).toBeVisible();
    await expectNoViolations(page);
  });

  test('error.tsx dentro del layout real', async ({ page }) => {
    await page.goto('/no-existe');
    const markup = renderErrorPage(ErrorPage);
    // El layout es el dueño de `main`: la frontera de error se pinta dentro de él.
    await page.locator('main#contenido').evaluate((main, html) => {
      main.innerHTML = html;
    }, markup);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'No hemos podido cargar esta página'
    );
    await expectNoViolations(page);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`página 429 en ${scheme}`, async ({ page }) => {
      onlyProject('w1280-light');
      await page.emulateMedia({ colorScheme: scheme });
      await page.setContent(buildRateLimitResponse(42).body);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Demasiadas peticiones seguidas'
      );
      await expectNoViolations(page);
    });

    test(`global-error en ${scheme}`, async ({ page }) => {
      onlyProject('w1280-light');
      await page.emulateMedia({ colorScheme: scheme });
      const markup = renderErrorPage(GlobalError);
      await page.setContent(markup);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Buscahogar no está disponible ahora mismo'
      );
      await expectNoViolations(page);
    });
  }
});

// WCAG 2.5.8 (R3): «Ver mapa» y «Ver lista» miden al menos 24x24 px donde se ven. Desde 64rem el
// conmutador sobra (lista y mapa conviven) y está oculto.
test.describe('tamaño de objetivo del conmutador Ver mapa / Ver lista (2.5.8)', () => {
  for (const [name, label] of [
    ['home', 'Ver mapa'],
    ['map', 'Ver lista'],
  ] as const) {
    test(`«${label}» en ${name}`, async ({ page }) => {
      await openRoute(page, route(name));
      const link = page.locator('.view-toggle a');
      if (projectWidth() === 'w1280') {
        await expect(page.locator('.view-toggle')).toBeHidden();
        return;
      }
      await expect(link).toHaveText(label);
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    });
  }
});
