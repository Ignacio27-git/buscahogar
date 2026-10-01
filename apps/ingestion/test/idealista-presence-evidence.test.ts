// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105, U2) — la constante
// que habilita retirar anuncios por OMISIÓN está atada a la evidencia grabada:
// `DELISTED_OMISSION_CONFIRMED` es true exactamente cuando la fixture de la sonda
// `adIds` demuestra `delistedIdBehaviour === 'omitted'` (S-LR-9).
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DELISTED_OMISSION_CONFIRMED,
  omissionConfirmedByFixtureMeta,
} from '../src/sources/idealista/presence-evidence.js';

const FIXTURES_DIR = new URL('./fixtures/idealista/', import.meta.url);

// La fixture más reciente de la sonda `adids-<fecha>.meta.json` (la fecha ISO
// ordena lexicográficamente). `null` = la sonda aún no se ha ejecutado.
function latestProbeMeta(): { readonly file: string; readonly meta: unknown } | null {
  const files = readdirSync(FIXTURES_DIR)
    .filter((name) => /^adids-.*\.meta\.json$/.test(name))
    .sort();
  const file = files.at(-1);
  if (file === undefined) {
    return null;
  }
  return { file, meta: JSON.parse(readFileSync(new URL(file, FIXTURES_DIR), 'utf8')) as unknown };
}

describe('omissionConfirmedByFixtureMeta (pura)', () => {
  it("true solo cuando delistedIdBehaviour es 'omitted'", () => {
    expect(omissionConfirmedByFixtureMeta({ delistedIdBehaviour: 'omitted' })).toBe(true);
  });

  it.each(['error', 'other', 'listed', 'OMITTED', ''])("false con delistedIdBehaviour = '%s'", (value) => {
    expect(omissionConfirmedByFixtureMeta({ delistedIdBehaviour: value })).toBe(false);
  });

  it.each([null, undefined, 'omitted', 42, [], {}, { delistedIdBehaviour: null }, { otroCampo: 'omitted' }])(
    'false con una meta ausente o malformada (%j)',
    (meta) => {
      expect(omissionConfirmedByFixtureMeta(meta)).toBe(false);
    }
  );
});

describe('DELISTED_OMISSION_CONFIRMED atada a la fixture de la sonda (U2, S-LR-9)', () => {
  it('es true exactamente cuando la fixture más reciente demuestra omisión; false si la fixture no existe', () => {
    const probe = latestProbeMeta();

    expect(DELISTED_OMISSION_CONFIRMED).toBe(probe === null ? false : omissionConfirmedByFixtureMeta(probe.meta));
  });

  it('el valor commiteado es un booleano literal (no derivado de entorno ni de flags)', () => {
    const source = readFileSync(new URL('../src/sources/idealista/presence-evidence.ts', import.meta.url), 'utf8');

    expect(source).toMatch(/export const DELISTED_OMISSION_CONFIRMED\s*(:\s*boolean\s*)?=\s*(true|false)\s*;/);
    expect(source).not.toMatch(/process\.env/);
  });
});
