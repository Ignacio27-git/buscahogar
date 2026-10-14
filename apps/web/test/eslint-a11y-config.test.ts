// Paso D.15 (decision 193) — la puerta de lint de accesibilidad es parte del
// contrato: se comprueba la configuracion RESUELTA de ESLint, no el texto del
// fichero de configuracion.
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Una sola instancia para todo el fichero: crearla cuesta la carga de los plugins (varios
// segundos en frio) y bajo la carga del contenedor superaba el timeout por defecto de 5 s (D.18).
const eslint = new ESLint({ cwd: WEB_ROOT });
const configCache = new Map<string, Promise<{ rules?: Record<string, unknown> }>>();

async function resolveConfig(file: string): Promise<{ rules?: Record<string, unknown> }> {
  const config = (await eslint.calculateConfigForFile(file)) as
    | {
        rules?: Record<string, unknown>;
      }
    | undefined;
  if (config === undefined) throw new Error(`Sin configuracion para ${file}`);
  return config;
}

/** Configuracion resuelta, memoizada por fichero: cada ruta se calcula una sola vez. */
function configFor(file: string): Promise<{ rules?: Record<string, unknown> }> {
  const cached = configCache.get(file);
  if (cached !== undefined) return cached;
  const pending = resolveConfig(file);
  configCache.set(file, pending);
  return pending;
}

/** Severidad normalizada: `[2, ...opciones]` o `2` → 2. */
function severity(entry: unknown): number | undefined {
  const level: unknown = Array.isArray(entry) ? (entry as unknown[])[0] : entry;
  return typeof level === 'number' ? level : undefined;
}

describe('puerta de lint jsx-a11y (D.15)', { timeout: 60_000 }, () => {
  it('src/**/*.tsx lleva jsx-a11y/alt-text como error', async () => {
    const config = await configFor('src/components/x.tsx');
    expect(severity(config.rules?.['jsx-a11y/alt-text'])).toBe(2);
  });

  it('src/**/*.tsx lleva reglas jsx-a11y mas alla de las seis de Next', async () => {
    const config = await configFor('src/components/x.tsx');
    expect(severity(config.rules?.['jsx-a11y/anchor-is-valid'])).toBe(2);
  });

  it('los ficheros e2e/*.ts no llevan ninguna regla jsx-a11y', async () => {
    const config = await configFor('e2e/a11y.spec.ts');
    const a11yRules = Object.keys(config.rules ?? {}).filter((rule) =>
      rule.startsWith('jsx-a11y/')
    );
    expect(a11yRules).toEqual([]);
  });
});
