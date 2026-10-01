// imageHashTableSchema (ROADMAP 2.3, decisión 096): forma de
// hashes.{calibration,evaluation}.json. Cabecera de PROCEDENCIA (con qué
// sharp/libvips se calculó, qué algoritmo, qué margen de recorte y qué
// umbral de baja entropía) + un mapa de entradas con claves ordenadas
// ascendentemente — un fichero regenerado con las mismas fotos produce
// SIEMPRE el mismo diff legible en revisión, nunca un reordenamiento
// espurio de claves (Phase 3/4, generate-image-hashes.ts).
import { z } from 'zod';

export const IMAGE_HASH_ALGORITHM = 'dct-phash-64';

const HASH_PATTERN = /^[0-9a-f]{16}$/;

const imageHashEntrySchema = z.union([
  z.strictObject({
    kind: z.literal('hashed'),
    hash: z.string().regex(HASH_PATTERN),
    lowEntropy: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('unreadable') }),
]);

function hasSortedKeys(entries: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(entries);
  const sorted = [...keys].sort();
  return keys.every((key, index) => key === sorted[index]);
}

const sortedImageHashEntriesSchema = z
  .record(z.string(), imageHashEntrySchema)
  .refine(hasSortedKeys, {
    message: 'las claves de "entries" deben estar en orden ascendente (sorted-key entry map)',
  });

export const imageHashTableSchema = z.strictObject({
  sharp: z.string().min(1),
  libvips: z.string().min(1),
  algorithm: z.literal(IMAGE_HASH_ALGORITHM),
  // Ratio 0-1: 0.05 = 5% de margen por lado (decisión 095), nunca 0 (sin
  // recorte no sería este algoritmo) ni >1 (no tiene sentido geométrico).
  cropMargin: z.number().positive().max(1),
  lowEntropyStddev: z.number().positive(),
  entries: sortedImageHashEntriesSchema,
});

export type ImageHashTable = z.infer<typeof imageHashTableSchema>;
