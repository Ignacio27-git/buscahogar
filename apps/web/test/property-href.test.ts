// ROADMAP 1.12 (diseño D9, decisión 061) — función pura: construye el href
// de la página de detalle a partir de un `listingId`. Extraída de la JSX
// porque una ruta es una preocupación de `apps/web`, nunca del dominio
// (`packages/core` no debe conocer formas de ruta).
import { describe, expect, it } from 'vitest';

import { buildPropertyDetailHref } from '../src/lib/property-href.js';

describe('buildPropertyDetailHref — D9', () => {
  it('construye /properties/{listingId}', () => {
    expect(buildPropertyDetailHref('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/properties/550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('es determinista para el mismo listingId', () => {
    const id = 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789';
    expect(buildPropertyDetailHref(id)).toBe(buildPropertyDetailHref(id));
  });
});
