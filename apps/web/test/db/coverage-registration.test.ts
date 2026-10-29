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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CoverageOperation, Database, ZoneGeometry } from '@buscahogar/db';
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

// ROADMAP 3.3 (decisión 251): la cobertura de una operación es `coverage_jobs.last_completed_at`; el
// estado agregado `zones.state` ya no decide. Siembra el job de una operación como completado.
async function seedCompletedJob(db: Database, zoneId: string, operation: CoverageOperation): Promise<void> {
  const [source] = await db.select({ id: sources.id }).from(sources);
  if (!source) {
    throw new Error('Sin fuente de prueba');
  }
  await db
    .insert(coverageJobs)
    .values({ zoneId, sourceId: source.id, operation, status: 'done', lastCompletedAt: new Date() });
}

async function jobsOf(db: Database, zoneId: string): Promise<readonly { operation: string; status: string }[]> {
  const rows = await db.select().from(coverageJobs);
  return rows
    .filter((row) => row.zoneId === zoneId)
    .map((row) => ({ operation: row.operation, status: row.status }))
    .sort((a, b) => a.operation.localeCompare(b.operation));
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

  it('S15.4: zona con venta y alquiler completados y sin operación: outcome "covered", no registra nada', async () => {
    const ineCode = '18001';
    const zoneId = await insertZone(db, { ineCode, state: 'covered', centroid: { latitude: 37.1, longitude: -3.6 } });
    await seedCompletedJob(db, zoneId, 'sale');
    await seedCompletedJob(db, zoneId, 'rent');
    const geometry = await resolveZoneGeometry(db, ineCode);
    if (!geometry) throw new Error('geometry inesperadamente null');

    const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);
    expect(outcome).toEqual({ kind: 'covered' });
    expect(await jobsOf(db, zoneId)).toEqual([
      { operation: 'rent', status: 'done' },
      { operation: 'sale', status: 'done' },
    ]);
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

  // ROADMAP 3.3 (decisión 251, PD9; S15.1-S15.5) — cobertura y registro POR OPERACIÓN.
  describe('PD9: cobertura por operación', () => {
    async function setupZone(ineCode: string, zoneState = 'uncovered'): Promise<{ zoneId: string; geometry: ZoneGeometry }> {
      const zoneId = await insertZone(db, { ineCode, state: zoneState, centroid: { latitude: 37.1, longitude: -3.6 } });
      const geometry = await resolveZoneGeometry(db, ineCode);
      if (!geometry) throw new Error('geometry inesperadamente null');
      return { zoneId, geometry };
    }

    it('S15.1: con alquiler cubierto y filtro sale la zona NO está cubierta y se registra un job de sale', async () => {
      const { zoneId, geometry } = await setupZone('18101', 'covered');
      await seedCompletedJob(db, zoneId, 'rent');

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 10, null, 'sale');

      expect(outcome.kind).toBe('registered');
      expect(await jobsOf(db, zoneId)).toEqual([
        { operation: 'rent', status: 'done' },
        { operation: 'sale', status: 'pending' },
      ]);
    });

    it('con alquiler cubierto y filtro rent la zona SÍ está cubierta aunque venta no lo esté, sin registrar nada', async () => {
      const { zoneId, geometry } = await setupZone('18102', 'covered');
      await seedCompletedJob(db, zoneId, 'rent');

      expect(await resolveCoverageForZone(db, () => db, geometry, 10, null, 'rent')).toEqual({ kind: 'covered' });
      expect(await jobsOf(db, zoneId)).toEqual([{ operation: 'rent', status: 'done' }]);
    });

    it('S15.2: sin filtro y solo alquiler cubierto: no cubierta y se registra SOLO el job de sale', async () => {
      const { zoneId, geometry } = await setupZone('18103', 'covered');
      await seedCompletedJob(db, zoneId, 'rent');

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);

      expect(outcome.kind).toBe('registered');
      expect(await jobsOf(db, zoneId)).toEqual([
        { operation: 'rent', status: 'done' },
        { operation: 'sale', status: 'pending' },
      ]);
    });

    it('S15.3: sin filtro y ninguna operación cubierta: dos jobs pendientes a la vez (sale y rent)', async () => {
      const { zoneId, geometry } = await setupZone('18104');

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);

      expect(outcome.kind).toBe('registered');
      if (outcome.kind === 'registered') {
        expect(outcome.job?.status).toBe('pending');
      }
      expect(await jobsOf(db, zoneId)).toEqual([
        { operation: 'rent', status: 'pending' },
        { operation: 'sale', status: 'pending' },
      ]);
    });

    it('S15.5: un job pendiente de la operación que falta no se duplica y devuelve su estado', async () => {
      const { zoneId, geometry } = await setupZone('18105', 'covered');
      await seedCompletedJob(db, zoneId, 'rent');
      await resolveCoverageForZone(db, () => db, geometry, 10); // registra el de sale

      const again = await resolveCoverageForZone(db, () => db, geometry, 10);

      expect(again.kind).toBe('registered');
      if (again.kind === 'registered') {
        expect(again.job?.status).toBe('pending');
      }
      expect(await jobsOf(db, zoneId)).toEqual([
        { operation: 'rent', status: 'done' },
        { operation: 'sale', status: 'pending' },
      ]);
    });

    it('con un job pendiente de rent y sin filtro, registra solo el de sale y no toca el de rent', async () => {
      const { zoneId, geometry } = await setupZone('18106');
      await resolveCoverageForZone(db, () => db, geometry, 10, null, 'rent');
      expect(await jobsOf(db, zoneId)).toEqual([{ operation: 'rent', status: 'pending' }]);

      await resolveCoverageForZone(db, () => db, geometry, 10);

      expect(await jobsOf(db, zoneId)).toEqual([
        { operation: 'rent', status: 'pending' },
        { operation: 'sale', status: 'pending' },
      ]);
    });

    it('el estado agregado zones.state=covered ya no basta: sin jobs completados la zona no está cubierta', async () => {
      const { zoneId, geometry } = await setupZone('18107', 'covered');

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 10);

      expect(outcome.kind).toBe('registered');
      expect(await jobsOf(db, zoneId)).toHaveLength(2);
    });

    it('el tope global cuenta zonas distintas: una zona con dos jobs ocupa UNA plaza', async () => {
      const first = await setupZone('18108');
      const second = await setupZone('18109');
      const third = await setupZone('18110');

      // tope=2: cada zona registra dos jobs (dos filas, una plaza).
      expect((await resolveCoverageForZone(db, () => db, first.geometry, 2)).kind).toBe('registered');
      expect((await resolveCoverageForZone(db, () => db, second.geometry, 2)).kind).toBe('registered');
      // Ahora hay 2 zonas (4 filas): la tercera ya no cabe.
      expect(await resolveCoverageForZone(db, () => db, third.geometry, 2)).toEqual({ kind: 'cap-exhausted' });
    });

    it('una zona que ya ocupa plaza hoy puede añadir la operación que le falta aunque el tope esté lleno', async () => {
      const { zoneId, geometry } = await setupZone('18111');
      await resolveCoverageForZone(db, () => db, geometry, 1, null, 'rent'); // llena el tope=1 ella sola

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 1); // falta sale; ya está contada

      expect(outcome.kind).toBe('registered');
      expect(await jobsOf(db, zoneId)).toEqual([
        { operation: 'rent', status: 'pending' },
        { operation: 'sale', status: 'pending' },
      ]);
    });

    it('la cuota por cliente se consume UNA vez por zona aunque se registren dos jobs', async () => {
      const { geometry } = await setupZone('18112');
      const keyHash = 'a'.repeat(64);

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 10, { keyHash, dailyCap: 1 });

      expect(outcome.kind).toBe('registered');
      const rows = (await db.select().from(coverageClientQuota)).filter((row) => row.keyHash === keyHash);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.registrations).toBe(1);
    });

    it('si ya existen los jobs que faltan no se consume cuota del cliente', async () => {
      const { geometry } = await setupZone('18113');
      await resolveCoverageForZone(db, () => db, geometry, 10); // crea los dos jobs, sin cliente
      const keyHash = 'b'.repeat(64);

      const outcome = await resolveCoverageForZone(db, () => db, geometry, 10, { keyHash, dailyCap: 1 });

      expect(outcome.kind).toBe('registered');
      expect((await db.select().from(coverageClientQuota)).filter((row) => row.keyHash === keyHash)).toHaveLength(0);
    });
  });
});
