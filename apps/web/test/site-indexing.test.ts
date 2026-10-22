// ROADMAP 3.4 (decisión 262, D20; R9.3, PD7) — interruptor de indexación. Apagado por defecto:
// `robots.txt` con `Disallow: /`, `noindex, nofollow` en las páginas y `/sitemap.xml` con 404.
// Encendido (`SITE_INDEXING=true`): se permite el rastreo y el mapa del sitio expone las páginas públicas.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata } from '../src/app/layout.js';
import robots from '../src/app/robots.js';
import * as sitemapRoute from '../src/app/sitemap.xml/route.js';
import { InvalidSiteIndexingError, parseSiteIndexing } from '../src/lib/site-indexing.js';
import { PUBLIC_SITEMAP_PATHS, buildSitemapXml } from '../src/lib/sitemap.js';

const SITE_URL = 'https://buscahogar.example';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseSiteIndexing', () => {
  it('sin variables: apagado y sin URL', () => {
    expect(parseSiteIndexing({})).toEqual({ enabled: false, siteUrl: null });
  });

  it.each(['', 'false'])('SITE_INDEXING=%j sigue apagado', (value) => {
    expect(parseSiteIndexing({ SITE_INDEXING: value })).toEqual({ enabled: false, siteUrl: null });
  });

  it('encendido exige SITE_URL y devuelve su origen sin barra final', () => {
    expect(parseSiteIndexing({ SITE_INDEXING: 'true', SITE_URL: `${SITE_URL}/` })).toEqual({
      enabled: true,
      siteUrl: SITE_URL,
    });
  });

  it('apagado también valida SITE_URL si se define, pero no la exige', () => {
    expect(parseSiteIndexing({ SITE_URL })).toEqual({ enabled: false, siteUrl: SITE_URL });
    expect(() => parseSiteIndexing({ SITE_URL: 'no es una url' })).toThrow(InvalidSiteIndexingError);
  });

  it.each([
    ['encendido sin SITE_URL', { SITE_INDEXING: 'true' }],
    ['valor desconocido de SITE_INDEXING', { SITE_INDEXING: 'yes', SITE_URL }],
    ['SITE_URL con ruta', { SITE_INDEXING: 'true', SITE_URL: `${SITE_URL}/ruta` }],
    ['SITE_URL con consulta', { SITE_INDEXING: 'true', SITE_URL: `${SITE_URL}/?a=1` }],
    ['SITE_URL con credenciales', { SITE_INDEXING: 'true', SITE_URL: 'https://u:p@buscahogar.example' }],
    ['SITE_URL sin http(s)', { SITE_INDEXING: 'true', SITE_URL: 'ftp://buscahogar.example' }],
  ])('rechaza %s', (_name, env) => {
    expect(() => parseSiteIndexing(env)).toThrow(InvalidSiteIndexingError);
  });
});

describe('robots.txt', () => {
  it('apagado (por defecto): Disallow: / para todos los agentes y sin mapa del sitio', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('encendido: permite el rastreo, excluye la API y apunta al mapa del sitio', () => {
    vi.stubEnv('SITE_INDEXING', 'true');
    vi.stubEnv('SITE_URL', SITE_URL);
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/theme'] },
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });
});

describe('metadatos de robots del layout', () => {
  it('apagado: noindex y nofollow, y se conservan título y descripción', () => {
    const metadata = generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toEqual({ default: 'Buscahogar', template: '%s · Buscahogar' });
    expect(typeof metadata.description).toBe('string');
  });

  it('encendido: no declara robots (el valor por defecto de los buscadores es indexar)', () => {
    vi.stubEnv('SITE_INDEXING', 'true');
    vi.stubEnv('SITE_URL', SITE_URL);
    const metadata = generateMetadata();
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toEqual({ default: 'Buscahogar', template: '%s · Buscahogar' });
  });
});

describe('buildSitemapXml', () => {
  it('genera un urlset con una <loc> absoluta por ruta, en orden', () => {
    const xml = buildSitemapXml(SITE_URL, ['/', '/legal/privacy']);
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        `  <url><loc>${SITE_URL}/</loc></url>\n` +
        `  <url><loc>${SITE_URL}/legal/privacy</loc></url>\n` +
        '</urlset>\n'
    );
  });

  it('escapa los caracteres especiales de XML en la ruta', () => {
    expect(buildSitemapXml(SITE_URL, ['/a?x=1&y=2'])).toContain(`<loc>${SITE_URL}/a?x=1&amp;y=2</loc>`);
  });

  it('las páginas públicas son la home y las tres páginas legales', () => {
    expect(PUBLIC_SITEMAP_PATHS).toEqual(['/', '/legal/privacy', '/legal/cookies', '/legal/notice']);
  });
});

describe('GET /sitemap.xml', () => {
  it('apagado (por defecto): 404 sin cuerpo XML', async () => {
    const response = sitemapRoute.GET();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('encendido: 200 application/xml con las páginas públicas', async () => {
    vi.stubEnv('SITE_INDEXING', 'true');
    vi.stubEnv('SITE_URL', SITE_URL);
    const response = sitemapRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(await response.text()).toBe(buildSitemapXml(SITE_URL, PUBLIC_SITEMAP_PATHS));
  });
});
