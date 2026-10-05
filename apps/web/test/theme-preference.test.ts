// ROADMAP D.4 (decisiones 144-146) — helpers puros de la preferencia de
// tema: esquema, cookie, ruta de retorno same-origin y script previo al
// pintado. Los vectores de ruta de retorno son literales de prueba.
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import {
  THEME_INIT_SCRIPT,
  buildThemeCookie,
  isSecureRequest,
  resolveReturnPath,
  themeChoiceSchema,
  toSameOriginPath,
} from '../src/server/theme-preference.js';

const REQUEST_URL = 'http://host.test/theme';
const ORIGIN = 'http://host.test';

function resolve(returnTo: unknown, referer: string | null = null): string {
  return resolveReturnPath({ returnTo, referer, requestUrl: REQUEST_URL });
}

describe('themeChoiceSchema y buildThemeCookie', () => {
  it('acepta light, dark y system y rechaza el resto', () => {
    for (const value of ['light', 'dark', 'system']) {
      expect(themeChoiceSchema.safeParse(value).success).toBe(true);
    }
    for (const value of ['purple', '', 'DARK', null, undefined, 1]) {
      expect(themeChoiceSchema.safeParse(value).success).toBe(false);
    }
  });

  it('serializa light/dark con el orden exacto de atributos', () => {
    expect(buildThemeCookie('dark', false)).toBe(
      'theme=dark; Path=/; Max-Age=31536000; SameSite=Lax'
    );
    expect(buildThemeCookie('light', true)).toBe(
      'theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
    );
  });

  it('system expira la cookie', () => {
    expect(buildThemeCookie('system', false)).toBe('theme=; Path=/; Max-Age=0; SameSite=Lax');
    expect(buildThemeCookie('system', true)).toBe(
      'theme=; Path=/; Max-Age=0; SameSite=Lax; Secure'
    );
  });
});

describe('resolveReturnPath — vectores que caen al siguiente candidato', () => {
  const hostile = [
    '//evil.example',
    '/\\evil',
    'https://evil.example',
    '/..//evil.example',
    '/%2e%2e//evil.example',
    '/.//x',
    '/%0d%0a',
    '/a\rb',
    '/a\nb',
    '/a\tb',
    '/a\u0020b',
    '/a\u00a0b',
    '',
    'relative',
    42,
    null,
  ];

  it.each(hostile.map((v) => [JSON.stringify(v), v] as const))(
    'returnTo %s se ignora y devuelve "/"',
    (_label, value) => {
      expect(resolve(value)).toBe('/');
    }
  );

  it('un returnTo inválido cae al Referer same-origin', () => {
    expect(resolve('//evil.example', 'http://host.test/a?b=1')).toBe('/a?b=1');
  });

  it('un Referer cuya ruta normaliza a doble barra cae a "/"', () => {
    expect(resolve(undefined, 'http://host.test/..//evil.example')).toBe('/');
    expect(resolve(undefined, 'http://host.test/%2e%2e//evil.example')).toBe('/');
  });

  it('inválido más Referer cross-origin cae a "/"', () => {
    expect(resolve('//evil.example', 'http://evil.example/a')).toBe('/');
  });
});

describe('resolveReturnPath — rutas válidas', () => {
  it('conserva ruta y query del returnTo y descarta el hash', () => {
    expect(resolve('/buscar?q=1')).toBe('/buscar?q=1');
    expect(resolve('/buscar?q=1#frag')).toBe('/buscar?q=1');
  });

  it('/theme se mapea a "/"', () => {
    expect(resolve('/theme')).toBe('/');
    expect(resolve('/theme/?x')).toBe('/');
    expect(resolve('/./theme')).toBe('/');
    expect(resolve(undefined, 'http://host.test/theme')).toBe('/');
  });

  it('usa el Referer same-origin cuando no hay returnTo', () => {
    expect(resolve(undefined, 'http://host.test/a?b=1')).toBe('/a?b=1');
  });

  it('sin returnTo ni Referer devuelve "/"', () => {
    expect(resolve(undefined, null)).toBe('/');
  });

  it('toSameOriginPath rechaza otro origen y rutas protocol-relative', () => {
    expect(toSameOriginPath('https://evil.example/x', ORIGIN)).toBeNull();
    expect(toSameOriginPath('/..//evil.example', ORIGIN)).toBeNull();
    expect(toSameOriginPath('/ok?x=1', ORIGIN)).toBe('/ok?x=1');
  });
});

describe('isSecureRequest', () => {
  it.each([
    ['https://host.test/theme', null, true],
    ['http://host.test/theme', 'https, http', true],
    ['http://host.test/theme', ' HTTPS ', true],
    ['http://host.test/theme', 'http', false],
    ['http://host.test/theme', 'http, https', false],
    ['http://host.test/theme', null, false],
  ] as const)('%s con x-forwarded-proto %s -> %s', (url, forwarded, expected) => {
    expect(isSecureRequest(url, forwarded)).toBe(expected);
  });
});

describe('THEME_INIT_SCRIPT', () => {
  function run(cookie: () => string): string[] {
    const added: string[] = [];
    const fakeDocument = {
      get cookie(): string {
        return cookie();
      },
      documentElement: {
        classList: {
          add: (name: string): void => {
            added.push(name);
          },
        },
      },
    };
    runInNewContext(THEME_INIT_SCRIPT, { document: fakeDocument });
    return added;
  }

  it('añade la clase para dark y light', () => {
    expect(run(() => 'theme=dark')).toEqual(['dark']);
    expect(run(() => 'a=1; theme=light; b=2')).toEqual(['light']);
  });

  it('no añade nada con cookie ausente, ajena, system o basura', () => {
    expect(run(() => '')).toEqual([]);
    expect(run(() => 'xtheme=dark')).toEqual([]);
    expect(run(() => 'theme=system')).toEqual([]);
    expect(run(() => 'theme=purple')).toEqual([]);
    expect(run(() => 'theme=darkness')).toEqual([]);
  });

  it('absorbe un getter que lanza', () => {
    expect(
      run(() => {
        throw new Error('cookies bloqueadas');
      })
    ).toEqual([]);
  });

  it('no contiene "</" que cierre el elemento script', () => {
    expect(THEME_INIT_SCRIPT).not.toContain('</');
  });
});
