// ROADMAP 3.4 (decisión 263 parte C; D22; R12.1) — deriva entre el inventario de variables de apps/ingestion (worker,
// despliegue, copias de seguridad, simulacro) y las tablas de `docs/DEPLOYMENT.md`. Si se añade, quita o cambia una
// variable en uno y no en el otro, este test falla. Además, cada variable que LEEN el código del worker y el
// despliegue debe estar en el inventario (no solo las documentadas).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ENV_DOCS_HEADINGS, ENV_MANIFEST } from '../src/ops/env-manifest.js';
import type { EnvService } from '../src/ops/env-manifest.js';
import { readDeploymentDoc, readEnvTable } from './helpers/docs-env-tables.js';

const SERVICES = Object.keys(ENV_MANIFEST) as EnvService[];

describe.each(SERVICES)('docs/DEPLOYMENT.md — variables del servicio «%s»', (service) => {
  const doc = readDeploymentDoc();
  const specs = ENV_MANIFEST[service];
  const rows = readEnvTable(doc, ENV_DOCS_HEADINGS[service]);

  it('la tabla lista exactamente las variables del inventario, sin faltas ni sobrantes', () => {
    expect(rows.map((row) => row.name).sort()).toEqual(specs.map((spec) => spec.name).sort());
  });

  it('cada fila coincide con el inventario en obligatoriedad, valor por defecto y tipo de URL', () => {
    const byName = new Map(rows.map((row) => [row.name, row]));
    for (const spec of specs) {
      const row = byName.get(spec.name);
      expect(row, spec.name).toBeDefined();
      expect({ name: spec.name, required: row?.required, defaultValue: row?.defaultValue, connection: row?.connection }).toEqual({
        name: spec.name,
        required: spec.required,
        defaultValue: spec.defaultValue.replaceAll('`', ''),
        connection: spec.connection,
      });
    }
  });

  it('el inventario no repite nombres ni usa el prefijo NEXT_PUBLIC_', () => {
    const names = specs.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => !name.startsWith('NEXT_PUBLIC_'))).toBe(true);
  });

  it('los ejemplos no contienen ningún secreto con forma de valor real', () => {
    for (const spec of specs) {
      expect(spec.example, spec.name).not.toMatch(/AKIA|AGE-SECRET-KEY|\d{6,}:[A-Za-z0-9_-]{20,}/);
    }
  });
});

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
}

describe('el código no lee variables que el inventario no conozca', () => {
  it('todas las variables del esquema de `readEnv` del worker están en el inventario, y al revés', () => {
    const source = sourceOf('../scripts/coverage-worker.ts');
    const schema = /const EnvSchema = z\.object\(\{([\s\S]*?)\n\}\);/.exec(source)?.[1] ?? '';
    const declared = [...schema.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1] ?? '');
    expect(declared.length).toBeGreaterThan(20);
    const known = new Set(ENV_MANIFEST.worker.map((spec) => spec.name));
    expect(declared.filter((name) => !known.has(name))).toEqual([]);
    expect([...known].filter((name) => !declared.includes(name))).toEqual([]);
  });

  it('todas las variables del esquema del despliegue están en el inventario, y al revés', () => {
    const source = sourceOf('../src/deploy/deploy-env.ts');
    const schema = /const EnvSchema = z\s*\.object\(\{([\s\S]*?)\n {2}\}\)/.exec(source)?.[1] ?? '';
    const declared = [...schema.matchAll(/^ {4}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1] ?? '');
    expect(declared).toHaveLength(7);
    expect([...declared].sort()).toEqual(ENV_MANIFEST.deploy.map((spec) => spec.name).sort());
  });

  it('las variables que exige backup.sh están en el inventario de las copias de seguridad', () => {
    const backup = sourceOf('../../../ops/backup/backup.sh');
    const required = /require_env ([A-Z0-9_ ]+)/.exec(backup)?.[1]?.trim().split(/\s+/) ?? [];
    expect(required.length).toBeGreaterThanOrEqual(5);
    const known = new Set(ENV_MANIFEST.backup.map((spec) => spec.name));
    expect(required.filter((name) => !known.has(name))).toEqual([]);
  });
});
