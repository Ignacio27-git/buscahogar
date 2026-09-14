// Paso 1.6 — createIdealistaSource: implementa PropertySource<IdealistaElement>
// (diseño, "Data flow"). Shell de orquestación — sin bucles (D6, ver
// eslint.config.mjs), sin lógica de negocio propia: cada decisión no
// trivial delega en un módulo puro ya testeado por separado.
//
// Orden por llamada a fetchArea: bindArea → decodeCursor [pure] → token
// (adquirido una vez por barrido, cacheado) → budget.spend('search', ctx)
// SIEMPRE antes de la petición (D6, "contar siempre antes de enviar") →
// buildSearchFields [pure] → http-client (el único fetch) → no-2xx lanza
// SweepTransportError con la MISMA página como resumeCursor → planNext
// [pure] decide nextCursor o lanza UntrustworthyEnvelopeError → per-element
// rawElementSchema separa items de rejectedElements (D3).
import type { AreaQuery, PropertySource, SourcePage } from '@buscahogar/core';

import { createSweepBudget, type BudgetSnapshot } from './budget.js';
import { decodeCursor, encodeCursor, type SweepPosition } from './cursor.js';
import { SweepAreaMismatchError, SweepTransportError } from './errors.js';
import { IDEALISTA_FILTERS } from './filters.js';
import { describeMapping } from './property-type-map.js';
import { rawElementSchema, type IdealistaElement } from './raw-element.schema.js';
import { buildSearchFields } from './search-request.js';
import { scrubCredentials } from './scrub-credentials.js';
import { planNext } from './sweep-planner.js';
import type { IdealistaSearchPort, IdealistaTokenPort, SweepLogger } from './ports.js';

export interface IdealistaSourceOptions {
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
  readonly logger?: SweepLogger;
  readonly maxSearchRequestsPerSweep?: number;
  readonly maxItemsPerPage?: number;
}

export interface SweepDiagnostics {
  readonly budget: BudgetSnapshot;
  readonly rejectedElements: readonly unknown[];
  readonly unmappedPropertyTypes: readonly string[];
}

export interface IdealistaSource extends PropertySource<IdealistaElement> {
  diagnostics(): SweepDiagnostics;
}

const DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP = 10;
const DEFAULT_MAX_ITEMS_PER_PAGE = 50;
const FIRST_FILTER = IDEALISTA_FILTERS[0];
const START_POSITION: SweepPosition = { filter: FIRST_FILTER, page: 1 };

// Extracción defensiva y ligera (nunca lanza): SOLO se usa para calcular
// `elementListLength` antes de invocar planNext, que es quien hace la
// validación completa del esquema y decide si el envelope es fiable (D3
// caveat: elementListLength nunca se deriva de `items`, y aquí tampoco se
// deriva de nada post-filtrado). Si el envelope resulta inválido, el valor
// exacto de esta extracción es irrelevante: planNext lanzará de todos modos.
function extractElementList(body: unknown): readonly unknown[] {
  if (typeof body === 'object' && body !== null && 'elementList' in body) {
    const value = (body as { elementList?: unknown }).elementList;
    if (Array.isArray(value)) return value;
  }
  return [];
}

function areasMatch(a: AreaQuery, b: AreaQuery): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// D7: caída del predicado, no un comentario — items vacíos con nextCursor
// presente es NORMAL (un filtro sin resultados en el área) y D3 añade una
// segunda razón por la que una página puede ser corta. Solo nextCursor
// ausente significa barrido completo.
export function isSweepComplete(page: SourcePage<IdealistaElement>): boolean {
  return page.nextCursor === undefined;
}

export function createIdealistaSource(options: IdealistaSourceOptions): IdealistaSource {
  const maxSearchRequestsPerSweep = options.maxSearchRequestsPerSweep ?? DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP;
  const maxItemsPerPage = options.maxItemsPerPage ?? DEFAULT_MAX_ITEMS_PER_PAGE;
  const budget = createSweepBudget(maxSearchRequestsPerSweep);

  let boundArea: AreaQuery | undefined;
  let cachedToken: string | undefined;
  const rejectedElements: unknown[] = [];
  const unmappedPropertyTypes = new Set<string>();

  async function ensureToken(position: SweepPosition): Promise<string> {
    if (cachedToken !== undefined) return cachedToken;

    // Contar SIEMPRE antes de enviar (D6, mismo principio que
    // scripts/probe/ledger.ts del paso 1.5).
    budget.spend('token', { resumeCursor: encodeCursor(position) });
    const outcome = await options.tokenPort.acquire();

    if (outcome.kind !== 'ok') {
      throw new SweepTransportError(
        outcome.kind,
        encodeCursor(position),
        outcome.kind === 'network-error' ? outcome.message : outcome.bodyText.slice(0, 500)
      );
    }

    const body = outcome.body as { access_token?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new SweepTransportError(
        'unparseable',
        encodeCursor(position),
        'la respuesta de token no contiene un access_token no vacío.'
      );
    }

    cachedToken = body.access_token;
    return cachedToken;
  }

  return {
    id: 'idealista',

    async fetchArea(area: AreaQuery, cursor?: string): Promise<SourcePage<IdealistaElement>> {
      if (boundArea === undefined) {
        boundArea = area;
      } else if (!areasMatch(boundArea, area)) {
        throw new SweepAreaMismatchError(boundArea, area);
      }

      // decodeCursor es puro y rechaza ANTES de tocar ningún puerto —
      // incluido el de token, aunque ya estuviera cacheado.
      const position = cursor === undefined ? START_POSITION : decodeCursor(cursor);

      const token = await ensureToken(position);

      // Antes de la petición (D6): un intento fallido cuenta igual.
      budget.spend('search', { resumeCursor: encodeCursor(position) });

      const fields = buildSearchFields(area, position.filter, position.page, maxItemsPerPage);
      const outcome = await options.searchPort.search(fields, token);

      if (outcome.kind !== 'ok') {
        const observation =
          outcome.kind === 'network-error'
            ? outcome.message
            : scrubCredentials(outcome.bodyText.slice(0, 500), { apiKey: '', apiSecret: '', accessToken: token });
        options.logger?.warn({
          status: outcome.kind === 'network-error' ? 0 : outcome.status,
          headers: outcome.kind === 'network-error' ? {} : outcome.headers,
          bodyExcerpt: observation,
        });
        throw new SweepTransportError(
          outcome.kind,
          encodeCursor(position),
          observation,
          outcome.kind === 'network-error' ? undefined : outcome.status
        );
      }

      const elementList = extractElementList(outcome.body);
      // planNext valida el envelope completo (rawEnvelopeSchema) y decide
      // el siguiente cursor, o lanza UntrustworthyEnvelopeError con
      // resumeCursor = la MISMA página (Reconciliación #1).
      const planResult = planNext(position, outcome.body, elementList.length);

      // `.forEach`, no un `for...of`: el ban de bucles de este fichero
      // (D6, eslint.config.mjs) es una regla AST sobre construcciones de
      // bucle, no sobre la iteración en sí — este recorrido no emite
      // ninguna petición, procesa datos ya recibidos en memoria.
      const items: IdealistaElement[] = [];
      elementList.forEach((rawItem) => {
        const parsed = rawElementSchema.safeParse(rawItem);
        if (parsed.success) {
          items.push(parsed.data);
          const mapping = describeMapping(parsed.data.propertyType);
          if (!mapping.recognised) unmappedPropertyTypes.add(parsed.data.propertyType);
        } else {
          // D3: no se lanza ni se descarta en silencio — se conserva el
          // objeto crudo para diagnostics(), nada pagado se destruye.
          rejectedElements.push(rawItem);
        }
      });

      // A7: total SIEMPRE omitido, nunca una suma ni el total de un único
      // filtro presentado como total del barrido.
      return planResult.nextCursor === undefined ? { items } : { items, nextCursor: planResult.nextCursor };
    },

    diagnostics(): SweepDiagnostics {
      return {
        budget: budget.snapshot(),
        rejectedElements: [...rejectedElements],
        unmappedPropertyTypes: [...unmappedPropertyTypes],
      };
    },
  };
}
