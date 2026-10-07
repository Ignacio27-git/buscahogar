// Paso D.1b (spec visual-regression-suite R9, S9.2/S9.3; diseño «Routes») — las
// rutas del e2e visual y de accesibilidad. Los identificadores de vivienda
// vienen de la siembra (`@buscahogar/db/e2e`): una única fuente.
import {
  E2E_DETAIL_LISTING_ID,
  E2E_GALLERY_LISTING_ID,
  E2E_HISTORY_LISTING_ID,
  E2E_MISSING_LISTING_ID,
} from '@buscahogar/db/e2e';
import type { Page } from '@playwright/test';

export interface E2eRoute {
  // Nombre estable: clave de la línea base axe y nombre del fichero de captura.
  readonly name: string;
  readonly path: string;
  // D.8a: la sección del mapa se renderiza en toda búsqueda válida. `markers` espera
  // marcadores; `empty` (0 coincidencias con ubicación) solo el lienzo y las teselas;
  // `none` no tiene mapa (interpretación de `?q=`, detalle y errores).
  readonly map: 'none' | 'markers' | 'empty';
}

export const ROUTES: readonly E2eRoute[] = [
  { name: 'home', path: '/', map: 'markers' },
  { name: 'map', path: '/?view=map', map: 'markers' },
  // D.6a: nueve filtros aplicados a la vez (todos los escalares y el radio) para
  // comprobar que la fila de chips no desborda a 320px.
  {
    name: 'home-filtered',
    path: '/?operation=sale&propertyType=flat&minPrice=100000&maxPrice=300000&minSurface=50&maxSurface=120&minRooms=2&minBathrooms=1&lat=40.4&lng=-3.7&radius=5000',
    // Ningún punto de la siembra queda a menos de 5 km de 40.4,-3.7: mapa vacío.
    map: 'empty',
  },
  {
    name: 'nl-query',
    path: `/?q=${encodeURIComponent('piso en alquiler en Getafe hasta 900 € con 2 habitaciones')}`,
    map: 'none',
  },
  { name: 'detail', path: `/properties/${E2E_DETAIL_LISTING_ID}`, map: 'none' },
  // D.9 (decisión 175): P7, solo inactivos, no sale en la búsqueda. Su ficha enseña la
  // galería de dos fotos locales, el «—» de los datos sin consolidar y la nota única.
  { name: 'detail-gallery', path: `/properties/${E2E_GALLERY_LISTING_ID}`, map: 'none' },
  // D.10 (decisión 178): P1 (dos anuncios con cambios de precio): gráfico escalonado, leyenda
  // y tabla agrupada por anuncio. `detail` es P2 y `detail-gallery` P7: ninguna lleva gráfico.
  { name: 'detail-history', path: `/properties/${E2E_HISTORY_LISTING_ID}`, map: 'none' },
  { name: 'not-found-route', path: '/no-existe', map: 'none' },
  { name: 'not-found-property', path: `/properties/${E2E_MISSING_LISTING_ID}`, map: 'none' },
];

// Navega y espera a que la página esté estable: fuentes cargadas, la primera foto de
// la galería decodificada (si hay galería) y, si el mapa se ve, lienzo, marcadores
// (si se esperan) y todas las teselas (locales) cargadas (S9.2).
// El marco existe siempre (D.8a) pero bajo 64rem la vista de lista lo oculta: ahí no
// hay nada más que esperar.
export async function openRoute(page: Page, route: E2eRoute): Promise<void> {
  await page.goto(route.path);
  await page.evaluate(() => document.fonts.ready);
  // Solo la primera: las demás quedan fuera de la tira y su carga diferida no se ve.
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.property-gallery img');
    return image === null || (image.complete && image.naturalWidth > 0);
  });
  if (route.map === 'none') return;
  const frame = page.locator('.search-map__frame');
  await frame.waitFor({ state: 'attached' });
  if (!(await frame.isVisible())) return;
  await frame.locator('.leaflet-container').waitFor();
  if (route.map === 'markers') await frame.locator('.leaflet-marker-icon').first().waitFor();
  await page.waitForFunction(() => {
    const tiles = document.querySelectorAll('.leaflet-tile');
    return (
      tiles.length > 0 &&
      document.querySelectorAll('.leaflet-tile:not(.leaflet-tile-loaded)').length === 0 &&
      document.querySelector('.leaflet-zoom-anim') === null
    );
  });
}
