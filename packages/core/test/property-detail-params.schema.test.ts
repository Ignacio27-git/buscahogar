// ROADMAP 1.12 (diseño D2; docs/DECISIONS.md, decisión 061) — límite Zod del
// parámetro de ruta `listingId` de la página de detalle. CLAUDE.md exige
// validar con Zod toda entrada externa, "incluidos los search params" — un
// parámetro de ruta es la misma clase de entrada. RED test del apartado de
// la matriz de amenazas "Routing — untrusted path segment" (diseño obs
// #191).
import { describe, expect, it } from 'vitest';

import { propertyDetailParamsSchema } from '../src/schemas/property-detail-params.schema.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('propertyDetailParamsSchema — uuid bien formado', () => {
  it('acepta un uuid válido', () => {
    const result = propertyDetailParamsSchema.safeParse({ listingId: VALID_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.listingId).toBe(VALID_UUID);
    }
  });
});

describe('propertyDetailParamsSchema — rechazo por segmento no confiable (matriz de amenazas)', () => {
  it('rechaza un valor malformado (no uuid)', () => {
    const result = propertyDetailParamsSchema.safeParse({ listingId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rechaza una cadena vacía', () => {
    const result = propertyDetailParamsSchema.safeParse({ listingId: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza un valor de tipo array — Next.js puede resolver un segmento dinámico repetido como array', () => {
    const result = propertyDetailParamsSchema.safeParse({ listingId: [VALID_UUID, VALID_UUID] });
    expect(result.success).toBe(false);
  });

  it('rechaza cuando falta el campo', () => {
    const result = propertyDetailParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rechaza un intento de inyección de segmento (path traversal)', () => {
    const result = propertyDetailParamsSchema.safeParse({ listingId: '../../etc/passwd' });
    expect(result.success).toBe(false);
  });
});
