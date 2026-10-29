// ROADMAP 3.4 (decisión 259, D17) — adaptadores a PostgreSQL de los avisos: las fuentes de estado (jobs
// fallidos en la ventana y cuota mensual) y el almacén duradero de deduplicación (`alert_dispatch_log`). Solo
// `apps/ingestion` los usa, con la credencial de propietario.
import { purgeAlertDispatchLog, readAlertDispatchTimes, readMonthlyLedgerState, recordAlertDispatch } from '@buscahogar/db';
import type { AlertQuotaState } from '@buscahogar/core';
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';

import type { AlertingSources, AlertingStore } from './alerting.js';

export function createDbAlertingSources(db: Database, sourceId: string): AlertingSources {
  return {
    // Reloj de la base de datos, el mismo que fija `finished_at`: la ventana no depende del reloj del proceso.
    async countFailedJobs(windowMs: number): Promise<number> {
      const { rows } = await db.execute<{ failed: number }>(sql`
        select count(*)::int as failed from coverage_jobs
        where status = 'failed'
          and finished_at >= now() - (${windowMs}::bigint * interval '1 millisecond')
      `);
      return rows[0]?.failed ?? 0;
    },

    async readQuota(): Promise<AlertQuotaState | null> {
      const state = await readMonthlyLedgerState(db, sourceId);
      return state === null ? null : { totalCap: state.totalCap, searchRequests: state.searchRequests };
    },
  };
}

export function createDbAlertingStore(db: Database): AlertingStore {
  return {
    readTimes: (keys) => readAlertDispatchTimes(db, keys),
    record: (key, at) => recordAlertDispatch(db, key, at),
    purge: (olderThan) => purgeAlertDispatchLog(db, olderThan),
  };
}
