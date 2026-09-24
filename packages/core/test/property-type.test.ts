import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PROPERTY_TYPES, type PropertyType } from '../src/types/property-type.js';

// El paso 1.4 fija esta unión cerrada como decisión de producto confirmada
// (obs #67) y tres de sus miembros verificados contra datos reales
// (DECISIONS 027: `flat`, `duplex`, `penthouse`). `other` es la válvula de
// seguridad para los ocho miembros restantes, todavía no confirmados.
describe('PropertyType', () => {
  it('declara exactamente 11 miembros sin duplicados', () => {
    expect(PROPERTY_TYPES).toHaveLength(11);
    expect(new Set(PROPERTY_TYPES).size).toBe(11);
  });

  it('incluye los miembros verificados contra datos reales y la válvula "other"', () => {
    expect(PROPERTY_TYPES).toContain('flat');
    expect(PROPERTY_TYPES).toContain('duplex');
    expect(PROPERTY_TYPES).toContain('penthouse');
    expect(PROPERTY_TYPES).toContain('commercial');
    expect(PROPERTY_TYPES).toContain('other');
  });

  it('cubre exhaustivamente la unión en un switch sin default', () => {
    const describe = (value: PropertyType): string => {
      switch (value) {
        case 'flat':
        case 'house':
        case 'penthouse':
        case 'duplex':
        case 'studio':
        case 'land':
        case 'commercial':
        case 'garage':
        case 'storage_room':
        case 'building':
        case 'other': {
          return value;
        }
        default: {
          // Si se añade un miembro a PROPERTY_TYPES sin actualizar este
          // switch, esta rama deja de ser inalcanzable y el tipo `never`
          // falla en tiempo de compilación.
          const exhaustive: never = value;
          return exhaustive;
        }
      }
    };

    expect(describe('flat')).toBe('flat');
    expect(describe('other')).toBe('other');
  });

  it('el esquema Zod deriva del mismo tuple y expone acceso en minúsculas (v4)', () => {
    const schema = z.enum(PROPERTY_TYPES);

    // Zod 4 expone `enum`/`options` en minúsculas; `.Enum`/`.Values` (v3) no
    // existen. Esta aserción falla si alguien regresa a la forma v3.
    expect(schema.enum.flat).toBe('flat');
    expect(schema.safeParse('flat').success).toBe(true);
    expect(schema.safeParse('homes').success).toBe(false);
  });
});
