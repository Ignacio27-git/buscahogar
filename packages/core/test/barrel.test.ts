import { describe, expect, it } from 'vitest';

import * as barrel from '../src/index.js';

// Prueba de la superficie pública explícita (D1 del diseño): src/index.ts
// usa reexports nombrados, no `export *`, así que este test es la lista de
// comprobación legible de lo que el paquete promete a sus consumidores.
describe('barril público de @buscahogar/core', () => {
  it('expone los valores en tiempo de ejecución: const tuples, esquemas y CORE_VERSION', () => {
    expect(barrel.PROPERTY_TYPES).toBeDefined();
    expect(barrel.OPERATION_TYPES).toBeDefined();
    expect(barrel.listingSchema).toBeDefined();
    expect(barrel.areaQuerySchema).toBeDefined();
    expect(barrel.CORE_VERSION).toBeDefined();
  });

  it('ROADMAP 1.11: expone searchQuerySchema, utilizable como validador Zod', () => {
    expect(barrel.searchQuerySchema).toBeDefined();
    const result = barrel.searchQuerySchema.safeParse({ operation: 'sale' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operation).toBe('sale');
    }
  });

  it('ROADMAP 1.9: expone haversineDistanceMeters, ruleBasedDedupStrategy y classify', () => {
    expect(typeof barrel.haversineDistanceMeters).toBe('function');
    expect(barrel.ruleBasedDedupStrategy).toBeDefined();
    expect(barrel.ruleBasedDedupStrategy.name).toBe('rule-based-structured');
    expect(typeof barrel.classify).toBe('function');
  });

  it('ROADMAP 1.13 (DD-22): expone normalizeSearchName, comportamiento real no solo existencia', () => {
    expect(typeof barrel.normalizeSearchName).toBe('function');
    expect(barrel.normalizeSearchName('Málaga')).toBe('malaga');
  });

  it('ROADMAP 1.13 (A-11): expone zoneSelectionSchema y zoneQuerySchema, utilizables como validadores Zod', () => {
    expect(barrel.zoneSelectionSchema.safeParse('18087').success).toBe(true);
    expect(barrel.zoneSelectionSchema.safeParse('bad').success).toBe(false);
    expect(barrel.zoneQuerySchema.safeParse('Granada').success).toBe(true);
  });

  it('ROADMAP 1.10: expone buildPropertyGroups, selectWinningListing y countCompleteness', () => {
    expect(typeof barrel.buildPropertyGroups).toBe('function');
    expect(typeof barrel.selectWinningListing).toBe('function');
    expect(typeof barrel.countCompleteness).toBe('function');

    // Prueba de comportamiento mínima, no solo de existencia (D3): un único
    // par 'accept' produce un único grupo con ambos miembros.
    const grouping = barrel.buildPropertyGroups(
      ['a', 'b'],
      [{ listingAId: 'a', listingBId: 'b', band: 'accept', score: 0.9 }]
    );
    expect(grouping.groups).toHaveLength(1);
    expect(grouping.groups[0]?.listingIds).toEqual(['a', 'b']);
  });

  it('ROADMAP 1.15 (security-hardening): expone evaluateFixedWindow, parseTrustedClientIp y UNKNOWN_CLIENT_IDENTITY', () => {
    expect(typeof barrel.evaluateFixedWindow).toBe('function');
    expect(typeof barrel.parseTrustedClientIp).toBe('function');
    expect(barrel.UNKNOWN_CLIENT_IDENTITY).toBe('unknown');

    // Prueba de comportamiento mínima (D3), no solo de existencia: la misma
    // función accesible desde el barril produce el mismo resultado real que
    // ejercitan fixed-window.test.ts/client-ip.test.ts contra el módulo
    // interno.
    const result = barrel.evaluateFixedWindow(undefined, 0, { max: 1, windowMs: 1000 });
    expect(result.allowed).toBe(true);
    expect(barrel.parseTrustedClientIp('203.0.113.5')).toBe('203.0.113.5');
    expect(barrel.parseTrustedClientIp('not-an-ip')).toBeNull();
  });

  it('PROPERTY_TYPES y OPERATION_TYPES son iterables por consumidores/tests futuros', () => {
    expect(Array.isArray(barrel.PROPERTY_TYPES)).toBe(true);
    expect(Array.isArray(barrel.OPERATION_TYPES)).toBe(true);
  });

  it('los esquemas exportados son instancias Zod utilizables', () => {
    expect(
      barrel.listingSchema.safeParse({
        sourceId: 'x',
        externalId: 'y',
        url: 'https://example.com',
        operation: 'sale',
        propertyType: 'flat',
        priceCents: 100,
      }).success
    ).toBe(true);
    expect(
      barrel.areaQuerySchema.safeParse({
        center: { latitude: 0, longitude: 0 },
        radiusMeters: 100,
        operation: 'sale',
      }).success
    ).toBe(true);
  });

  it('un símbolo deliberadamente interno no está presente en el barril', () => {
    // coordinatesSchema es un esquema anidado interno (sub-barril de
    // schemas/), no forma parte de la superficie pública enumerada en D1.
    expect((barrel as Record<string, unknown>)['coordinatesSchema']).toBeUndefined();
  });

  it('ROADMAP 1.9: pesos, umbrales, vocabulario y funciones de señal individuales quedan internos', () => {
    // Deliberadamente NO exportados (design.md, sección Interfaces): solo
    // ruleBasedDedupStrategy/classify/SimilarityBand cruzan a la superficie
    // pública. Los tests los alcanzan vía ../src/strategies/rule-based/...
    const internals = ['WEIGHTS', 'T_HIGH', 'T_LOW', 'STREET_TOKENS_OBSERVED', 'scoreDistance', 'scorePrice'];

    for (const symbol of internals) {
      expect((barrel as Record<string, unknown>)[symbol]).toBeUndefined();
    }
  });
});
