// Paso 1.6 — validación del envelope crudo de página de Idealista (R-TERM
// #4). `totalPages` es el campo cuya integridad protege la condición 4 de
// terminación (envelope no fiable, Reconciliación #1 de las tareas).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { MAX_TRUSTED_TOTAL_PAGES, rawEnvelopeSchema } from '../src/sources/idealista/raw-envelope.schema.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/idealista/', import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, 'utf8'));
}

describe('rawEnvelopeSchema — fixtures reales (paso 1.5)', () => {
  it('parsea el envelope completo de homes', () => {
    expect(rawEnvelopeSchema.safeParse(loadFixture('search-homes-2026-09-10.json')).success).toBe(true);
  });

  it('parsea el envelope completo de premises', () => {
    expect(rawEnvelopeSchema.safeParse(loadFixture('search-premises-2026-09-10.json')).success).toBe(true);
  });
});

describe('rawEnvelopeSchema — totalPages no fiable (rechazo, condición 4)', () => {
  const base = { elementList: [], actualPage: 1, itemsPerPage: 50 };

  it('rechaza totalPages ausente', () => {
    expect(rawEnvelopeSchema.safeParse({ ...base }).success).toBe(false);
  });

  it('rechaza totalPages no entero', () => {
    expect(rawEnvelopeSchema.safeParse({ ...base, totalPages: 3.5 }).success).toBe(false);
  });

  it(`rechaza totalPages absurdo (> MAX_TRUSTED_TOTAL_PAGES = ${String(MAX_TRUSTED_TOTAL_PAGES)})`, () => {
    expect(rawEnvelopeSchema.safeParse({ ...base, totalPages: MAX_TRUSTED_TOTAL_PAGES + 1 }).success).toBe(false);
  });

  it('acepta totalPages en el límite exacto de MAX_TRUSTED_TOTAL_PAGES', () => {
    expect(rawEnvelopeSchema.safeParse({ ...base, totalPages: MAX_TRUSTED_TOTAL_PAGES }).success).toBe(true);
  });
});
