// ROADMAP 1.13 (diseño §5 interfaces, decisión 057) — validación Zod de la
// selección de zona ANTES de cualquier llamada a base de datos (A-11).
// `zoneSelectionSchema` valida el código INE resuelto (formato, nunca
// existencia); `zoneQuerySchema` valida el texto libre de autocompletado
// (`?zoneQuery=`), acotado en longitud para que nunca llegue una cadena sin
// límite a la consulta de prefijo.
import { describe, expect, it } from 'vitest';

import { zoneQuerySchema, zoneSelectionSchema } from '../src/schemas/zone-selection.schema.js';

describe('zoneSelectionSchema (A-11, decisión 057) — código INE, nunca z.coerce', () => {
  it('acepta un código INE de 5 dígitos bien formado', () => {
    const result = zoneSelectionSchema.safeParse('18087');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('18087');
    }
  });

  it('rechaza una cadena arbitraria ANTES de que ninguna consulta a base de datos pudiera ejecutarse (distinto de "zona desconocida")', () => {
    const result = zoneSelectionSchema.safeParse('no-es-un-codigo');
    expect(result.success).toBe(false);
  });

  it('rechaza un código de 6 dígitos (mismo CHECK que la base de datos, R4)', () => {
    expect(zoneSelectionSchema.safeParse('180871').success).toBe(false);
  });

  it('rechaza un código de 4 dígitos', () => {
    expect(zoneSelectionSchema.safeParse('1808').success).toBe(false);
  });

  it('nunca coacciona: un número no es una entrada válida (z.coerce introduciría justo este fallo silencioso)', () => {
    expect(zoneSelectionSchema.safeParse(18087).success).toBe(false);
  });
});

describe('zoneQuerySchema (A-11) — texto libre de autocompletado, recortado y acotado 2..64', () => {
  it('acepta una consulta de longitud razonable y la recorta', () => {
    const result = zoneQuerySchema.safeParse('  Málaga  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('Málaga');
    }
  });

  it('rechaza una consulta de un solo carácter (mínimo 2)', () => {
    expect(zoneQuerySchema.safeParse('a').success).toBe(false);
  });

  it('rechaza una consulta que excede el máximo de 64 caracteres — nunca una cadena sin límite llega a la consulta de prefijo', () => {
    expect(zoneQuerySchema.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('acepta exactamente el límite superior de 64 caracteres', () => {
    expect(zoneQuerySchema.safeParse('a'.repeat(64)).success).toBe(true);
  });
});
