// imageProvenanceEntrySchema (ROADMAP 2.3, spec "CC0 Provenance for Every
// Base Image", decisión 096): forma de cada entrada de
// `test/fixtures/images/provenance.json` — una por foto base committeada.
// `z.strictObject`: una clave extra no declarada se rechaza, mismo criterio
// que `imageHashTableSchema` (hash-table.schema.ts) — un campo de
// procedencia añadido sin actualizar el esquema debe fallar en voz alta, no
// colarse silenciosamente.
import { z } from 'zod';

// Kinds usados por las 18 fotos base sourced en la tarea 3.1 (apply-progress
// #300) — ningún `floor-plan` entre ellos (spec "CC0 Provenance..."): un
// plano de planta no es una foto de vivienda real, y la enumeración cerrada
// lo excluye por construcción, no solo por convención documental.
export const IMAGE_PROVENANCE_KINDS = [
  'facade',
  'living-room',
  'kitchen',
  'bedroom',
  'bathroom',
] as const;
export type ImageProvenanceKind = (typeof IMAGE_PROVENANCE_KINDS)[number];

export const IMAGE_PROVENANCE_LICENSES = ['CC0-1.0', 'PDM-1.0'] as const;
export type ImageProvenanceLicense = (typeof IMAGE_PROVENANCE_LICENSES)[number];

export const IMAGE_PROVENANCE_SETS = ['calibration', 'evaluation'] as const;
export type ImageProvenanceSet = (typeof IMAGE_PROVENANCE_SETS)[number];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RETRIEVED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const imageProvenanceEntrySchema = z.strictObject({
  file: z.string().min(1),
  set: z.enum(IMAGE_PROVENANCE_SETS),
  kind: z.enum(IMAGE_PROVENANCE_KINDS),
  title: z.string().min(1),
  author: z.string().min(1),
  sourceUrl: z.string().min(1),
  license: z.enum(IMAGE_PROVENANCE_LICENSES),
  retrievedAt: z.string().regex(RETRIEVED_AT_PATTERN),
  sha256: z.string().regex(SHA256_PATTERN),
  modifications: z.string().min(1),
});

export type ImageProvenanceEntry = z.infer<typeof imageProvenanceEntrySchema>;

export const imageProvenanceSchema = z.array(imageProvenanceEntrySchema);

export type ImageProvenance = z.infer<typeof imageProvenanceSchema>;
