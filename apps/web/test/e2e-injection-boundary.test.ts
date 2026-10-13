// D.17 (decisión 209, spec standalone-page-visual-coverage) — frontera de las rutas e2e
// inyectadas. `apps/web/e2e/inject/app/**` refleja `src/app` y SOLO `Dockerfile.e2e` lo copia a
// `src/app` antes de `next build`. Este guard comprueba sobre el árbol versionado que nada de eso
// llega a la build de producción: ni `template.*`, ni `e2e-only/`, ni referencias desde `src/**`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_DIR = fileURLToPath(new URL('../', import.meta.url));
const REPO_DIR = fileURLToPath(new URL('../../../', import.meta.url));
const SRC_APP_DIR = join(WEB_DIR, 'src', 'app');
const INJECT_APP_DIR = join(WEB_DIR, 'e2e', 'inject', 'app');
const INJECT_MARKER = 'e2e/inject';
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'dist', '.git']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIPPED_DIRS.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

function relativeFiles(root: string): string[] {
  return walk(root).map((file) => toPosix(relative(root, file)));
}

describe('Frontera de las rutas e2e inyectadas (D.17, decisión 209)', () => {
  const injected = relativeFiles(INJECT_APP_DIR);
  const tracked = relativeFiles(SRC_APP_DIR);

  it('el directorio de inyección contiene la plantilla y las dos páginas de prueba', () => {
    expect(injected.sort()).toEqual([
      'e2e-only/error-boundary/page.tsx',
      'e2e-only/global-error/page.tsx',
      'template.tsx',
    ]);
  });

  it('src/app no tiene template.* ni la carpeta e2e-only', () => {
    expect(tracked.filter((file) => /^template\./.test(file))).toEqual([]);
    expect(tracked.filter((file) => file.startsWith('e2e-only/'))).toEqual([]);
    // El árbol se ha leído de verdad: `layout.tsx` existe en src/app.
    expect(tracked).toContain('layout.tsx');
  });

  it('ningún fichero inyectable existe en src/app', () => {
    expect(injected.length).toBeGreaterThan(0);
    const collisions = injected.filter((file) => tracked.includes(file));
    expect(collisions).toEqual([]);
  });

  it('ningún fichero de src/** menciona e2e/inject ni E2E_ONLY', () => {
    const files = walk(join(WEB_DIR, 'src'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes(INJECT_MARKER) || source.includes('E2E_ONLY');
    });
    expect(offenders.map((file) => toPosix(relative(REPO_DIR, file)))).toEqual([]);
  });

  it('solo Dockerfile.e2e referencia e2e/inject entre Dockerfiles, compose y package.json', () => {
    const rootFiles = readdirSync(REPO_DIR)
      .filter((name) => name.startsWith('Dockerfile') || name === 'docker-compose.yml')
      .map((name) => join(REPO_DIR, name));
    const packageFiles = ['', 'apps', 'packages'].flatMap((dir) => {
      const base = join(REPO_DIR, dir);
      const candidates = dir === '' ? [base] : readdirSync(base).map((name) => join(base, name));
      return candidates.map((candidate) => join(candidate, 'package.json')).filter(exists);
    });
    const referencing = [...rootFiles, ...packageFiles]
      .filter((file) => readFileSync(file, 'utf8').includes(INJECT_MARKER))
      .map((file) => toPosix(relative(REPO_DIR, file)));
    expect(referencing).toEqual(['Dockerfile.e2e']);
  });
});

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
