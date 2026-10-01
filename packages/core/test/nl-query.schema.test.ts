import { describe, expect, it } from 'vitest';

import { nlQuerySchema } from '../src/schemas/nl-query.schema.js';

// ROADMAP 3.1 — validación de `?q=`.
describe('nlQuerySchema', () => {
  it('recorta los espacios y acepta una frase normal', () => {
    expect(nlQuerySchema.parse('  piso en Getafe  ')).toBe('piso en Getafe');
  });

  it('rechaza la cadena vacía o solo espacios', () => {
    expect(nlQuerySchema.safeParse('').success).toBe(false);
    expect(nlQuerySchema.safeParse('   ').success).toBe(false);
  });

  it('acepta 200 caracteres y rechaza 201', () => {
    expect(nlQuerySchema.safeParse('a'.repeat(200)).success).toBe(true);
    expect(nlQuerySchema.safeParse('a'.repeat(201)).success).toBe(false);
  });
});
