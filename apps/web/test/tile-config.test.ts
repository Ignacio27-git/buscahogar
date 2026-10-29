// ROADMAP 3.4 (decisión 261, enmienda la 112; R9.1, R9.2, PD6, PD11) — la plantilla de teselas, el
// host de la CSP y la atribución salen de UNA configuración validada con Zod. Por defecto, las
// teselas estándar de OpenStreetMap (NF5); un proveedor propio exige https, un único host, sin
// credenciales en la URL ni fragmento, y SÍ admite una cadena de consulta con parámetros literales
// (una clave publicable restringida por dominio, nunca un secreto).
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TILE_URL_TEMPLATE,
  InvalidTileConfigError,
  parseTileConfig,
  renderAttributionHtml,
} from '../src/lib/tile-config.js';

const OSM_ATTRIBUTION_HTML = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

describe('parseTileConfig — valores por defecto (NF5)', () => {
  it('sin variables: plantilla, host y atribución de OpenStreetMap', () => {
    const config = parseTileConfig({});
    expect(config.urlTemplate).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(config.urlTemplate).toBe(DEFAULT_TILE_URL_TEMPLATE);
    expect(config.imgSrcOrigin).toBe('https://tile.openstreetmap.org');
    expect(renderAttributionHtml(config.attribution)).toBe(OSM_ATTRIBUTION_HTML);
    expect(config.attribution).toEqual({
      prefix: '© ',
      label: 'OpenStreetMap',
      href: 'https://www.openstreetmap.org/copyright',
    });
  });

  it('las variables vacías equivalen a no definidas', () => {
    expect(parseTileConfig({ TILE_URL_TEMPLATE: '', TILE_ATTRIBUTION: '' })).toEqual(parseTileConfig({}));
  });

  it('la plantilla por defecto escrita a mano conserva la atribución de OpenStreetMap', () => {
    const config = parseTileConfig({ TILE_URL_TEMPLATE: DEFAULT_TILE_URL_TEMPLATE });
    expect(renderAttributionHtml(config.attribution)).toBe(OSM_ATTRIBUTION_HTML);
  });
});

describe('parseTileConfig — proveedor propio', () => {
  it('acepta una plantilla https con clave publicable en la consulta y el host de la CSP no la lleva', () => {
    const config = parseTileConfig({
      TILE_URL_TEMPLATE: 'https://tiles.example.com/v3/{z}/{x}/{y}.png?key=PUBLISHABLE-123',
      TILE_ATTRIBUTION: '© Example Maps © OpenStreetMap contributors',
    });
    expect(config.urlTemplate).toBe('https://tiles.example.com/v3/{z}/{x}/{y}.png?key=PUBLISHABLE-123');
    expect(config.imgSrcOrigin).toBe('https://tiles.example.com');
    expect(config.imgSrcOrigin).not.toContain('key');
    expect(config.attribution).toEqual({
      prefix: '',
      label: '© Example Maps © OpenStreetMap contributors',
      href: null,
    });
  });

  it('conserva un puerto explícito en el origen de la CSP', () => {
    const config = parseTileConfig({
      TILE_URL_TEMPLATE: 'https://tiles.example.com:8443/{z}/{x}/{y}.png',
      TILE_ATTRIBUTION: 'Example',
    });
    expect(config.imgSrcOrigin).toBe('https://tiles.example.com:8443');
  });

  it('la atribución se escapa al convertirla a HTML (texto plano, nunca marcado)', () => {
    const config = parseTileConfig({
      TILE_URL_TEMPLATE: 'https://tiles.example.com/{z}/{x}/{y}.png',
      TILE_ATTRIBUTION: 'A & B "mapas"',
    });
    expect(renderAttributionHtml(config.attribution)).toBe('A &amp; B &quot;mapas&quot;');
  });

  it('la atribución con enlace (la de OpenStreetMap) se renderiza con su href', () => {
    expect(
      renderAttributionHtml({ prefix: '© ', label: 'Proveedor', href: 'https://proveedor.example/copyright' })
    ).toBe('© <a href="https://proveedor.example/copyright">Proveedor</a>');
  });
});

describe('parseTileConfig — plantillas rechazadas (arranque con error)', () => {
  const ATTRIBUTION = 'Example';

  it.each([
    ['http en lugar de https', 'http://tiles.example.com/{z}/{x}/{y}.png'],
    ['credenciales en la URL', 'https://user:pass@tiles.example.com/{z}/{x}/{y}.png'],
    ['solo usuario en la URL', 'https://user@tiles.example.com/{z}/{x}/{y}.png'],
    ['fragmento', 'https://tiles.example.com/{z}/{x}/{y}.png#frag'],
    ['subdominios {s}', 'https://{s}.tiles.example.com/{z}/{x}/{y}.png'],
    ['{s} fuera del host', 'https://tiles.example.com/{s}/{z}/{x}/{y}.png'],
    ['marcador desconocido', 'https://tiles.example.com/{z}/{x}/{y}{r}.png'],
    ['falta {z}', 'https://tiles.example.com/{x}/{y}.png'],
    ['falta {x}', 'https://tiles.example.com/{z}/{y}.png'],
    ['falta {y}', 'https://tiles.example.com/{z}/{x}.png'],
    ['sin esquema', 'tiles.example.com/{z}/{x}/{y}.png'],
    ['cadena arbitraria', 'esto no es una url'],
    ['comodín en el host', 'https://*.example.com/{z}/{x}/{y}.png'],
  ])('rechaza %s', (_name, template) => {
    expect(() => parseTileConfig({ TILE_URL_TEMPLATE: template, TILE_ATTRIBUTION: ATTRIBUTION })).toThrow(
      InvalidTileConfigError
    );
  });

  it('el mensaje de error nombra la variable y no repite la plantilla (la clave no se vuelca)', () => {
    const template = 'http://tiles.example.com/{z}/{x}/{y}.png?key=SUPERCLAVE';
    let message = '';
    try {
      parseTileConfig({ TILE_URL_TEMPLATE: template, TILE_ATTRIBUTION: ATTRIBUTION });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('TILE_URL_TEMPLATE');
    expect(message).not.toContain('SUPERCLAVE');
  });
});

describe('parseTileConfig — atribución rechazada', () => {
  const TEMPLATE = 'https://tiles.example.com/{z}/{x}/{y}.png';

  it('un proveedor propio exige atribución', () => {
    expect(() => parseTileConfig({ TILE_URL_TEMPLATE: TEMPLATE })).toThrow(InvalidTileConfigError);
    expect(() => parseTileConfig({ TILE_URL_TEMPLATE: TEMPLATE, TILE_ATTRIBUTION: '' })).toThrow(
      InvalidTileConfigError
    );
  });

  it('una atribución en blanco se rechaza', () => {
    expect(() => parseTileConfig({ TILE_URL_TEMPLATE: TEMPLATE, TILE_ATTRIBUTION: '   ' })).toThrow(
      InvalidTileConfigError
    );
  });

  it('la atribución es texto plano: se rechaza el marcado', () => {
    expect(() =>
      parseTileConfig({ TILE_URL_TEMPLATE: TEMPLATE, TILE_ATTRIBUTION: '<a href="https://x.test">x</a>' })
    ).toThrow(InvalidTileConfigError);
  });

  it('TILE_ATTRIBUTION sin TILE_URL_TEMPLATE se rechaza: la atribución de OpenStreetMap (ODbL) no se sustituye', () => {
    expect(() => parseTileConfig({ TILE_ATTRIBUTION: 'Otra' })).toThrow(InvalidTileConfigError);
  });

  it('recorta los espacios de la atribución válida', () => {
    const config = parseTileConfig({ TILE_URL_TEMPLATE: TEMPLATE, TILE_ATTRIBUTION: '  Example  ' });
    expect(config.attribution.label).toBe('Example');
  });
});
