// Paso D.1b (spec a11y-baseline R12/R13, S12.1, S13.1-S13.4; diseño A7) — escaneo
// axe por ruta y proyecto contra la línea base de huellas. Las violaciones
// actuales se REGISTRAN, no se corrigen (D.15). En modo actualización
// (`--update-snapshots`) cada test prepara sus huellas y pasa; el teardown
// global reescribe la línea base (`global-teardown.ts`).
import AxeBuilder from '@axe-core/playwright';

import {
  AXE_TAGS,
  compareToBaseline,
  fingerprintViolations,
  formatComparisonFailure,
} from './axe-baseline';
import { readBaseline, writeStaged } from './axe-files';
import { expect, test } from './fixtures';
import { openRoute, ROUTES } from './routes';

test.describe('accesibilidad (axe)', () => {
  for (const route of ROUTES) {
    test(`axe ${route.name}`, async ({ page }, testInfo) => {
      await openRoute(page, route);
      const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
      const fingerprints = fingerprintViolations(results.violations);
      const project = testInfo.project.name;

      const mode = testInfo.config.updateSnapshots;
      if (mode === 'all' || mode === 'changed') {
        writeStaged({ route: route.name, project, fingerprints });
        return;
      }

      const outcome = compareToBaseline(
        readBaseline(),
        route.name,
        project,
        fingerprints,
        AXE_TAGS
      );
      expect(
        outcome.ok,
        outcome.ok ? '' : formatComparisonFailure(route.name, project, outcome)
      ).toBe(true);
    });
  }
});
