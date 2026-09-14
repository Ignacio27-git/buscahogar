// Paso 1.7 — reference-store.ts (diseño D5 paso 1, D9). Resuelve
// sources.key → uuid e ine_code → zona (vía locations, FK 1:1 con zones).
// NUNCA crea la fila de referencia que falta como efecto colateral de un
// barrido — eso es responsabilidad exclusiva del seed (fase 4, COVERAGE-7).
// Un fallo aquí aborta el barrido ANTES de escribir ningún listing
// (PERSIST-9).
import { eq } from 'drizzle-orm';

import { locations, sources, zones } from '@buscahogar/db';
import type { Database } from '@buscahogar/db';

export class UnknownSourceError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`No existe una fila en sources con key="${key}". Ejecuta \`pnpm db:seed\`.`);
    this.key = key;
  }
}

export class UnknownZoneError extends Error {
  readonly ineCode: string;

  constructor(ineCode: string) {
    super(`No existe ninguna zona para el código INE "${ineCode}" (locations.ine_code). Ejecuta \`pnpm db:seed\`.`);
    this.ineCode = ineCode;
  }
}

// sources.key → uuid. El compositor (fase 4) la resuelve UNA vez por
// barrido y cachea el resultado (diseño D5); esta función no cachea nada
// por sí misma.
export async function resolveSourceUuid(db: Database, key: string): Promise<string> {
  const [row] = await db.select({ id: sources.id }).from(sources).where(eq(sources.key, key));
  if (!row) {
    throw new UnknownSourceError(key);
  }
  return row.id;
}

// ine_code → location → zone. `zones.location_id` es UNIQUE (relación 1:1),
// así que como mucho una zona corresponde a cada localización.
export async function resolveZoneByIneCode(db: Database, ineCode: string): Promise<string> {
  const [location] = await db.select({ id: locations.id }).from(locations).where(eq(locations.ineCode, ineCode));
  if (!location) {
    throw new UnknownZoneError(ineCode);
  }

  const [zone] = await db.select({ id: zones.id }).from(zones).where(eq(zones.locationId, location.id));
  if (!zone) {
    throw new UnknownZoneError(ineCode);
  }

  return zone.id;
}
