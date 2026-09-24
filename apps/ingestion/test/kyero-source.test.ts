// Paso 1.14 — createKyeroSource: forma del contrato (spec
// "PropertySource<KyeroProperty> Conformance"), un único fetch por
// instancia (D1/D12), cursor (D11), área ligada (mismo patrón que
// Idealista) y tope de páginas (D12). RED inicial: el módulo no existe
// todavía. FeedFetcher falso — sin red, mismo patrón que
// createCountingSearchPort de idealista-source-cap.test.ts.
import { describe, expect, it } from 'vitest';

import type { AreaQuery, SourcePage } from '@buscahogar/core';

import { createKyeroSource, type FeedFetcher, type KyeroSourceOptions } from '../src/sources/kyero/kyero-source.js';
import { KyeroAreaMismatchError, KyeroInvalidCursorError, KyeroPageCapExceededError } from '../src/sources/kyero/errors.js';
import type { KyeroProperty } from '../src/sources/kyero/raw-property.schema.js';

const CENTER = { latitude: 36.5298, longitude: -4.6499 };
const AREA: AreaQuery = { center: CENTER, radiusMeters: 1000, operation: 'sale' };

function propertyXml(id: number): string {
  return `
    <property>
      <id>${String(id)}</id>
      <price>100000</price>
      <currency>EUR</currency>
      <price_freq>sale</price_freq>
      <type>flat</type>
      <location><latitude>${String(CENTER.latitude)}</latitude><longitude>${String(CENTER.longitude)}</longitude></location>
      <url>https://example-kyero.test/${String(id)}</url>
    </property>`;
}

function buildFeedXml(count: number): string {
  const properties = Array.from({ length: count }, (_, index) => propertyXml(1000 + index)).join('\n');
  return `<kyero>${properties}</kyero>`;
}

function createCountingFetcher(xml: string): FeedFetcher & { readonly calls: number } {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    fetchFeed(): Promise<string> {
      state.calls += 1;
      return Promise.resolve(xml);
    },
  };
}

function createSource(
  xml: string,
  overrides: Partial<Omit<KyeroSourceOptions, 'fetcher'>> = {}
): { readonly source: ReturnType<typeof createKyeroSource>; readonly fetcher: FeedFetcher & { readonly calls: number } } {
  const fetcher = createCountingFetcher(xml);
  const source = createKyeroSource({ ...overrides, fetcher });
  return { source, fetcher };
}

// Recorre nextCursor hasta que se agota o lanza — mismo patrón que
// driveSweep de idealista-source-cap.test.ts.
async function driveSweep(
  source: ReturnType<typeof createKyeroSource>,
  area: AreaQuery
): Promise<{ readonly pages: SourcePage<KyeroProperty>[]; readonly error?: unknown }> {
  const pages: SourcePage<KyeroProperty>[] = [];
  let cursor: string | undefined;
  try {
    for (;;) {
      const page = await source.fetchArea(area, cursor);
      pages.push(page);
      if (page.nextCursor === undefined) break;
      cursor = page.nextCursor;
    }
    return { pages };
  } catch (error) {
    return { pages, error };
  }
}

describe('createKyeroSource — forma del contrato (spec "PropertySource<KyeroProperty> Conformance")', () => {
  it('id es "kyero" (string) y fetchArea resuelve un SourcePage', async () => {
    const { source } = createSource(buildFeedXml(1));
    expect(source.id).toBe('kyero');
    const page = await source.fetchArea(AREA);
    expect(Array.isArray(page.items)).toBe(true);
  });
});

describe('createKyeroSource — un único fetch por instancia, incluso con paginado (D1/D12)', () => {
  it('un barrido completo (12 elementos, pageSize 5) llama a fetchFeed exactamente una vez', async () => {
    const { source, fetcher } = createSource(buildFeedXml(12), { pageSize: 5 });

    const { pages, error } = await driveSweep(source, AREA);

    expect(error).toBeUndefined();
    expect(fetcher.calls).toBe(1);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.items).toHaveLength(5);
    expect(pages[1]?.items).toHaveLength(5);
    expect(pages[2]?.items).toHaveLength(2);
  });

  it('nextCursor se omite en la última página; total refleja el conjunto filtrado completo (D11, a diferencia de Idealista A7)', async () => {
    const { source } = createSource(buildFeedXml(3), { pageSize: 5 });
    const page = await source.fetchArea(AREA);
    expect(page.nextCursor).toBeUndefined();
    expect(page.total).toBe(3);
  });
});

describe('createKyeroSource — cursor (D11)', () => {
  it('un cursor malformado (no numérico) rechaza', async () => {
    const { source } = createSource(buildFeedXml(5), { pageSize: 5 });
    await expect(source.fetchArea(AREA, 'no-es-un-numero')).rejects.toThrow(KyeroInvalidCursorError);
  });

  it('un cursor que no es múltiplo del tamaño de página rechaza, nunca cae en la página 0', async () => {
    const { source } = createSource(buildFeedXml(10), { pageSize: 5 });
    await expect(source.fetchArea(AREA, '3')).rejects.toThrow(KyeroInvalidCursorError);
  });

  it('un cursor fuera de rango (ajeno a esta consulta) rechaza', async () => {
    const { source } = createSource(buildFeedXml(5), { pageSize: 5 });
    await expect(source.fetchArea(AREA, '500')).rejects.toThrow(KyeroInvalidCursorError);
  });

  it('reanudar en un cursor válido devuelve exactamente esa página (ordenada por id)', async () => {
    const { source } = createSource(buildFeedXml(12), { pageSize: 5 });
    const page = await source.fetchArea(AREA, '5');
    expect(page.items).toHaveLength(5);
    expect(page.items[0]?.id).toBe('1005');
  });
});

describe('createKyeroSource — área ligada a la instancia (mismo patrón que SweepAreaMismatchError de Idealista)', () => {
  it('una segunda área distinta en la misma instancia lanza KyeroAreaMismatchError', async () => {
    const { source } = createSource(buildFeedXml(3));
    await source.fetchArea(AREA);
    const otherArea: AreaQuery = { ...AREA, radiusMeters: 999 };
    await expect(source.fetchArea(otherArea)).rejects.toThrow(KyeroAreaMismatchError);
  });

  it('la misma área repetida en la misma instancia NO lanza', async () => {
    const { source, fetcher } = createSource(buildFeedXml(3));
    await source.fetchArea(AREA);
    await expect(source.fetchArea({ ...AREA })).resolves.toBeDefined();
    expect(fetcher.calls).toBe(1);
  });
});

describe('createKyeroSource — tope de páginas por barrido (D12)', () => {
  it('con maxPagesPerSweep:1, la segunda página rechaza con un resumeCursor que reanuda exactamente ahí', async () => {
    const { source } = createSource(buildFeedXml(10), { pageSize: 5, maxPagesPerSweep: 1 });

    const { pages, error } = await driveSweep(source, AREA);

    expect(pages).toHaveLength(1);
    expect(error).toBeInstanceOf(KyeroPageCapExceededError);
    if (error instanceof KyeroPageCapExceededError) {
      expect(error.resumeCursor).toBe('5');
    }
  });
});
