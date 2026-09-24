// ROADMAP 1.13 Unit D (diseño DD-15, punto 4: "coverage-db.ts es importado
// por EXACTAMENTE un módulo, y ningún fichero con 'use client' lo importa
// transitivamente") — mismo patrón de recorrido manual que
// no-client-directive.test.ts / no-sources-import.test.ts.
//
// Nota de secuenciación (tarea 10.3/10.4, fase 10): en el momento en que
// esta prueba se escribe, `coverage-db.ts` todavía no tiene ningún
// importador real — `apps/web/src/app/page.tsx` no lo consume hasta la fase
// 12 de esta misma unidad. La aserción de abajo permite 0 o 1 importadores
// (nunca más de uno) para que la prueba sea significativa en TODO momento
// del desarrollo de esta unidad, no solo al final; queda re-confirmada con
// exactamente 1 importador tras la fase 12 (registrado en
// sdd/on-demand-coverage/apply-progress-2).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

interface SourceFile {
  readonly path: string;
  readonly relativePath: string;
  readonly source: string;
}

function collectSourceFiles(dir: string, srcRoot: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(`${fullPath}/`, srcRoot));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push({
        path: fullPath,
        relativePath: fullPath.slice(srcRoot.length),
        source: readFileSync(fullPath, 'utf8'),
      });
    }
  }
  return files;
}

function importsCoverageDb(source: string): boolean {
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  return specifiers.some((specifier) => /(^|\/)server\/coverage-db(\.js)?$/.test(specifier ?? ''));
}

function declaresUseClient(source: string): boolean {
  return /^\s*['"]use client['"]/m.test(source);
}

describe('coverage-db.ts — frontera de importación (DD-15)', () => {
  it('como mucho UN módulo importa coverage-db.ts, y nunca uno con "use client"', () => {
    const files = collectSourceFiles(SRC_DIR, SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    const importers = files.filter((file) => importsCoverageDb(file.source));

    expect(importers.length).toBeLessThanOrEqual(1);
    for (const importer of importers) {
      expect(declaresUseClient(importer.source)).toBe(false);
    }
  });
});
