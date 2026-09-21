// ROADMAP 1.13 (diseño DD-11) — ÚNICA definición de "hoy" para todo el
// cambio: día natural UTC, nunca hora local (dos transiciones de DST al año
// darían un día de 23h o de 25h) ni ventana móvil de 24h (D6 exige poder
// anunciar una hora de reintento concreta; una ventana móvil solo puede
// responder "progresivamente"). El ledger de presupuesto
// (`budget-ledger.ts`, DD-12) y el contador de zonas nuevas del día (Unit D,
// `coverage.ts`, DD-14) consumen la MISMA función — nunca dos relojes
// distintos.
//
// Primer bloque: prueba PURA, sin base de datos — mismo patrón que
// `search/search.test.ts` (`createDb('postgres://toSQL-only/no-op')` +
// `.toSQL()`), confirma que el fragmento SQL es estable y determinista.
//
// Segundo bloque: "reloj inyectado" — dos filas con `requested_at`
// controlado explícitamente (una muy anterior a hoy, otra real) prueban que
// `utcDayStart()` las reparte en el cubo correcto, usando la tabla
// `coverage_jobs` que ya existe desde la Unit A (no depende de la
// migración 0009 de esta unidad, que aún no se ha aplicado en este punto
// del ciclo RED→GREEN).
import { gte } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb } from '../src/db.js';
import type { Database } from '../src/db.js';
import { coverageJobs, sources, zones } from '../src/tables.js';
import { utcDayStart } from '../src/time.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';
import { insertLocation } from './helpers/fixtures.js';

// `.toSQL()` no ejecuta nada contra la red — mismo patrón que
// `search/search.test.ts:16` y `blocking/blocking-plan.test.ts`.
const toSqlOnlyDb = createDb('postgres://toSQL-only/no-op').db;

describe('utcDayStart — fragmento SQL estable (DD-11)', () => {
  it("produce date_trunc('day', ...) en zona horaria UTC, nunca hora local", () => {
    const { sql } = toSqlOnlyDb.select({ start: utcDayStart() }).from(sources).toSQL();
    expect(sql).toMatch(/date_trunc\('day',\s*now\(\)\s*at time zone 'utc'\)/i);
  });

  it('dos llamadas independientes producen el mismo texto SQL — ninguna variación entre invocaciones', () => {
    const first = toSqlOnlyDb.select({ start: utcDayStart() }).from(sources).toSQL();
    const second = toSqlOnlyDb.select({ start: utcDayStart() }).from(sources).toSQL();
    expect(first.sql).toBe(second.sql);
  });
});

describeWithDb('utcDayStart — bajo reloj inyectado, dos escrituras cercanas al límite acuerdan el mismo día', () => {
  let db: Database;
  let pool: Pool;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('una fila con requested_at inyectado en el pasado NUNCA cuenta como de hoy; una fila con reloj real SIEMPRE cuenta', async () => {
    const locationId = await insertLocation(db);
    const [zone] = await db.insert(zones).values({ locationId }).returning({ id: zones.id });
    const [sourceOld] = await db
      .insert(sources)
      .values({ key: 'time-test-old', name: 'Fuente antigua', kind: 'api' })
      .returning({ id: sources.id });
    const [sourceNew] = await db
      .insert(sources)
      .values({ key: 'time-test-new', name: 'Fuente reciente', kind: 'api' })
      .returning({ id: sources.id });
    if (!zone || !sourceOld || !sourceNew) {
      throw new Error('No se pudieron insertar los datos de partida');
    }

    // Reloj inyectado: una fecha fija, muy anterior a cualquier límite de
    // día real — nunca depende de en qué instante se ejecute el test.
    await db.insert(coverageJobs).values({
      zoneId: zone.id,
      sourceId: sourceOld.id,
      requestedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    // Reloj real: `requestedAt` cae por defecto en `now()`, dentro del día
    // de hoy por construcción.
    await db.insert(coverageJobs).values({ zoneId: zone.id, sourceId: sourceNew.id });

    const rows = await db
      .select({ id: coverageJobs.id })
      .from(coverageJobs)
      .where(gte(coverageJobs.requestedAt, utcDayStart()));

    expect(rows).toHaveLength(1);
  });
});
