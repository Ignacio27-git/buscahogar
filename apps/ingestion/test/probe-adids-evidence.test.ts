// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105, U2/U3) — interpretación
// PURA de las respuestas de la sonda de `adIds` y construcción de la meta de la
// fixture. `delistedIdBehaviour` es lo que, una vez revisado por una persona,
// autoriza cambiar `DELISTED_OMISSION_CONFIRMED` (presence-evidence.ts).
import { describe, expect, it } from 'vitest';

import {
  buildAdIdsProbeMeta,
  classifyDelistedIdBehaviour,
  classifyPropertyTypeConstraint,
  describeProbeOutcome,
} from '../scripts/probe/adids-evidence.js';
import type { ProbeSearchOutcome } from '../scripts/probe/adids-evidence.js';
import { omissionConfirmedByFixtureMeta } from '../src/sources/idealista/presence-evidence.js';

const LIVE = '111741132';
const DELISTED = '99999999';

function ok(ids: readonly string[], overrides: Record<string, unknown> = {}): ProbeSearchOutcome {
  return {
    kind: 'ok',
    status: 200,
    body: {
      elementList: ids.map((propertyCode) => ({ propertyCode })),
      totalPages: 1,
      actualPage: 1,
      itemsPerPage: 50,
      ...overrides,
    },
  };
}

const FAILED: ProbeSearchOutcome = { kind: 'failed', status: 500 };

describe('classifyDelistedIdBehaviour', () => {
  it("'omitted': el id vivo solo se devuelve y, junto al dado de baja, solo vuelve el vivo", () => {
    const behaviour = classifyDelistedIdBehaviour({
      liveAlone: ok([LIVE]),
      liveAndDelisted: ok([LIVE]),
      liveId: LIVE,
      delistedId: DELISTED,
    });

    expect(behaviour).toBe('omitted');
  });

  it("'other': el id dado de baja SÍ aparece en la respuesta (la API no lo omite)", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: ok([LIVE, DELISTED]),
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it("'other': la lista con dos ids no se respetó (el vivo no vuelve): no se puede afirmar omisión", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: ok([]),
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it("'other': adIds no se respeta ni para el id vivo solo (devuelve ids ajenos)", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE, '555']),
        liveAndDelisted: ok([LIVE]),
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it("'other': el id vivo solo no vuelve (¿el id ya no está vivo o el filtro no lo cubre?)", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([]),
        liveAndDelisted: ok([]),
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it("'other': un id ajeno en la respuesta combinada invalida la conclusión", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: ok([LIVE, '555']),
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it("'other': totalPages > 1 o envelope inválido no son evidencia", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: ok([LIVE], { totalPages: 3 }),
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: { kind: 'ok', status: 200, body: { nada: true } },
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it("'error': la petición combinada falló (HTTP de error, red o cuerpo no JSON)", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: FAILED,
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('error');
  });

  it("una petición omitida ('skipped') nunca produce 'omitted'", () => {
    expect(
      classifyDelistedIdBehaviour({
        liveAlone: ok([LIVE]),
        liveAndDelisted: { kind: 'skipped' },
        liveId: LIVE,
        delistedId: DELISTED,
      })
    ).toBe('other');
  });

  it('un propertyCode numérico casa con el id en texto', () => {
    const numeric: ProbeSearchOutcome = {
      kind: 'ok',
      status: 200,
      body: { elementList: [{ propertyCode: Number(LIVE) }], totalPages: 1, actualPage: 1, itemsPerPage: 50 },
    };

    expect(
      classifyDelistedIdBehaviour({ liveAlone: numeric, liveAndDelisted: numeric, liveId: LIVE, delistedId: DELISTED })
    ).toBe('omitted');
  });
});

describe('classifyPropertyTypeConstraint', () => {
  it('el id vivo vuelve bajo OTRO filtro -> propertyType NO restringe adIds (false)', () => {
    expect(classifyPropertyTypeConstraint(ok([LIVE]), LIVE)).toBe(false);
  });

  it('respuesta fiable sin el id vivo bajo otro filtro -> propertyType SÍ restringe (true)', () => {
    expect(classifyPropertyTypeConstraint(ok([]), LIVE)).toBe(true);
  });

  it("fallo, omitida o envelope inválido -> 'unknown'", () => {
    expect(classifyPropertyTypeConstraint(FAILED, LIVE)).toBe('unknown');
    expect(classifyPropertyTypeConstraint({ kind: 'skipped' }, LIVE)).toBe('unknown');
    expect(classifyPropertyTypeConstraint({ kind: 'ok', status: 200, body: {} }, LIVE)).toBe('unknown');
  });
});

describe('describeProbeOutcome', () => {
  it('resume cada desenlace sin volcar el cuerpo', () => {
    expect(describeProbeOutcome(ok([LIVE]))).toEqual({ outcome: 'ok', httpStatus: 200, returnedIds: [LIVE] });
    expect(describeProbeOutcome(FAILED)).toEqual({ outcome: 'failed', httpStatus: 500, returnedIds: null });
    expect(describeProbeOutcome({ kind: 'skipped' })).toEqual({ outcome: 'skipped', httpStatus: null, returnedIds: null });
  });
});

describe('buildAdIdsProbeMeta — la meta que lee presence-evidence.ts', () => {
  const base = {
    timestamp: '2026-10-05T10:00:00.000Z',
    counters: { token: 1, search: 3 },
    requests: [],
    liveId: LIVE,
    delistedId: DELISTED,
  };

  it("con omisión demostrada la meta dice 'omitted' y omissionConfirmedByFixtureMeta la acepta", () => {
    const meta = buildAdIdsProbeMeta({
      ...base,
      outcomes: { liveAlone: ok([LIVE]), liveAndDelisted: ok([LIVE]), liveOtherFilter: ok([LIVE]) },
    });

    expect(meta.delistedIdBehaviour).toBe('omitted');
    expect(meta.propertyTypeConstrainsAdIds).toBe(false);
    expect(meta.adIdsListEncoding).toBe('comma-separated');
    expect(meta.adIdsListHonoured).toBe(true);
    expect(meta.searchQuotaImpact).toBe('billable');
    expect(omissionConfirmedByFixtureMeta(meta)).toBe(true);
  });

  it("si el dado de baja aparece, la meta dice 'other' y la omisión NO se confirma", () => {
    const meta = buildAdIdsProbeMeta({
      ...base,
      outcomes: { liveAlone: ok([LIVE]), liveAndDelisted: ok([LIVE, DELISTED]), liveOtherFilter: ok([]) },
    });

    expect(meta.delistedIdBehaviour).toBe('other');
    expect(meta.propertyTypeConstrainsAdIds).toBe(true);
    expect(omissionConfirmedByFixtureMeta(meta)).toBe(false);
  });

  it("si la petición combinada falla, 'error'; la lista con dos ids no se da por respetada", () => {
    const meta = buildAdIdsProbeMeta({
      ...base,
      outcomes: { liveAlone: ok([LIVE]), liveAndDelisted: FAILED, liveOtherFilter: { kind: 'skipped' } },
    });

    expect(meta.delistedIdBehaviour).toBe('error');
    expect(meta.adIdsListHonoured).toBe(false);
    expect(meta.propertyTypeConstrainsAdIds).toBe('unknown');
    expect(omissionConfirmedByFixtureMeta(meta)).toBe(false);
  });
});
