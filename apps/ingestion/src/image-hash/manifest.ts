// IMAGE_MANIFEST (ROADMAP 2.3, decisión 098): asignación CONGELADA
// pareja-corpus -> imagen, fijada ANTES de que exista ningún hash de
// evaluación (D8) — nunca se ajusta después de ver distancias; hacerlo
// sería calibrar contra el propio corpus de evaluación (mismo principio que
// spec "Threshold T Traceable Only to the Calibration Set", aplicado aquí a
// la asignación en vez de al umbral). Literal `as const`: cualquier cambio
// deja un diff explícito en revisión, nunca una regeneración silenciosa.
// Claves = refs no-fetchables `fixture-image:eval/<pairId>-<a|b>` (decisión
// 093), donde `<pairId>` es el `id` exacto de `dedupCorpus`
// (@buscahogar/core) — congelado como texto literal, no derivado en tiempo
// de ejecución, para que un cambio accidental de `id` en el corpus rompa
// este fichero en revisión en vez de desincronizarse en silencio (cubierto
// por `image-manifest.test.ts` importando `dedupCorpus` para comprobar la
// cobertura).
//
// Cobertura exacta:
// - tp-1..6, md-1, md-2, md-4 (9 parejas): MISMA base, DOS transforms
//   distintos por pareja; entre las 9, los 7 transforms de transforms.ts
//   aparecen todos al menos una vez.
// - md-3 lado b: SIN referencia — spec "Deliberately missing reference
//   resolves to neutral/missing"; el lado a sí tiene referencia.
// - en-1/2/5/6: bases DISTINTAS del MISMO kind (facade/kitchen/bedroom/
//   bathroom respectivamente, según provenance.json). en-3/4: bases
//   distintas de kind distinto.
// - hn-1 y hn-7: COMPARTEN una misma base de fachada, portalA/portalB
//   invertidos entre sí — el caso difícil deliberado (misma foto de
//   fachada, chrome de portal distinto, verdad terreno `distinct`).
// - hn-2/3/4/6/8: bases de interior distintas, sin transform (foto sin
//   modificar).
// - hn-5: placeholder en los dos lados (sharp({create}) generado en
//   memoria, nunca committeado — decisión 096).
import type { ImageTransformKind } from './transforms.js';

export interface ImageManifestEntry {
  // `string`, no `string | 'placeholder'` — ESLint (no-redundant-type-
  // constituents) señala correctamente que el literal queda absorbido por
  // `string`. `'placeholder'` sigue siendo el valor centinela real: cuando
  // vale exactamente esa cadena, generate-image-hashes.ts genera la imagen
  // en memoria (sharp({create})) en vez de leer un fichero de fixtures/images/bases/.
  readonly base: string;
  readonly transform?: ImageTransformKind;
  readonly set: 'evaluation';
}

export const IMAGE_MANIFEST: Readonly<Record<string, ImageManifestEntry>> = {
  // --- Duplicados (tp-1..6, md-1, md-2, md-4): misma base, dos transforms
  // distintos; cobertura de los 7 transforms entre las 9 parejas. ---
  'fixture-image:eval/tp-1-mismo-anuncio-cerca-a': {
    base: 'eval-facade-1.jpg',
    transform: 'rescale',
    set: 'evaluation',
  },
  'fixture-image:eval/tp-1-mismo-anuncio-cerca-b': {
    base: 'eval-facade-1.jpg',
    transform: 'jpeg',
    set: 'evaluation',
  },

  'fixture-image:eval/tp-2-otra-fuente-otro-sourceId-a': {
    base: 'eval-facade-2.jpg',
    transform: 'webp',
    set: 'evaluation',
  },
  'fixture-image:eval/tp-2-otra-fuente-otro-sourceId-b': {
    base: 'eval-facade-2.jpg',
    transform: 'crop',
    set: 'evaluation',
  },

  'fixture-image:eval/tp-3-superficie-ausente-un-lado-a': {
    base: 'eval-kitchen-1.jpg',
    transform: 'overlay',
    set: 'evaluation',
  },
  'fixture-image:eval/tp-3-superficie-ausente-un-lado-b': {
    base: 'eval-kitchen-1.jpg',
    transform: 'portalA',
    set: 'evaluation',
  },

  'fixture-image:eval/tp-4-premises-sin-rooms-bathrooms-a': {
    base: 'eval-kitchen-2.jpg',
    transform: 'portalB',
    set: 'evaluation',
  },
  'fixture-image:eval/tp-4-premises-sin-rooms-bathrooms-b': {
    base: 'eval-kitchen-2.jpg',
    transform: 'rescale',
    set: 'evaluation',
  },

  'fixture-image:eval/tp-5-distancia-mayor-resto-fuerte-a': {
    base: 'eval-bedroom-1.jpg',
    transform: 'jpeg',
    set: 'evaluation',
  },
  'fixture-image:eval/tp-5-distancia-mayor-resto-fuerte-b': {
    base: 'eval-bedroom-1.jpg',
    transform: 'webp',
    set: 'evaluation',
  },

  'fixture-image:eval/tp-6-direccion-en-desacuerdo-resto-fuerte-a': {
    base: 'eval-bedroom-2.jpg',
    transform: 'crop',
    set: 'evaluation',
  },
  'fixture-image:eval/tp-6-direccion-en-desacuerdo-resto-fuerte-b': {
    base: 'eval-bedroom-2.jpg',
    transform: 'overlay',
    set: 'evaluation',
  },

  'fixture-image:eval/md-1-premises-sin-rooms-bathrooms-a': {
    base: 'eval-bathroom-1.jpg',
    transform: 'portalA',
    set: 'evaluation',
  },
  'fixture-image:eval/md-1-premises-sin-rooms-bathrooms-b': {
    base: 'eval-bathroom-1.jpg',
    transform: 'portalB',
    set: 'evaluation',
  },

  'fixture-image:eval/md-2-coordenadas-ausentes-un-lado-a': {
    base: 'eval-bathroom-2.jpg',
    transform: 'rescale',
    set: 'evaluation',
  },
  'fixture-image:eval/md-2-coordenadas-ausentes-un-lado-b': {
    base: 'eval-bathroom-2.jpg',
    transform: 'webp',
    set: 'evaluation',
  },

  // md-3: lado b DELIBERADAMENTE sin referencia.
  'fixture-image:eval/md-3-direccion-ausente-ambos-lados-a': {
    base: 'eval-living-room-1.jpg',
    transform: 'rescale',
    set: 'evaluation',
  },

  'fixture-image:eval/md-4-solo-dos-senales-evaluables-a': {
    base: 'eval-living-room-1.jpg',
    transform: 'jpeg',
    set: 'evaluation',
  },
  'fixture-image:eval/md-4-solo-dos-senales-evaluables-b': {
    base: 'eval-living-room-1.jpg',
    transform: 'crop',
    set: 'evaluation',
  },

  // --- en-1/2/5/6: bases distintas del mismo kind. ---
  'fixture-image:eval/en-1-lejos-y-distinto-a': { base: 'eval-facade-1.jpg', set: 'evaluation' },
  'fixture-image:eval/en-1-lejos-y-distinto-b': { base: 'eval-facade-2.jpg', set: 'evaluation' },

  'fixture-image:eval/en-2-precio-y-superficie-muy-distintos-a': { base: 'eval-kitchen-1.jpg', set: 'evaluation' },
  'fixture-image:eval/en-2-precio-y-superficie-muy-distintos-b': { base: 'eval-kitchen-2.jpg', set: 'evaluation' },

  'fixture-image:eval/en-5-rooms-bathrooms-coinciden-resto-no-a': { base: 'eval-bedroom-1.jpg', set: 'evaluation' },
  'fixture-image:eval/en-5-rooms-bathrooms-coinciden-resto-no-b': { base: 'eval-bedroom-2.jpg', set: 'evaluation' },

  'fixture-image:eval/en-6-distinto-en-casi-todo-a': { base: 'eval-bathroom-1.jpg', set: 'evaluation' },
  'fixture-image:eval/en-6-distinto-en-casi-todo-b': { base: 'eval-bathroom-2.jpg', set: 'evaluation' },

  // --- en-3/4: bases distintas, kind distinto. ---
  'fixture-image:eval/en-3-veto-tipo-de-inmueble-a': { base: 'eval-facade-3.jpg', set: 'evaluation' },
  'fixture-image:eval/en-3-veto-tipo-de-inmueble-b': { base: 'eval-living-room-1.jpg', set: 'evaluation' },

  'fixture-image:eval/en-4-veto-operacion-a': { base: 'eval-facade-4.jpg', set: 'evaluation' },
  'fixture-image:eval/en-4-veto-operacion-b': { base: 'eval-living-room-2.jpg', set: 'evaluation' },

  // --- hn-1 / hn-7: misma base de fachada, portalA/portalB invertidos —
  // caso difícil deliberado (decisión 098). ---
  'fixture-image:eval/hn-1-trafalgar-street-less-rooms-distintos-a': {
    base: 'eval-facade-3.jpg',
    transform: 'portalA',
    set: 'evaluation',
  },
  'fixture-image:eval/hn-1-trafalgar-street-less-rooms-distintos-b': {
    base: 'eval-facade-3.jpg',
    transform: 'portalB',
    set: 'evaluation',
  },

  'fixture-image:eval/hn-7-misma-direccion-mismas-rooms-necesita-floor-a': {
    base: 'eval-facade-3.jpg',
    transform: 'portalB',
    set: 'evaluation',
  },
  'fixture-image:eval/hn-7-misma-direccion-mismas-rooms-necesita-floor-b': {
    base: 'eval-facade-3.jpg',
    transform: 'portalA',
    set: 'evaluation',
  },

  // --- hn-2/3/4/6/8: bases de interior distintas, sin transform. ---
  'fixture-image:eval/hn-2-trafalgar-street-less-bathrooms-distintos-a': { base: 'eval-kitchen-1.jpg', set: 'evaluation' },
  'fixture-image:eval/hn-2-trafalgar-street-less-bathrooms-distintos-b': { base: 'eval-bathroom-1.jpg', set: 'evaluation' },

  'fixture-image:eval/hn-3-trafalgar-street-less-precio-superficie-lejos-a': { base: 'eval-living-room-2.jpg', set: 'evaluation' },
  'fixture-image:eval/hn-3-trafalgar-street-less-precio-superficie-lejos-b': { base: 'eval-bedroom-2.jpg', set: 'evaluation' },

  'fixture-image:eval/hn-4-trafalgar-street-less-casi-todo-distinto-a': { base: 'eval-bedroom-1.jpg', set: 'evaluation' },
  'fixture-image:eval/hn-4-trafalgar-street-less-casi-todo-distinto-b': { base: 'eval-kitchen-2.jpg', set: 'evaluation' },

  'fixture-image:eval/hn-6-street-level-otra-calle-rooms-distintos-a': { base: 'eval-bathroom-2.jpg', set: 'evaluation' },
  'fixture-image:eval/hn-6-street-level-otra-calle-rooms-distintos-b': { base: 'eval-living-room-1.jpg', set: 'evaluation' },

  'fixture-image:eval/hn-8-identico-en-todo-falso-positivo-irreducible-a': { base: 'eval-bedroom-2.jpg', set: 'evaluation' },
  'fixture-image:eval/hn-8-identico-en-todo-falso-positivo-irreducible-b': { base: 'eval-living-room-2.jpg', set: 'evaluation' },

  // --- hn-5: placeholder en los dos lados. ---
  'fixture-image:eval/hn-5-street-level-igual-rooms-distintos-a': { base: 'placeholder', set: 'evaluation' },
  'fixture-image:eval/hn-5-street-level-igual-rooms-distintos-b': { base: 'placeholder', set: 'evaluation' },
} as const;
