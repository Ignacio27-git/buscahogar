// ROADMAP 3.3 (decisión 253; D13) — puertos REALES del presweep (`run-presweep.ts`): el registro mensual y los
// candidatos salen de PostgreSQL (`packages/db`), y el barrido reutiliza SIN CAMBIOS `composeStore`, `runSweep` y
// `createIdealistaSource` (el mismo camino que `sweep-zone` y el worker, CR-2). Los puertos de red de Idealista
// llegan inyectados: el composition root pasa los HTTP reales y los tests, conectores falsos (cero red, NF1).
import type { MonthlyLedgerState } from '@buscahogar/core';
import {
  readMonthlyLedgerState,
  reconcileRequestBudget,
  reserveRequestBudget,
  resolveZoneGeometry,
  selectPresweepCandidates,
} from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

import {
  createIdealistaSource,
  createReusableTokenPort,
  IdealistaListingNormalizer,
  invalidateOnRejectedToken,
} from '../sources/idealista/index.js';
import { InvalidCursorError } from '../sources/idealista/errors.js';
import type { IdealistaSearchPort, IdealistaTokenPort } from '../sources/idealista/ports.js';
import { areaFingerprint, buildArea } from '../sweep/area.js';
import { composeStore } from '../sweep/compose-store.js';
import { JobAlreadyClaimedError } from '../sweep/coverage-store.js';
import { buildReport } from '../sweep/report.js';
import { runSweep } from '../sweep/sweep-runner.js';
import type { ClaimedJob } from '../sweep/store.js';
import type { PresweepCandidate, PresweepPorts, PresweepReservation, UnitSweepResult } from './run-presweep.js';

export interface RealPresweepDeps {
  readonly db: Database;
  // Resuelto UNA vez por el composition root (`resolveSourceUuid(db, 'idealista')`).
  readonly sourceUuid: string;
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
  readonly log: (line: string) => void;
}

// Cada unidad reserva el token que PODRÍA pedir (su fuente pide como mucho uno, budget.ts). Si lo reutiliza,
// `settle` lo devuelve con el gasto real 0 (decisión 272). Reservar 0 al tener un token vigente no sería seguro: la
// reconciliación solo reembolsa, así que un token pedido sin reservar (caducidad o 401 entre unidades) no quedaría
// anotado. La reserva de token no consume margen: el techo del carril solo mira las búsquedas.
const TOKEN_RESERVE = 1;

export function createRealPresweepPorts(deps: RealPresweepDeps): PresweepPorts {
  const store = composeStore(deps.db);
  // Decisión 272: UN token para toda la ejecución mientras no caduque; un 401 lo invalida para la unidad siguiente.
  const tokenPort = createReusableTokenPort(deps.tokenPort, { now: Date.now });
  const searchPort = invalidateOnRejectedToken(deps.searchPort, tokenPort);

  return {
    readLedger(): Promise<MonthlyLedgerState | null> {
      return readMonthlyLedgerState(deps.db, deps.sourceUuid);
    },

    async listCandidates(top: number): Promise<readonly PresweepCandidate[]> {
      const rows = await selectPresweepCandidates(deps.db, { sourceId: deps.sourceUuid, top });
      return rows.map((row) => ({
        id: row.ineCode,
        municipality: row.municipality,
        population: row.population,
        units: row.units,
      }));
    },

    // Carril batch: solo contra el mes (D7), concesión parcial (D6b). El recibo queda en la clausura de
    // `settle`, que devuelve al registro lo concedido y no gastado en el mes de la reserva.
    async reserve(requested: number): Promise<PresweepReservation> {
      const result = await reserveRequestBudget(deps.db, deps.sourceUuid, {
        lane: 'batch',
        searchRequested: requested,
        tokenReserved: TOKEN_RESERVE,
      });
      if (!result.granted) {
        return { granted: false, reason: result.reason === 'monthly-missing' ? 'monthly-missing' : 'monthly' };
      }
      return {
        granted: true,
        searchGranted: result.searchGranted,
        settle: (actual) => reconcileRequestBudget(deps.db, deps.sourceUuid, result, actual),
      };
    },

    async sweepUnit(unit, hardCap): Promise<UnitSweepResult> {
      const geometry = await resolveZoneGeometry(deps.db, unit.cityId);
      if (geometry === null || geometry.centroid === null || geometry.sweepRadiusM === null) {
        // El candidato exige centroide y radio; solo un cambio entre la consulta y el barrido llega aquí.
        return { kind: 'not-claimed', reason: `la zona "${unit.cityId}" ya no tiene geometría barrible (DD-5).` };
      }
      const area = buildArea({
        zone: geometry.ineCode,
        center: geometry.centroid,
        radiusMeters: geometry.sweepRadiusM,
        operation: unit.operation,
        maxSearchRequestsPerSweep: hardCap,
      });
      const fingerprint = areaFingerprint(area);

      // Reclamo ANTES de cualquier petición, con la marca de presweep (D11): si falla, `runSweep` ni se invoca.
      let job: ClaimedJob;
      try {
        job = await store.claimJob(geometry.zoneId, deps.sourceUuid, unit.operation, fingerprint, { presweep: 'mark' });
      } catch (error) {
        if (error instanceof JobAlreadyClaimedError || error instanceof InvalidCursorError) {
          return { kind: 'not-claimed', reason: error.message };
        }
        throw error;
      }

      const acquisitionsBefore = tokenPort.acquisitions();
      const source = createIdealistaSource({
        searchPort,
        tokenPort,
        // Tope duro del barrido = lo concedido por el registro mensual (R4).
        maxSearchRequestsPerSweep: hardCap,
      });
      const result = await runSweep({
        source,
        normalizer: new IdealistaListingNormalizer(),
        store,
        area,
        job,
        sourceUuid: deps.sourceUuid,
        fingerprint,
      });

      // Mismo informe que `sweep-zone` y el worker: evidencia de qué área se barrió y con qué resultado.
      deps.log(
        JSON.stringify(
          buildReport({
            area,
            outcome: result.outcome,
            inserted: result.inserted,
            versioned: result.versioned,
            unchanged: result.unchanged,
            rejectedCount: result.rejectedCount,
            resumeCursor: result.resumeCursor,
            error: result.error,
            requestsSpent: source.diagnostics().budget.search,
          })
        )
      );

      // Token: las llamadas REALES de esta unidad, no las adquisiciones que pidió la fuente (decisión 272).
      return {
        kind: 'swept',
        outcome: result.outcome,
        actual: { search: source.diagnostics().budget.search, token: tokenPort.acquisitions() - acquisitionsBefore },
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    },

    log: deps.log,
  };
}
