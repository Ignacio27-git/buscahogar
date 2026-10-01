import { describe, expect, it } from 'vitest';

import { nlSearchCorpus, type NlCorpusEntry } from '../src/evaluation/nl-search-corpus.js';
import {
  evaluateEntry,
  evaluateNlCorpus,
  type NlInterpreter,
} from '../src/evaluation/nl-search-evaluate.js';
import { wilsonInterval } from '../src/evaluation/metrics.js';
import { interpretSearchText } from '../src/nl-search/interpret.js';
import { searchQuerySchema } from '../src/schemas/search-query.schema.js';

function makeEntry(overrides: Partial<NlCorpusEntry>): NlCorpusEntry {
  return {
    id: 'x',
    split: 'dev',
    category: 'basic',
    text: 'texto',
    params: {},
    placeText: null,
    schemaValid: true,
    rationale: 'prueba',
    ...overrides,
  };
}

function stub(params: Record<string, string>, placeText: string | null = null): NlInterpreter {
  return () => ({ params, placeText, recognised: [], conflicts: [], unrecognised: [] });
}

describe('evaluateEntry — resultado por campo', () => {
  it('correct: esperado y devuelto con el mismo valor', () => {
    const result = evaluateEntry(
      makeEntry({ params: { operation: 'rent' } }),
      stub({ operation: 'rent' })
    );
    expect(result.outcomes).toEqual({ operation: 'correct' });
    expect(result.exact).toBe(true);
  });

  it('missed: esperado y no devuelto', () => {
    const result = evaluateEntry(makeEntry({ params: { operation: 'rent' } }), stub({}));
    expect(result.outcomes).toEqual({ operation: 'missed' });
    expect(result.exact).toBe(false);
  });

  it('wrong: esperado y devuelto con otro valor', () => {
    const result = evaluateEntry(
      makeEntry({ params: { maxPrice: '900' } }),
      stub({ maxPrice: '9' })
    );
    expect(result.outcomes).toEqual({ maxPrice: 'wrong' });
    expect(result.exact).toBe(false);
  });

  it('spurious: devuelto sin que se esperase', () => {
    const result = evaluateEntry(makeEntry({}), stub({ minRooms: '3' }));
    expect(result.outcomes).toEqual({ minRooms: 'spurious' });
    expect(result.exact).toBe(false);
  });

  it('el lugar se evalúa como un campo más', () => {
    expect(evaluateEntry(makeEntry({ placeText: 'Getafe' }), stub({}, 'Getafe')).outcomes).toEqual({
      place: 'correct',
    });
    expect(evaluateEntry(makeEntry({ placeText: 'Getafe' }), stub({}, null)).outcomes).toEqual({
      place: 'missed',
    });
    expect(
      evaluateEntry(makeEntry({ placeText: 'Getafe' }), stub({}, 'Getafe sur')).outcomes
    ).toEqual({
      place: 'wrong',
    });
    expect(evaluateEntry(makeEntry({}), stub({}, 'Getafe')).outcomes).toEqual({
      place: 'spurious',
    });
  });

  it('una entrada sin nada esperado ni devuelto es un acierto exacto sin campos', () => {
    const result = evaluateEntry(makeEntry({}), stub({}));
    expect(result.outcomes).toEqual({});
    expect(result.exact).toBe(true);
  });
});

describe('evaluateNlCorpus — agregación', () => {
  const corpus: NlCorpusEntry[] = [
    makeEntry({ id: 'a', split: 'dev', params: { operation: 'rent' } }),
    makeEntry({ id: 'b', split: 'holdout', category: 'hard-negative', params: {} }),
    makeEntry({ id: 'c', split: 'holdout', params: { maxPrice: '900' } }),
  ];
  // Alquiler siempre, y un mínimo de habitaciones que nadie pidió.
  const result = evaluateNlCorpus(corpus, stub({ operation: 'rent', minRooms: '2' }));

  it('separa dev y holdout y calcula la tasa con su intervalo de Wilson', () => {
    expect(result.dev.hitRate.trials).toBe(1);
    expect(result.holdout.hitRate.trials).toBe(2);
    expect(result.all.hitRate.trials).toBe(3);
    expect(result.dev.hitRate.hits).toBe(0);
    expect(result.all.hitRate.wilson95).toEqual(wilsonInterval(0, 3));
  });

  it('cuenta correct/missed/wrong/spurious por campo', () => {
    expect(result.all.perField.operation).toEqual({ correct: 1, missed: 0, wrong: 0, spurious: 2 });
    expect(result.all.perField.maxPrice).toEqual({ correct: 0, missed: 1, wrong: 0, spurious: 0 });
    expect(result.all.perField.minRooms).toEqual({ correct: 0, missed: 0, wrong: 0, spurious: 3 });
  });

  it('cuenta los criterios falsos solo en los negativos difíciles', () => {
    // b es hard-negative: operation y minRooms espurios.
    expect(result.all.hardNegativeFalseCriteria).toBe(2);
    expect(result.dev.hardNegativeFalseCriteria).toBe(0);
  });

  it('un corpus vacío da tasa nula, no NaN', () => {
    const empty = evaluateNlCorpus([], stub({}));
    expect(empty.all.hitRate.value).toBeNull();
    expect(empty.all.hitRate.wilson95).toBeNull();
  });
});

describe('nlSearchCorpus — integridad de los datos', () => {
  it('tiene identificadores únicos y rationale no vacía', () => {
    const ids = nlSearchCorpus.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of nlSearchCorpus) {
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  it('reparte dev y holdout con ambos conjuntos no vacíos y negativos difíciles en los dos', () => {
    const holdout = nlSearchCorpus.filter((entry) => entry.split === 'holdout');
    const dev = nlSearchCorpus.filter((entry) => entry.split === 'dev');
    expect(nlSearchCorpus.length).toBeGreaterThanOrEqual(40);
    expect(holdout.length).toBeGreaterThanOrEqual(10);
    expect(dev.length).toBeGreaterThanOrEqual(10);
    expect(holdout.some((entry) => entry.category === 'hard-negative')).toBe(true);
    expect(dev.some((entry) => entry.category === 'hard-negative')).toBe(true);
  });

  it('los criterios esperados pasan searchQuerySchema salvo los marcados como inválidos', () => {
    for (const entry of nlSearchCorpus) {
      const parsed = searchQuerySchema.safeParse(entry.params);
      expect(parsed.success, entry.id).toBe(entry.schemaValid);
    }
  });

  it('incluye los casos exigidos como datos', () => {
    const texts = nlSearchCorpus.map((entry) => entry.text);
    for (const needle of [
      'Atlantis',
      'alquiler 900 €',
      'sin ascensor',
      'terraza',
      'hasta 3 hab.',
    ]) {
      expect(
        texts.some((text) => text.includes(needle)),
        needle
      ).toBe(true);
    }
  });
});

// Cifras MEDIDAS con el intérprete real (no objetivos). Cambiarlas debe ser
// una decisión deliberada y quedar registrada en la memoria.
describe('nlSearchCorpus — tasa de aciertos medida con el intérprete real', () => {
  const result = evaluateNlCorpus(nlSearchCorpus, interpretSearchText);

  it('cifras fijadas por conjunto', () => {
    expect({
      dev: [result.dev.hitRate.hits, result.dev.hitRate.trials],
      holdout: [result.holdout.hitRate.hits, result.holdout.hitRate.trials],
      all: [result.all.hitRate.hits, result.all.hitRate.trials],
    }).toEqual({ dev: [26, 28], holdout: [13, 14], all: [39, 42] });
  });

  // Ningún negativo difícil produce un criterio falso. Antes de la unidad U2b
  // el dev tenía 2 (dev-27 y dev-28, ambos en el lugar); se corrigieron en el
  // intérprete a partir de dev, sin mirar el holdout.
  it('negativos difíciles: criterios equivocados o espurios por conjunto', () => {
    expect(result.holdout.hardNegativeFalseCriteria).toBe(0);
    expect(result.dev.hardNegativeFalseCriteria).toBe(0);
  });

  it('las entradas no exactas son exactamente estas, con su resultado por campo', () => {
    expect(result.all.entries.filter((e) => !e.exact).map((e) => [e.id, e.outcomes])).toEqual([
      // Sin preposición ante el lugar ("piso Madrid"): no hay disparador.
      [
        'ho-10-mil-decimal-sin-preposicion-de-lugar',
        { operation: 'correct', propertyType: 'correct', maxPrice: 'correct', place: 'missed' },
      ],
      // El máximo de habitaciones no existe; el límite inferior se pierde.
      ['dev-15-entre-habitaciones', { propertyType: 'correct', minRooms: 'missed' }],
      // Número sin unidad: no reconocido por prudencia (especificación).
      ['dev-23-cifra-sin-unidad', { propertyType: 'correct', maxPrice: 'missed' }],
    ]);
  });
});
