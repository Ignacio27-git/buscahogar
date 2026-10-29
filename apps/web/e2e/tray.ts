// Paso D.6b — ayuda compartida de los e2e que usan la bandeja de filtros.
import type { Locator, Page } from '@playwright/test';

export const TRAY_SUMMARY = 'details.filter-tray > summary';

export function traySummary(page: Page): Locator {
  return page.locator(TRAY_SUMMARY);
}

// Abre la bandeja si hace falta. En escritorio (desde 64rem, con soporte de
// `::details-content`) el resumen está oculto y el formulario ya es visible: no
// hay nada que abrir. Con la bandeja ya abierta tampoco se hace nada.
export async function openFilterTray(page: Page): Promise<void> {
  const summary = traySummary(page);
  if (!(await summary.isVisible())) return;
  const isOpen = await page.locator('details.filter-tray').evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await summary.click();
}
