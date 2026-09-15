import { describe, expect, it } from 'vitest';

import { classify } from '../src/strategies/rule-based/classify.js';
import { ruleBasedDedupStrategy } from '../src/strategies/rule-based/strategy.js';
import { dedupCorpus } from './dedup-corpus.js';

// CORP-1a: todo el corpus tiene rationale no vacía — las 24 entradas
// completas (6 verdaderos positivos, 6 negativos fáciles, 8 negativos
// difíciles, 4 de datos ausentes). El bandeado real
// (`classify(strategy.score(a, b)) === expected`) se prueba más abajo, en
// el bloque "bandeado completo" — es el primer punto donde el criterio de
// aceptación real de ROADMAP 1.9 se comprueba de extremo a extremo.
describe('dedup-corpus — CORP-1a: toda entrada tiene una rationale no vacía', () => {
  it.each(dedupCorpus.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    expect(entry.rationale.length).toBeGreaterThan(0);
  });
});

describe('dedup-corpus — nivel de score (sin banda todavía)', () => {
  it('CORP-2a: el verdadero positivo con superficie ausente en un lado evalúa el resto de señales a peso completo', () => {
    const entry = dedupCorpus.find((e) => e.id === 'tp-3-superficie-ausente-un-lado');
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const result = ruleBasedDedupStrategy.score(entry.a, entry.b);

    expect(result.signals['surface']?.weight).toBe(0);
    expect(result.signals['distance']?.weight).toBeGreaterThan(0);
    expect(result.signals['price']?.weight).toBeGreaterThan(0);
    expect(result.signals['addressExact']?.weight).toBeGreaterThan(0);
    expect(result.signals['rooms']?.weight).toBeGreaterThan(0);
    expect(result.signals['bathrooms']?.weight).toBeGreaterThan(0);
  });

  it('CORP-4a: el par con propertyType distinto conserva un score acumulado alto sin que el veto lo module', () => {
    const entry = dedupCorpus.find((e) => e.id === 'en-3-veto-tipo-de-inmueble');
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const result = ruleBasedDedupStrategy.score(entry.a, entry.b);

    expect(result.signals['propertyTypeMatch']).toEqual({
      value: 0,
      weight: 0,
      detail: 'tipo de inmueble distinto',
    });
    // El score acumulado NO se pone a cero ni se recorta por el veto — BAND-3
    // exige que la evidencia acumulada se preserve intacta como dato.
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('el par con operation distinta conserva un score acumulado alto sin que el veto lo module', () => {
    const entry = dedupCorpus.find((e) => e.id === 'en-4-veto-operacion');
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const result = ruleBasedDedupStrategy.score(entry.a, entry.b);

    expect(result.signals['operationMatch']).toEqual({ value: 0, weight: 0, detail: 'operación distinta' });
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('SIM-1a / RDS-6a: score está en [0,1] y es simétrico para todo el corpus', () => {
    for (const entry of dedupCorpus) {
      const forward = ruleBasedDedupStrategy.score(entry.a, entry.b);
      const backward = ruleBasedDedupStrategy.score(entry.b, entry.a);

      expect(forward.score).toBeGreaterThanOrEqual(0);
      expect(forward.score).toBeLessThanOrEqual(1);
      expect(forward.score).toBe(backward.score);
    }
  });

  it('RDS-4/RDS-7: los cuatro pares de "Piso en Trafalgar, Madrid" degradan a addressZone, nunca addressExact', () => {
    const trafalgarIds = [
      'hn-1-trafalgar-street-less-rooms-distintos',
      'hn-2-trafalgar-street-less-bathrooms-distintos',
      'hn-3-trafalgar-street-less-precio-superficie-lejos',
      'hn-4-trafalgar-street-less-casi-todo-distinto',
    ];

    for (const id of trafalgarIds) {
      const entry = dedupCorpus.find((e) => e.id === id);
      expect(entry).toBeDefined();
      if (entry === undefined) continue;

      const result = ruleBasedDedupStrategy.score(entry.a, entry.b);
      expect(result.signals['addressZone']).toEqual({
        value: 1,
        weight: 8,
        detail: expect.any(String) as string,
      });
      expect(result.signals['addressExact']?.weight).toBe(0);
    }
  });

  it('RDS-7: el par idéntico en todo lo evaluado puntúa EXACTAMENTE 1.0 por construcción', () => {
    const entry = dedupCorpus.find((e) => e.id === 'hn-8-identico-en-todo-falso-positivo-irreducible');
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const result = ruleBasedDedupStrategy.score(entry.a, entry.b);
    expect(result.score).toBe(1);
  });

  it('CORP-5/RDS-3a: el par premises sin rooms/bathrooms no está sistemáticamente penalizado (score alto)', () => {
    const entry = dedupCorpus.find((e) => e.id === 'md-1-premises-sin-rooms-bathrooms');
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const result = ruleBasedDedupStrategy.score(entry.a, entry.b);
    expect(result.signals['rooms']?.weight).toBe(0);
    expect(result.signals['bathrooms']?.weight).toBe(0);
    expect(result.score).toBeGreaterThan(0.8);
  });

  it('los verdaderos positivos puntúan claramente por encima de los negativos fáciles (separación bruta, sin banda todavía)', () => {
    const tpScores = dedupCorpus
      .filter((entry) => entry.id.startsWith('tp-'))
      .map((entry) => ruleBasedDedupStrategy.score(entry.a, entry.b).score);
    const lowestTp = Math.min(...tpScores);

    const nonVetoEnScores = dedupCorpus
      .filter((entry) => entry.id.startsWith('en-') && !entry.id.includes('veto'))
      .map((entry) => ruleBasedDedupStrategy.score(entry.a, entry.b).score);
    const highestNonVetoEn = Math.max(...nonVetoEnScores);

    expect(lowestTp).toBeGreaterThan(highestNonVetoEn);
  });
});

// Fase C (4.3): el primer punto donde se comprueba de extremo a extremo el
// criterio de aceptación real de ROADMAP 1.9 — `classify(strategy.score(a,
// b))` contra la etiqueta `expected` de las 24 entradas. CORP-1..CORP-5.
describe('dedup-corpus — bandeado completo: classify(strategy.score(a, b)) === expected', () => {
  it.each(dedupCorpus.map((entry) => [entry.id, entry] as const))('%s → %s', (_id, entry) => {
    const result = ruleBasedDedupStrategy.score(entry.a, entry.b);
    expect(classify(result)).toBe(entry.expected);
  });

  it('CORP-2: los seis verdaderos positivos aceptan', () => {
    const truePositives = dedupCorpus.filter((entry) => entry.id.startsWith('tp-'));
    expect(truePositives).toHaveLength(6);
    for (const entry of truePositives) {
      expect(classify(ruleBasedDedupStrategy.score(entry.a, entry.b))).toBe('accept');
    }
  });

  it('CORP-4: los seis negativos fáciles rechazan', () => {
    const easyNegatives = dedupCorpus.filter((entry) => entry.id.startsWith('en-'));
    expect(easyNegatives).toHaveLength(6);
    for (const entry of easyNegatives) {
      expect(classify(ruleBasedDedupStrategy.score(entry.a, entry.b))).toBe('reject');
    }
  });

  it('CORP-3: los ocho negativos difíciles nunca aceptan, salvo la excepción documentada de RDS-7', () => {
    const hardNegatives = dedupCorpus.filter((entry) => entry.id.startsWith('hn-'));
    expect(hardNegatives).toHaveLength(8);

    for (const entry of hardNegatives) {
      const band = classify(ruleBasedDedupStrategy.score(entry.a, entry.b));
      if (entry.id === 'hn-8-identico-en-todo-falso-positivo-irreducible') {
        expect(band).toBe('accept');
      } else {
        expect(band).not.toBe('accept');
      }
    }
  });

  it('CORP-5: los cuatro pares de datos ausentes ejercitan el piso sin quedar sistemáticamente penalizados', () => {
    const missingData = dedupCorpus.filter((entry) => entry.id.startsWith('md-'));
    expect(missingData).toHaveLength(4);
  });

  it('CORP-5a: el par con solo dos señales evaluables nunca acepta', () => {
    const entry = dedupCorpus.find((e) => e.id === 'md-4-solo-dos-senales-evaluables');
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const band = classify(ruleBasedDedupStrategy.score(entry.a, entry.b));
    expect(band).not.toBe('accept');
  });

  it('el corpus completo tiene 24 entradas', () => {
    expect(dedupCorpus).toHaveLength(24);
  });
});
