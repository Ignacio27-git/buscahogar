// ROADMAP 2.3 — provenance.json (tarea 3.1, apply-progress #300; spec "CC0
// Provenance for Every Base Image"): una entrada por foto base committeada
// en `fixtures/images/bases/`, con el sha256 REAL del fichero — no el que
// dice el JSON, el que se recalcula aquí mismo sobre los bytes committeados
// — y ningún `kind` de plano de planta.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  IMAGE_PROVENANCE_KINDS,
  imageProvenanceEntrySchema,
  imageProvenanceSchema,
} from '../src/image-hash/provenance.schema.js';

const FIXTURES_DIR = fileURLToPath(new URL('fixtures/images/', import.meta.url));
const BASES_DIR = fileURLToPath(new URL('fixtures/images/bases/', import.meta.url));

function readProvenance(): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}provenance.json`, 'utf8'));
}

function sha256Of(file: string): string {
  return createHash('sha256').update(readFileSync(`${BASES_DIR}${file}`)).digest('hex');
}

describe('provenance.json (ROADMAP 2.3, spec "CC0 Provenance for Every Base Image")', () => {
  it('Zod-valida el array completo: una entrada por cada una de las 18 fotos base', () => {
    const result = imageProvenanceSchema.safeParse(readProvenance());

    expect(result.success).toBe(true);
    expect(result.success && result.data.length).toBe(18);
  });

  it('cada entrada tiene un `file` que existe realmente en fixtures/images/bases/', () => {
    const provenance = imageProvenanceSchema.parse(readProvenance());
    const actualFiles = new Set(readdirSync(BASES_DIR));

    for (const entry of provenance) {
      expect(actualFiles.has(entry.file)).toBe(true);
    }
  });

  it('cada `sha256` declarado coincide con el sha256 REAL del fichero committeado', () => {
    const provenance = imageProvenanceSchema.parse(readProvenance());

    for (const entry of provenance) {
      expect(entry.sha256).toBe(sha256Of(entry.file));
    }
  });

  it('ningún `kind` es floor-plan: la enumeración cerrada lo excluye por construcción', () => {
    const provenance = imageProvenanceSchema.parse(readProvenance());

    expect(IMAGE_PROVENANCE_KINDS).not.toContain('floor-plan');
    for (const entry of provenance) {
      expect(entry.kind).not.toBe('floor-plan');
    }
  });

  it('el conjunto calibration tiene exactamente 6 entradas y evaluation exactamente 12', () => {
    const provenance = imageProvenanceSchema.parse(readProvenance());

    expect(provenance.filter((entry) => entry.set === 'calibration')).toHaveLength(6);
    expect(provenance.filter((entry) => entry.set === 'evaluation')).toHaveLength(12);
  });

  it('rechaza una entrada con license desconocida', () => {
    const [first] = imageProvenanceSchema.parse(readProvenance());
    const result = imageProvenanceEntrySchema.safeParse({ ...first, license: 'All-Rights-Reserved' });

    expect(result.success).toBe(false);
  });

  it('rechaza una entrada con una clave extra (z.strictObject)', () => {
    const [first] = imageProvenanceSchema.parse(readProvenance());
    const result = imageProvenanceEntrySchema.safeParse({ ...first, extra: true });

    expect(result.success).toBe(false);
  });
});
