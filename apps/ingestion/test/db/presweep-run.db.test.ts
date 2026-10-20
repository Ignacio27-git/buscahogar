// ROADMAP 3.3 (decisión 253; R3, R4, R5, D11, D13; S3.1, S3.2, S4.1-S4.4, S5.1, S5.2) — el presweep de punta a
// punta: comando real + puertos reales (PostgreSQL real: candidatos, registro mensual, claim, cursores) y un
// conector de Idealista FALSO que sirve páginas con la forma de las grabadas (cero red, NF1). Verifica lo que los
// tests con puertos falsos no pueden: que el tope duro llega al conector, que el cursor persiste y reanuda sin
// repetir páginas, que el gasto real queda en el carril batch y que un preflight fallido no escribe nada.
import { coverageJobs } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runPresweepCommand } from '../../scripts/presweep-top-cities.js';
import type { IdealistaSearchPort, IdealistaTokenPort, TransportOutcome } from '../../src/sources/idealista/ports.js';
import type { SearchField } from '../../src/sources/idealista/search-request.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { insertLocationWithZone, insertSource, seedMonthlyQuota } from './helpers/seed-fixtures.js';

interface City {
  readonly ineCode: string;
  readonly municipality: string;
  readonly population: number;
  readonly latitude: number;
  readonly longitude: number;
}

const MADRID: City = { ineCode: '28079', municipality: 'Madrid', population: 3_300_000, latitude: 40.4168, longitude: -3.7038 };
const BARCELONA: City = { ineCode: '08019', municipality: 'Barcelona', population: 1_600_000, latitude: 41.3874, longitude: 2.1686 };
const SEVILLA: City = { ineCode: '41091', municipality: 'Sevilla', population: 680_000, latitude: 37.3891, longitude: -5.9845 };
const SIN_POBLACION: City = { ineCode: '11001', municipality: 'Sin dato', population: 0, latitude: 36.5, longitude: -6.2 };

interface RecordedRequest {
  readonly cityPrefix: string;
  readonly operation: string;
  readonly filter: string;
  readonly page: number;
}

interface FakeIdealista {
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
  readonly requests: RecordedRequest[];
  tokenCalls: number;
}

function field(fields: readonly SearchField[], name: string): string {
  return fields.find((candidate) => candidate.name === name)?.value ?? '';
}

// Conector falso con la forma de las respuestas grabadas: una página por petición, con `totalPages` y
// `actualPage` coherentes. `homes` tiene `homesPages` páginas y los demás filtros una: una unidad completa
// necesita `homesPages + 4` peticiones. `failOnRequest` hace que esa petición (1-based) devuelva HTTP 429.
function createFakeIdealista(options: { readonly homesPages: number; readonly failOnRequest?: number }): FakeIdealista {
  const requests: RecordedRequest[] = [];
  const fake: FakeIdealista = {
    requests,
    tokenCalls: 0,
    tokenPort: {
      acquire(): Promise<TransportOutcome> {
        fake.tokenCalls += 1;
        return Promise.resolve({ kind: 'ok', status: 200, headers: {}, body: { access_token: 'fake-token' } });
      },
    },
    searchPort: {
      search(fields): Promise<TransportOutcome> {
        const page = Number(field(fields, 'numPage'));
        const filter = field(fields, 'propertyType');
        const operation = field(fields, 'operation');
        requests.push({ cityPrefix: field(fields, 'center').slice(0, 5), operation, filter, page });
        if (options.failOnRequest === requests.length) {
          return Promise.resolve({ kind: 'http-error', status: 429, headers: {}, bodyText: 'Too Many Requests' });
        }
        const totalPages = filter === 'homes' ? options.homesPages : 1;
        return Promise.resolve({
          kind: 'ok',
          status: 200,
          headers: {},
          body: {
            elementList: [
              {
                propertyCode: String(1_000_000 + requests.length),
                price: 100_000 + requests.length,
                propertyType: 'flat',
                operation,
                url: `https://example.test/${String(requests.length)}`,
                address: 'calle falsa 1',
                latitude: 37.18,
                longitude: -3.6,
              },
            ],
            totalPages,
            actualPage: page,
            itemsPerPage: 1,
            total: totalPages,
          },
        });
      },
    },
  };
  return fake;
}

describe('presweep-top-cities — comando de punta a punta (decisión 253)', () => {
  let db: Database;
  let pool: Pool;
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    IDEALISTA_API_KEY: 'no-usada',
    IDEALISTA_API_SECRET: 'no-usada',
  };

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  async function seedCity(city: City): Promise<string> {
    const { locationId, zoneId } = await insertLocationWithZone(db, {
      ineCode: city.ineCode,
      municipality: city.municipality,
      searchName: city.municipality.toLowerCase(),
      ...(city.population > 0 ? { population: city.population } : {}),
    });
    await db.execute(sql`
      update locations
      set centroid = ST_SetSRID(ST_MakePoint(${city.longitude}, ${city.latitude}), 4326)::geography, sweep_radius_m = 4500
      where id = ${locationId}
    `);
    return zoneId;
  }

  async function setup(options: { readonly quota?: Parameters<typeof seedMonthlyQuota>[2] | null } = {}): Promise<string> {
    const sourceId = await insertSource(db);
    if (options.quota !== null) {
      await seedMonthlyQuota(db, sourceId, options.quota ?? { totalCap: 1000, reserve: 100 });
    }
    return sourceId;
  }

  async function ledger(): Promise<{ search: number; batch: number; token: number } | undefined> {
    const { rows } = await db.execute<{ search: number; batch: number; token: number }>(sql`
      select search_requests as search, batch_requests as batch, token_requests as token from monthly_request_budget
    `);
    return rows[0];
  }

  async function dailyRows(): Promise<number> {
    const { rows } = await db.execute<{ total: number }>(sql`select count(*)::integer as total from daily_request_budget`);
    return rows[0]?.total ?? 0;
  }

  async function jobOf(zoneId: string, operation: string): Promise<typeof coverageJobs.$inferSelect | undefined> {
    const [job] = await db
      .select()
      .from(coverageJobs)
      .where(and(eq(coverageJobs.zoneId, zoneId), eq(coverageJobs.operation, operation)));
    return job;
  }

  function run(
    argv: readonly string[],
    fake: FakeIdealista,
    logged: string[] = []
  ): Promise<number> {
    return runPresweepCommand(argv, env, { log: (line) => logged.push(line) }, { searchPort: fake.searchPort, tokenPort: fake.tokenPort });
  }

  const ARGS = (top: number, maxRequests: number, perSweep: number): string[] => [
    '--top', String(top), '--max-requests', String(maxRequests), '--max-requests-per-sweep', String(perSweep),
  ];

  it('S4.1/S5.1: tope por barrido 5 de una unidad de 36 páginas hace EXACTAMENTE 5, persiste el cursor y la siguiente ejecución reanuda en la página 6 sin repetir', async () => {
    await setup();
    const madridZone = await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });

    const first = await run(ARGS(1, 5, 5), fake);

    expect(first).toBe(0);
    expect(fake.requests.map((request) => [request.operation, request.filter, request.page])).toEqual([
      ['sale', 'homes', 1],
      ['sale', 'homes', 2],
      ['sale', 'homes', 3],
      ['sale', 'homes', 4],
      ['sale', 'homes', 5],
    ]);
    const saleJob = await jobOf(madridZone, 'sale');
    expect(saleJob).toMatchObject({ status: 'pending', operation: 'sale' });
    expect(saleJob?.cursor).not.toBeNull();
    expect(saleJob?.presweepRequestedAt).toBeInstanceOf(Date);
    expect(saleJob?.lastCompletedAt).toBeNull();
    expect(await jobOf(madridZone, 'rent')).toBeUndefined();

    // Segunda ejecución: el cursor manda, la venta continúa donde se quedó.
    const secondFake = createFakeIdealista({ homesPages: 36 });
    await run(ARGS(1, 5, 5), secondFake);

    expect(secondFake.requests.map((request) => [request.operation, request.filter, request.page])).toEqual([
      ['sale', 'homes', 6],
      ['sale', 'homes', 7],
      ['sale', 'homes', 8],
      ['sale', 'homes', 9],
      ['sale', 'homes', 10],
    ]);
  });

  it('el gasto real queda en el carril batch del registro mensual (peticiones + un token por barrido) y nada en el diario (D7)', async () => {
    await setup();
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });

    await run(ARGS(1, 8, 5), fake);

    // venta: 5 peticiones (tope por barrido), alquiler: 3 (tope de la ejecución). Dos barridos = 2 tokens.
    expect(fake.requests).toHaveLength(8);
    expect(await ledger()).toEqual({ search: 8, batch: 8, token: 2 });
    expect(fake.tokenCalls).toBe(2);
    expect(await dailyRows()).toBe(0);
  });

  it('S4.3: el tope de la ejecución recorta el último barrido y la ejecución se detiene sin tocar las ciudades siguientes', async () => {
    await setup();
    await seedCity(MADRID);
    const barcelonaZone = await seedCity(BARCELONA);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const code = await run(ARGS(2, 7, 5), fake, logged);

    expect(code).toBe(0);
    expect(fake.requests).toHaveLength(7);
    expect(fake.requests.filter((request) => request.operation === 'rent')).toHaveLength(2);
    expect(await jobOf(barcelonaZone, 'sale')).toBeUndefined();
    expect(logged.join('\n')).toContain('run-cap');
  });

  it('S4.2: con 3 de margen del batch y tope por barrido 10 se hacen 3 peticiones, motivo techo mensual, salida 0', async () => {
    await setup({ quota: { totalCap: 100, reserve: 30, batch: 67 } });
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const code = await run(ARGS(1, 100, 10), fake, logged);

    expect(code).toBe(0);
    expect(fake.requests).toHaveLength(3);
    expect(await ledger()).toEqual({ search: 70, batch: 70, token: 1 });
    expect(logged.join('\n')).toContain('monthly-batch-ceiling');
  });

  it('S3.2: sin ninguna fila de cuota (ni heredable) sale con 1, no pide token, no emite peticiones y no escribe NADA (ni ledger ni jobs)', async () => {
    await setup({ quota: null });
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const code = await run(ARGS(1, 100, 10), fake, logged);

    expect(code).toBe(1);
    expect(fake.tokenCalls).toBe(0);
    expect(fake.requests).toHaveLength(0);
    expect(await ledger()).toBeUndefined();
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    expect(logged.join('\n')).toContain('set-monthly-quota');
  });

  it('techo del batch en 0: sale con 0, reason monthly-batch-ceiling, cero token, cero peticiones, ledger y jobs intactos', async () => {
    await setup({ quota: { totalCap: 100, reserve: 30, batch: 70 } });
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const code = await run(ARGS(1, 100, 10), fake, logged);

    expect(code).toBe(0);
    expect(fake.tokenCalls).toBe(0);
    expect(fake.requests).toHaveLength(0);
    expect(await ledger()).toEqual({ search: 70, batch: 70, token: 0 });
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    expect(logged.join('\n')).toContain('monthly-batch-ceiling');
  });

  it('herencia (PD10): sin fila del mes pero con la del mes anterior la ejecución gasta contra lo heredado y crea la fila del mes', async () => {
    const sourceId = await setup({ quota: null });
    await seedCity(MADRID);
    await db.execute(sql`
      insert into monthly_request_budget (month, source_id, total_cap, reserve)
      values ((date_trunc('month', now() at time zone 'utc') - interval '1 month')::date, ${sourceId}, 100, 30)
    `);
    const fake = createFakeIdealista({ homesPages: 36 });

    const code = await run(ARGS(1, 4, 4), fake);

    expect(code).toBe(0);
    expect(fake.requests).toHaveLength(4);
    const { rows } = await db.execute<{ total: number; spent: number }>(sql`
      select count(*)::integer as total, coalesce(max(search_requests), 0)::integer as spent
      from monthly_request_budget where month = date_trunc('month', now() at time zone 'utc')::date
    `);
    expect(rows[0]).toEqual({ total: 1, spent: 4 });
  });

  it('S4.4: una respuesta 429 de la fuente detiene la ejecución con salida 1, el job queda failed con cursor y se devuelve lo no gastado', async () => {
    await setup();
    const madridZone = await seedCity(MADRID);
    const barcelonaZone = await seedCity(BARCELONA);
    const fake = createFakeIdealista({ homesPages: 36, failOnRequest: 3 });
    const logged: string[] = [];

    const code = await run(ARGS(2, 100, 10), fake, logged);

    expect(code).toBe(1);
    expect(fake.requests).toHaveLength(3);
    const saleJob = await jobOf(madridZone, 'sale');
    expect(saleJob?.status).toBe('failed');
    expect(saleJob?.cursor).not.toBeNull();
    expect(await jobOf(barcelonaZone, 'sale')).toBeUndefined();
    // Se gastaron 3 peticiones reales (la fallida cuenta); lo concedido y no gastado vuelve.
    expect(await ledger()).toEqual({ search: 3, batch: 3, token: 1 });
    expect(logged.join('\n')).toContain('upstream-signal');
  });

  it('una unidad que se completa queda cubierta (last_completed_at), pierde la marca de presweep y la siguiente ejecución la omite con cero peticiones (S5.2)', async () => {
    await setup();
    const madridZone = await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 1 });

    await run(ARGS(1, 100, 10), fake);

    // 5 filtros de una página cada uno por operación = 5 + 5 peticiones.
    expect(fake.requests).toHaveLength(10);
    for (const operation of ['sale', 'rent']) {
      const job = await jobOf(madridZone, operation);
      expect(job).toMatchObject({ status: 'done', cursor: null, presweepRequestedAt: null });
      expect(job?.lastCompletedAt).toBeInstanceOf(Date);
    }

    const again = createFakeIdealista({ homesPages: 1 });
    const code = await run(ARGS(1, 100, 10), again);

    expect(code).toBe(0);
    expect(again.requests).toHaveLength(0);
    expect(again.tokenCalls).toBe(0);
  });

  it('S2.1: top 2 sobre 3 ciudades con población barre solo las dos mayores, y una ciudad sin población conocida no entra nunca', async () => {
    await setup();
    await seedCity(SEVILLA);
    await seedCity(MADRID);
    await seedCity(BARCELONA);
    await seedCity(SIN_POBLACION);
    const fake = createFakeIdealista({ homesPages: 1 });

    await run(ARGS(2, 1000, 50), fake);

    const cities = [...new Set(fake.requests.map((request) => request.cityPrefix))];
    expect(cities).toEqual(['40.41', '41.38']);
  });

  it('un job en curso de otro proceso (running) se omite sin gastar; el resto del plan continúa', async () => {
    const sourceId = await setup();
    const madridZone = await seedCity(MADRID);
    await db.insert(coverageJobs).values({ zoneId: madridZone, sourceId, operation: 'sale', status: 'running' });
    const fake = createFakeIdealista({ homesPages: 1 });

    const code = await run(ARGS(1, 1000, 50), fake);

    expect(code).toBe(0);
    expect(new Set(fake.requests.map((request) => request.operation))).toEqual(new Set(['rent']));
    expect((await jobOf(madridZone, 'sale'))?.status).toBe('running');
  });

  it('S3.1: argumentos inválidos o ausentes: salida 2, cero token, cero peticiones, ledger y jobs intactos (ni se abre la base de datos)', async () => {
    await setup();
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const missingPerSweep = await run(['--top', '5', '--max-requests', '100'], fake, logged);
    const zero = await run(ARGS(0, 100, 10), fake, logged);
    const unknownFlag = await run([...ARGS(1, 100, 10), '--total', '5'], fake, logged);

    expect([missingPerSweep, zero, unknownFlag]).toEqual([2, 2, 2]);
    expect(fake.tokenCalls).toBe(0);
    expect(fake.requests).toHaveLength(0);
    expect(await ledger()).toEqual({ search: 0, batch: 0, token: 0 });
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    expect(logged.join('\n')).toContain('--max-requests-per-sweep');
  });

  it('--dry-run: lista el plan sin pedir token ni gastar ni crear jobs, aunque haya cuota', async () => {
    await setup();
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const code = await run([...ARGS(1, 100, 10), '--dry-run'], fake, logged);

    expect(code).toBe(0);
    expect(fake.tokenCalls).toBe(0);
    expect(fake.requests).toHaveLength(0);
    expect(await ledger()).toEqual({ search: 0, batch: 0, token: 0 });
    expect(await db.select().from(coverageJobs)).toHaveLength(0);
    expect(logged.join('\n')).toContain('28079 sale');
  });

  it('la variable de credenciales ausente falla con 2 antes de tocar nada (salvo en --dry-run, que no las necesita)', async () => {
    await setup();
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    const logged: string[] = [];

    const code = await runPresweepCommand(
      ARGS(1, 100, 10),
      { DATABASE_URL: process.env.DATABASE_URL },
      { log: (line) => logged.push(line) },
      { searchPort: fake.searchPort, tokenPort: fake.tokenPort }
    );

    expect(code).toBe(2);
    expect(fake.requests).toHaveLength(0);
    expect(await ledger()).toEqual({ search: 0, batch: 0, token: 0 });
    expect(logged.join('\n')).toContain('IDEALISTA_API_KEY');
  });

  it('el orden del plan es población DESC y, por ciudad, venta antes que alquiler', async () => {
    await setup();
    await seedCity(BARCELONA);
    await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 1 });

    await run(ARGS(2, 1000, 50), fake);

    const order = fake.requests
      .map((request) => `${request.cityPrefix}:${request.operation}`)
      .filter((value, index, all) => all.indexOf(value) === index);
    expect(order).toEqual(['40.41:sale', '40.41:rent', '41.38:sale', '41.38:rent']);
  });

  it('un job existente con cursor guardado y marca previa se reanuda y vuelve a marcarse (idempotente)', async () => {
    const sourceId = await setup();
    const madridZone = await seedCity(MADRID);
    const fake = createFakeIdealista({ homesPages: 36 });
    await run(ARGS(1, 5, 5), fake);
    const [before] = await db.select().from(coverageJobs).where(eq(coverageJobs.sourceId, sourceId)).orderBy(asc(coverageJobs.requestedAt));
    expect(before?.presweepRequestedAt).toBeInstanceOf(Date);

    await run(ARGS(1, 5, 5), createFakeIdealista({ homesPages: 36 }));

    const job = await jobOf(madridZone, 'sale');
    expect(job?.presweepRequestedAt).toBeInstanceOf(Date);
    expect(job?.attempts).toBe(2);
  });
});
