// D.11 (decisión 179) — sección «Ubicación» de la ficha: mosaico estático de 2×2
// teselas OSM, círculo de 500 m con trama y sin ningún punto. Server Component
// síncrono, así que `renderToStaticMarkup` lo cubre entero.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PropertyLocation } from '@/components/property-location';
import { OSM_TILE_URL_TEMPLATE, osmTileUrl } from '@/lib/osm-tiles';

const P1 = { lat: 40.3063, lon: -3.7324, municipality: 'Getafe' };

function render(property: { lat: number | null; lon: number | null; municipality: string | null }): string {
  return renderToStaticMarkup(<PropertyLocation property={property} />);
}

describe('PropertyLocation — con coordenadas', () => {
  const html = render(P1);

  it('pinta cuatro teselas con URL del módulo compartido, lazy, 256×256, sin referrerpolicy', () => {
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(4);
    for (const img of imgs) {
      expect(img).toMatch(/src="https:\/\/tile\.openstreetmap\.org\/14\/\d+\/\d+\.png"/);
      expect(img).toContain('alt=""');
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('width="256"');
      expect(img).toContain('height="256"');
      expect(img).not.toMatch(/referrerpolicy/i);
    }
  });

  it('el marco es una imagen con nombre accesible que cita 500 m y el municipio', () => {
    const frame = html.match(/<div class="location-map__frame"[^>]*>/)?.[0] ?? '';
    expect(frame).toContain('role="img"');
    expect(frame).toContain('aria-label="Mapa con el área aproximada de la vivienda: un círculo de unos 500 m de radio en Getafe."');
  });

  it('dibuja un único círculo de área, con la trama, sin ningún otro marcador', () => {
    expect(html.match(/<circle\b[^>]*location-map__area"/g)).toHaveLength(1);
    expect(html.match(/<circle\b/g)).toHaveLength(2); // área + filete
    expect(html).toContain('<pattern id="location-map-hatch"');
    expect(html).toContain('fill="url(#location-map-hatch)"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/marker|pin|crosshair/i);
    const r = Number(html.match(/<circle[^>]*class="location-map__area"[^>]*\br="([\d.]+)"/)?.[1]);
    expect(r).toBeGreaterThan(50);
  });

  it('lleva el aviso, la atribución enlazada y ningún atributo style', () => {
    expect(html).toContain('Ubicación aproximada');
    expect(html).toContain('<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>');
    expect(html).toContain('©');
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).toContain('<h2 id="ubicacion">Ubicación</h2>');
    expect(html).toContain('Getafe');
  });

  it('sin municipio muestra el mapa y el aviso, sin línea de municipio', () => {
    const noMunicipality = render({ ...P1, municipality: null });
    expect(noMunicipality.match(/<img\b/g)).toHaveLength(4);
    expect(noMunicipality).toContain('Ubicación aproximada');
    expect(noMunicipality).not.toContain('property-location__municipality');
    expect(noMunicipality).toContain('aria-label="Mapa con el área aproximada de la vivienda: un círculo de unos 500 m de radio."');
  });
});

describe('PropertyLocation — sin coordenadas', () => {
  it('con municipio: solo el título y el municipio, sin mapa, aviso ni atribución', () => {
    const html = render({ lat: null, lon: null, municipality: 'Getafe' });
    expect(html).toContain('<h2 id="ubicacion">Ubicación</h2>');
    expect(html).toContain('<p class="property-location__municipality">Getafe</p>');
    for (const absent of ['<img', '<svg', 'Ubicación aproximada', 'OpenStreetMap']) {
      expect(html).not.toContain(absent);
    }
  });

  it('un solo valor nulo también cuenta como sin coordenadas', () => {
    expect(render({ lat: 40.3, lon: null, municipality: 'Getafe' })).not.toContain('<img');
    expect(render({ lat: null, lon: -3.7, municipality: null })).toBe('');
  });

  it('sin coordenadas ni municipio no se pinta nada', () => {
    expect(render({ lat: null, lon: null, municipality: null })).toBe('');
  });
});

describe('osmTileUrl', () => {
  it('rellena la plantilla compartida', () => {
    expect(OSM_TILE_URL_TEMPLATE).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(osmTileUrl({ z: 14, x: 8021, y: 6183 })).toBe('https://tile.openstreetmap.org/14/8021/6183.png');
  });

  it('lanza RangeError con valores no enteros o fuera de rango', () => {
    expect(() => osmTileUrl({ z: 1.5, x: 0, y: 0 })).toThrow(RangeError);
    expect(() => osmTileUrl({ z: 20, x: 0, y: 0 })).toThrow(RangeError);
    expect(() => osmTileUrl({ z: 2, x: 4, y: 0 })).toThrow(RangeError);
    expect(() => osmTileUrl({ z: 2, x: 0, y: -1 })).toThrow(RangeError);
    expect(() => osmTileUrl({ z: 2, x: 0.5, y: 0 })).toThrow(RangeError);
  });
});
