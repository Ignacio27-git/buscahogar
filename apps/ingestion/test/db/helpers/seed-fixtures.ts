// Paso 1.7 — constructores de filas de referencia mínimas, compartidos por
// las suites DB de esta fase (reference-store, coverage-store). Cada test
// añade por encima lo que necesite comprobar, igual que
// packages/db/test/helpers/fixtures.ts (precedente, no reutilizado
// directamente por la misma razón de D2: es un helper de test, no una
// superficie exportada de packages/db).
import { randomInt } from 'node:crypto';

import { normalizeSearchName } from '@buscahogar/core';
import { locations, sources, zones } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';
import { sql } from 'drizzle-orm';

// `key` por defecto es 'idealista': es la única fuente que este cambio
// necesita seedear (diseño D8). Un test que necesite otra clave la pasa por
// `overrides`.
export async function insertSource(
  db: Database,
  overrides: Partial<typeof sources.$inferInsert> = {}
): Promise<string> {
  const [source] = await db
    .insert(sources)
    .values({ key: 'idealista', name: 'Idealista', kind: 'api', ...overrides })
    .returning({ id: sources.id });
  if (!source) {
    throw new Error('No se pudo insertar la fuente de prueba');
  }
  return source.id;
}

export async function insertLocation(
  db: Database,
  overrides: Partial<typeof locations.$inferInsert> = {}
): Promise<string> {
  const [location] = await db
    .insert(locations)
    .values({
      // ROADMAP 1.13 (DD-1): `ine_code` lleva ahora CHECK `^[0-9]{5}$`
      // (`locations_ine_code_check`) — un fragmento de uuid puede contener
      // letras hexadecimales y violarlo, así que el código aleatorio de
      // este fixture pasa a ser puramente numérico.
      ineCode: String(randomInt(10_000, 100_000)),
      municipality: 'Granada',
      province: 'Granada',
      provinceCode: '18',
      autonomousCommunity: 'Andalucía',
      searchName: normalizeSearchName('Granada'),
      ...overrides,
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo insertar la localización de prueba');
  }
  return location.id;
}

export async function insertZone(
  db: Database,
  locationId: string,
  overrides: Partial<typeof zones.$inferInsert> = {}
): Promise<string> {
  const [zone] = await db
    .insert(zones)
    .values({ locationId, ...overrides })
    .returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

// Atajo: localización + zona ligada 1:1 — la combinación que reference-store
// y coverage-store necesitan en la mayoría de sus tests.
export async function insertLocationWithZone(
  db: Database,
  overrides: Partial<typeof locations.$inferInsert> = {}
): Promise<{ readonly locationId: string; readonly zoneId: string }> {
  const locationId = await insertLocation(db, overrides);
  const zoneId = await insertZone(db, locationId);
  return { locationId, zoneId };
}

// ROADMAP 3.3 (decisión 248) — registro mensual de cuota del mes UTC en curso para una fuente.
// Sin esta fila el worker, el barrido manual y el presweep NO gastan nada (fail-closed): los
// tests que ejercitan gasto real la siembran de forma explícita. Los contadores arrancan en 0;
// el gasto previo se indica por carril.
export async function seedMonthlyQuota(
  db: Database,
  sourceId: string,
  quota: {
    readonly totalCap?: number;
    readonly reserve?: number;
    readonly batch?: number;
    readonly onDemand?: number;
    readonly refresh?: number;
  } = {}
): Promise<void> {
  const batch = quota.batch ?? 0;
  const onDemand = quota.onDemand ?? 0;
  const refresh = quota.refresh ?? 0;
  await db.execute(sql`
    insert into monthly_request_budget
      (month, source_id, total_cap, reserve, search_requests, batch_requests, on_demand_requests, refresh_requests)
    values (
      date_trunc('month', now() at time zone 'utc')::date, ${sourceId},
      ${quota.totalCap ?? 100_000}, ${quota.reserve ?? 1_000},
      ${batch + onDemand + refresh}, ${batch}, ${onDemand}, ${refresh}
    )
  `);
}

// Fuente 'idealista' + cuota mensual holgada del mes en curso: la forma habitual de una suite
// que ejercita gasto real del worker con la fuente falsa, donde el techo mensual no es el tema.
export async function insertSourceWithQuota(db: Database): Promise<string> {
  const sourceId = await insertSource(db);
  await seedMonthlyQuota(db, sourceId);
  return sourceId;
}
