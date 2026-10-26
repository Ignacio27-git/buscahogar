// D.22 (decisión 269; IS-1, IS-2, IS-4) — estados ilustrados extremo a extremo: vacío filtrado, página
// fuera de rango, 404 y 429. Con la ilustración quitada, el estado, la copia y la acción siguen ahí (el dibujo
// es decorativo), hay exactamente UNA acción con la receta primaria y axe no da ninguna violación en el
// esquema del proyecto (claro y oscuro). `error.tsx` y `global-error.tsx` los cubre `a11y-states.spec.ts`
// con su marcado real, que ya incluye la ilustración y la acción principal.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { buildRateLimitResponse } from '../src/server/rate-limit-page';

import { AXE_TAGS, fingerprintViolations } from './axe-baseline';
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

const PRIMARY_ACTION = '.state-action';
const AA_TEXT_RATIO = 4.5;

function route(name: string): (typeof ROUTES)[number] {
  const found = ROUTES.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`falta la ruta ${name}`);
  return found;
}

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  expect(fingerprintViolations(results.violations)).toEqual([]);
}

async function removeIllustrations(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('svg.state-illustration').forEach((svg) => {
      svg.remove();
    });
  });
}

interface StateCase {
  readonly name: string;
  readonly open: (page: Page) => Promise<void>;
  readonly status: string;
  readonly action: string;
}

const CASES: readonly StateCase[] = [
  {
    name: 'vacío filtrado',
    open: async (page): Promise<void> => {
      await openRoute(page, route('home-filtered'));
    },
    status: 'Ninguna vivienda coincide con tu búsqueda.',
    action: 'Quitar todos los filtros',
  },
  {
    name: 'página fuera de rango',
    open: async (page): Promise<void> => {
      await page.goto('/?page=2');
    },
    status: 'Esta página ya no tiene viviendas.',
    action: 'Ir a la primera página',
  },
  {
    name: '404',
    open: async (page): Promise<void> => {
      await page.goto('/no-existe');
    },
    status: 'No encontramos esta página',
    action: 'Ir a la búsqueda',
  },
];

test.describe('estados ilustrados (D.22)', () => {
  for (const state of CASES) {
    test(`${state.name}: con la ilustración quitada siguen el estado, la copia y la acción`, async ({ page }) => {
      await state.open(page);
      await expect(page.locator('svg.state-illustration')).toHaveCount(1);
      await expect(page.locator('svg.state-illustration')).toHaveAttribute('aria-hidden', 'true');

      await removeIllustrations(page);

      await expect(page.getByText(state.status, { exact: true })).toBeVisible();
      await expect(page.locator(`main ${PRIMARY_ACTION}`).filter({ hasText: state.action })).toBeVisible();
      await expect(page.locator(`main ${PRIMARY_ACTION}`)).toHaveCount(1);
    });

    test(`${state.name}: axe sin violaciones`, async ({ page }) => {
      await state.open(page);
      await expectNoViolations(page);
    });
  }

  test('429: ilustración decorativa, una acción principal a / y axe sin violaciones en claro y oscuro', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'w1280-light', 'solo un proyecto: fija su propio esquema');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setContent(buildRateLimitResponse(42).body);
      await expect(page.locator('svg.state-illustration')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator(PRIMARY_ACTION)).toHaveCount(1);
      await expect(page.locator(PRIMARY_ACTION)).toHaveAttribute('href', '/');
      await expectNoViolations(page);

      await removeIllustrations(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demasiadas peticiones seguidas');
    }
  });

  // El texto de la acción principal es --ink-on-accent: en reposo y con el puntero encima (la regla de enlaces
  // de la capa base lo teñiría de acento sobre acento si la receta no lo fijara) alcanza AA sobre su relleno.
  test('la acción principal conserva el contraste AA en reposo y con el puntero encima', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('w1280'), 'solo 1280 px, claro y oscuro');
    await page.goto('/?page=2');
    const ratio = (): Promise<number> =>
      page.locator(PRIMARY_ACTION).evaluate((element) => {
        const luminance = (css: string): number => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d');
          if (context === null) throw new Error('canvas sin contexto 2d');
          context.fillStyle = css;
          context.fillRect(0, 0, 1, 1);
          const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
          const lin = (value: number): number => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        const style = getComputedStyle(element);
        const [light = 0, dark = 0] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
        return (light + 0.05) / (dark + 0.05);
      });

    expect(await ratio()).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    await page.locator(PRIMARY_ACTION).hover();
    expect(await ratio()).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
  });
});
