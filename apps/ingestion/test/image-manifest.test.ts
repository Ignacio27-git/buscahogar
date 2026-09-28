// ROADMAP 2.3 — IMAGE_MANIFEST (decisión 098): asignación CONGELADA
// pareja-corpus -> imagen, fijada antes de que exista ningún hash de
// evaluación (D8). Este test verifica la asignación exacta descrita en
// tasks #298 tarea 3.5, no solo que el módulo exporte algo con la forma
// correcta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { dedupCorpus } from '@buscahogar/core';

import { IMAGE_MANIFEST } from '../src/image-hash/manifest.js';
import { imageProvenanceSchema } from '../src/image-hash/provenance.schema.js';

const PROVENANCE_PATH = fileURLToPath(new URL('fixtures/images/provenance.json', import.meta.url));

const ALL_TRANSFORMS = ['rescale', 'jpeg', 'webp', 'crop', 'overlay', 'portalA', 'portalB'] as const;

// tp-1..6, md-1, md-2, md-4: la lista exacta que cubre los 7 transforms
// entre sus 9 parejas (decisión 098).
const DUPLICATE_PAIR_IDS = dedupCorpus
  .filter((entry) => /^(tp-\d|md-1-|md-2-|md-4-)/.test(entry.id))
  .map((entry) => entry.id);

function kindByBase(): Map<string, string> {
  const provenance = imageProvenanceSchema.parse(JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')));
  return new Map(provenance.map((entry) => [entry.file, entry.kind]));
}

function refA(id: string): string {
  return `fixture-image:eval/${id}-a`;
}
function refB(id: string): string {
  return `fixture-image:eval/${id}-b`;
}

describe('IMAGE_MANIFEST (ROADMAP 2.3, decisión 098)', () => {
  it('cubre el lado a de las 24 parejas del corpus, y el lado b de todas menos md-3', () => {
    expect(dedupCorpus).toHaveLength(24);

    for (const entry of dedupCorpus) {
      expect(IMAGE_MANIFEST[refA(entry.id)]).toBeDefined();
      if (entry.id.startsWith('md-3-')) {
        expect(IMAGE_MANIFEST[refB(entry.id)]).toBeUndefined();
      } else {
        expect(IMAGE_MANIFEST[refB(entry.id)]).toBeDefined();
      }
    }
  });

  it('tp-1..6/md-1/md-2/md-4: cada pareja usa la MISMA base con dos transforms distintos', () => {
    expect(DUPLICATE_PAIR_IDS).toHaveLength(9);

    for (const id of DUPLICATE_PAIR_IDS) {
      const a = IMAGE_MANIFEST[refA(id)];
      const b = IMAGE_MANIFEST[refB(id)];
      expect(a?.base).toBe(b?.base);
      expect(a?.transform).toBeDefined();
      expect(b?.transform).toBeDefined();
      expect(a?.transform).not.toBe(b?.transform);
    }
  });

  it('tp-1..6/md-1/md-2/md-4: entre sus 9 parejas aparecen los 7 transforms al menos una vez', () => {
    const usedTransforms = new Set<string>();
    for (const id of DUPLICATE_PAIR_IDS) {
      const a = IMAGE_MANIFEST[refA(id)];
      const b = IMAGE_MANIFEST[refB(id)];
      if (a?.transform !== undefined) usedTransforms.add(a.transform);
      if (b?.transform !== undefined) usedTransforms.add(b.transform);
    }

    for (const transform of ALL_TRANSFORMS) {
      expect(usedTransforms.has(transform)).toBe(true);
    }
  });

  it('en-1/2/5/6: bases distintas del mismo kind', () => {
    const kindOf = kindByBase();
    for (const id of ['en-1-lejos-y-distinto', 'en-2-precio-y-superficie-muy-distintos', 'en-5-rooms-bathrooms-coinciden-resto-no', 'en-6-distinto-en-casi-todo']) {
      const a = IMAGE_MANIFEST[refA(id)];
      const b = IMAGE_MANIFEST[refB(id)];
      expect(a?.base).not.toBe(b?.base);
      expect(kindOf.get(a?.base ?? '')).toBe(kindOf.get(b?.base ?? ''));
    }
  });

  it('en-3/4: bases distintas', () => {
    for (const id of ['en-3-veto-tipo-de-inmueble', 'en-4-veto-operacion']) {
      const a = IMAGE_MANIFEST[refA(id)];
      const b = IMAGE_MANIFEST[refB(id)];
      expect(a?.base).not.toBe(b?.base);
    }
  });

  it('hn-1 y hn-7 comparten la MISMA base de fachada, portalA/portalB invertidos entre sí', () => {
    const hn1a = IMAGE_MANIFEST[refA('hn-1-trafalgar-street-less-rooms-distintos')];
    const hn1b = IMAGE_MANIFEST[refB('hn-1-trafalgar-street-less-rooms-distintos')];
    const hn7a = IMAGE_MANIFEST[refA('hn-7-misma-direccion-mismas-rooms-necesita-floor')];
    const hn7b = IMAGE_MANIFEST[refB('hn-7-misma-direccion-mismas-rooms-necesita-floor')];

    expect(hn1a?.base).toBe(hn1b?.base);
    expect(hn7a?.base).toBe(hn7b?.base);
    expect(hn1a?.base).toBe(hn7a?.base);

    expect(new Set([hn1a?.transform, hn1b?.transform])).toEqual(new Set(['portalA', 'portalB']));
    expect(hn7a?.transform).toBe(hn1b?.transform);
    expect(hn7b?.transform).toBe(hn1a?.transform);
  });

  it('hn-2/3/4/6/8: bases de interior distintas (nunca fachada, nunca placeholder)', () => {
    const kindOf = kindByBase();
    for (const id of [
      'hn-2-trafalgar-street-less-bathrooms-distintos',
      'hn-3-trafalgar-street-less-precio-superficie-lejos',
      'hn-4-trafalgar-street-less-casi-todo-distinto',
      'hn-6-street-level-otra-calle-rooms-distintos',
      'hn-8-identico-en-todo-falso-positivo-irreducible',
    ]) {
      const a = IMAGE_MANIFEST[refA(id)];
      const b = IMAGE_MANIFEST[refB(id)];
      expect(a?.base).not.toBe(b?.base);
      expect(a?.base).not.toBe('placeholder');
      expect(b?.base).not.toBe('placeholder');
      expect(kindOf.get(a?.base ?? '')).not.toBe('facade');
      expect(kindOf.get(b?.base ?? '')).not.toBe('facade');
    }
  });

  it('hn-5: placeholder en los dos lados', () => {
    const a = IMAGE_MANIFEST[refA('hn-5-street-level-igual-rooms-distintos')];
    const b = IMAGE_MANIFEST[refB('hn-5-street-level-igual-rooms-distintos')];
    expect(a?.base).toBe('placeholder');
    expect(b?.base).toBe('placeholder');
  });

  it('todas las entradas declaran set "evaluation"', () => {
    for (const entry of Object.values(IMAGE_MANIFEST)) {
      expect(entry.set).toBe('evaluation');
    }
  });
});
