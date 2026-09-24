// ROADMAP 1.13 (diseño DD-12) — ledger PERSISTENTE de presupuesto diario:
// UNA sentencia atómica de reserva (`INSERT ... ON CONFLICT ... DO UPDATE
// ... WHERE`), sin lectura-modificación-escritura entre procesos. Cero
// filas devueltas ⇒ el tope se habría superado ⇒ NINGUNA reserva, NINGUNA
// petición debe emitirse (A-9.1, fail-closed).
//
// Fail-closed (A-9.1) es ESTRUCTURAL, no una rama `catch` que decide
// permitir la petición: si la lectura/escritura del ledger falla, la
// promesa de `reserveDailyBudget` debe RECHAZAR, nunca resolver con un
// valor que un llamador pudiera confundir con "reserva concedida". Este
// primer bloque lo prueba contra Postgres real forzando un fallo genuino
// (una clave foránea inexistente) — no hay ninguna llamada de red real de
// ninguna fuente externa en este fichero.
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../src/db.js';
import { reconcileDailyBudget, reserveDailyBudget } from '../src/budget-ledger.js';
import type { LedgerState } from '../src/budget-ledger.js';
import { sources } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

async function insertBudgetSource(db: Database): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: `budget-source-${randomUUID()}`, name: 'Fuente de presupuesto', kind: 'api' })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

describeWithDb('reserveDailyBudget — fail-closed (A-9.1, DD-12)', () => {
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

  it('un ledger que falla al escribir (fuente inexistente, violación de clave foránea) RECHAZA — nunca resuelve como si hubiera reservado', async () => {
    const nonExistentSourceId = randomUUID();

    // drizzle-orm 0.45 envuelve el error real del driver `pg` en
    // `DrizzleQueryError`; el código de Postgres vive en `.cause`.
    await expect(
      reserveDailyBudget(db, nonExistentSourceId, { searchReserved: 1, tokenReserved: 0 }, 100)
    ).rejects.toMatchObject({ cause: { code: '23503' } }); // foreign_key_violation
  });
});

describeWithDb('reserveDailyBudget — acumula sobre la misma fila (day, source) y respeta el tope', () => {
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

  it('una segunda reserva bajo el tope SUMA sobre la primera, no la reemplaza', async () => {
    const sourceId = await insertBudgetSource(db);

    const first = await reserveDailyBudget(db, sourceId, { searchReserved: 2, tokenReserved: 1 }, 10);
    expect(first).toEqual({ searchRequests: 2, tokenRequests: 1 });

    const second = await reserveDailyBudget(db, sourceId, { searchReserved: 3, tokenReserved: 0 }, 10);
    expect(second).toEqual({ searchRequests: 5, tokenRequests: 1 });
  });

  it('una reserva que superaría el tope devuelve null y NO modifica la fila existente', async () => {
    const sourceId = await insertBudgetSource(db);

    await reserveDailyBudget(db, sourceId, { searchReserved: 8, tokenReserved: 0 }, 10);
    const blocked = await reserveDailyBudget(db, sourceId, { searchReserved: 5, tokenReserved: 0 }, 10); // 8+5=13>10
    expect(blocked).toBeNull();

    // Reservar 0 no cambia el total (0 <= tope siempre), así que sirve para
    // leer el estado real de la fila sin volver a escribir sobre ella.
    const stateAfter = await reserveDailyBudget(db, sourceId, { searchReserved: 0, tokenReserved: 0 }, 10);
    expect(stateAfter).toEqual({ searchRequests: 8, tokenRequests: 0 });
  });

  it('dos fuentes distintas tienen ledgers independientes — la reserva de una nunca consume el tope de la otra', async () => {
    const sourceA = await insertBudgetSource(db);
    const sourceB = await insertBudgetSource(db);

    await reserveDailyBudget(db, sourceA, { searchReserved: 9, tokenReserved: 0 }, 10);
    const forB = await reserveDailyBudget(db, sourceB, { searchReserved: 9, tokenReserved: 0 }, 10);

    expect(forB).toEqual({ searchRequests: 9, tokenRequests: 0 });
  });
});

// ROADMAP 1.13 (A-9.2) — "spend recorded before the request is issued". El
// mecanismo real de la Unit C (worker) no existe todavía en esta unidad; lo
// que se prueba aquí es el CONTRATO que Unit C debe seguir: un llamador que
// respeta el orden reserva → (solo si concedida) petición nunca emite una
// petición sin haber reservado antes, y nunca emite una petición cuando la
// reserva fue rechazada. `reserveDailyBudget` (6.7) ya es lo único que este
// contrato necesita — de ahí que 6.9 no añada implementación nueva.
describeWithDb('orden reserva-antes-de-petición (A-9.2) — contrato para Unit C', () => {
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

  it('la petición saliente SOLO se emite después de que la reserva resuelva con éxito, y nunca cuando el tope se supera', async () => {
    const sourceId = await insertBudgetSource(db);
    const calls: string[] = [];
    const issueRequest = (): void => {
      calls.push('issue-request');
    };

    async function reserveThenIssue(cap: number): Promise<LedgerState | null> {
      calls.push('reserve');
      const state = await reserveDailyBudget(db, sourceId, { searchReserved: 3, tokenReserved: 0 }, cap);
      if (state !== null) {
        issueRequest();
      }
      return state;
    }

    const granted = await reserveThenIssue(5); // primera reserva del día: 3 <= 5, sin conflicto
    expect(granted).not.toBeNull();
    expect(calls).toEqual(['reserve', 'issue-request']);

    calls.length = 0;
    const denied = await reserveThenIssue(5); // 3+3=6 > 5 -> null
    expect(denied).toBeNull();
    expect(calls).toEqual(['reserve']); // 'issue-request' NUNCA se añade
  });
});

describeWithDb('reconcileDailyBudget — resta la diferencia reservado-real (DD-12)', () => {
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

  it('cuando el gasto real fue MENOR que lo reservado, la diferencia se devuelve al ledger', async () => {
    const sourceId = await insertBudgetSource(db);

    await reserveDailyBudget(db, sourceId, { searchReserved: 10, tokenReserved: 1 }, 100);
    await reconcileDailyBudget(db, sourceId, { searchReserved: 10, tokenReserved: 1 }, { search: 4, token: 1 });

    const stateAfter = await reserveDailyBudget(db, sourceId, { searchReserved: 0, tokenReserved: 0 }, 100);
    expect(stateAfter).toEqual({ searchRequests: 4, tokenRequests: 1 });
  });

  it('cuando el gasto real IGUALA lo reservado, el ledger no cambia (no-op explícito, sin UPDATE)', async () => {
    const sourceId = await insertBudgetSource(db);

    await reserveDailyBudget(db, sourceId, { searchReserved: 6, tokenReserved: 1 }, 100);
    await reconcileDailyBudget(db, sourceId, { searchReserved: 6, tokenReserved: 1 }, { search: 6, token: 1 });

    const stateAfter = await reserveDailyBudget(db, sourceId, { searchReserved: 0, tokenReserved: 0 }, 100);
    expect(stateAfter).toEqual({ searchRequests: 6, tokenRequests: 1 });
  });
});

// ROADMAP 1.13 (corrección post-verificación orchestrator, work unit B) —
// GAP encontrado en verificación independiente: la sentencia original de
// DD-12 solo evalúa su `WHERE` en la rama `ON CONFLICT ... DO UPDATE`. La
// PRIMERA reserva del día para un (day, source) no tiene fila con la que
// entrar en conflicto, así que ese `INSERT` se ejecutaba SIN pasar por
// ninguna cláusula `WHERE` — una reserva mayor que el tope se concedía
// igual en el primer `INSERT` del día. Este bloque prueba el cierre de ese
// hueco: la primera reserva del día debe respetar el tope exactamente
// igual que cualquier reserva posterior.
describeWithDb('reserveDailyBudget — el tope se respeta también en la PRIMERA reserva del día', () => {
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

  it('la PRIMERA reserva del día (sin fila previa para (day, source)) por encima del tope devuelve null y NO inserta ninguna fila', async () => {
    const sourceId = await insertBudgetSource(db);

    const result = await reserveDailyBudget(db, sourceId, { searchReserved: 20, tokenReserved: 0 }, 10);
    expect(result).toBeNull();

    const rows = await db.execute<{ count: string }>(sql`select count(*)::text as count from daily_request_budget`);
    expect(rows.rows[0]?.count).toBe('0');
  });

  it('caso límite: la PRIMERA reserva del día IGUAL al tope tiene éxito (searchReserved == searchCap)', async () => {
    const sourceId = await insertBudgetSource(db);

    const result = await reserveDailyBudget(db, sourceId, { searchReserved: 10, tokenReserved: 0 }, 10);
    expect(result).toEqual({ searchRequests: 10, tokenRequests: 0 });
  });
});

// ROADMAP 1.13 (6.11, DD-12) — dos reservas concurrentes cerca del tope: la
// sentencia atómica de UPSERT serializa las dos escrituras a nivel de fila
// en Postgres, así que como mucho una de las dos debe superar el tope.
describeWithDb('reserveDailyBudget — dos reservas concurrentes cerca del tope (6.11)', () => {
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

  it('con tope 5 y dos reservas de 3 lanzadas a la vez, EXACTAMENTE una tiene éxito', async () => {
    const sourceId = await insertBudgetSource(db);

    const [resultA, resultB] = await Promise.all([
      reserveDailyBudget(db, sourceId, { searchReserved: 3, tokenReserved: 0 }, 5),
      reserveDailyBudget(db, sourceId, { searchReserved: 3, tokenReserved: 0 }, 5),
    ]);

    const grantedCount = [resultA, resultB].filter((result) => result !== null).length;
    expect(grantedCount).toBe(1);

    // El total final nunca debe superar el tope, sea cual sea el ganador de
    // la carrera.
    const finalState = await reserveDailyBudget(db, sourceId, { searchReserved: 0, tokenReserved: 0 }, 5);
    expect(finalState?.searchRequests).toBeLessThanOrEqual(5);
    expect(finalState?.searchRequests).toBe(3);
  });
});
