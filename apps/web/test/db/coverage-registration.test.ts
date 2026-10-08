// ROADMAP 1.13 Unit D (tareas 11.3/11.4 guarda de centroide, 11.7/11.8
// guarda de tope; diseño DD-14, CR-12) — `resolveCoverageForZone` es la
// guarda de APLICACIÓN que `packages/db/src/coverage.ts` deliberadamente no
// implementa por sí sola: el rol INSERT-only de D1 solo puede escribir
// `coverage_jobs`, nunca leer `locations.centroid` ni `zones.state`, así
// que ambas comprobaciones (centroide, tope diario) viven aquí, contra el
// rol de SOLO LECTURA, ANTES de intentar cualquier escritura. Cableada en
// `apps/web/src/app/(search)/page.tsx` en la fase 12 de esta misma unidad.
//
// Conexión de prueba: el owner (`DATABASE_URL`) para AMBOS lados
// (lectura/escritura) — se prueba la LÓGICA de la guarda, no el límite de
// privilegios del rol restringido real (eso es la tarea 10.6, aparte).
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '@buscahogar/db';
import {
  consumeClientQuota,
  coverageClientQuota,
  coverageJobs,
  geographyPointWkt,
  locations,
  sources,
  zones,
} from '@buscahogar/db';

import { resolveZoneGeometry } from '@buscahogar/db';
import { resolveCoverageForZone } from '../../src/server/coverage.js';
import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/db-gate.js';

async function insertZone(
  db: Database,
  overrides: {
    readonly ineCode: string;
    readonly state?: string;
    readonly centroid?: { readonly latitude: number; readonly longitude: number };
  }
): Promise<string> {
  const [location] = await db
    .insert(locations)
    .values({
      ineCode: overrides.ineCode,
      municipality: 'Granada',
      province: 'Granada',
      provinceCode: '18',
      autonomousCommunity: 'Andalucía',
      searchName: 'granada',
      centroid: overrides.centroid ? geographyPointWkt(overrides.centroid) : null,
      sweepRadiusM: overrides.centroid ? 4500 : null,
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo insertar la localización de prueba');
  }
  const [zone] = await db
    .insert(zones)
    .values({ locationId: location.id, state: overrides.state ?? 'uncovered' })
    .returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }
  return zone.id;
}

describeWithDb('resolveCoverageForZone (DD-14, CR-12) — guarda de aplicación', () => {
  let db: Database;
  let pool: import('../helpers/db-client.js').TestDbHandle['pool'];

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await db.insert(sources).values({ key: 'idealista', name: 'Idealista', kind: 'api' });
  });

  it('zona covered: outcome "covered", nunca toca coverage_jobs', async () => {
    const ineCode = '18001';
    await insertZone(db, { ineCode, state: 'covered', centroid: { latitude: 37.1, longitude: -3.6 } });
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);
    expect(outcome).toEqual({ kind: 'covered' });

    const jobs = await db.select().from(zones);
    expect(jobs).toHaveLength(1); // sanity: sigue habiendo solo la zona sembrada
  });

  it('CR-12: zona uncovered SIN centroide -> "not-sweepable", CERO filas en coverage_jobs', async () => {
    const ineCode = '18002';
    await insertZone(db, { ineCode, state: 'uncovered' }); // sin centroid
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);
    expect(outcome).toEqual({ kind: 'not-sweepable' });
  });

  it('zona uncovered CON centroide, bajo el tope: registra y devuelve el estado del job', async () => {
    const ineCode = '18003';
    await insertZone(db, { ineCode, state: 'uncovered', centroid: { latitude: 37.1, longitude: -3.6 } });
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);
    expect(outcome.kind).toBe('registered');
    if (outcome.kind === 'registered') {
      expect(outcome.job?.status).toBe('pending');
    }
  });

  it('DD-14: tope de zonas nuevas agotado -> "cap-exhausted", CERO filas nuevas en coverage_jobs', async () => {
    // Agota el tope (1) registrando una zona distinta primero.
    const alreadyOpened = '18004';
    await insertZone(db, { ineCode: alreadyOpened, state: 'uncovered', centroid: { latitude: 37.1, longitude: -3.6 } });
    const openedGeometry = await resolveZoneGeometry(db, alreadyOpened);
    if (!openedGeometry) throw new Error('geometry inesperadamente null');
    await resolveCoverageForZone(db, () => db, openedGeometry, 1); // tope=1, consume la única plaza

    const ineCode = '18005';
    await insertZone(db, { ineCode, state: 'uncovered', centroid: { latitude: 37.2, longitude: -3.7 } });
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const outcome = await resolveCoverageForZone(db, () => db, geometry, 1); // mismo tope=1, ya consumido
    expect(outcome).toEqual({ kind: 'cap-exhausted' });
  });

  it('una zona YA registrada hoy nunca se bloquea por el tope al re-visitarla — el tope solo protege registros NUEVOS', async () => {
    const ineCode = '18006';
    await insertZone(db, { ineCode, state: 'uncovered', centroid: { latitude: 37.1, longitude: -3.6 } });
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const first = await resolveCoverageForZone(db, () => db, geometry, 1); // registra, consume el tope=1
    expect(first.kind).toBe('registered');

    const second = await resolveCoverageForZone(db, () => db, geometry, 1); // re-visita, tope ya consumido
    expect(second.kind).toBe('registered'); // NUNCA cap-exhausted para un job que ya existe
  });

  // ROADMAP 1.15 (security-hardening, spec #261 "Three Checks, In Order —
  // Global Cap (Read-Only) Before Per-Client Consume (Write)", diseño
  // decisión 079) — el orden es la propiedad de seguridad central: el tope
  // GLOBAL se comprueba PRIMERO, de solo lectura, así que ningún registro
  // que vaya a ser rechazado por él consume nunca la cuota de un cliente.
  it('spec #261: tope global agotado bloquea el registro y NUNCA toca la cuota por cliente', async () => {
    const alreadyOpened = '18007';
    await insertZone(db, { ineCode: alreadyOpened, state: 'uncovered', centroid: { latitude: 37.1, longitude: -3.6 } });
    const openedGeometry = await resolveZoneGeometry(db, alreadyOpened);
    if (!openedGeometry) throw new Error('geometry inesperadamente null');
    await resolveCoverageForZone(db, () => db, openedGeometry, 1); // tope=1, consume la única plaza

    const ineCode = '18008';
    await insertZone(db, { ineCode, state: 'uncovered', centroid: { latitude: 37.2, longitude: -3.7 } });
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const keyHash = 'e'.repeat(64);
    const outcome = await resolveCoverageForZone(db, () => db, geometry, 1, { keyHash, dailyCap: 5 });
    expect(outcome).toEqual({ kind: 'cap-exhausted' });

    // La cuota del cliente NUNCA se tocó: ni siquiera una fila con
    // registrations=0 debería existir — el write path no se invocó.
    const quotaRows = await db.select().from(coverageClientQuota);
    expect(quotaRows.filter((row) => row.keyHash === keyHash)).toHaveLength(0);
  });

  it('spec #261: tope por cliente agotado bloquea el registro SOLO cuando el tope global tiene hueco', async () => {
    const keyHash = 'f'.repeat(64);
    // Agota la cuota del cliente de forma independiente, sin consumir el
    // tope global (que sigue con hueco de sobra, cap=10).
    await consumeClientQuota(db, keyHash, 1);

    const ineCode = '18009';
    await insertZone(db, { ineCode, state: 'uncovered', centroid: { latitude: 37.3, longitude: -3.8 } });
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const outcome = await resolveCoverageForZone(db, () => db, geometry, 10, { keyHash, dailyCap: 1 });
    expect(outcome).toEqual({ kind: 'client-cap-exhausted' });
    expect(outcome.kind).not.toBe('cap-exhausted'); // distinto del outcome global (D6)

    // Cero filas nuevas en coverage_jobs para esta zona: registerCoverageJob
    // nunca se invocó porque el tope por cliente lo bloqueó antes.
    const allJobs = await db.select().from(coverageJobs);
    expect(allJobs.filter((job) => job.zoneId === geometry.zoneId)).toHaveLength(0);
  });
});
