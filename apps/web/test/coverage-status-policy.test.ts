// ROADMAP 1.13 Unit D (diseño DD-23, arbitraje CR-9) — superficie PURA y
// probada de `coverage-status.tsx`: `shouldKeepRefreshing(status,
// refreshCount)`. `apps/web/vitest.config.ts` corre en entorno `node`, sin
// jsdom y sin contexto de router (`useRouter()` necesita uno que
// `renderToStaticMarkup` no provee) — así que el componente en sí queda
// fino y esta es la superficie que se prueba, siguiendo la misma disciplina
// que obs #191 D9.
import { describe, expect, it } from 'vitest';

import { shouldKeepRefreshing } from '../src/components/coverage-status-policy.js';

describe('shouldKeepRefreshing (DD-23) — se detiene en estado terminal o en el techo de refrescos', () => {
  it('continúa mientras el estado es pending y el contador está por debajo del techo', () => {
    expect(shouldKeepRefreshing('pending', 0)).toBe(true);
  });

  it('continúa mientras el estado es running y el contador está por debajo del techo', () => {
    expect(shouldKeepRefreshing('running', 5)).toBe(true);
  });

  it('se detiene en estado done, sin importar el contador', () => {
    expect(shouldKeepRefreshing('done', 0)).toBe(false);
  });

  it('se detiene en estado failed, sin importar el contador', () => {
    expect(shouldKeepRefreshing('failed', 0)).toBe(false);
  });

  it('se detiene al alcanzar el techo de refrescos, aunque el estado siga pending/running', () => {
    const atCeiling = shouldKeepRefreshing('pending', 1_000_000);
    expect(atCeiling).toBe(false);
  });
});
