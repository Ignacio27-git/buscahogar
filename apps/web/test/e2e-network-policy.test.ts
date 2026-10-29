// Paso D.1a (spec visual-regression-suite R8, S8.1/S8.2; diseño A5/A6, decisión
// 137) — clasificación PURA de las peticiones del navegador en el e2e. Vive en
// `apps/web/test` (vitest) y no importa `@playwright/test`, por eso se puede
// probar sin navegador. El origen es esquema + host + puerto: un origen
// «mejorado» a https por `upgrade-insecure-requests` es OTRO origen y se
// clasifica como externo, que es justo lo que delata un fallo de la CSP.
import { describe, expect, it } from 'vitest';

import { classifyRequest } from '../e2e/network-policy';

const APP_ORIGIN = 'http://127.0.0.1:3100';

describe('classifyRequest', () => {
  it('S8.1 reconoce las teselas de OpenStreetMap por https', () => {
    expect(classifyRequest('https://tile.openstreetmap.org/12/2013/1569.png', APP_ORIGIN)).toBe(
      'tile'
    );
  });

  it('reconoce el origen de la aplicación, con cualquier ruta y query', () => {
    expect(classifyRequest('http://127.0.0.1:3100/', APP_ORIGIN)).toBe('app');
    expect(classifyRequest('http://127.0.0.1:3100/_next/static/chunks/a.js?v=1', APP_ORIGIN)).toBe(
      'app'
    );
  });

  it('A6 un origen mejorado a https (upgrade-insecure-requests) es externo', () => {
    expect(classifyRequest('https://127.0.0.1:3100/', APP_ORIGIN)).toBe('external');
  });

  it('S8.2 cualquier otro host es externo', () => {
    expect(classifyRequest('https://example.com/x', APP_ORIGIN)).toBe('external');
    expect(classifyRequest('http://127.0.0.1:3101/', APP_ORIGIN)).toBe('external');
    expect(classifyRequest('http://localhost:3100/', APP_ORIGIN)).toBe('external');
  });

  it('no se deja engañar por hosts que solo se parecen al de las teselas', () => {
    expect(classifyRequest('https://tile.openstreetmap.org.evil.test/1/1/1.png', APP_ORIGIN)).toBe(
      'external'
    );
    expect(classifyRequest('https://a.tile.openstreetmap.org/1/1/1.png', APP_ORIGIN)).toBe(
      'external'
    );
    expect(classifyRequest('http://tile.openstreetmap.org/1/1/1.png', APP_ORIGIN)).toBe('external');
    expect(
      classifyRequest('https://example.com/?next=https://tile.openstreetmap.org/', APP_ORIGIN)
    ).toBe('external');
  });

  it('las URL data: y blob: no salen a la red y no cuentan como externas', () => {
    expect(classifyRequest('data:image/png;base64,AAAA', APP_ORIGIN)).toBe('inline');
    expect(classifyRequest('blob:http://127.0.0.1:3100/0a1b', APP_ORIGIN)).toBe('inline');
  });

  it('una URL ilegible se trata como externa (fallo cerrado)', () => {
    expect(classifyRequest('no es una url', APP_ORIGIN)).toBe('external');
  });
});
