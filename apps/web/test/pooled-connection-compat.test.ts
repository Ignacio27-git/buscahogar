// ROADMAP 3.4 (decisión 256, D6; R2.1) — detrás de un pooler de transacciones (Neon `-pooler`, PgBouncer)
// no hay sesión estable: ninguna sentencia puede depender de estado de sesión. Esta prueba recorre el
// código que `apps/web` ejecuta contra la base de datos (su propio `src/` y las consultas de
// `packages/db`) y falla si aparece alguna de las cinco construcciones incompatibles. Los comentarios se
// descartan antes de buscar, porque las explicaciones sí las nombran.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOTS = [
  fileURLToPath(new URL('../src/', import.meta.url)),
  fileURLToPath(new URL('../../../packages/db/src/', import.meta.url)),
];

function collect(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      return collect(`${full}/`);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.generated.ts') ? [full.replaceAll('\\', '/')] : [];
  });
}

// Herramientas del propietario que `apps/web` nunca importa (siembra, bases de prueba, e2e): abren sus
// propias conexiones directas y sí pueden usar estado de sesión.
const OWNER_ONLY_TOOLING = /\/packages\/db\/src\/(e2e\/|seed\.ts$|test-database\.ts$)/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['sentencias preparadas con nombre', /\.prepare\(\s*['"`]|\bname\s*:\s*['"`][\w-]+['"`]\s*,\s*text\s*:/],
  [
    'SET de sesión (SET LOCAL / SESSION / set_config / GUC conocidos)',
    /\bset\s+(local|session)\s|\bset_config\s*\(|\bset\s+(search_path|statement_timeout|role|jit|time\s*zone|application_name|work_mem|lock_timeout)\b/i,
  ],
  ['LISTEN / NOTIFY', /\b(listen|notify)\s+["\w]+\s*[;`'"]|\bpg_notify\s*\(/i],
  ['bloqueos consultivos', /\bpg_(try_)?advisory\w*/i],
  ['tablas temporales', /\bcreate\s+(global\s+|local\s+)?temp(orary)?\s+table\b/i],
];

describe('compatibilidad con el pooler de conexiones (decisión 256)', () => {
  const files = ROOTS.flatMap((root) => collect(root)).filter((file) => !OWNER_ONLY_TOOLING.test(file));

  it('el recorrido encuentra el código de apps/web y el de packages/db (la búsqueda no es vacía)', () => {
    expect(files.some((file) => file.endsWith('/proxy.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('/client-quota.ts'))).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN)('ninguna consulta usa %s', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('el detector funciona: reconoce cada construcción prohibida en un ejemplo sintético', () => {
    const samples = [
      "db.prepare('named-stmt')",
      'sql`SET LOCAL statement_timeout = 5`',
      "sql`select set_config('jit', 'off', true)`",
      'sql`LISTEN canal;`',
      'sql`select pg_advisory_lock(1)`',
      'sql`CREATE TEMP TABLE t (a int)`',
    ];
    const matched = samples.map((sample) => FORBIDDEN.some(([, pattern]) => pattern.test(sample)));
    expect(matched).toEqual([true, true, true, true, true, true]);
  });
});
