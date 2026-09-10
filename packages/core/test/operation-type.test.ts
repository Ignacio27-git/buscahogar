import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { OPERATION_TYPES, type OperationType } from '../src/types/operation-type.js';

describe('OperationType', () => {
  it('declara exactamente ["sale", "rent"]', () => {
    expect(OPERATION_TYPES).toEqual(['sale', 'rent']);
  });

  it('cubre exhaustivamente la unión en un switch sin default', () => {
    const label = (value: OperationType): string => {
      switch (value) {
        case 'sale': {
          return 'venta';
        }
        case 'rent': {
          return 'alquiler';
        }
        default: {
          const exhaustive: never = value;
          return exhaustive;
        }
      }
    };

    expect(label('sale')).toBe('venta');
    expect(label('rent')).toBe('alquiler');
  });

  it('el esquema Zod deriva del mismo tuple', () => {
    const schema = z.enum(OPERATION_TYPES);

    expect(schema.safeParse('sale').success).toBe(true);
    expect(schema.safeParse('lease').success).toBe(false);
  });
});
