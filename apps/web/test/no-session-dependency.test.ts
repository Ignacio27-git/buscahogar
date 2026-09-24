// ROADMAP 1.13 Unit D (tarea 14.3; maintainer decision D5 — el tope por
// sesión se descarta deliberadamente, solo queda el tope diario) — ningún
// mecanismo de sesión/cookie existe en `apps/web` tras este cambio. D5 no
// es una ausencia accidental: es una decisión de producto que este test
// hace verificable en vez de dejarla implícita (spec «No Session/Cookie
// Dependency Is Added Anywhere In apps/web»).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

// Nombres de librería habituales de sesión/cookie en el ecosistema Node —
// ninguno debe aparecer como dependencia declarada.
const SESSION_PACKAGE_PATTERNS = [/session/i, /^cookie/i, /^iron-session$/i, /^next-auth$/i];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(`${fullPath}/`));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('apps/web — sin dependencia de sesión/cookie (maintainer decision D5)', () => {
  it('package.json no declara ninguna dependencia de sesión/cookie', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      readonly dependencies?: Record<string, string>;
      readonly devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const name of Object.keys(allDeps)) {
      for (const pattern of SESSION_PACKAGE_PATTERNS) {
        expect(pattern.test(name)).toBe(false);
      }
    }
  });

  it('ningún fichero de src/ importa un middleware de sesión ni fija una cookie de sesión', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/next-auth|iron-session|express-session/i);
      expect(source).not.toMatch(/cookies\(\)\.set/);
    }
  });

  it('no existe ningún fichero middleware.ts en apps/web', () => {
    const middlewarePath = fileURLToPath(new URL('../middleware.ts', import.meta.url));
    expect(() => readFileSync(middlewarePath, 'utf8')).toThrow();
  });
});
