// ROADMAP 1.13 (diseño §5 interfaces, DD-19 mitad de consulta, DD-22,
// arbitraje CR-12) — capa de consulta de zonas: la base compartida que
// alimentan Unit C (worker) y Unit D (web). `suggestZones` es el
// autocompletado servido por el servidor (DD-19: sin JavaScript de
// cliente); `resolveZoneGeometry` es lo que convierte un código INE
// resuelto en la geometría que un `AreaQuery` necesita.
//
// CR-12 (ruling de la arbitración, SUSTITUYE el escenario original del
// spec): un municipio sin centroide aparece IGUAL en las sugerencias,
// marcado `sweepable: false` — nunca oculto. Ocultarlo produce exactamente
// el fallo silencioso que la decisión D6 existe para impedir: un usuario
// que busca un municipio real recibe un resultado indistinguible de una
// errata tipográfica.
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import type { Database } from '../src/db.js';
import { resolveZoneGeometry, resolveZoneGeometryById, suggestZones } from '../src/locations-query.js';
import { geographyPointWkt } from '../src/spatial.js';
import { locations, zones } from '../src/tables.js';
import { connectTestDb, truncateAll } from './helpers/db-client.js';
import { describeWithDb } from './helpers/docker-gate.js';

async function insertMunicipality(
  db: Database,
  overrides: {
    readonly ineCode: string;
    readonly municipality: string;
    readonly searchName: string;
    readonly centroid?: { readonly latitude: number; readonly longitude: number };
    readonly sweepRadiusM?: number;
  }
): Promise<{ readonly locationId: string; readonly zoneId: string }> {
  const [location] = await db
    .insert(locations)
    .values({
      ineCode: overrides.ineCode,
      municipality: overrides.municipality,
      province: 'Granada',
      provinceCode: '18',
      autonomousCommunity: 'Andalucía',
      searchName: overrides.searchName,
      centroid: overrides.centroid ? geographyPointWkt(overrides.centroid) : null,
      sweepRadiusM: overrides.sweepRadiusM ?? null,
    })
    .returning({ id: locations.id });
  if (!location) {
    throw new Error('No se pudo insertar la localización de prueba');
  }

  const [zone] = await db.insert(zones).values({ locationId: location.id }).returning({ id: zones.id });
  if (!zone) {
    throw new Error('No se pudo insertar la zona de prueba');
  }

  return { locationId: location.id, zoneId: zone.id };
}

describeWithDb('suggestZones (DD-19, DD-22, CR-12) — autocompletado servidor, centroid-less visible y marcado', () => {
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

  it('coincide por prefijo de search_name y devuelve ine_code/municipality/province/state', async () => {
    await insertMunicipality(db, {
      ineCode: '18087',
      municipality: 'Granada',
      searchName: 'granada',
      centroid: { latitude: 37.177336, longitude: -3.598557 },
      sweepRadiusM: 4500,
    });

    const results = await suggestZones(db, 'gran', 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ineCode: '18087', municipality: 'Granada', province: 'Granada', state: 'uncovered' });
  });

  it('CR-12: un municipio sin centroide APARECE en las sugerencias, marcado sweepable:false — nunca oculto', async () => {
    await insertMunicipality(db, { ineCode: '99999', municipality: 'Sin Centroide', searchName: 'sin centroide' });

    const results = await suggestZones(db, 'sin', 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.sweepable).toBe(false);
  });

  it('un municipio CON centroide se marca sweepable:true', async () => {
    await insertMunicipality(db, {
      ineCode: '18087',
      municipality: 'Granada',
      searchName: 'granada',
      centroid: { latitude: 37.177336, longitude: -3.598557 },
      sweepRadiusM: 4500,
    });

    const results = await suggestZones(db, 'gran', 10);
    expect(results[0]?.sweepable).toBe(true);
  });

  it('DD-22: escapa "%" literal en la consulta — un "%" tecleado no debe coincidir con TODOS los municipios', async () => {
    await insertMunicipality(db, { ineCode: '18087', municipality: 'Granada', searchName: 'granada' });
    await insertMunicipality(db, { ineCode: '07040', municipality: 'Palma', searchName: 'palma' });

    const results = await suggestZones(db, '%', 10);
    expect(results).toHaveLength(0); // "%" literal no es un comodín aquí — se escapa
  });

  it('respeta el límite pasado', async () => {
    await insertMunicipality(db, { ineCode: '18087', municipality: 'Granada Uno', searchName: 'granada uno' });
    await insertMunicipality(db, { ineCode: '18088', municipality: 'Granada Dos', searchName: 'granada dos' });

    const results = await suggestZones(db, 'granada', 1);
    expect(results).toHaveLength(1);
  });

  it('un prefijo sin ninguna coincidencia devuelve una lista vacía, nunca lanza', async () => {
    const results = await suggestZones(db, 'zzz-no-existe', 10);
    expect(results).toEqual([]);
  });
});

describeWithDb('resolveZoneGeometry (§5 interfaces) — geometría necesaria para un AreaQuery', () => {
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

  it('una zona con centroide devuelve latitude/longitude/sweepRadiusM no nulos', async () => {
    await insertMunicipality(db, {
      ineCode: '18087',
      municipality: 'Granada',
      searchName: 'granada',
      centroid: { latitude: 37.177336, longitude: -3.598557 },
      sweepRadiusM: 4500,
    });

    const geometry = await resolveZoneGeometry(db, '18087');
    expect(geometry?.centroid?.latitude).toBeCloseTo(37.177336, 4);
    expect(geometry?.centroid?.longitude).toBeCloseTo(-3.598557, 4);
    expect(geometry?.sweepRadiusM).toBe(4500);
  });

  it('una zona SIN centroide resuelve por identidad pero la geometría es null — nunca lanza, nunca inventa una coordenada', async () => {
    await insertMunicipality(db, { ineCode: '99999', municipality: 'Sin Centroide', searchName: 'sin centroide' });

    const geometry = await resolveZoneGeometry(db, '99999');
    expect(geometry?.ineCode).toBe('99999');
    expect(geometry?.centroid).toBeNull();
    expect(geometry?.sweepRadiusM).toBeNull();
  });

  it('un ine_code sin ninguna fila devuelve null (no la fila), distinto de una zona sin centroide', async () => {
    const geometry = await resolveZoneGeometry(db, '00000');
    expect(geometry).toBeNull();
  });

  it('el zoneId devuelto corresponde a la fila real de zones, verificable de vuelta', async () => {
    const { zoneId } = await insertMunicipality(db, { ineCode: '18087', municipality: 'Granada', searchName: 'granada' });

    const geometry = await resolveZoneGeometry(db, '18087');
    expect(geometry?.zoneId).toBe(zoneId);

    const [zoneRow] = await db.select().from(zones).where(eq(zones.id, zoneId));
    expect(zoneRow).toBeDefined();
  });
});

// ROADMAP 1.13 Unit C (diseño DD-17/DD-18, CoverageWorkerPorts.resolveZoneGeometry) —
// `coverage_jobs.zone_id` es el FK real que el worker recorre, nunca un
// ine_code: el worker necesita resolver geometría A PARTIR del uuid de zona,
// no del código INE que `resolveZoneGeometry` (arriba) ya sirve para la web.
// Misma consulta, distinta clave — hermana deliberada, no una reescritura.
describeWithDb('resolveZoneGeometryById (§5 interfaces, CoverageWorkerPorts) — geometría a partir del uuid de zona', () => {
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

  it('una zona con centroide, buscada por su uuid, devuelve latitude/longitude/sweepRadiusM no nulos', async () => {
    const { zoneId } = await insertMunicipality(db, {
      ineCode: '18087',
      municipality: 'Granada',
      searchName: 'granada',
      centroid: { latitude: 37.177336, longitude: -3.598557 },
      sweepRadiusM: 4500,
    });

    const geometry = await resolveZoneGeometryById(db, zoneId);
    expect(geometry?.zoneId).toBe(zoneId);
    expect(geometry?.centroid?.latitude).toBeCloseTo(37.177336, 4);
    expect(geometry?.centroid?.longitude).toBeCloseTo(-3.598557, 4);
    expect(geometry?.sweepRadiusM).toBe(4500);
  });

  it('una zona SIN centroide resuelve por uuid pero la geometría es null — nunca lanza, nunca inventa una coordenada', async () => {
    const { zoneId } = await insertMunicipality(db, { ineCode: '99999', municipality: 'Sin Centroide', searchName: 'sin centroide' });

    const geometry = await resolveZoneGeometryById(db, zoneId);
    expect(geometry?.ineCode).toBe('99999');
    expect(geometry?.centroid).toBeNull();
    expect(geometry?.sweepRadiusM).toBeNull();
  });

  it('un uuid de zona sin ninguna fila devuelve null, nunca lanza', async () => {
    const geometry = await resolveZoneGeometryById(db, '00000000-0000-0000-0000-000000000000');
    expect(geometry).toBeNull();
  });
});
