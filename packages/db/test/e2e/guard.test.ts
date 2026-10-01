// Paso D.1a (spec e2e-test-database R1, S1.1-S1.4; diseño A3) — el guard de la
// base de datos e2e se prueba ANTES de existir (RED). Es una barrera de
// seguridad sobre una operación destructiva (DROP DATABASE), así que cada
// rechazo tiene su caso: nombre sin sufijo, URL de desarrollo, rol equivocado.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { e2eUuid } from '../../src/e2e/fixture-ids.js';
import {
  E2eGuardError,
  assertE2eOwnerDatabaseUrl,
  assertE2eWebDatabaseUrl,
  maintenanceUrl,
} from '../../src/e2e/guard.js';
import { resolveE2eSeedTarget } from '../../src/e2e/seed.js';

const DEV_DB = 'buscahogar';
const OWNER_URL = 'postgresql://buscahogar:secret@db:5432/buscahogar_e2e';
const WEB_URL = 'postgresql://web_readonly:other@db:5432/buscahogar_e2e';

describe('assertE2eOwnerDatabaseUrl', () => {
  it('S1.4 acepta buscahogar_e2e cuando la URL no es la de desarrollo', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl(OWNER_URL, DEV_DB);
    }).not.toThrow();
  });

  it('S1.1 rechaza la base de datos de desarrollo y nombra la base rechazada', () => {
    const devUrl = 'postgresql://buscahogar:secret@localhost:5432/buscahogar';
    expect(() => {
      assertE2eOwnerDatabaseUrl(devUrl, DEV_DB);
    }).toThrow(E2eGuardError);
    expect(() => {
      assertE2eOwnerDatabaseUrl(devUrl, DEV_DB);
    }).toThrow(/"buscahogar"/);
  });

  it('rechaza una URL ausente o vacía', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl(undefined, DEV_DB);
    }).toThrow(E2eGuardError);
    expect(() => {
      assertE2eOwnerDatabaseUrl('', DEV_DB);
    }).toThrow(E2eGuardError);
  });

  it('rechaza una URL ilegible', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl('no es una url', DEV_DB);
    }).toThrow(E2eGuardError);
  });

  it('S1.4 rechaza x_e2e_old (el sufijo no está al final)', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl('postgresql://u:p@db:5432/x_e2e_old', DEV_DB);
    }).toThrow(E2eGuardError);
  });

  it('S1.4 rechaza E2E sin el sufijo _e2e, y mayúsculas', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl('postgresql://u:p@db:5432/E2E', DEV_DB);
    }).toThrow(E2eGuardError);
    expect(() => {
      assertE2eOwnerDatabaseUrl('postgresql://u:p@db:5432/buscahogar_E2E', DEV_DB);
    }).toThrow(E2eGuardError);
  });

  it('rechaza un nombre que no es un identificador seguro (se interpola en DROP/CREATE)', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl('postgresql://u:p@db:5432/a%22%3Bdrop_e2e', DEV_DB);
    }).toThrow(E2eGuardError);
  });

  it('S1.2 rechaza una URL idéntica a una URL prohibida aunque termine en _e2e', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl(OWNER_URL, DEV_DB, [OWNER_URL]);
    }).toThrow(E2eGuardError);
    // Triangulación: con una URL prohibida distinta, el mismo destino se acepta.
    expect(() => {
      assertE2eOwnerDatabaseUrl(OWNER_URL, DEV_DB, [WEB_URL]);
    }).not.toThrow();
  });

  it('S1.3 ignora entradas prohibidas sin definir', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl(OWNER_URL, DEV_DB, [undefined, WEB_URL]);
    }).not.toThrow();
  });

  it('rechaza un destino cuyo nombre coincide con el de desarrollo aunque acabe en _e2e', () => {
    expect(() => {
      assertE2eOwnerDatabaseUrl(OWNER_URL, 'buscahogar_e2e');
    }).toThrow(E2eGuardError);
  });
});

describe('assertE2eWebDatabaseUrl', () => {
  it('acepta el rol web_readonly sobre la base e2e', () => {
    expect(() => {
      assertE2eWebDatabaseUrl(WEB_URL, OWNER_URL);
    }).not.toThrow();
  });

  it('acepta sin URL de propietario (solo valida nombre y rol)', () => {
    expect(() => {
      assertE2eWebDatabaseUrl(WEB_URL);
    }).not.toThrow();
  });

  it('rechaza una URL ausente', () => {
    expect(() => {
      assertE2eWebDatabaseUrl(undefined, OWNER_URL);
    }).toThrow(E2eGuardError);
  });

  it('rechaza una base que no termina en _e2e', () => {
    expect(() => {
      assertE2eWebDatabaseUrl('postgresql://web_readonly:p@db:5432/buscahogar', OWNER_URL);
    }).toThrow(E2eGuardError);
  });

  it('rechaza cualquier usuario distinto de web_readonly (nunca el propietario)', () => {
    expect(() => {
      assertE2eWebDatabaseUrl(OWNER_URL, OWNER_URL);
    }).toThrow(/web_readonly/);
    expect(() => {
      assertE2eWebDatabaseUrl('postgresql://web_coverage:p@db:5432/buscahogar_e2e', OWNER_URL);
    }).toThrow(E2eGuardError);
  });

  it('rechaza una URL web con otro host, puerto o base que la del propietario', () => {
    expect(() => {
      assertE2eWebDatabaseUrl('postgresql://web_readonly:p@otro:5432/buscahogar_e2e', OWNER_URL);
    }).toThrow(E2eGuardError);
    expect(() => {
      assertE2eWebDatabaseUrl('postgresql://web_readonly:p@db:5433/buscahogar_e2e', OWNER_URL);
    }).toThrow(E2eGuardError);
    expect(() => {
      assertE2eWebDatabaseUrl('postgresql://web_readonly:p@db:5432/otra_e2e', OWNER_URL);
    }).toThrow(E2eGuardError);
  });

  it('rechaza un propietario que ya es web_readonly (credenciales no distintas)', () => {
    expect(() => {
      assertE2eWebDatabaseUrl(WEB_URL, WEB_URL);
    }).toThrow(E2eGuardError);
  });
});

describe('maintenanceUrl', () => {
  it('apunta a la base postgres conservando credenciales, host y puerto', () => {
    const parsed = new URL(maintenanceUrl(OWNER_URL));
    expect(parsed.pathname).toBe('/postgres');
    expect(parsed.username).toBe('buscahogar');
    expect(parsed.password).toBe('secret');
    expect(parsed.hostname).toBe('db');
    expect(parsed.port).toBe('5432');
  });

  it('no depende del nombre de la base original', () => {
    expect(new URL(maintenanceUrl('postgresql://u:p@h:6543/otra_e2e')).pathname).toBe('/postgres');
  });
});

describe('e2eUuid', () => {
  it('produce un UUID con forma v4 y un sufijo hexadecimal de 12 dígitos', () => {
    expect(e2eUuid(1)).toBe('e2e00000-0000-4000-8000-000000000001');
    expect(e2eUuid(255)).toBe('e2e00000-0000-4000-8000-0000000000ff');
  });

  it('es determinista y distinto para cada índice', () => {
    expect(e2eUuid(7)).toBe(e2eUuid(7));
    expect(e2eUuid(7)).not.toBe(e2eUuid(8));
  });

  it('rechaza índices no enteros o negativos', () => {
    expect(() => e2eUuid(-1)).toThrow(RangeError);
    expect(() => e2eUuid(1.5)).toThrow(RangeError);
  });
});

describe('barril público ./e2e', () => {
  const read = (file: string): string =>
    readFileSync(fileURLToPath(new URL(`../../src/e2e/${file}`, import.meta.url)), 'utf8');
  const importSpecifiers = (source: string): string[] =>
    [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+'([^']+)'/g)].map(
      (match) => match[1] ?? ''
    );

  it('public.ts solo reexporta los módulos puros guard y fixture-ids', () => {
    expect(importSpecifiers(read('public.ts')).sort()).toEqual(['./fixture-ids.js', './guard.js']);
  });

  it('guard.ts y fixture-ids.ts no importan pg, drizzle ni ningún módulo de base de datos', () => {
    expect(importSpecifiers(read('guard.ts'))).toEqual([]);
    expect(importSpecifiers(read('fixture-ids.ts'))).toEqual([]);
  });
});

describe('resolveE2eSeedTarget (guard previo a cualquier conexión)', () => {
  it('S1.1 rechaza la base de desarrollo antes de que el seed abra un Pool', () => {
    const env = {
      E2E_DATABASE_URL: 'postgresql://buscahogar:s@localhost:5432/buscahogar',
      E2E_WEB_DATABASE_URL: WEB_URL,
    };
    expect(() => resolveE2eSeedTarget(env)).toThrow(E2eGuardError);
  });

  it('S1.4 acepta el destino e2e y devuelve el nombre de base validado', () => {
    const env = {
      E2E_DATABASE_URL: OWNER_URL,
      E2E_WEB_DATABASE_URL: WEB_URL,
      E2E_DEV_DATABASE_NAME: DEV_DB,
    };
    expect(resolveE2eSeedTarget(env)).toEqual({
      ownerUrl: OWNER_URL,
      databaseName: 'buscahogar_e2e',
    });
  });

  it('S1.2/S1.3 rechaza una URL e2e idéntica a DATABASE_URL o a WEB_DATABASE_URL del entorno', () => {
    const base = { E2E_DATABASE_URL: OWNER_URL, E2E_WEB_DATABASE_URL: WEB_URL };
    expect(() => resolveE2eSeedTarget({ ...base, DATABASE_URL: OWNER_URL })).toThrow(E2eGuardError);
    expect(() => resolveE2eSeedTarget({ ...base, WEB_DATABASE_URL: OWNER_URL })).toThrow(
      E2eGuardError
    );
  });

  it('rechaza una URL web con un rol que no es web_readonly', () => {
    const env = { E2E_DATABASE_URL: OWNER_URL, E2E_WEB_DATABASE_URL: OWNER_URL };
    expect(() => resolveE2eSeedTarget(env)).toThrow(/web_readonly/);
  });
});
