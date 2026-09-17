// ROADMAP 1.11 — resolveThumbnailSource (diseño, arbitraje obs #175, escenario
// (iii)): la decisión entre miniatura real y placeholder se extrae a una
// función pura, testable en node plano sin renderizar ningún componente —
// exactamente la ruta que el arbitraje eligió para hacer falsificable el
// escenario "sin miniatura es un estado normal".
import { describe, expect, it } from 'vitest';

import { resolveThumbnailSource } from '../src/components/thumbnail-source.js';

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
