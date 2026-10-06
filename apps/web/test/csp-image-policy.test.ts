// ROADMAP 2.6 (decisión 112, enmienda la 080): `img-src` admite UN host, el de
// las teselas de OpenStreetMap; el resto de directivas no cambia.
// ROADMAP 1.15 (security-hardening, spec #261 "runtime-config-validation" /
// diseño decisión 080, hueco de investigación #258) — ninguna imagen pasa
// por fuera de `next/image`: nada de `<img>` nativo, nada de `unoptimized`
// (que desactivaría la optimización y serviría la imagen remota
// directamente), y la propia CSP nunca declara un host remoto en
// `img-src`. Mismo patrón de recorrido manual que `no-client-directive.
// test.ts`.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

async function readCsp(): Promise<string[]> {
  if (typeof nextConfig.headers !== 'function') {
    throw new Error('next.config.ts debe exportar headers().');
  }
  const rules = (await nextConfig.headers()) as readonly HeaderRule[];
  const rule = rules.find((entry) => entry.source === '/(.*)');
  const cspHeader = rule?.headers.find((header) => header.key === 'Content-Security-Policy');
  expect(cspHeader).toBeDefined();
  return (cspHeader?.value ?? '').split(';').map((part) => part.trim());
}

describe('Política de imágenes (spec #261 csp-image-policy, diseño decisión 080; enmendada por 112)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("img-src de la CSP es EXACTAMENTE 'self' blob: data: y el host de teselas OSM (decisión 112)", async () => {
    const imgSrcDirective = (await readCsp()).find((part) => part.startsWith('img-src'));
    expect(imgSrcDirective).toBe("img-src 'self' blob: data: https://tile.openstreetmap.org");
  });

  it('el resto de directivas queda fijado en producción (solo cambia img-src)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await readCsp()).toEqual([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://tile.openstreetmap.org",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ]);
  });

  it('el resto de directivas queda fijado en desarrollo (unsafe-eval, sin upgrade-insecure-requests)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await readCsp()).toEqual([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://tile.openstreetmap.org",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]);
  });

  it('negativo duro: sin connect-src, sin comodín y sin ningún otro host en la CSP', async () => {
    for (const env of ['production', 'development']) {
      vi.stubEnv('NODE_ENV', env);
      const csp = await readCsp();
      expect(csp.some((part) => part.startsWith('connect-src'))).toBe(false);
      const hosts = csp.join(' ').match(/https?:\/\/[^\s;]+/g) ?? [];
      expect(hosts).toEqual(['https://tile.openstreetmap.org']);
      expect(csp.join(' ')).not.toMatch(/\*|\bhttps:(?!\/\/)/);
    }
  });
});
