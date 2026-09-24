// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage
// Limit...", diseño decisión 076/077, obs #262) — consumeClientQuota
// probado contra PostgreSQL real: UPSERT atómico de una sola sentencia
// (decisión 077, mismo idioma que `reserveDailyBudget`/DD-12), purga de la
// ventana cerrada como parte del propio camino de escritura (decisión 076),
// y concurrencia real con Promise.all (mismo patrón que
// budget-ledger.test.ts, 6.11).
//
// "stored key is HMAC hex never raw identity" (spec #261, requisito "Per-
// Client Coverage Limit...") se demuestra en ESTE nivel comprobando que
// packages/db almacena `key_hash` de forma completamente OPACA — exactamente
// el valor recibido, sin transformarlo ni derivarlo de nuevo. El cómputo
// real del HMAC (`node:crypto`, `apps/web/src/server/client-identity.ts`)
// vive en PR2 y se prueba por separado (`client-identity.test.ts`):
// `packages/db` es Zod-free (decisión 023) Y crypto-free por el mismo
// principio — solo recibe ya-resuelto el hash, jamás la IP cruda.
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../../src/db.js';
import { consumeClientQuota, purgeExpiredClientQuota } from '../../src/client-quota.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/docker-gate.js';

// Hex de 64 caracteres — misma FORMA que un HMAC-SHA256 real
// (apps/web/src/server/client-identity.ts, PR2), nunca una IP.
function fakeKeyHash(): string {
  return randomBytes(32).toString('hex');
}

describeWithDb('consumeClientQuota — permite hasta el tope y lo respeta (spec #261, decisión 077)', () => {
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

  it('las primeras N consumiciones hasta el tope se permiten, la N+1 se rechaza', async () => {
    const keyHash = fakeKeyHash();

    const first = await consumeClientQuota(db, keyHash, 3);
    const second = await consumeClientQuota(db, keyHash, 3);
    const third = await consumeClientQuota(db, keyHash, 3);
    const fourth = await consumeClientQuota(db, keyHash, 3);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(third).toBe(true);
    expect(fourth).toBe(false);
  });

  it('un cliente en su tope NO consume la fila — el rechazo no incrementa el contador', async () => {
    const keyHash = fakeKeyHash();
    await consumeClientQuota(db, keyHash, 1);

    await consumeClientQuota(db, keyHash, 1); // rechazada

    const rows = await db.execute<{ registrations: number }>(
      sql`select registrations from coverage_client_quota where key_hash = ${keyHash}`
    );
    expect(rows.rows[0]?.registrations).toBe(1);
  });

  it('dos claves distintas tienen cuotas independientes — consumir una nunca afecta a la otra', async () => {
    const keyA = fakeKeyHash();
    const keyB = fakeKeyHash();
    await consumeClientQuota(db, keyA, 1);

    const forB = await consumeClientQuota(db, keyB, 1);

    expect(forB).toBe(true);
  });

  it('el key_hash almacenado es EXACTAMENTE el valor recibido — opaco, nunca reinterpretado (spec #261)', async () => {
    const keyHash = fakeKeyHash();
    await consumeClientQuota(db, keyHash, 5);

    const rows = await db.execute<{ key_hash: string }>(
      sql`select key_hash from coverage_client_quota where key_hash = ${keyHash}`
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.key_hash).toBe(keyHash);
    expect(rows.rows[0]?.key_hash).not.toBe('203.0.113.5'); // nunca una IP de ejemplo
  });
});

describeWithDb('consumeClientQuota — un día nuevo abre una ventana fresca (spec #261)', () => {
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

  it('una fila sembrada para AYER en el tope no bloquea el registro de HOY — consumeClientQuota siempre escribe bajo el "hoy" real de Postgres', async () => {
    const keyHash = fakeKeyHash();
    // Siembra DIRECTA (bypass de consumeClientQuota, que jamás escribiría en
    // otro día que no sea "hoy"): simula que este cliente YA agotó su tope
    // AYER.
    await db.execute(sql`
      insert into coverage_client_quota (key_hash, day, registrations)
      values (${keyHash}, ((now() at time zone 'utc')::date - 1), 1)
    `);

    const today = await consumeClientQuota(db, keyHash, 1);

    expect(today).toBe(true);
  });
});

describeWithDb('consumeClientQuota — purga la ventana cerrada como parte del propio camino de escritura (decisión 076)', () => {
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

  it('una fila de un día ya cerrado desaparece tras la SIGUIENTE consumición de CUALQUIER cliente, no solo del mismo', async () => {
    const staleKey = fakeKeyHash();
    const otherKey = fakeKeyHash();
    await db.execute(sql`
      insert into coverage_client_quota (key_hash, day, registrations)
      values (${staleKey}, ((now() at time zone 'utc')::date - 2), 1)
    `);

    await consumeClientQuota(db, otherKey, 5); // cualquier escritura purga

    const stale = await db.execute<{ key_hash: string }>(
      sql`select key_hash from coverage_client_quota where key_hash = ${staleKey}`
    );
    expect(stale.rows).toHaveLength(0);
  });
});

describeWithDb('purgeExpiredClientQuota — reutilizable directamente (D9, purga programada de apps/ingestion)', () => {
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

  it('borra únicamente las filas con day < hoy, deja intactas las de hoy', async () => {
    const staleKey = fakeKeyHash();
    const todayKey = fakeKeyHash();
    await db.execute(sql`
      insert into coverage_client_quota (key_hash, day, registrations) values
        (${staleKey}, ((now() at time zone 'utc')::date - 1), 1),
        (${todayKey}, (now() at time zone 'utc')::date, 1)
    `);

    const purged = await purgeExpiredClientQuota(db);

    expect(purged).toBe(1);
    const remaining = await db.execute<{ key_hash: string }>(sql`select key_hash from coverage_client_quota`);
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0]?.key_hash).toBe(todayKey);
  });

  it('sin ninguna fila expirada, no borra nada y devuelve 0', async () => {
    const todayKey = fakeKeyHash();
    await consumeClientQuota(db, todayKey, 5);

    const purged = await purgeExpiredClientQuota(db);

    expect(purged).toBe(0);
  });
});

describeWithDb('consumeClientQuota — N consumiciones concurrentes -> exactamente el tope permitido (decisión 077)', () => {
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

  it('con tope 5 y 8 consumiciones lanzadas a la vez, EXACTAMENTE 5 se permiten', async () => {
    const keyHash = fakeKeyHash();

    const results = await Promise.all(Array.from({ length: 8 }, () => consumeClientQuota(db, keyHash, 5)));

    const grantedCount = results.filter((allowed) => allowed).length;
    expect(grantedCount).toBe(5);

    const rows = await db.execute<{ registrations: number }>(
      sql`select registrations from coverage_client_quota where key_hash = ${keyHash}`
    );
    expect(rows.rows[0]?.registrations).toBe(5);
  });
});
