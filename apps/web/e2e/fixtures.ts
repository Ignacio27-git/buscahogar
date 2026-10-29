// Paso D.1a (spec R8, S8.1-S8.3; diseño A5/A6, decisión 137) — guard de red del
// e2e como fixture AUTOMÁTICA: todo test lo recibe sin pedirlo (no es opt-in).
// Una sola ruta a nivel de CONTEXTO (cubre popups y pestañas nuevas):
//   - teselas de OpenStreetMap -> PNG local, nunca la red;
//   - origen de la app -> pasa;
//   - cualquier otra cosa -> se aborta, se registra y el test FALLA al terminar.
import { readFileSync } from 'node:fs';

import { expect, test as base } from '@playwright/test';

import { classifyRequest } from './network-policy';

const TILE_PNG = readFileSync(new URL('./assets/tile.png', import.meta.url));

interface NetworkGuardFixtures {
  // URL externas abortadas durante el test. Se expone para que la autoprueba
  // del guard pueda inspeccionarlas; la comprobación final es automática.
  externalRequests: string[];
}

export const test = base.extend<NetworkGuardFixtures>({
  externalRequests: [
    async ({ context, baseURL }, provide): Promise<void> => {
      const appOrigin = new URL(baseURL ?? 'http://127.0.0.1:3100').origin;
      const blocked: string[] = [];

      await context.route('**/*', async (route): Promise<void> => {
        const url = route.request().url();
        switch (classifyRequest(url, appOrigin)) {
          case 'tile':
            await route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG });
            return;
          case 'app':
          case 'inline':
            await route.continue();
            return;
          case 'external':
            blocked.push(url);
            await route.abort('blockedbyclient');
            return;
        }
      });

      await provide(blocked);

      expect(
        blocked,
        'el e2e no admite peticiones a hosts externos (solo teselas OSM, locales)'
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
