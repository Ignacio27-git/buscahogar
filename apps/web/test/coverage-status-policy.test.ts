// ROADMAP 1.13 Unit D (diseño DD-23, arbitraje CR-9) — superficie PURA y
// probada de `coverage-status.tsx`: `shouldKeepRefreshing(status,
// refreshCount)`. `apps/web/vitest.config.ts` corre en entorno `node`, sin
// jsdom y sin contexto de router (`useRouter()` necesita uno que
// `renderToStaticMarkup` no provee) — así que el componente en sí queda
// fino y esta es la superficie que se prueba, siguiendo la misma disciplina
// que obs #191 D9.
import { describe, expect, it } from 'vitest';

import {
  MAX_REFRESH_COUNT,
  describeRefresh,
  shouldKeepRefreshing,
} from '../src/components/coverage-status-policy.js';

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

// D.13 (decisión 181): el texto que acompaña al refresco automático. Los números
// salen de las constantes de la política, nunca de literales aparte.
describe('describeRefresh (D.13) — texto del refresco automático', () => {
  it('mientras sigue refrescando dice cada cuánto y durante cuánto, y que el enlace queda', () => {
    expect(describeRefresh('pending', 0)).toBe(
      'Esta página se actualiza sola cada 5 segundos durante 2 minutos. Después, pulsa «Comprobar de nuevo».'
    );
    expect(describeRefresh('running', MAX_REFRESH_COUNT - 1)).toBe(describeRefresh('pending', 0));
  });

  it('al alcanzar el techo avisa de que ya no se actualiza sola', () => {
    expect(describeRefresh('pending', MAX_REFRESH_COUNT)).toBe(
      'Esta página ya no se actualiza sola. Pulsa «Comprobar de nuevo» para ver cómo va.'
    );
    expect(describeRefresh('running', 1_000_000)).toBe(
      describeRefresh('pending', MAX_REFRESH_COUNT)
    );
  });

  it('en estado terminal no dice nada', () => {
    expect(describeRefresh('done', 0)).toBeNull();
    expect(describeRefresh('failed', MAX_REFRESH_COUNT)).toBeNull();
  });
});
