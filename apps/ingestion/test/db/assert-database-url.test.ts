// Paso 1.7 — assertDatabaseUrlOrThrow (diseño D2, resuelve D-a). Extracción
// del guard de test/db/setup-db-env.ts a una función pura: un setupFile de
// vitest no es directamente comprobable con describe/it, así que la
// propiedad "lanza cuando falta DATABASE_URL" se prueba aquí, no allí (nota
// de ordenación 5 de la lista de tareas).
import { describe, expect, it } from 'vitest';

import { assertDatabaseUrlOrThrow, MissingDatabaseUrlError } from '../../src/sweep/db-env-guard.js';

describe('assertDatabaseUrlOrThrow — D2/D-a: una suite DB que se omite en silencio es imposible', () => {
  it('lanza un error nombrado cuando DATABASE_URL está ausente', () => {
    expect(() => {
      assertDatabaseUrlOrThrow({});
    }).toThrow(MissingDatabaseUrlError);
    expect(() => {
      assertDatabaseUrlOrThrow({});
    }).toThrow(/DATABASE_URL/);
  });

  it('lanza un error nombrado cuando DATABASE_URL está presente pero vacía', () => {
    expect(() => {
      assertDatabaseUrlOrThrow({ DATABASE_URL: '' });
    }).toThrow(MissingDatabaseUrlError);
  });

  it('no lanza cuando DATABASE_URL está presente y no vacía', () => {
    expect(() => {
      assertDatabaseUrlOrThrow({ DATABASE_URL: 'postgres://user:pass@localhost:5432/db' });
    }).not.toThrow();
  });
});
