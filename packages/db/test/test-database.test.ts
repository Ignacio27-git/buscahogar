// Guard de aislamiento de las suites con base de datos (decisión 245, cierra la
// 046): la base de pruebas se DERIVA de `DATABASE_URL`, nunca se configura. Estas
// pruebas no abren ninguna conexión real (S-TDI-12).
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  TestDatabaseGuardError,
  assertConnectedToTestDatabase,
  redirectToTestDatabase,
  testDatabaseUrl,
} from '../src/test-database.js';

const DEV_URL = 'postgresql://owner:s3cret@localhost:5432/buscahogar';

function fakePool(databaseName: string): Pool {
  return {
    query: () => Promise.resolve({ rows: [{ name: databaseName }] }),
  } as unknown as Pool;
}

describe('testDatabaseUrl', () => {
  it('deriva una base por paquete a partir de la de desarrollo (S-TDI-4)', () => {
    expect(new URL(testDatabaseUrl(DEV_URL, 'db')).pathname).toBe('/buscahogar_db_test');
    expect(new URL(testDatabaseUrl(DEV_URL, 'web')).pathname).toBe('/buscahogar_web_test');
    expect(new URL(testDatabaseUrl(DEV_URL, 'ingestion')).pathname).toBe(
      '/buscahogar_ingestion_test'
    );
  });

  it('conserva usuario, host y puerto de la URL de desarrollo', () => {
    const derived = new URL(testDatabaseUrl(DEV_URL, 'db'));
    expect(derived.username).toBe('owner');
    expect(derived.hostname).toBe('localhost');
    expect(derived.port).toBe('5432');
  });

  it('se niega si DATABASE_URL no está definida o está vacía (S-TDI-1)', () => {
    expect(() => testDatabaseUrl(undefined, 'db')).toThrow(TestDatabaseGuardError);
    expect(() => testDatabaseUrl('', 'db')).toThrow(/DATABASE_URL/);
  });

  it('se niega si el nombre de la base no es un nombre seguro (S-TDI-2)', () => {
    const unsafe = 'postgresql://owner:s3cret@localhost:5432/Bad-Name%3B';
    expect(() => testDatabaseUrl(unsafe, 'db')).toThrow(TestDatabaseGuardError);
    expect(() => testDatabaseUrl('postgresql://owner:s3cret@localhost:5432/', 'db')).toThrow(
      TestDatabaseGuardError
    );
  });

  it('se niega si la URL no es legible (S-TDI-2)', () => {
    expect(() => testDatabaseUrl('no-es-una-url', 'db')).toThrow(TestDatabaseGuardError);
  });

  it('se niega si la base derivada coincidiría con la de desarrollo (S-TDI-3)', () => {
    // La base de desarrollo ya se llama como la derivada: derivar de ella
    // devolvería la misma base y TRUNCATE alcanzaría los datos reales.
    const devNamedLikeDerived = 'postgresql://owner:s3cret@localhost:5432/buscahogar_db_test';
    expect(() => testDatabaseUrl(devNamedLikeDerived, 'db')).toThrow(/coincide/);
  });

  it('nunca incluye credenciales en los mensajes (S-TDI-12)', () => {
    const cases: Array<() => unknown> = [
      (): unknown => testDatabaseUrl('postgresql://owner:s3cret@localhost:5432/Bad-Name', 'db'),
      (): unknown => testDatabaseUrl('postgresql://owner:s3cret@localhost:5432/buscahogar_db_test', 'db'),
      (): unknown => testDatabaseUrl('s3cret no es una url', 'db'),
    ];
    for (const run of cases) {
      let message = '';
      try {
        run();
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('s3cret');
    }
  });
});

describe('redirectToTestDatabase', () => {
  it('reescribe en el entorno solo las claves presentes (S-TDI-4)', () => {
    const env: Record<string, string | undefined> = {
      DATABASE_URL: DEV_URL,
      WEB_DATABASE_URL: 'postgresql://web_readonly:pw@localhost:5432/buscahogar',
    };
    redirectToTestDatabase(env, 'web', [
      'DATABASE_URL',
      'WEB_DATABASE_URL',
      'WEB_COVERAGE_DATABASE_URL',
    ]);
    expect(new URL(env.DATABASE_URL ?? '').pathname).toBe('/buscahogar_web_test');
    expect(new URL(env.WEB_DATABASE_URL ?? '').pathname).toBe('/buscahogar_web_test');
    expect(env.WEB_COVERAGE_DATABASE_URL).toBeUndefined();
    expect('WEB_COVERAGE_DATABASE_URL' in env).toBe(false);
  });

  it('es idempotente: redirigir dos veces no encadena sufijos', () => {
    const env: Record<string, string | undefined> = { DATABASE_URL: DEV_URL };
    redirectToTestDatabase(env, 'db', ['DATABASE_URL']);
    redirectToTestDatabase(env, 'db', ['DATABASE_URL']);
    expect(new URL(env.DATABASE_URL ?? '').pathname).toBe('/buscahogar_db_test');
  });

  it('no altera nada si ninguna clave está presente', () => {
    const env: Record<string, string | undefined> = {};
    redirectToTestDatabase(env, 'db', ['DATABASE_URL']);
    expect(env).toEqual({});
  });
});

describe('assertConnectedToTestDatabase', () => {
  it('acepta una conexión a una base _test', async () => {
    await expect(assertConnectedToTestDatabase(fakePool('buscahogar_db_test'))).resolves.toBe(
      undefined
    );
  });

  it('se niega ante una base que no termina en _test antes de cualquier TRUNCATE (S-TDI-2)', async () => {
    await expect(assertConnectedToTestDatabase(fakePool('buscahogar'))).rejects.toThrow(
      TestDatabaseGuardError
    );
  });
});
