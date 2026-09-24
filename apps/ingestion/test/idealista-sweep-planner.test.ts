// Paso 1.6 — planNext: las cinco condiciones de terminación del barrido
// (spec, R-TERM), con las Reconciliaciones #1 y #2 de las tareas (obs #106)
// ya resueltas: condición 4 LANZA (no avanza en silencio) y condición 5
// compara envelope.elementList.length, NUNCA items.length (D3 del diseño,
// "la misma trampa que enfrenta el llamador de 1.7, una capa más abajo").
import { describe, expect, it } from 'vitest';

import type { SweepPosition } from '../src/sources/idealista/cursor.js';
import { UntrustworthyEnvelopeError } from '../src/sources/idealista/errors.js';
import { planNext } from '../src/sources/idealista/sweep-planner.js';

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    elementList: [],
    totalPages: 3,
    actualPage: 1,
    itemsPerPage: 50,
    total: 100,
    ...overrides,
  };
}

const homesPage1: SweepPosition = { filter: 'homes', page: 1 };

describe('planNext — condición 1: página agotada dentro del filtro', () => {
  it('actualPage/page >= totalPages hace avanzar al siguiente filtro, página 1', () => {
    const result = planNext({ filter: 'homes', page: 3 }, envelope({ totalPages: 3, itemsPerPage: 50 }), 50);
    expect(result.nextCursor).toBe('offices:1');
  });

  it('page < totalPages y página llena avanza a la siguiente página del MISMO filtro', () => {
    const result = planNext(homesPage1, envelope({ totalPages: 3, itemsPerPage: 50 }), 50);
    expect(result.nextCursor).toBe('homes:2');
  });
});

describe('planNext — condición 2: barrido completo', () => {
  it('el último filtro de la tupla (bedrooms) agotado omite nextCursor', () => {
    const result = planNext({ filter: 'bedrooms', page: 3 }, envelope({ totalPages: 3, itemsPerPage: 50 }), 50);
    expect(result.nextCursor).toBeUndefined();
  });
});

describe('planNext — condición 4 (Reconciliación #1): envelope no fiable', () => {
  it('totalPages ausente lanza UntrustworthyEnvelopeError con resumeCursor en la MISMA página, no avanza', () => {
    const corrupt = envelope();
    delete corrupt.totalPages;

    expect(() => planNext(homesPage1, corrupt, 50)).toThrow(UntrustworthyEnvelopeError);
  });

  it('el resumeCursor del error es exactamente la página actual, nunca la siguiente', () => {
    const corrupt = envelope();
    delete corrupt.totalPages;

    try {
      planNext(homesPage1, corrupt, 50);
      throw new Error('planNext debía lanzar UntrustworthyEnvelopeError');
    } catch (error) {
      expect(error).toBeInstanceOf(UntrustworthyEnvelopeError);
      if (error instanceof UntrustworthyEnvelopeError) {
        expect(error.resumeCursor).toBe('homes:1');
      }
    }
  });

  it('totalPages absurdo (mayor que MAX_TRUSTED_TOTAL_PAGES) también lanza', () => {
    expect(() => planNext(homesPage1, envelope({ totalPages: 100000 }), 50)).toThrow(UntrustworthyEnvelopeError);
  });
});

describe('planNext — condición 5 (D3, la trampa del bug latente)', () => {
  it('una elementListLength igual a itemsPerPage NO se lee como agotada, aunque algún elemento vaya a fallar su propio esquema después', () => {
    // itemsPerPage=50 y elementListLength=50 (el tamaño de elementList
    // crudo, NUNCA items.length tras el filtrado por-elemento): el filtro
    // no está agotado por esta condición. Un planner que comparase
    // items.length en su lugar fallaría exactamente esta aserción con
    // cualquier valor menor que 50.
    const result = planNext(homesPage1, envelope({ totalPages: 3, itemsPerPage: 50 }), 50);
    expect(result.nextCursor).toBe('homes:2');
  });

  it('página corta (elementListLength < itemsPerPage) agota el filtro aunque totalPages diga que quedan más páginas', () => {
    const result = planNext(homesPage1, envelope({ totalPages: 3, itemsPerPage: 50 }), 10);
    expect(result.nextCursor).toBe('offices:1');
  });

  it('filtro sin resultados (elementListLength: 0) en un filtro NO final avanza al siguiente filtro, nunca se lee como fin del barrido', () => {
    const result = planNext(
      { filter: 'homes', page: 1 },
      envelope({ totalPages: 1, itemsPerPage: 50 }),
      0
    );
    expect(result.nextCursor).toBe('offices:1');
  });

  it('filtro sin resultados en el ÚLTIMO filtro (bedrooms) sí completa el barrido', () => {
    const result = planNext(
      { filter: 'bedrooms', page: 1 },
      envelope({ totalPages: 1, itemsPerPage: 50 }),
      0
    );
    expect(result.nextCursor).toBeUndefined();
  });
});

describe('planNext — total (R-TOTAL)', () => {
  it('el resultado nunca expone un campo total: esa omisión (A7) la aplica el shell sobre SourcePage, no planNext', () => {
    const result = planNext(homesPage1, envelope({ totalPages: 3, itemsPerPage: 50 }), 50);
    expect(result).not.toHaveProperty('total');
  });
});
