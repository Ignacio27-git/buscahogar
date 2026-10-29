// ROADMAP 1.11 (diseño D10) → ROADMAP 1.13 Unit D (diseño DD-19/DD-20,
// decisión 065) — NINGÚN fichero de `apps/web/src` declara `'use client'`,
// EXCEPTO el allowlist explícito de abajo. La autocompletación de zona
// (DD-19) no necesita JavaScript de cliente en absoluto — solo el estado de
// un barrido en curso lo necesita (DD-23, refresco automático vía
// `router.refresh()`), así que el hueco que esta prueba abre queda de UN
// fichero de ancho, nunca más.
//
// Tres aserciones, no una (DD-20):
//   1. Ningún fichero FUERA del allowlist declara la directiva — la regla
//      original, sin cambios en su fuerza.
//   2. Cada entrada del allowlist EXISTE de verdad en disco — una entrada
//      obsoleta (que apuntara a un fichero borrado) ensancharía el hueco en
//      silencio; esta aserción lo hace fallar en voz alta.
//   3. Cada entrada del allowlist SÍ contiene la directiva — una entrada
//      que no hiciera falta sería hueco abierto para nada.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

// Rutas EXACTAS, relativas a `src/`. Ningún patrón/glob: cada entrada se
// verifica una a una (aserción 2).
// ROADMAP 2.6 (decisión 113, enmienda la 065): crece en exactamente UNA entrada,
// el wrapper del mapa. Los módulos de Leaflet (canvas, capa de clústeres,
// control de dibujo) no llevan la directiva: son código de cliente por el
// grafo de imports (lo fija `map-guards.test.ts`).
// D.14 (decisión 186, enmienda la 113): crece en otras DOS entradas, las fronteras de error de
// Next. `error.tsx` y `global-error.tsx` DEBEN ser componentes de cliente (reciben `retry`).
const CLIENT_COMPONENT_ALLOWLIST = [
  'components/coverage-status.tsx',
  'components/search-map.tsx',
  'app/error.tsx',
  'app/global-error.tsx',
] as const;

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

function declaresUseClient(source: string): boolean {
  return /^\s*['"]use client['"]/m.test(source);
}

describe('apps/web/src — "use client" solo en el allowlist explícito (D10, DD-20)', () => {
  it('ningún fichero FUERA del allowlist declara "use client"', () => {
    const allowlistAbsolutePaths = new Set(CLIENT_COMPONENT_ALLOWLIST.map((relative) => `${SRC_DIR}${relative}`));
    const files = collectSourceFiles(SRC_DIR);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      if (allowlistAbsolutePaths.has(file)) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });

  it('el allowlist tiene exactamente 4 entradas (decisiones 113 y 186)', () => {
    expect(CLIENT_COMPONENT_ALLOWLIST).toHaveLength(4);
  });

  it('cada entrada del allowlist existe de verdad en disco — una entrada obsoleta falla en voz alta', () => {
    for (const relative of CLIENT_COMPONENT_ALLOWLIST) {
      expect(existsSync(`${SRC_DIR}${relative}`)).toBe(true);
    }
  });

  it('cada entrada del allowlist SÍ contiene la directiva "use client"', () => {
    for (const relative of CLIENT_COMPONENT_ALLOWLIST) {
      const source = readFileSync(`${SRC_DIR}${relative}`, 'utf8');
      expect(declaresUseClient(source)).toBe(true);
    }
  });
});
