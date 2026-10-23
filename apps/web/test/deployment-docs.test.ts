// ROADMAP 3.4 (decisión 263 parte C; D22; R12.1) — deriva entre el inventario de variables de apps/web y la tabla
// de `docs/DEPLOYMENT.md`. Si se añade, quita o cambia una variable en uno y no en el otro, este test falla.
import { describe, expect, it } from 'vitest';

import { WEB_ENV_DOCS_HEADING, WEB_ENV_MANIFEST } from '../src/server/env-manifest.js';
import { forbiddenPublicEnvNames } from '../src/lib/public-env.js';
import { readDeploymentDoc, readEnvTable } from './helpers/docs-env-tables.js';

describe('docs/DEPLOYMENT.md — variables de apps/web', () => {
  const doc = readDeploymentDoc();
  const rows = readEnvTable(doc, WEB_ENV_DOCS_HEADING);

  it('la tabla lista exactamente las variables del inventario, sin faltas ni sobrantes', () => {
    expect(rows.map((row) => row.name).sort()).toEqual(WEB_ENV_MANIFEST.map((spec) => spec.name).sort());
  });

  it('cada fila coincide con el inventario en obligatoriedad, valor por defecto y tipo de URL', () => {
    const byName = new Map(rows.map((row) => [row.name, row]));
    for (const spec of WEB_ENV_MANIFEST) {
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

  it('el inventario no repite nombres y ninguno es una credencial NEXT_PUBLIC_*', () => {
    const names = WEB_ENV_MANIFEST.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    expect(forbiddenPublicEnvNames(names)).toEqual([]);
    expect(names.every((name) => !name.startsWith('NEXT_PUBLIC_'))).toBe(true);
  });

  it('los ejemplos del inventario no contienen ningún secreto con forma de valor real', () => {
    for (const spec of WEB_ENV_MANIFEST) {
      expect(spec.example, spec.name).not.toMatch(/AKIA|AGE-SECRET-KEY|\d{6,}:[A-Za-z0-9_-]{20,}/);
    }
  });

  it('las dos URL de base de datos de la web son del pooler y las demás no lo son', () => {
    const pooled = WEB_ENV_MANIFEST.filter((spec) => spec.connection === 'pooler').map((spec) => spec.name);
    expect(pooled).toEqual(['DATABASE_URL', 'WEB_COVERAGE_DATABASE_URL']);
  });
});
