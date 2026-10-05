// ROADMAP D.4 (decisión 145) — Route Handler POST /theme: 303 hecho a mano
// con cookie de preferencia, sin API de redirección de Next ni cookies().
import { describe, expect, it } from 'vitest';

import * as themeRoute from '../src/app/theme/route.js';

function post(
  body: BodyInit | null,
  options: { url?: string; headers?: Record<string, string> } = {}
): Request {
  return new Request(options.url ?? 'http://host.test/theme', {
    method: 'POST',
    body,
    headers: options.headers,
  });
}

function form(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields);
}

describe('POST /theme', () => {
  it('exporta únicamente POST', () => {
    expect(Object.keys(themeRoute)).toEqual(['POST']);
  });

  it.each([
    ['dark', 'theme=dark; Path=/; Max-Age=31536000; SameSite=Lax'],
    ['light', 'theme=light; Path=/; Max-Age=31536000; SameSite=Lax'],
    ['system', 'theme=; Path=/; Max-Age=0; SameSite=Lax'],
  ] as const)('theme=%s responde 303 con cookie y no-store', async (theme, cookie) => {
    const response = await themeRoute.POST(post(form({ theme })));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toBe(cookie);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('conserva la ruta del Referer same-origin', async () => {
    const response = await themeRoute.POST(
      post(form({ theme: 'dark' }), { headers: { referer: 'http://host.test/buscar?q=1' } })
    );
    expect(response.headers.get('Location')).toBe('/buscar?q=1');
  });

  it('un returnTo hostil no provoca 400 y no sale del origen', async () => {
    const response = await themeRoute.POST(
      post(form({ theme: 'dark', returnTo: '/..//evil.example' }))
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
  });

  it('añade Secure con URL https y con x-forwarded-proto https', async () => {
    const https = await themeRoute.POST(
      post(form({ theme: 'dark' }), { url: 'https://host.test/theme' })
    );
    expect(https.headers.get('Set-Cookie')).toMatch(/; Secure$/);

    const forwarded = await themeRoute.POST(
      post(form({ theme: 'dark' }), { headers: { 'x-forwarded-proto': 'https, http' } })
    );
    expect(forwarded.headers.get('Set-Cookie')).toMatch(/; Secure$/);

    const plain = await themeRoute.POST(post(form({ theme: 'dark' })));
    expect(plain.headers.get('Set-Cookie')).not.toMatch(/Secure/);
  });

  it.each([
    ['theme ausente', form({})],
    ['theme desconocido', form({ theme: 'purple' })],
  ])('%s responde 400 sin cookie', async (_label, body) => {
    const response = await themeRoute.POST(post(body));
    expect(response.status).toBe(400);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('un cuerpo JSON responde 400', async () => {
    const response = await themeRoute.POST(
      post(JSON.stringify({ theme: 'dark' }), { headers: { 'content-type': 'application/json' } })
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });
});
