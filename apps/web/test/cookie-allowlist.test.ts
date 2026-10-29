// ROADMAP 3.4 (decisión 263; R10.3) — la aplicación solo puede fijar la cookie `theme` (decisión 146). Este
// test recorre el código de `src/` y FALLA si algo escribe una cookie con otro nombre o con un nombre que no
// se puede resolver en estático. La comprobación en ejecución (cookies reales del navegador, sobre las
// rutas públicas) está en `e2e/cookie-allowlist.spec.ts`.
//
// El escáner es una función pura con su propia autoprueba: una regex que no encuentra nada es la forma más
// fácil de que un guardián pase en falso. Las lecturas (`document.cookie.match`, `cookies().get`) no cuentan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildThemeCookie, THEME_COOKIE_NAME } from '../src/server/theme-preference.js';

const ALLOWED_COOKIES: ReadonlySet<string> = new Set(['theme']);
const DYNAMIC = '<dinámico>';
const SET_COOKIE_HEADER = '<cabecera Set-Cookie>';

// Quita comentarios para que una mención en prosa no cuente como escritura. El `//` solo se toma como
// comentario si va al inicio de línea o tras un espacio (una URL `https://` no lo es).
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, '$1');
}

// Devuelve cada escritura de cookie del código: el nombre si es un literal, DYNAMIC si no se puede
// resolver, y SET_COOKIE_HEADER cuando la cookie se fija por cabecera (el nombre lo pone quien construye
// el valor, que se comprueba aparte).
export function scanCookieWrites(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];

  // document.cookie = '<nombre>=…'  (la asignación, no `==` ni una lectura)
  for (const match of code.matchAll(/document\.cookie\s*=(?!=)\s*([`'"])?([^=;`'"]*)/g)) {
    const name = match[2] ?? '';
    found.push(match[1] === undefined || name === '' || name.includes('$') ? DYNAMIC : name);
  }

  // cookies().set(…) / cookieStore.set(…) / res.cookies.set(…)
  for (const match of code.matchAll(
    /(?:cookies\(\)|cookieStore|\.cookies)\.set\(\s*(?:(['"`])([^'"`]+)\1)?/g
  )) {
    found.push(match[2] ?? DYNAMIC);
  }

  // Set-Cookie por cabecera (en cualquier capitalización)
  if (/set-cookie/i.test(code)) {
    found.push(SET_COOKIE_HEADER);
  }

  return found;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = `${directory}/${entry}`;
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx|js|mjs)$/.test(entry) ? [path] : [];
  });
}

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url)).replaceAll('\\', '/');

describe('scanCookieWrites — autoprueba del escáner', () => {
  it('encuentra una asignación a document.cookie y su nombre', () => {
    expect(scanCookieWrites("document.cookie = 'ga=GA1.2; Path=/';")).toEqual(['ga']);
  });

  it('encuentra escrituras con cookies().set, cookieStore.set y res.cookies.set por nombre literal', () => {
    expect(scanCookieWrites("cookies().set('sesion', 'x');")).toEqual(['sesion']);
    expect(scanCookieWrites('await cookieStore.set("carrito", value);')).toEqual(['carrito']);
    expect(scanCookieWrites("response.cookies.set('visita', '1');")).toEqual(['visita']);
  });

  it('marca como dinámico un nombre que no es un literal', () => {
    expect(scanCookieWrites('cookies().set(name, value);')).toEqual([DYNAMIC]);
    expect(scanCookieWrites("cookies().set({ name: 'a', value: 'b' });")).toEqual([DYNAMIC]);
    expect(scanCookieWrites('document.cookie = `${name}=1`;')).toEqual([DYNAMIC]);
  });

  it('marca una cookie fijada por cabecera Set-Cookie, con cualquier capitalización', () => {
    expect(scanCookieWrites("headers: { 'Set-Cookie': value }")).toEqual([SET_COOKIE_HEADER]);
    expect(scanCookieWrites("response.headers.append('set-cookie', value);")).toEqual([
      SET_COOKIE_HEADER,
    ]);
  });

  it('ignora lecturas y menciones en comentarios', () => {
    expect(
      scanCookieWrites('const m = document.cookie.match(/(?:^|;\\s*)theme=(light|dark)/);')
    ).toEqual([]);
    expect(scanCookieWrites('const all = document.cookie;')).toEqual([]);
    expect(scanCookieWrites("const v = cookies().get('theme');")).toEqual([]);
    expect(scanCookieWrites("// document.cookie = 'ga=1' y cookies().set('x')")).toEqual([]);
    expect(scanCookieWrites("/* Set-Cookie: a=1 */ const url = 'https://example.test';")).toEqual(
      []
    );
  });
});

describe('el código de src/ solo escribe cookies de la lista permitida (R10.3)', () => {
  const files = sourceFiles(SRC_DIR);

  it('el recorrido ve el código real (no recorre un directorio vacío)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => file.endsWith('/server/theme-preference.ts'))).toBe(true);
  });

  it('ninguna escritura de cookie con nombre literal queda fuera de la lista', () => {
    const offenders = files.flatMap((file) =>
      scanCookieWrites(readFileSync(file, 'utf8'))
        .filter((name) => name !== SET_COOKIE_HEADER && !ALLOWED_COOKIES.has(name))
        .map((name) => `${file.slice(SRC_DIR.length)}: ${name}`)
    );
    expect(offenders).toEqual([]);
  });

  it('la cabecera Set-Cookie solo aparece donde se construye la cookie de tema', () => {
    const withHeader = files
      .filter((file) => scanCookieWrites(readFileSync(file, 'utf8')).includes(SET_COOKIE_HEADER))
      .map((file) => file.slice(SRC_DIR.length));
    expect(withHeader).toEqual(['/server/theme-preference.ts']);
  });

  it('el valor Set-Cookie que construye ese módulo lleva solo el nombre permitido, en cada rama', () => {
    expect(THEME_COOKIE_NAME).toBe('theme');
    for (const choice of ['light', 'dark', 'system'] as const) {
      for (const secure of [false, true]) {
        const header = buildThemeCookie(choice, secure);
        const name = header.split('=')[0] ?? '';
        expect(ALLOWED_COOKIES.has(name)).toBe(true);
      }
    }
  });
});
