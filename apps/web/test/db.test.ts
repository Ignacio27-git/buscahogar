// ROADMAP 1.11 — getDb() (diseño D11; docs/DECISIONS.md, decisión 056).
// Falla alto en la PRIMERA petición cuando falta la credencial de solo
// lectura: nunca un valor por defecto silencioso, nunca una lista de
// resultados vacía que confundiría "sin credencial" con "sin viviendas".
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb, MissingDatabaseUrlError } from '../src/server/db.js';

describe('getDb — DATABASE_URL ausente (D11, decisión 056)', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('lanza MissingDatabaseUrlError cuando DATABASE_URL no está definida', () => {
    expect(() => getDb()).toThrow(MissingDatabaseUrlError);
  });

  it('el mensaje nombra la decisión 056, no un fallo genérico', () => {
    expect(() => getDb()).toThrow(/decisión 056/);
  });

  it('una cadena vacía se trata igual que ausencia', () => {
    process.env.DATABASE_URL = '';
    expect(() => getDb()).toThrow(MissingDatabaseUrlError);
  });
});
