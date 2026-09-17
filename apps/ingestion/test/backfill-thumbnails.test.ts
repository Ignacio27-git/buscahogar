// ROADMAP 1.11 — extractThumbnailUrl (diseño D6): función pura, sin base de
// datos. Lee el jsonb `raw` YA persistido, nunca gasta cuota. Este fichero
// prueba SOLO la extracción; el bucle principal (lectura de la versión más
// antigua + UPDATE idempotente) se prueba contra PostgreSQL real en
// test/db/backfill-thumbnails.db.test.ts (fail-loud, sin describeWithDb).
import { describe, expect, it } from 'vitest';

import { extractThumbnailUrl } from '../scripts/backfill-thumbnails.js';

describe('extractThumbnailUrl — lee raw.thumbnail sin tocar la red (D6)', () => {
  it('devuelve la URL cuando raw.thumbnail es una cadena no vacía', () => {
    expect(extractThumbnailUrl({ thumbnail: 'https://img4.idealista.com/foto.webp' })).toBe(
      'https://img4.idealista.com/foto.webp'
    );
  });

  it('devuelve undefined cuando raw es null', () => {
    expect(extractThumbnailUrl(null)).toBeUndefined();
  });

  it('devuelve undefined cuando falta la clave thumbnail', () => {
    expect(extractThumbnailUrl({ propertyCode: '123' })).toBeUndefined();
  });

  it('devuelve undefined cuando thumbnail es una cadena vacía', () => {
    expect(extractThumbnailUrl({ thumbnail: '' })).toBeUndefined();
  });

  it('devuelve undefined cuando thumbnail no es una cadena (tipo inesperado en el jsonb)', () => {
    expect(extractThumbnailUrl({ thumbnail: 12345 })).toBeUndefined();
  });
});
