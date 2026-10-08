// D.14 (decisión 189) — página 429 en español. Módulo puro que el proxy alcanza: se prueba el
// cuerpo, las cabeceras (con `Retry-After` sin tocar) y que no importa `server-only`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildRateLimitResponse } from '../src/server/rate-limit-page.js';
import { STANDALONE_PAGE_CSS } from '../src/lib/standalone-page.js';

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('buildRateLimitResponse — cuerpo', () => {
  const { body } = buildRateLimitResponse(30);

  it('es un documento HTML en español con título y un h1 en tuteo', () => {
    expect(body.startsWith('<!doctype html>')).toBe(true);
    expect(body).toContain('<html lang="es">');
    expect(body).toContain('<title>Demasiadas peticiones seguidas</title>');
    expect(body).toContain('<h1>Demasiadas peticiones seguidas</h1>');
    expect(visibleText(body)).toContain('Espera 30 segundos y vuelve a cargar la página.');
    expect(visibleText(body)).toMatch(/temporal/);
  });

  it('no usa texto técnico ni inglés y no depende de recursos externos', () => {
    expect(body).not.toContain('Too Many Requests');
    expect(visibleText(body)).not.toMatch(/\b(429|HTTP|rate)\b/i);
    expect(body).not.toMatch(/<script|<link|url\(|https?:\/\//);
  });

  it('incrusta el CSS autónomo, que elige el esquema con prefers-color-scheme', () => {
    expect(body).toContain(STANDALONE_PAGE_CSS);
    expect(body).toContain('prefers-color-scheme: dark');
  });
});

describe('buildRateLimitResponse — cabeceras', () => {
  it('HTML con charset, Retry-After tal cual, no-store y sin RateLimit-*', () => {
    const { headers } = buildRateLimitResponse(42);

    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(headers['Retry-After']).toBe('42');
    expect(headers['Cache-Control']).toBe('no-store');
    expect(Object.keys(headers).filter((name) => /^ratelimit/i.test(name))).toEqual([]);
  });

  it.each([
    [0, '0', 'Espera 1 segundo y'],
    [0.2, '0.2', 'Espera 1 segundo y'],
    [1, '1', 'Espera 1 segundo y'],
    [59, '59', 'Espera 59 segundos y'],
    [60, '60', 'Espera 1 minuto y'],
    [90, '90', 'Espera 2 minutos y'],
    [3600, '3600', 'Espera 60 minutos y'],
  ])('retry %s: cabecera «%s» intacta y texto «%s» recortado solo al mostrarse', (seconds, header, text) => {
    const { body, headers } = buildRateLimitResponse(seconds);

    expect(headers['Retry-After']).toBe(header);
    expect(visibleText(body)).toContain(text);
  });

  it('un valor no finito no rompe el texto (se muestra 1 segundo) y la cabecera sigue siendo String(n)', () => {
    const { body, headers } = buildRateLimitResponse(Number.NaN);

    expect(visibleText(body)).toContain('Espera 1 segundo y');
    expect(headers['Retry-After']).toBe('NaN');
  });
});

describe('módulo', () => {
  it('no importa server-only (el proxy corre fuera del grafo de componentes de servidor)', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/server/rate-limit-page.ts', import.meta.url)), 'utf8');

    expect(source).not.toMatch(/^\s*import\s+['"]server-only['"]/m);
  });
});
