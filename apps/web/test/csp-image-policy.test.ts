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
// D.11 (decisión 179): único fichero con `<img>` nativo, solo para teselas OSM.
const STATIC_MAP = 'components/property-location.tsx';

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

  it('solo el mapa estático usa la etiqueta nativa, con una sola aparición y src de osmTileUrl (decisión 179)', () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    const staticMap = `${SRC_DIR}${STATIC_MAP}`;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (file === staticMap) {
        continue;
      }
      expect(source, file).not.toMatch(/<img[\s>]/);
    }
    const source = readFileSync(staticMap, 'utf8');
    expect(source.match(/<img[\s>]/g)).toHaveLength(1);
    expect(source).toMatch(/<img\b[^>]*\bsrc=\{osmTileUrl\(/s);
    expect(source).not.toMatch(/next\/image/);
  });

  it('la excepción de ESLint no-img-element aparece una sola vez en src/, en el mapa estático', () => {
    const hits = collectSourceFiles(SRC_DIR).filter((file) =>
      readFileSync(file, 'utf8').includes('@next/next/no-img-element')
    );
    expect(hits).toEqual([`${SRC_DIR}${STATIC_MAP}`]);
    expect(readFileSync(hits[0] ?? '', 'utf8').match(/@next\/next\/no-img-element/g)).toHaveLength(1);
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

// ROADMAP 3.4 (decisión 261, enmienda la 112; R9.1, R9.2): el host de `img-src` sale de la misma
// configuración que la plantilla de teselas. Un proveedor propio sustituye al de OpenStreetMap: sigue
// habiendo UN solo host de teselas, la cadena de consulta (clave publicable) nunca llega a la CSP y
// una plantilla inválida hace fallar `headers()` (arranque con error).
describe('Política de imágenes con proveedor de teselas configurado (decisión 261)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('img-src lista únicamente el host configurado, sin la consulta y sin el host de OpenStreetMap', async () => {
    vi.stubEnv('TILE_URL_TEMPLATE', 'https://tiles.example.com/v3/{z}/{x}/{y}.png?key=PUBLISHABLE-123');
    vi.stubEnv('TILE_ATTRIBUTION', '© Example Maps');
    const imgSrcDirective = (await readCsp()).find((part) => part.startsWith('img-src'));
    expect(imgSrcDirective).toBe("img-src 'self' blob: data: https://tiles.example.com");
  });

  it('el resto de la CSP no cambia y no aparece ningún otro host (ni la clave)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TILE_URL_TEMPLATE', 'https://tiles.example.com:8443/{z}/{x}/{y}.png?key=PUBLISHABLE-123');
    vi.stubEnv('TILE_ATTRIBUTION', '© Example Maps');
    const csp = await readCsp();
    const hosts = csp.join(' ').match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(hosts).toEqual(['https://tiles.example.com:8443']);
    expect(csp.join(' ')).not.toContain('PUBLISHABLE');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp.some((part) => part.startsWith('connect-src'))).toBe(false);
  });

  it('una plantilla inválida (http) hace fallar headers(): el arranque no continúa', async () => {
    vi.stubEnv('TILE_URL_TEMPLATE', 'http://tiles.example.com/{z}/{x}/{y}.png');
    vi.stubEnv('TILE_ATTRIBUTION', '© Example Maps');
    await expect(readCsp()).rejects.toThrow(/TILE_URL_TEMPLATE/);
  });
});
