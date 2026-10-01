// Paso D.1b (spec visual-regression-suite R9, S9.2/S9.3; diseño «Routes») — las
// 6 rutas del e2e visual y de accesibilidad. Los identificadores de vivienda
// vienen de la siembra (`@buscahogar/db/e2e`): una única fuente.
import { E2E_DETAIL_LISTING_ID, E2E_MISSING_LISTING_ID } from '@buscahogar/db/e2e';
import type { Page } from '@playwright/test';

export interface E2eRoute {
  // Nombre estable: clave de la línea base axe y nombre del fichero de captura.
  readonly name: string;
  readonly path: string;
  readonly isMap: boolean;
}

export const ROUTES: readonly E2eRoute[] = [
  { name: 'home', path: '/', isMap: false },
  { name: 'map', path: '/?view=map', isMap: true },
  {
    name: 'nl-query',
    path: `/?q=${encodeURIComponent('piso en alquiler en Getafe hasta 900 € con 2 habitaciones')}`,
    isMap: false,
  },
  { name: 'detail', path: `/properties/${E2E_DETAIL_LISTING_ID}`, isMap: false },
  { name: 'not-found-route', path: '/no-existe', isMap: false },
  { name: 'not-found-property', path: `/properties/${E2E_MISSING_LISTING_ID}`, isMap: false },
];

// Navega y espera a que la página esté estable: fuentes cargadas y, en el mapa,
// marcadores presentes y todas las teselas (locales) cargadas (S9.2).
export async function openRoute(page: Page, route: E2eRoute): Promise<void> {
  await page.goto(route.path);
  await page.evaluate(() => document.fonts.ready);
  if (route.isMap) {
    await page.locator('.leaflet-marker-icon').first().waitFor();
    await page.waitForFunction(() => {
      const tiles = document.querySelectorAll('.leaflet-tile');
      return (
        tiles.length > 0 &&
        document.querySelectorAll('.leaflet-tile:not(.leaflet-tile-loaded)').length === 0 &&
        document.querySelector('.leaflet-zoom-anim') === null
      );
    });
  }
}
