// ROADMAP 1.12 (diseño D8, corregido por arbitraje obs #193 AR-8: DOS
// estados, no tres) — decisión pura de qué texto mostrar cuando un atributo
// consolidado es NULL. `sources` (Q2, `packages/db/src/detail.ts`) no
// arrastra copias por-fuente de los atributos consolidados, así que
// distinguir "NULL pero una fuente lo tiene" de "nadie lo tiene" exigiría
// ensanchar esa forma — rechazado en el arbitraje por ser una distinción
// cosmética que no compensa la confusión añadida. Solo dos estados: un
// valor, o el indicador explícito.
import { describe, expect, it } from 'vitest';

import { resolveConsolidatedField } from '../src/components/consolidated-field.js';

describe('resolveConsolidatedField — dos estados, nunca tres (AR-8)', () => {
  it('devuelve el valor cuando la cabecera consolidada no es NULL', () => {
    const result = resolveConsolidatedField('flat');
    expect(result).toEqual({ kind: 'value', value: 'flat' });
  });

  it('devuelve el indicador explícito "no consolidado" cuando la cabecera es NULL', () => {
    const result = resolveConsolidatedField(null);
    expect(result).toEqual({ kind: 'not-consolidated' });
  });

  it('un número consolidado (p. ej. bathrooms) también se resuelve como valor', () => {
    const result = resolveConsolidatedField(2);
    expect(result).toEqual({ kind: 'value', value: 2 });
  });

  it('cero es un valor legítimo, nunca se confunde con NULL', () => {
    const result = resolveConsolidatedField(0);
    expect(result).toEqual({ kind: 'value', value: 0 });
  });
});
