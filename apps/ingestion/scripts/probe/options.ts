// Sonda de la API de Idealista (paso 1.5) — parseo de argumentos y
// construcción de los parámetros de búsqueda.
//
// `parseArgs` de node:util con `strict: true`: rechaza cualquier flag
// desconocido sin tener que reimplementar esa comprobación a mano (D2). No
// hay rama de reserva sobre `process.argv`: la API está presente y tipada en
// Node >=20.11, así que una rama alternativa sería código muerto que nunca
// se ejecuta ni se cubre — y sería una segunda implementación de lo único
// que protege una petición facturable.
import { parseArgs } from 'node:util';

export const PROBE_PROFILES = ['homes', 'premises'] as const;
export type ProbeProfile = (typeof PROBE_PROFILES)[number];

export interface SearchField {
  readonly name: string;
  readonly value: string;
}

export interface ProbeOptions {
  readonly mode: 'dry-run' | 'execute' | 'analyse';
  readonly profile: ProbeProfile | null; // null solo en modo analyse
  readonly analysePaths: readonly string[];
  readonly overwrite: boolean;
}

export class ProbeUsageError extends Error {}

export const USAGE = `Uso:
  probe-idealista.ts --profile <homes|premises> [--execute] [--overwrite]
  probe-idealista.ts --analyse <fixture...>

Por defecto (sin --execute) el script solo imprime la petición planeada y
no abre ninguna conexión de red. --analyse no necesita credenciales ni red:
relee fixtures ya commiteadas.`;

function isProbeProfile(value: string): value is ProbeProfile {
  return (PROBE_PROFILES as readonly string[]).includes(value);
}

export function parseProbeArgs(argv: readonly string[]): ProbeOptions {
  let values: { profile?: string; 'dry-run'?: boolean; execute?: boolean; overwrite?: boolean; analyse?: boolean };
  let positionals: string[];

  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      options: {
        profile: { type: 'string' },
        'dry-run': { type: 'boolean' },
        execute: { type: 'boolean' },
        overwrite: { type: 'boolean' },
        analyse: { type: 'boolean' },
      },
      allowPositionals: true,
      strict: true,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Argumentos inválidos.';
    throw new ProbeUsageError(`${message}\n\n${USAGE}`);
  }

  const overwrite = values.overwrite === true;
  const executeFlag = values.execute === true;

  if (values.analyse === true) {
    if (executeFlag) {
      throw new ProbeUsageError(
        `--analyse y --execute no pueden combinarse: el modo de análisis no hace peticiones de red.\n\n${USAGE}`
      );
    }
    return { mode: 'analyse', profile: null, analysePaths: positionals, overwrite };
  }

  if (positionals.length > 0) {
    throw new ProbeUsageError(
      `Argumentos posicionales inesperados fuera de --analyse: ${positionals.join(', ')}.\n\n${USAGE}`
    );
  }

  const profileValue = values.profile;
  if (profileValue === undefined || !isProbeProfile(profileValue)) {
    throw new ProbeUsageError(
      `--profile es obligatorio y debe ser uno de: ${PROBE_PROFILES.join(', ')}.\n\n${USAGE}`
    );
  }

  return {
    mode: executeFlag ? 'execute' : 'dry-run',
    profile: profileValue,
    analysePaths: [],
    overwrite,
  };
}

// Tabla de parámetros de la petición de búsqueda. `Record<ProbeProfile, …>`
// obliga en tiempo de compilación a que cada perfil de PROBE_PROFILES tenga
// entrada aquí: no puede quedar un perfil sin sus parámetros.
const PROFILE_PARAMETERS: Record<ProbeProfile, { readonly distance: string; readonly propertyType: string }> = {
  homes: { distance: '300', propertyType: 'homes' },
  premises: { distance: '2000', propertyType: 'premises' },
};

export function buildSearchFields(profile: ProbeProfile): readonly SearchField[] {
  const { distance, propertyType } = PROFILE_PARAMETERS[profile];

  return [
    { name: 'center', value: '40.430,-3.702' },
    { name: 'distance', value: distance },
    { name: 'propertyType', value: propertyType },
    { name: 'operation', value: 'sale' },
    { name: 'maxItems', value: '50' },
    { name: 'numPage', value: '1' },
  ];
}

// Única iteración permitida en el módulo de la sonda (D5): el ban de bucles
// de ESLint solo alcanza a `scripts/probe-idealista.ts`, el único fichero que
// toca la red.
export function toFormData(fields: readonly SearchField[]): FormData {
  const formData = new FormData();
  for (const field of fields) {
    formData.append(field.name, field.value);
  }
  return formData;
}
