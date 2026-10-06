// ROADMAP 1.13 Unit D (tareas 12.5-12.10; spec «coverage-degradation»,
// «Three Honest Cases, Never Silence» D6; arbitraje CR-10/CR-12) — prueba
// DB-backed que renderiza `HomePage` de verdad (mismo patrón que
// `property-detail-page.test.tsx`: invocación directa de la función
// exportada, `renderToStaticMarkup` sobre el elemento ya resuelto) contra
// datos reales sembrados en Postgres. `NEW_ZONES_DAILY_CAP` se fija en el
// propio test (nunca inventado en código de producción — ver
// `coverage-env.test.ts`).
import { randomInt } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Database } from '@buscahogar/db';
import { consumeClientQuota, geographyPointWkt, locations, sources, zones } from '@buscahogar/db';
import { registerCoverageJob } from '@buscahogar/db';

import { connectTestDb, truncateAll } from '../helpers/db-client.js';
import { describeWithDb } from '../helpers/db-gate.js';
import { hmacClientKey } from '../../src/server/client-identity.js';

// DD-23/CR-9 (diseño, confirmado empíricamente al escribir esta prueba):
// `<CoverageStatus/>` llama a `useRouter()`, que exige un contexto de
// router que `renderToStaticMarkup` NO provee ("invariant expected app
// router to be mounted") — exactamente la razón por la que el diseño deja
// el componente SIN prueba de render directa y prueba en su lugar el
// módulo puro `coverage-status-policy.ts` (`coverage-status-policy.test.ts`).
// Mismo patrón que `property-detail-page.test.tsx` ya usa (`vi.mock('@/server/db', ...)`):
// se sustituye el ÚNICO componente 'use client' por un doble inerte, para
// que esta prueba se centre en lo que SÍ puede observar sin un arnés de
// navegador — el markup SERVER-RENDERED (D8: el baseline sin JS es
// completo, este componente es una mejora, nunca la única vía).
vi.mock('@/components/coverage-status', () => ({
  CoverageStatus: (): null => null,
}));

// D.8a: toda búsqueda válida renderiza también la sección del mapa. El wrapper de cliente
// (`next/dynamic`, ssr:false) no se puede renderizar sin navegador, así que se sustituye por
// un doble inerte; la consulta de puntos sí corre contra la base de datos real.
vi.mock('@/components/search-map', () => ({
  SearchMap: (): null => null,
}));

// ROADMAP 1.15 (security-hardening, validador notes obs #263) — "page test
// asserts the next/headers mock is NOT called when CLIENT_IP_HEADER is
// unset". `CLIENT_IP_HEADER` se borra en el `beforeEach` de abajo, así que
// los seis casos YA EXISTENTES de este fichero siguen ejerciendo la ruta
// deshabilitada (D1a) — este mock permite comprobar que, en esa ruta,
// `next/headers` nunca se invoca.
const headersMock = vi.fn();
vi.mock('next/headers', () => ({ headers: headersMock }));

const { default: HomePage } = await import('../../src/app/page.js');

async function insertMunicipality(
  db: Database,
  overrides: {
    readonly ineCode: string;
    readonly municipality: string;
    readonly searchName: string;
    readonly state?: string;
    readonly centroid?: { readonly latitude: number; readonly longitude: number };
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
  return { locationId: location.id, zoneId: zone.id };
}

function randomIneCode(): string {
  return String(randomInt(10_000, 100_000));
}

async function renderHome(searchParams: Record<string, string>): Promise<string> {
  const element = await HomePage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describeWithDb('HomePage — los tres casos honestos de degradación (D6, DD-14, CR-10, CR-12)', () => {
  let db: Database;
  let pool: import('../helpers/db-client.js').TestDbHandle['pool'];
  const originalCap = process.env.NEW_ZONES_DAILY_CAP;

  beforeAll(() => {
    ({ db, pool } = connectTestDb());
  });

  afterAll(async () => {
    await pool.end();
    if (originalCap !== undefined) {
      process.env.NEW_ZONES_DAILY_CAP = originalCap;
    } else {
      delete process.env.NEW_ZONES_DAILY_CAP;
    }
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await db.insert(sources).values({ key: 'idealista', name: 'Idealista', kind: 'api' });
    process.env.NEW_ZONES_DAILY_CAP = '10';
    // D1a: deshabilitado por defecto en cada caso — los seis casos
    // EXISTENTES de abajo nunca configuran el limitador por cliente, así
    // que deben seguir ejerciendo la ruta deshabilitada, nunca `next/headers`.
    delete process.env.CLIENT_IP_HEADER;
    headersMock.mockReset();
  });

  afterEach(() => {
    delete process.env.NEW_ZONES_DAILY_CAP;
    delete process.env.CLIENT_IP_HEADER;
    delete process.env.CLIENT_IP_HMAC_KEY;
    delete process.env.COVERAGE_PER_CLIENT_DAILY_CAP;
    delete process.env.PROXY_RATE_LIMIT_MAX;
    delete process.env.PROXY_RATE_LIMIT_WINDOW_SECONDS;
  });

  it('zona covered: renderiza resultados SIN ninguna notificación de cobertura', async () => {
    const ineCode = randomIneCode();
    await insertMunicipality(db, { ineCode, municipality: 'Zona Cubierta', searchName: 'zona cubierta', state: 'covered', centroid: { latitude: 37.1, longitude: -3.6 } });

    const html = await renderHome({ zone: ineCode });
    expect(html).not.toMatch(/no hay cobertura|límite diario|no se ha encontrado ningún municipio/i);
  });

  it('zona uncovered con job YA registrado: markup server-rendered muestra el estado Y un enlace de recarga plano con href real', async () => {
    const ineCode = randomIneCode();
    const { zoneId } = await insertMunicipality(db, {
      ineCode,
      municipality: 'Zona Pendiente',
      searchName: 'zona pendiente',
      centroid: { latitude: 37.1, longitude: -3.6 },
    });
    const [sourceRow] = await db.select({ id: sources.id }).from(sources);
    if (!sourceRow) throw new Error('sin source');
    await registerCoverageJob(db, zoneId, sourceRow.id);

    const html = await renderHome({ zone: ineCode });
    expect(html).toMatch(/pendiente/i);
    expect(html).toMatch(/href="\/\?zone=/);
  });

  it('DD-14: tope de zonas nuevas agotado: notificación NOMBRADA, cero filas nuevas en coverage_jobs', async () => {
    process.env.NEW_ZONES_DAILY_CAP = '1';
    // Consume la única plaza del tope con una zona ya registrada hoy.
    const already = await insertMunicipality(db, {
      ineCode: randomIneCode(),
      municipality: 'Ya Abierta',
      searchName: 'ya abierta',
      centroid: { latitude: 37.1, longitude: -3.6 },
    });
    const [sourceRow] = await db.select({ id: sources.id }).from(sources);
    if (!sourceRow) throw new Error('sin source');
    await registerCoverageJob(db, already.zoneId, sourceRow.id);

    const ineCode = randomIneCode();
    await insertMunicipality(db, { ineCode, municipality: 'Sin Plaza', searchName: 'sin plaza', centroid: { latitude: 37.2, longitude: -3.7 } });

    const html = await renderHome({ zone: ineCode });
    expect(html).toMatch(/límite diario/i);
    // validador notes obs #263: con CLIENT_IP_HEADER sin definir,
    // resolveCoverageClientLimit() nunca invoca next/headers.
    expect(headersMock).not.toHaveBeenCalled();
  });

  // ROADMAP 1.15 (security-hardening, spec #261 "A Per-Client Limit Hit Is
  // The Distinct Outcome client-cap-exhausted...", diseño decisión 079) —
  // CUARTO caso honesto de degradación, distinto de los tres de #214: el
  // tope GLOBAL tiene hueco (NEW_ZONES_DAILY_CAP='10', beforeEach), pero el
  // cliente concreto ya agotó SU tope (dailyCap=1, agotado de antemano).
  // Necesita el rol `web_coverage` (la cuota se consume con el handle de
  // escritura): sin WEB_COVERAGE_DATABASE_URL se OMITE, como el resto de
  // pruebas de ese rol (helpers/coverage-db-gate.ts), nunca falla.
  it.skipIf(!process.env.WEB_COVERAGE_DATABASE_URL)('spec #261: client-cap-exhausted -> notificación DISTINTA de "límite diario" (D6, decisión 079)', async () => {
    process.env.CLIENT_IP_HEADER = 'x-forwarded-for';
    process.env.CLIENT_IP_HMAC_KEY = 'a'.repeat(32);
    // cap=1: coincide con el consumeClientQuota(..., 1) de abajo que agota
    // la cuota de antemano — un cap distinto entre el pre-consumo directo y
    // el que lee resolveCoverageClientLimit() dejaría hueco de sobra.
    process.env.COVERAGE_PER_CLIENT_DAILY_CAP = '1';
    process.env.PROXY_RATE_LIMIT_MAX = '10';
    process.env.PROXY_RATE_LIMIT_WINDOW_SECONDS = '60';

    const clientIp = '9.9.9.9';
    headersMock.mockResolvedValue({
      get: (name: string): string | null => (name === 'x-forwarded-for' ? clientIp : null),
    });
    const keyHash = hmacClientKey(clientIp, process.env.CLIENT_IP_HMAC_KEY);
    await consumeClientQuota(db, keyHash, 1); // agota de antemano el tope=1 de este cliente

    const ineCode = randomIneCode();
    await insertMunicipality(db, {
      ineCode,
      municipality: 'Con Cliente Agotado',
      searchName: 'con cliente agotado',
      centroid: { latitude: 37.1, longitude: -3.6 },
    });

    const html = await renderHome({ zone: ineCode });
    expect(html).toMatch(/límite personal/i);
    expect(html).not.toMatch(/límite diario/i);
    expect(headersMock).toHaveBeenCalledTimes(1);
  });

  it('CR-12: municipio SIN centroide seleccionado por zone -> notificación NOMBRADA distinta, nunca un registro', async () => {
    const ineCode = randomIneCode();
    await insertMunicipality(db, { ineCode, municipality: 'Sin Centroide', searchName: 'sin centroide' });

    const html = await renderHome({ zone: ineCode });
    expect(html).toMatch(/no hay cobertura disponible/i);
  });

  it('código INE bien formado pero desconocido: notificación distinta de la anterior', async () => {
    const html = await renderHome({ zone: '00000' });
    expect(html).toMatch(/no se ha encontrado ningún municipio/i);
  });

  it('CR-10/DD-19: ?zoneQuery= renderiza sugerencias JUNTO a los resultados existentes, en la MISMA respuesta', async () => {
    await insertMunicipality(db, { ineCode: randomIneCode(), municipality: 'Granada', searchName: 'granada', centroid: { latitude: 37.1, longitude: -3.6 } });
    await insertMunicipality(db, { ineCode: randomIneCode(), municipality: 'Granada Sin Centroide', searchName: 'granada sin centroide' });

    const html = await renderHome({ zoneQuery: 'gran' });
    expect(html).toMatch(/Granada/);
    // CR-12 en la lista de sugerencias: el municipio sin centroide aparece IGUAL, marcado.
    expect(html).toMatch(/sin cobertura/i);
  });

  // ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102, spec QSR-3,
  // S-QSR-1, S-QSR-7, S-PS-9) — la señal de demanda se registra desde la
  // página, con el rol `web_coverage`, y NUNCA rompe la búsqueda.
  async function countSignals(zoneId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      'select count(*)::text as count from zone_query_signals where zone_id = $1',
      [zoneId]
    );
    return Number(rows[0]?.count);
  }

  it.skipIf(!process.env.WEB_COVERAGE_DATABASE_URL)(
    'S-QSR-1: una búsqueda sobre zona COVERED registra exactamente una señal (zona, hoy), aunque se repita',
    async () => {
      const ineCode = randomIneCode();
      const { zoneId } = await insertMunicipality(db, {
        ineCode,
        municipality: 'Zona Cubierta',
        searchName: 'zona cubierta',
        state: 'covered',
        centroid: { latitude: 37.1, longitude: -3.6 },
      });

      await renderHome({ zone: ineCode });
      await renderHome({ zone: ineCode });

      expect(await countSignals(zoneId)).toBe(1);
    }
  );

  it.skipIf(!process.env.WEB_COVERAGE_DATABASE_URL)(
    'la señal se registra también para una zona UNCOVERED con centroide (cualquier estado)',
    async () => {
      const ineCode = randomIneCode();
      const { zoneId } = await insertMunicipality(db, {
        ineCode,
        municipality: 'Zona Sin Cubrir',
        searchName: 'zona sin cubrir',
        centroid: { latitude: 37.2, longitude: -3.7 },
      });

      await renderHome({ zone: ineCode });

      expect(await countSignals(zoneId)).toBe(1);
    }
  );

  it.skipIf(!process.env.WEB_COVERAGE_DATABASE_URL)(
    'un municipio SIN centroide no registra señal (no es barrible, no genera demanda de refresco)',
    async () => {
      const ineCode = randomIneCode();
      const { zoneId } = await insertMunicipality(db, {
        ineCode,
        municipality: 'Sin Centroide',
        searchName: 'sin centroide',
      });

      await renderHome({ zone: ineCode });

      expect(await countSignals(zoneId)).toBe(0);
    }
  );

  it('S-QSR-7: sin WEB_COVERAGE_DATABASE_URL la búsqueda se renderiza igual y el error se registra sin secretos', async () => {
    const ineCode = randomIneCode();
    await insertMunicipality(db, {
      ineCode,
      municipality: 'Zona Cubierta',
      searchName: 'zona cubierta',
      state: 'covered',
      centroid: { latitude: 37.1, longitude: -3.6 },
    });
    const holder = globalThis as unknown as { buscahogarCoverageDb?: unknown };
    const cachedHandle = holder.buscahogarCoverageDb;
    const originalUrl = process.env.WEB_COVERAGE_DATABASE_URL;
    delete holder.buscahogarCoverageDb;
    delete process.env.WEB_COVERAGE_DATABASE_URL;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const html = await renderHome({ zone: ineCode });

      expect(html).toMatch(/\d+ resultados?/);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toMatch(/señal de demanda.*WEB_COVERAGE_DATABASE_URL/);
    } finally {
      errorSpy.mockRestore();
      holder.buscahogarCoverageDb = cachedHandle;
      if (originalUrl !== undefined) {
        process.env.WEB_COVERAGE_DATABASE_URL = originalUrl;
      }
    }
  });

  it('S-PS-9: con fetch global sustituido por uno que lanza, la búsqueda funciona y fetch nunca se llama', async () => {
    const ineCode = randomIneCode();
    await insertMunicipality(db, {
      ineCode,
      municipality: 'Zona Cubierta',
      searchName: 'zona cubierta',
      state: 'covered',
      centroid: { latitude: 37.1, longitude: -3.6 },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('la web no debe llamar a fuentes externas'));

    try {
      const html = await renderHome({ zone: ineCode });

      expect(html).toMatch(/\d+ resultados?/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
