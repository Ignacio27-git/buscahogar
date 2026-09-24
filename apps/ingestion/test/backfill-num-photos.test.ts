// ROADMAP 1.12 — extractNumPhotos (diseño D5, mismo patrón que D6 para
// thumbnailUrl): función pura, sin base de datos. Lee el jsonb `raw` YA
// persistido, nunca gasta cuota. Este fichero prueba SOLO la extracción; el
// bucle principal (lectura de la versión más antigua + UPDATE idempotente) se
// prueba contra PostgreSQL real en test/db/backfill-num-photos.db.test.ts
// (fail-loud, sin describeWithDb).
import { describe, expect, it } from 'vitest';

import { extractNumPhotos } from '../scripts/backfill-num-photos.js';

describe('extractNumPhotos — lee raw.numPhotos sin tocar la red (docs/DECISIONS.md, decisión 062)', () => {
  it('devuelve el número cuando raw.numPhotos es un entero no negativo', () => {
    expect(extractNumPhotos({ numPhotos: 46 })).toBe(46);
  });

  it('devuelve 0 cuando raw.numPhotos es cero', () => {
    expect(extractNumPhotos({ numPhotos: 0 })).toBe(0);
  });

  it('devuelve undefined cuando raw es null', () => {
    expect(extractNumPhotos(null)).toBeUndefined();
  });

  it('devuelve undefined cuando falta la clave numPhotos', () => {
    expect(extractNumPhotos({ propertyCode: '123' })).toBeUndefined();
  });

  it('devuelve undefined cuando numPhotos es negativo (narrowing de unknown)', () => {
    expect(extractNumPhotos({ numPhotos: -1 })).toBeUndefined();
  });

  it('devuelve undefined cuando numPhotos no es un entero (narrowing de unknown)', () => {
    expect(extractNumPhotos({ numPhotos: 4.5 })).toBeUndefined();
  });

  it('devuelve undefined cuando numPhotos no es un número (tipo inesperado en el jsonb)', () => {
    expect(extractNumPhotos({ numPhotos: '46' })).toBeUndefined();
  });
});

describe('backfill-num-photos.ts — cero cuota: ningún import de src/sources/** (D5)', () => {
  it('el texto fuente no contiene ningún especificador que apunte a sources/', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const scriptPath = fileURLToPath(new URL('../scripts/backfill-num-photos.ts', import.meta.url));
    const source = readFileSync(scriptPath, 'utf8');
    const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(specifier).not.toMatch(/sources\//);
    }
  });
});
