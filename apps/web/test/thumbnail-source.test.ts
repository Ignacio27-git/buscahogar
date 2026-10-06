// ROADMAP 1.11 — resolveThumbnailSource (diseño, arbitraje obs #175, escenario
// (iii)): la decisión entre miniatura real y placeholder se extrae a una
// función pura, testable en node plano sin renderizar ningún componente —
// exactamente la ruta que el arbitraje eligió para hacer falsificable el
// escenario "sin miniatura es un estado normal".
import { describe, expect, it } from 'vitest';

import { resolveThumbnailAlt, resolveThumbnailSource } from '../src/components/thumbnail-source.js';

describe('resolveThumbnailSource — presente vs. ausente (D5, spec: "No thumbnail is a normal state")', () => {
  it('devuelve la ruta de miniatura real cuando el valor está presente', () => {
    const result = resolveThumbnailSource('https://img4.idealista.com/foto.webp');
    expect(result).toEqual({ kind: 'thumbnail', url: 'https://img4.idealista.com/foto.webp' });
  });

  it('devuelve la ruta de placeholder cuando el valor es null (backfill sin miniatura)', () => {
    expect(resolveThumbnailSource(null)).toEqual({ kind: 'placeholder' });
  });

  it('devuelve la ruta de placeholder cuando el valor es undefined', () => {
    expect(resolveThumbnailSource(undefined)).toEqual({ kind: 'placeholder' });
  });
});

// D.6b (decisión 152) — política del texto alternativo: vacío solo cuando el
// texto de la fila ya identifica la vivienda (tipo, operación y dirección).
describe('resolveThumbnailAlt — S6, S7', () => {
  const identified = { propertyType: 'flat', operation: 'sale', address: 'Calle Mayor 1' } as const;

  it('tipo, operación y dirección presentes: alt vacío', () => {
    expect(resolveThumbnailAlt(identified)).toBe('');
  });

  it('sin tipo: alt fijo', () => {
    expect(resolveThumbnailAlt({ ...identified, propertyType: null })).toBe('Foto de la vivienda');
  });

  it('tipo desconocido cuenta como ausente', () => {
    expect(resolveThumbnailAlt({ ...identified, propertyType: 'castle' })).toBe('Foto de la vivienda');
  });

  it('sin operación: alt fijo', () => {
    expect(resolveThumbnailAlt({ ...identified, operation: null })).toBe('Foto de la vivienda');
  });

  it('sin dirección: alt fijo', () => {
    expect(resolveThumbnailAlt({ ...identified, address: null })).toBe('Foto de la vivienda');
  });

  it('dirección en blanco: alt fijo', () => {
    expect(resolveThumbnailAlt({ ...identified, address: '   ' })).toBe('Foto de la vivienda');
  });
});
