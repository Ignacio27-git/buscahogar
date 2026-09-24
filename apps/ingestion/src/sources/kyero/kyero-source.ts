// Paso 1.14 — createKyeroSource: implementa PropertySource<KyeroProperty>
// (diseño, "Data flow"). Shell de orquestación — sin bucles (D14, ver
// eslint.config.mjs), sin lógica de negocio propia: cada decisión no
// trivial delega en un módulo puro ya testeado por separado.
//
// Orden por llamada a fetchArea: bindArea (mismatch lanza) -> feed ??=
// fetcher.fetchFeed() (memoizado, D12: una sola llamada por instancia,
// pase lo que pase con el paginado) -> parseFeed [P] -> por-elemento
// safeParse [P] (rechazados se cuentan, D6) -> isEligible [P] (moneda,
// coordenadas, operación, radio — D7/D8/D9/D10, contados) -> orden por id
// -> decodeCursor [P] (formato + rango contra la longitud YA filtrada) ->
// tope de páginas (D12) -> slice -> SourcePage<KyeroProperty>.
import type { AreaQuery, PropertySource, SourcePage } from '@buscahogar/core';

import { isEligible } from './area-filter.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { KyeroAreaMismatchError, KyeroPageCapExceededError } from './errors.js';
import { describeMapping } from './property-type-map.js';
import { parseFeed } from './feed-parser.js';
import { rawPropertySchema, type KyeroProperty } from './raw-property.schema.js';

// Puerto inyectado (D1): el ÚNICO camino a la red del adaptador. Este
// fichero nunca llama a `fetch` — eso vive exclusivamente en
// http-feed-fetcher.ts, tal como IdealistaSearchPort/IdealistaTokenPort en
// apps/ingestion/src/sources/idealista/ports.ts. Definido aquí (sin un
// ports.ts propio, a diferencia de Idealista) porque Kyero solo tiene un
// puerto de una sola operación — mantener el fichero adicional no aportaba
// nada con un único miembro.
export interface FeedFetcher {
  fetchFeed(): Promise<string>;
}

export interface KyeroSourceOptions {
  readonly fetcher: FeedFetcher;
  readonly pageSize?: number;
  readonly maxPagesPerSweep?: number;
}

export interface KyeroSourceDiagnostics {
  readonly pagesServed: number;
  readonly rejectedElements: readonly unknown[];
  readonly unmappedPropertyTypes: readonly string[];
}

export interface KyeroSource extends PropertySource<KyeroProperty> {
  diagnostics(): KyeroSourceDiagnostics;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES_PER_SWEEP = 40;

function areasMatch(a: AreaQuery, b: AreaQuery): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareById(a: KyeroProperty, b: KyeroProperty): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function createKyeroSource(options: KyeroSourceOptions): KyeroSource {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPagesPerSweep = options.maxPagesPerSweep ?? DEFAULT_MAX_PAGES_PER_SWEEP;

  let boundArea: AreaQuery | undefined;
  let feedPromise: Promise<string> | undefined;
  let pagesServed = 0;
  const rejectedElements: unknown[] = [];
  const unmappedPropertyTypes = new Set<string>();

  // D12: el dump completo se pide como mucho una vez por instancia,
  // memoizado en esta promesa — pase lo que pase con cuántas páginas se
  // sirvan después. D3/D6/D8/D9/D10 aplicados aquí, en orden.
  async function loadEligible(area: AreaQuery): Promise<KyeroProperty[]> {
    feedPromise ??= options.fetcher.fetchFeed();
    const xml = await feedPromise;
    const rawItems = parseFeed(xml);

    const eligible: KyeroProperty[] = [];
    rawItems.forEach((rawItem) => {
      const parsed = rawPropertySchema.safeParse(rawItem);
      if (!parsed.success) {
        // D6: se conserva el objeto crudo para diagnostics(), nunca se
        // descarta en silencio ni aborta el resto del feed.
        rejectedElements.push(rawItem);
        return;
      }
      const mapping = describeMapping(parsed.data.type);
      if (!mapping.recognised) unmappedPropertyTypes.add(parsed.data.type);
      if (isEligible(parsed.data, area)) eligible.push(parsed.data);
    });

    // D11: el cursor es un offset sobre este orden — sort() es una llamada
    // a método, no una sentencia de bucle, así que no viola D14.
    return eligible.sort(compareById);
  }

  return {
    id: 'kyero',

    async fetchArea(area: AreaQuery, cursor?: string): Promise<SourcePage<KyeroProperty>> {
      if (boundArea === undefined) {
        boundArea = area;
      } else if (!areasMatch(boundArea, area)) {
        throw new KyeroAreaMismatchError(boundArea, area);
      }

      const eligible = await loadEligible(area);
      const offset = cursor === undefined ? 0 : decodeCursor(cursor, pageSize, eligible.length);

      // D12: tope duro, comprobado ANTES de servir la página — mismo
      // principio "contar siempre antes de enviar" que budget.ts de
      // Idealista, adaptado a un recurso en memoria en vez de una cuota de
      // red.
      const pageNumber = offset / pageSize + 1;
      if (pageNumber > maxPagesPerSweep) {
        throw new KyeroPageCapExceededError(encodeCursor(offset));
      }
      pagesServed += 1;

      const items = eligible.slice(offset, offset + pageSize);
      const nextOffset = offset + pageSize;
      const nextCursor = nextOffset < eligible.length ? encodeCursor(nextOffset) : undefined;

      // D11: total SIEMPRE presente (a diferencia de Idealista A7) — el
      // dump completo ya está en memoria, así que el total del conjunto
      // filtrado es un hecho conocido, no una estimación.
      return nextCursor === undefined
        ? { items, total: eligible.length }
        : { items, nextCursor, total: eligible.length };
    },

    diagnostics(): KyeroSourceDiagnostics {
      return {
        pagesServed,
        rejectedElements: [...rejectedElements],
        unmappedPropertyTypes: [...unmappedPropertyTypes],
      };
    },
  };
}
