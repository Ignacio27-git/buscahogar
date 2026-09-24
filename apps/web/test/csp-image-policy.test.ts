// ROADMAP 1.15 (security-hardening, spec #261 "runtime-config-validation" /
// diseño decisión 080, hueco de investigación #258) — ninguna imagen pasa
// por fuera de `next/image`: nada de `<img>` nativo, nada de `unoptimized`
// (que desactivaría la optimización y serviría la imagen remota
// directamente), y la propia CSP nunca declara un host remoto en
// `img-src`. Mismo patrón de recorrido manual que `no-client-directive.
// test.ts`.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import nextConfig from '../next.config.js';

interface HeaderEntry {
  readonly key: string;
  readonly value: string;
}

interface HeaderRule {
  readonly source: string;
  readonly headers: readonly HeaderEntry[];
}

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

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

describe('Política de imágenes (spec #261 csp-image-policy, diseño decisión 080)', () => {
  it('ningún fichero usa la etiqueta <img> nativa (siempre next/image)', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/<img[\s>]/);
    }
  });

  it('ningún uso de next/image desactiva la optimización con `unoptimized`', () => {
    const files = collectSourceFiles(SRC_DIR);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\bunoptimized\b/);
    }
  });

  it("img-src de la CSP no incluye ningún host remoto (solo 'self' blob: data:)", async () => {
    if (typeof nextConfig.headers !== 'function') {
      throw new Error('next.config.ts debe exportar headers().');
    }
    const rules = (await nextConfig.headers()) as readonly HeaderRule[];
    const rule = rules.find((entry) => entry.source === '/(.*)');
    const cspHeader = rule?.headers.find((header) => header.key === 'Content-Security-Policy');
    expect(cspHeader).toBeDefined();

    const imgSrcDirective = cspHeader?.value
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('img-src'));
    expect(imgSrcDirective).toBe("img-src 'self' blob: data:");
  });
});
