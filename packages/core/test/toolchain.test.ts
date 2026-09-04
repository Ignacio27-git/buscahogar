import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CORE_VERSION } from '../src/index';

// Este test no valida lógica de dominio: todavía no hay. Comprueba que la cadena
// de herramientas está bien montada — TypeScript estricto, ESM, resolución de
// dependencias bajo pnpm y ejecución con Vitest — para que un fallo de tooling
// se detecte aquí y no dentro de la lógica cuando llegue.
describe('cadena de herramientas', () => {
  it('resuelve las dependencias del workspace y valida con Zod', () => {
    const schema = z.object({ version: z.string().min(1) });

    const result = schema.safeParse({ version: CORE_VERSION });

    expect(result.success).toBe(true);
  });

  it('rechaza los datos que no cumplen el esquema', () => {
    const schema = z.object({ version: z.string().min(1) });

    const result = schema.safeParse({ version: 42 });

    expect(result.success).toBe(false);
  });
});
