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

  it('D.13b: expone el tope de reintentos de un coverage_job y su predicado', () => {
    expect(barrel.COVERAGE_JOB_MAX_ATTEMPTS).toBe(3);
    expect(barrel.hasRetriesLeft(2)).toBe(true);
    expect(barrel.hasRetriesLeft(3)).toBe(false);
  });

  it('ROADMAP 1.11: expone searchQuerySchema, utilizable como validador Zod', () => {
    expect(barrel.searchQuerySchema).toBeDefined();
    const result = barrel.searchQuerySchema.safeParse({ operation: 'sale' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operation).toBe('sale');
    }
  });

  it('ROADMAP 2.6: expone el códec de polígono y el esquema de vista', () => {
    expect(typeof barrel.parsePolygonParam).toBe('function');
    expect(typeof barrel.validatePolygonRing).toBe('function');
    expect(typeof barrel.formatPolygonParam).toBe('function');
    expect(typeof barrel.polygonAreaKm2).toBe('function');
    expect(barrel.POLYGON_MAX_VERTICES).toBe(50);
    expect(barrel.polygonParamSchema).toBeDefined();
    expect(barrel.searchViewSchema.parse(undefined)).toBe('list');
  });

  it('ROADMAP 3.1: expone el intérprete de lenguaje natural y nlQuerySchema, con comportamiento real', () => {
    expect(barrel.nlQuerySchema.parse('  piso en Getafe ')).toBe('piso en Getafe');
    expect(barrel.NL_PARAM_KEYS).toContain('maxPrice');
    expect(barrel.NL_PARAM_KEYS).not.toContain('page');
    const result = barrel.interpretSearchText('piso en alquiler hasta 900 €');
    expect(result.params).toEqual({ operation: 'rent', propertyType: 'flat', maxPrice: '900' });
    // Internos: no forman parte de la superficie pública.
    expect(barrel).not.toHaveProperty('tokenize');
    expect(barrel).not.toHaveProperty('parseSpanishNumber');
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
    const internals = [
      'WEIGHTS',
      'T_HIGH',
      'T_LOW',
      'STREET_TOKENS_OBSERVED',
      'scoreDistance',
      'scorePrice',
    ];

    for (const symbol of internals) {
      expect((barrel as Record<string, unknown>)[symbol]).toBeUndefined();
    }
  });

  it('ROADMAP 2.2: expone la estrategia probabilística, dedupCorpus/makeListing y el módulo de evaluación', () => {
    expect(barrel.probabilisticDedupStrategy).toBeDefined();
    expect(barrel.probabilisticDedupStrategy.name).toBe('probabilistic-fellegi-sunter');
    expect(typeof barrel.classifyProbabilistic).toBe('function');
    expect(barrel.FS_BAND_THRESHOLDS).toEqual({ high: 0.95, low: 0.5 });

    expect(barrel.dedupCorpus).toHaveLength(24);
    expect(typeof barrel.makeListing).toBe('function');

    // Prueba de comportamiento mínima (D3), no solo de existencia: el barril
    // reproduce el mismo cálculo real que evaluate.test.ts ejercita contra el
    // módulo interno.
    expect(typeof barrel.wilsonInterval).toBe('function');
    expect(barrel.wilsonInterval(5, 10)?.low).toBeCloseTo(0.2366, 4);
    expect(typeof barrel.computeMetrics).toBe('function');
    expect(typeof barrel.evaluateStrategy).toBe('function');
    expect(barrel.DEFAULT_SWEEP).toHaveLength(20);
    expect(barrel.RULE_BASED_EVALUATOR.strategy.name).toBe('rule-based-structured');
    expect(barrel.PROBABILISTIC_EVALUATOR.strategy.name).toBe('probabilistic-fellegi-sunter');
    expect(barrel.DEFAULT_EVALUATORS).toHaveLength(2);
  });

  it('ROADMAP 2.3: expone el comparador de imagen, el decorador y la señal de imagen', () => {
    expect(typeof barrel.hammingDistance64).toBe('function');
    expect(barrel.hammingDistance64('0000000000000000', 'ffffffffffffffff')).toBe(64);

    expect(typeof barrel.compareImageHashes).toBe('function');
    const comparison = barrel.compareImageHashes(undefined, undefined, 8);
    expect(comparison).toEqual({
      level: 'neutral',
      reason: 'missing',
      distance: null,
      threshold: 8,
    });

    expect(typeof barrel.formatImageDetail).toBe('function');
    expect(typeof barrel.parseImageDetail).toBe('function');
    expect(barrel.parseImageDetail(barrel.formatImageDetail(comparison))).toEqual(comparison);

    expect(typeof barrel.createImageHashLookup).toBe('function');
    const lookup = barrel.createImageHashLookup({});
    expect(
      lookup(barrel.makeListing({ thumbnailUrl: 'https://example.test/x.jpg' }))
    ).toBeUndefined();

    expect(typeof barrel.withImageSignal).toBe('function');
    const decorated = barrel.withImageSignal(barrel.ruleBasedDedupStrategy, {
      lookup,
      threshold: 8,
      combiner: (base) => base,
    });
    expect(decorated.name).toBe('rule-based-structured+image-phash');

    expect(typeof barrel.classifyRuleBasedWithImage).toBe('function');
  });

  it('ROADMAP 2.3 (Phase 4): expone IMAGE_HAMMING_THRESHOLD, withCorpusImages/IMAGE_REFS y createImageEvaluators', () => {
    expect(barrel.IMAGE_HAMMING_THRESHOLD).toBe(10);

    expect(barrel.IMAGE_REFS['tp-1-mismo-anuncio-cerca']).toEqual({
      a: 'fixture-image:eval/tp-1-mismo-anuncio-cerca-a',
      b: 'fixture-image:eval/tp-1-mismo-anuncio-cerca-b',
    });
    expect(barrel.IMAGE_REFS['md-3-direccion-ausente-ambos-lados']?.b).toBeUndefined();

    const withImages = barrel.withCorpusImages(barrel.dedupCorpus);
    expect(withImages).toHaveLength(24);
    expect(withImages[0]?.a.thumbnailUrl).toBe(barrel.IMAGE_REFS[withImages[0]?.id ?? '']?.a);
    // withCorpusImages nunca muta el corpus original.
    expect(barrel.dedupCorpus[0]?.a.thumbnailUrl).toBeUndefined();

    const lookup = barrel.createImageHashLookup({});
    const { ruleBasedWithImage, probabilisticWithImage } = barrel.createImageEvaluators(lookup);
    expect(ruleBasedWithImage.classify).toBe(barrel.classifyRuleBasedWithImage);
    expect(ruleBasedWithImage.imageThreshold).toBe(barrel.IMAGE_HAMMING_THRESHOLD);
    expect(probabilisticWithImage.classify).toBe(barrel.classifyProbabilistic);
    expect(probabilisticWithImage.imageThreshold).toBe(barrel.IMAGE_HAMMING_THRESHOLD);
  });

  it('ROADMAP 2.3: los combinadores de imagen quedan internos, mismo criterio que WEIGHTS/PRIOR_LOG_ODDS', () => {
    // Deliberadamente NO exportados (index.ts, sección ROADMAP 2.3): los
    // combinadores concretos y sus pesos/m/u son internos a
    // strategies/image/, usados solo dentro del paquete por
    // evaluation/image-evaluators.ts (Phase 4).
    const internals = ['ruleBasedImageCombiner', 'probabilisticImageCombiner'];

    for (const symbol of internals) {
      expect((barrel as Record<string, unknown>)[symbol]).toBeUndefined();
    }
  });

  it('ROADMAP 2.2: el umbral FS y el m/u/bits table quedan internos, igual que WEIGHTS/T_HIGH/T_LOW de rule-based', () => {
    // Deliberadamente NO exportados (design.md, sección Interfaces, tarea
    // 4.10): la tabla m/u de la estrategia probabilística y el prior son
    // parámetros internos de implementación, no superficie pública.
    const internals = [
      'PRIOR_LAMBDA',
      'PRIOR_LOG_ODDS',
      'DISTANCE_LEVELS',
      'PRICE_LEVELS',
      'SURFACE_LEVELS',
      'ADDRESS_LEVELS',
      'ROOMS_LEVELS',
      'BATHROOMS_LEVELS',
    ];

    for (const symbol of internals) {
      expect((barrel as Record<string, unknown>)[symbol]).toBeUndefined();
    }
  });
});
