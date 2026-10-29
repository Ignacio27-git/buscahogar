// ROADMAP 2.6 (map-view-search, decisión 115) — códec puro del polígono
// dibujado. Una fila por código de error nombrado; los casos límite del
// diseño (bow-tie, cierre duplicado, 50 vértices, L) van explícitos.
import { describe, expect, it } from 'vitest';

import {
  formatPolygonParam,
  parsePolygonParam,
  polygonAreaKm2,
  validatePolygonRing,
  type PolygonRing,
} from '../src/geo/polygon.js';

const SQUARE = '40,-3;40,-2.9;40.1,-2.9;40.1,-3';

function codeOf(raw: string): string | null {
  const result = parsePolygonParam(raw);
  return result.ok ? null : result.code;
}

// Anillo de 50 vértices sobre una circunferencia pequeña, a 5 decimales, con
// signos y longitud de 3 dígitos para forzar la codificación más larga.
function circle(n: number): PolygonRing {
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return {
      lat: Number((-45.5 + 0.05 * Math.sin(angle)).toFixed(5)),
      lon: Number((-123.5 + 0.05 * Math.cos(angle)).toFixed(5)),
    };
  });
}

describe('polygon — round trip y orden de ejes', () => {
  it('parsea lat,lng;... y lo devuelve en el mismo orden', () => {
    const result = parsePolygonParam(SQUARE);
    expect(result).toEqual({
      ok: true,
      ring: [
        { lat: 40, lon: -3 },
        { lat: 40, lon: -2.9 },
        { lat: 40.1, lon: -2.9 },
        { lat: 40.1, lon: -3 },
      ],
    });
  });

  it('format(parse(x)) reproduce el anillo y es determinista', () => {
    const result = parsePolygonParam('40.12345,-3.54321;40.12345,-3.4;40.2,-3.4;40.2,-3.54321');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const encoded = formatPolygonParam(result.ring);
    expect(encoded).toBe('40.12345,-3.54321;40.12345,-3.4;40.2,-3.4;40.2,-3.54321');
    const again = parsePolygonParam(encoded);
    expect(again.ok && again.ring).toEqual(result.ring);
  });

  it('format redondea a 5 decimales y no emite -0', () => {
    expect(formatPolygonParam([{ lat: 40.123456789, lon: -0.000001 }])).toBe('40.12346,0');
  });
});

describe('polygon — un código por fila', () => {
  it('too-long: 1.101 caracteres se rechazan antes de partir', () => {
    expect(codeOf('1,1;'.repeat(275) + '1')).toBe('too-long'); // 1.101
    expect(codeOf('a'.repeat(5000))).toBe('too-long');
  });

  it('too-long no se activa en exactamente 1.100 caracteres', () => {
    expect(codeOf('x'.repeat(1100))).toBe('malformed');
  });

  it.each([
    ['vacío', ''],
    ['sin coma dentro de un vértice', '40;40,-2.9;40.1,-2.9'],
    ['coma final', '40,-3;40,-2.9;40.1,-2.9;'],
    ['componente vacío', '40,;40,-2.9;40.1,-2.9'],
    ['texto', 'abc,def;40,-2.9;40.1,-2.9'],
    ['cantidad impar de números', '40,-3,5;40,-2.9;40.1,-2.9'],
    ['separadores erróneos', '40 -3|40 -2.9|40.1 -2.9'],
    ['6 decimales (no se redondea)', '40.123456,-3;40,-2.9;40.1,-2.9'],
    ['notación científica', '4e1,-3;40,-2.9;40.1,-2.9'],
    ['NaN', 'NaN,NaN;40,-2.9;40.1,-2.9'],
    ['Infinity', 'Infinity,1;40,-2.9;40.1,-2.9'],
    ['WKT', 'POLYGON((-3 40,-2.9 40,-2.9 40.1,-3 40))'],
    ['SQL', "1,1;2,2;3,3'); DROP TABLE properties;--"],
    ['unicode', '４０,-3;40,-2.9;40.1,-2.9'],
    ['espacios', ' 40,-3;40,-2.9;40.1,-2.9'],
  ])('malformed: %s', (_label, raw) => {
    expect(codeOf(raw)).toBe('malformed');
  });

  it('out-of-range: latitud 91 y longitud 181', () => {
    expect(codeOf('91,-3;40,-2.9;40.1,-2.9')).toBe('out-of-range');
    expect(codeOf('40,181;40,-2.9;40.1,-2.9')).toBe('out-of-range');
    expect(codeOf('-90.5,-3;40,-2.9;40.1,-2.9')).toBe('out-of-range');
  });

  it('too-few: 1 y 2 vértices', () => {
    expect(codeOf('40,-3')).toBe('too-few');
    expect(codeOf('40,-3;40,-2.9')).toBe('too-few');
  });

  it('too-many: 51 vértices', () => {
    expect(codeOf(formatPolygonParam(circle(51)))).toBe('too-many');
  });

  it('duplicate-vertex: consecutivo', () => {
    expect(codeOf('40,-3;40,-3;40.1,-2.9;40.1,-3')).toBe('duplicate-vertex');
  });

  it('duplicate-vertex: no consecutivo (no es self-intersecting)', () => {
    expect(codeOf('40,-3;40,-2.9;40.1,-2.9;40,-2.9;40.1,-3')).toBe('duplicate-vertex');
  });

  it('duplicate-vertex: el último igual al primero (anillo abierto, Q1)', () => {
    expect(codeOf(`${SQUARE};40,-3`)).toBe('duplicate-vertex');
  });

  it('degenerate: 3 vértices colineales', () => {
    expect(codeOf('40,-3;40.1,-3;40.2,-3')).toBe('degenerate');
  });

  it('degenerate: 5 vértices colineales, no self-intersecting', () => {
    expect(codeOf('0,0;1,1;2,2;3,3;4,4')).toBe('degenerate');
  });

  it('self-intersecting: bow-tie A(0,0) B(1,1) C(1,0) D(0,1) (área cero pero no colineal)', () => {
    expect(codeOf('0,0;1,1;1,0;0,1')).toBe('self-intersecting');
  });

  it('self-intersecting: vértice sobre una arista no adyacente', () => {
    // E(0,1) descansa sobre la arista A(0,0)-B(0,2): la arista D-E la toca.
    expect(codeOf('0,0;0,2;2,2;2,1;0,1')).toBe('self-intersecting');
  });

  it('self-intersecting: pico colineal entre aristas adyacentes', () => {
    // C vuelve sobre AB: aristas AB y BC colineales y solapadas.
    expect(codeOf('0,0;0,2;0,1;1,1')).toBe('self-intersecting');
  });

  it('too-large: polígono válido sobre el tope de 2.500 km²', () => {
    expect(codeOf('40,-3;40,-2.4;40.6,-2.4;40.6,-3')).toBe('too-large');
    expect(codeOf('0,0;0,10;10,10;10,0')).toBe('too-large');
  });

  it('el mensaje está en español, en tuteo y sin la clave polygon (la página pone el rótulo)', () => {
    const result = parsePolygonParam('abc');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('el enlace está dañado; vuelve a dibujar la zona.');
  });

  it.each([
    ['0,0;1,1', 'too-few', 'necesita al menos 3 vértices.'],
    ['0,0;0,0;1,1', 'duplicate-vertex', 'tiene un vértice repetido; vuelve a dibujar la zona.'],
    ['0,0;1,1;2,2', 'degenerate', 'sus vértices están alineados y no tiene área; vuelve a dibujar la zona.'],
    ['95,0;1,1;1,0', 'out-of-range', 'tiene puntos fuera del mapa; vuelve a dibujar la zona.'],
    ['0,0;0,10;10,10;10,0', 'too-large', 'supera el área máxima de 2500 km²; dibuja una zona más pequeña.'],
    ['1'.repeat(1101), 'too-long', 'es demasiado larga para el enlace; dibuja una zona más sencilla.'],
  ])('%s: código %s con su mensaje en español', (raw, code, message) => {
    const result = parsePolygonParam(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      expect(result.message).toBe(message);
    }
  });
});

describe('polygon — casos aceptados', () => {
  it('3 vértices (triángulo) son válidos', () => {
    expect(parsePolygonParam('40,-3;40,-2.9;40.1,-2.9').ok).toBe(true);
  });

  it('50 vértices son válidos y la codificación máxima cabe en 1.100', () => {
    const encoded = formatPolygonParam(circle(50));
    expect(encoded.length).toBeLessThanOrEqual(1100);
    expect(encoded.length).toBeGreaterThan(1000);
    const result = parsePolygonParam(encoded);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ring).toHaveLength(50);
  });

  it('una L no convexa es válida', () => {
    expect(parsePolygonParam('40,-3;40,-2.9;40.05,-2.9;40.05,-2.95;40.1,-2.95;40.1,-3').ok).toBe(true);
  });

  it('el sentido horario y antihorario son válidos y equivalentes en área', () => {
    const ccw = parsePolygonParam(SQUARE);
    const cw = parsePolygonParam('40.1,-3;40.1,-2.9;40,-2.9;40,-3');
    expect(ccw.ok && cw.ok).toBe(true);
    if (ccw.ok && cw.ok) expect(polygonAreaKm2(ccw.ring)).toBeCloseTo(polygonAreaKm2(cw.ring), 9);
  });

  it('acepta límites exactos de coordenadas', () => {
    expect(parsePolygonParam('-90,-180;-90,-179;-89,-179').ok).toBe(true);
    expect(parsePolygonParam('89,179;89,180;90,180').ok).toBe(true);
  });
});

describe('validatePolygonRing — anillos ya construidos (UI de dibujo)', () => {
  it('devuelve null para un anillo válido', () => {
    expect(validatePolygonRing(circle(20))).toBeNull();
  });

  it('devuelve el código y el mensaje para uno inválido', () => {
    expect(validatePolygonRing([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }])?.code).toBe('too-few');
    expect(validatePolygonRing(circle(51))?.code).toBe('too-many');
    expect(validatePolygonRing([{ lat: 91, lon: 0 }, { lat: 1, lon: 1 }, { lat: 2, lon: 0 }])?.code).toBe(
      'out-of-range'
    );
    expect(
      validatePolygonRing([
        { lat: 0, lon: 0 },
        { lat: 1, lon: 1 },
        { lat: 1, lon: 0 },
        { lat: 0, lon: 1 },
      ])?.message
    ).toBe('sus lados se cruzan; vuelve a dibujar la zona.');
  });
});

describe('polygonAreaKm2', () => {
  // Referencia esférica exacta: R² · Δλ · (sin φ2 − sin φ1).
  function sphericalBoxKm2(lat1: number, lat2: number, lon1: number, lon2: number): number {
    const rad = Math.PI / 180;
    return 6371 ** 2 * (lon2 - lon1) * rad * (Math.sin(lat2 * rad) - Math.sin(lat1 * rad));
  }

  it.each([
    [40, 40.1, -3, -2.9],
    [0, 0.2, 10, 10.2],
    [60, 60.1, 5, 5.3],
    [-35, -34.9, -60, -59.9],
  ])('caja %d..%d / %d..%d dentro del ±1 %% de la referencia esférica', (lat1, lat2, lon1, lon2) => {
    const ring: PolygonRing = [
      { lat: lat1, lon: lon1 },
      { lat: lat1, lon: lon2 },
      { lat: lat2, lon: lon2 },
      { lat: lat2, lon: lon1 },
    ];
    const expected = sphericalBoxKm2(lat1, lat2, lon1, lon2);
    expect(Math.abs(polygonAreaKm2(ring) - expected) / expected).toBeLessThan(0.01);
  });

  it('el área de un anillo cercano al tope (~2.400 km²) es <= 2.500 y vale la pena aceptarlo', () => {
    const ring: PolygonRing = [
      { lat: 40, lon: -3 },
      { lat: 40, lon: -2.5 },
      { lat: 40.5, lon: -2.5 },
      { lat: 40.5, lon: -3 },
    ];
    expect(polygonAreaKm2(ring)).toBeGreaterThan(2000);
    expect(validatePolygonRing(ring)).toBeNull();
  });
});
