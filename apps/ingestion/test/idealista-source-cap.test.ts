// Paso 1.6 — createIdealistaSource: el criterio de revisión de ROADMAP 1.6
// ("que el tope de peticiones existe y funciona, y que los tests pasan sin
// red", R-BUDGET, R-TEST). Puerto de búsqueda falso que cuenta llamadas;
// `driveSweep` recorre nextCursor con la forma exacta que usará el llamador
// de 1.7 — es una especificación ejecutable de cómo debe consumirse el
// adaptador, no solo un test.
import { describe, expect, it } from 'vitest';

import type { AreaQuery, SourcePage } from '@buscahogar/core';

import {
  createIdealistaSource,
  isSweepComplete,
  type IdealistaSourceOptions,
} from '../src/sources/idealista/idealista-source.js';
import { InvalidCursorError, SweepAreaMismatchError, SweepBudgetExhaustedError } from '../src/sources/idealista/errors.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../src/sources/idealista/ports.js';
import type { IdealistaElement } from '../src/sources/idealista/raw-element.schema.js';

const AREA: AreaQuery = { center: { latitude: 40.43, longitude: -3.702 }, radiusMeters: 500, operation: 'sale' };

function fakeElement(propertyCode: number): Record<string, unknown> {
  return {
    propertyCode,
    price: 100000,
    propertyType: 'flat',
    operation: 'sale',
    url: `https://example.test/${String(propertyCode)}`,
    address: 'calle falsa 1',
    latitude: 40.4,
    longitude: -3.7,
  };
}

// Envelope que SIEMPRE declara más páginas por delante: nunca agotado por
// las condiciones 1/5, así que el único freno posible es el presupuesto —
// exactamente lo que este test necesita probar.
function pageEnvelope(actualPage: number): unknown {
  return {
    elementList: Array.from({ length: 50 }, (_, index) => fakeElement(actualPage * 1000 + index)),
    totalPages: 1000,
    actualPage,
    itemsPerPage: 50,
    total: 50000,
  };
}

function createCountingSearchPort(): IdealistaSearchPort & { readonly calls: number } {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    search(): Promise<TransportOutcome> {
      state.calls += 1;
      return Promise.resolve({ kind: 'ok', status: 200, body: pageEnvelope(state.calls), headers: {} });
    },
  };
}

function createFakeTokenPort(): IdealistaTokenPort {
  return {
    acquire(): Promise<TransportOutcome> {
      return Promise.resolve({ kind: 'ok', status: 200, body: { access_token: 'fake-token' }, headers: {} });
    },
  };
}

function createSource(overrides: Partial<Omit<IdealistaSourceOptions, 'searchPort' | 'tokenPort'>> = {}): {
  readonly source: ReturnType<typeof createIdealistaSource>;
  readonly searchPort: IdealistaSearchPort & { readonly calls: number };
} {
  const searchPort = createCountingSearchPort();
  const tokenPort = createFakeTokenPort();
  const source = createIdealistaSource({ ...overrides, searchPort, tokenPort });
  return { source, searchPort };
}

// Recorre nextCursor hasta que se agota o lanza — la forma exacta en la que
// el llamador de 1.7 debe consumir el adaptador.
async function driveSweep(
  source: ReturnType<typeof createIdealistaSource>,
  area: AreaQuery
): Promise<{ pages: SourcePage<IdealistaElement>[]; error?: unknown }> {
  const pages: SourcePage<IdealistaElement>[] = [];
  let cursor: string | undefined;
  try {
    for (;;) {
      const page = await source.fetchArea(area, cursor);
      pages.push(page);
      if (isSweepComplete(page)) break;
      cursor = page.nextCursor;
    }
    return { pages };
  } catch (error) {
    return { pages, error };
  }
}

describe('createIdealistaSource — tope de peticiones (criterio de revisión de ROADMAP 1.6)', () => {
  it('con maxSearchRequestsPerSweep:3 y páginas siempre con más por delante, se detiene EXACTAMENTE tras 3 peticiones', async () => {
    const { source, searchPort } = createSource({ maxSearchRequestsPerSweep: 3 });

    const { error } = await driveSweep(source, AREA);

    expect(searchPort.calls).toBe(3);
    expect(error).toBeInstanceOf(SweepBudgetExhaustedError);
  });

  it('el error del 4º ciclo lleva un resumeCursor que reanuda exactamente en la petición 4, sin invocar el puerto una 4ª vez', async () => {
    const { source, searchPort } = createSource({ maxSearchRequestsPerSweep: 3 });

    const { error } = await driveSweep(source, AREA);

    expect(error).toBeInstanceOf(SweepBudgetExhaustedError);
    if (error instanceof SweepBudgetExhaustedError) {
      expect(error.resumeCursor).toBe('homes:4');
    }
    expect(searchPort.calls).toBe(3);
  });
});

describe('createIdealistaSource — cursor y reanudación (R-CURSOR, D7)', () => {
  it('reanudar en "premises:3" no emite peticiones para homes, offices ni premises páginas 1-2', async () => {
    const { source, searchPort } = createSource({ maxSearchRequestsPerSweep: 5 });

    await source.fetchArea(AREA, 'premises:3');

    expect(searchPort.calls).toBe(1);
  });

  it('un cursor malformado rechaza sin llamar a ningún puerto', async () => {
    const { source, searchPort } = createSource({ maxSearchRequestsPerSweep: 5 });

    await expect(source.fetchArea(AREA, 'garagess:1')).rejects.toThrow(InvalidCursorError);
    expect(searchPort.calls).toBe(0);
  });

  it('una segunda área distinta en la misma instancia lanza SweepAreaMismatchError', async () => {
    const { source } = createSource({ maxSearchRequestsPerSweep: 5 });

    await source.fetchArea(AREA);
    const otherArea: AreaQuery = { ...AREA, radiusMeters: 999 };

    await expect(source.fetchArea(otherArea)).rejects.toThrow(SweepAreaMismatchError);
  });

  it('la misma área repetida en la misma instancia NO lanza SweepAreaMismatchError', async () => {
    const { source, searchPort } = createSource({ maxSearchRequestsPerSweep: 5 });

    await source.fetchArea(AREA);
    await expect(source.fetchArea({ ...AREA }, 'homes:2')).resolves.toBeDefined();
    expect(searchPort.calls).toBe(2);
  });
});

describe('isSweepComplete — D7', () => {
  it('es true solo cuando nextCursor es undefined', () => {
    expect(isSweepComplete({ items: [] })).toBe(true);
    expect(isSweepComplete({ items: [], nextCursor: 'homes:2' })).toBe(false);
  });

  it('una página con items vacíos y nextCursor presente NO se lee como fin del barrido', () => {
    expect(isSweepComplete({ items: [], nextCursor: 'offices:1' })).toBe(false);
  });
});

describe('createIdealistaSource — total siempre omitido (A7)', () => {
  it('SourcePage nunca incluye la clave total', async () => {
    const { source } = createSource({ maxSearchRequestsPerSweep: 5 });
    const page = await source.fetchArea(AREA);
    expect(page).not.toHaveProperty('total');
  });
});
