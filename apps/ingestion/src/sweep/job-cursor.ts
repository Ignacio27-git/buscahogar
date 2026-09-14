// Paso 1.7 — job-cursor.ts (diseño D6): codec del envelope versionado que
// vive en coverage_jobs.cursor. La columna es opaca para el esquema
// (coverage-jobs.ts:22-24, "lo interpreta únicamente el conector de
// apps/ingestion") — su formato es nuestro, y este fichero lo define.
//
// Reutiliza InvalidCursorError del adaptador de Idealista (1.6, errors.ts)
// en vez de definir una clase nueva: es la misma clase de fallo ("un cursor
// no se pudo decodificar, no reanudar en silencio"), aplicada a un cursor
// distinto (el envelope del job, no el "<filtro>:<numPage>" del adaptador).
import { z } from 'zod';

import { InvalidCursorError } from '../sources/idealista/errors.js';

const jobCursorEnvelopeSchema = z.strictObject({
  v: z.literal(1),
  // Huella sha256 de areaFingerprint() (area.ts) — se compara por igualdad
  // exacta de cadena, nunca se reinterpreta aquí.
  area: z.string().min(1),
  // Cursor desnudo del adaptador de Idealista ("homes:3"); su propio
  // formato lo valida decodeCursor (1.6, cursor.ts) cuando se use, no aquí.
  cursor: z.string().min(1),
});

// Serializa el envelope que se persiste literalmente en coverage_jobs.cursor.
export function encodeJobCursor(areaFingerprintValue: string, cursor: string): string {
  return JSON.stringify({ v: 1, area: areaFingerprintValue, cursor });
}

// Decodifica y valida contra la huella de área ESPERADA del barrido actual.
// Un envelope malformado, de versión desconocida, o cuya huella no coincide
// rechaza siempre — nunca cae en reanudar desde cero ni en continuar el
// barrido de otra área en silencio (diseño D6).
export function decodeJobCursor(raw: string, expectedFingerprint: string): string {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new InvalidCursorError(raw, 'el envelope de coverage_jobs.cursor no es JSON válido.');
  }

  const result = jobCursorEnvelopeSchema.safeParse(parsedJson);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new InvalidCursorError(
      raw,
      `envelope malformado o versión desconocida: ${firstIssue?.message ?? 'sin detalle'}.`
    );
  }

  if (result.data.area !== expectedFingerprint) {
    throw new InvalidCursorError(
      raw,
      'la huella de área del envelope no coincide con el barrido actual: pertenece a otra área.'
    );
  }

  return result.data.cursor;
}
