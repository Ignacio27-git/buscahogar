// ROADMAP 1.13 (diseño CR-11, DD-4, DD-5) — puerta de cordura del importador:
// caja delimitadora de España + consistencia de provincia + guarda de
// esparcimiento (spread guard). Las tres comparten UN SOLO camino de código
// y un solo resultado (DD-5: "una sola disposición para una fila mala y para
// un fallo de la puerta — la misma disposición, no dos ramas"): la fila se
// importa IGUAL, sin centroide, nunca con un valor sustituto o interpolado.
//
// `provinceBounds` se recibe SIEMPRE inyectado, nunca hardcodeado dentro de
// este módulo: ninguna fuente disponible en este proyecto puede verificar
// las 52 cajas delimitadoras provinciales reales (mismo principio que R7 —
// nunca fabricar un dato geográfico que no se puede comprobar). `null`
// significa "el operador aún no ha rellenado el límite de esta provincia":
// la comprobación de provincia se omite explícitamente, nunca se adivina.
import { describe, expect, it } from 'vitest';

import { checkSanity, SPAIN_BBOX } from '../../src/catalogue/sanity.js';
import { RADIUS_CEILING_M } from '../../src/catalogue/geo.js';

const GRANADA = { latitude: 37.177336, longitude: -3.598557 };
const OUTSIDE_SPAIN = { latitude: 60.0, longitude: 30.0 }; // Rusia — deliberadamente absurdo
const GRANADA_PROVINCE_BOUNDS = { minLat: 36.6, maxLat: 37.6, minLon: -4.2, maxLon: -2.6 };
const MADRID_PROVINCE_BOUNDS = { minLat: 39.8, maxLat: 41.2, minLon: -4.6, maxLon: -3.0 };

describe('checkSanity (CR-11, DD-4, DD-5) — un único camino de código para las tres comprobaciones', () => {
  it('una fila dentro de España, consistente con su provincia y sin hermanas lejanas: pasa', () => {
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [],
      provinceBounds: GRANADA_PROVINCE_BOUNDS,
    });
    expect(result).toEqual({ passed: true, reason: null });
  });

  it('fuera de la caja delimitadora de España: falla con reason="out-of-spain-bbox", nunca lanza', () => {
    const result = checkSanity({
      tier: 'tier-1',
      centroid: OUTSIDE_SPAIN,
      siblingCoordinates: [],
      provinceBounds: null,
    });
    expect(result).toEqual({ passed: false, reason: 'out-of-spain-bbox' });
  });

  it('dentro de España pero fuera de los límites de SU provincia declarada: falla con reason="province-mismatch"', () => {
    // Coordenada de Granada evaluada contra los límites de Madrid.
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [],
      provinceBounds: MADRID_PROVINCE_BOUNDS,
    });
    expect(result).toEqual({ passed: false, reason: 'province-mismatch' });
  });

  it('provinceBounds=null (operador no lo ha rellenado aún): la comprobación de provincia se OMITE, nunca se adivina', () => {
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [],
      provinceBounds: null,
    });
    expect(result).toEqual({ passed: true, reason: null });
  });

  it('tier-2/tier-3 con una hermana cuya distancia excede el TECHO: falla con reason="spread-guard" — misma disposición que un fallo de caja/provincia', () => {
    const farSibling = { latitude: GRANADA.latitude + 2, longitude: GRANADA.longitude }; // ~222 km
    const result = checkSanity({
      tier: 'tier-3',
      centroid: GRANADA,
      siblingCoordinates: [farSibling],
      provinceBounds: GRANADA_PROVINCE_BOUNDS,
    });
    expect(result).toEqual({ passed: false, reason: 'spread-guard' });
  });

  it('tier-1 NUNCA se somete a la guarda de esparcimiento, aunque tenga hermanas muy lejanas (es la fila autoritativa)', () => {
    const farSibling = { latitude: GRANADA.latitude + 2, longitude: GRANADA.longitude };
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [farSibling],
      provinceBounds: GRANADA_PROVINCE_BOUNDS,
    });
    expect(result).toEqual({ passed: true, reason: null });
  });

  it('una hermana justo en el TECHO (no por encima) no dispara la guarda de esparcimiento', () => {
    // Construida para distar exactamente RADIUS_CEILING_M no es práctico con
    // grados; se prueba el umbral con un techo inyectado explícito en su
    // lugar, para no acoplar el test a la conversión grados↔metros.
    const nearCeilingSibling = { latitude: GRANADA.latitude + 0.01, longitude: GRANADA.longitude }; // ~1112 m
    const result = checkSanity({
      tier: 'tier-2',
      centroid: GRANADA,
      siblingCoordinates: [nearCeilingSibling],
      provinceBounds: GRANADA_PROVINCE_BOUNDS,
      spreadCeilingM: RADIUS_CEILING_M,
    });
    expect(result).toEqual({ passed: true, reason: null });
  });

  it('SPAIN_BBOX incluye Canarias (longitud mínima más occidental que la península)', () => {
    expect(SPAIN_BBOX.minLon).toBeLessThan(-9);
  });

  // Adaptación al fichero real (continuación 1.13) — mitad de la puerta de
  // cordura que llevaba inerte desde que se escribió: antes no existía
  // ninguna tabla de provincias contra la que comprobar `COD_PROV`. Ahora
  // `PROVINCIAS.csv` la aporta, así que se activa: el `COD_PROV` declarado
  // por la fila de MUNICIPIOS.csv debe coincidir con el prefijo de 2 dígitos
  // del código de municipio ya derivado (join.ts). Es una comprobación de
  // INTEGRIDAD de datos (comparación de strings), no geográfica — por eso
  // es ortogonal a `provinceBounds` (que sigue inerte: sin cajas
  // delimitadoras reales de las 52 provincias, nunca fabricadas).
  it('COD_PROV declarado distinto del prefijo del código derivado: falla con reason="province-code-mismatch"', () => {
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [],
      provinceBounds: null,
      declaredProvinceCode: '29', // Málaga, pero el código derivado es 18087 (Granada)
      expectedProvinceCode: '18',
    });
    expect(result).toEqual({ passed: false, reason: 'province-code-mismatch' });
  });

  it('COD_PROV declarado coincide con el prefijo derivado: pasa', () => {
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [],
      provinceBounds: null,
      declaredProvinceCode: '18',
      expectedProvinceCode: '18',
    });
    expect(result).toEqual({ passed: true, reason: null });
  });

  it('sin declaredProvinceCode/expectedProvinceCode (compatibilidad hacia atrás): la comprobación se OMITE, nunca se adivina', () => {
    const result = checkSanity({
      tier: 'tier-1',
      centroid: GRANADA,
      siblingCoordinates: [],
      provinceBounds: null,
    });
    expect(result).toEqual({ passed: true, reason: null });
  });
});
