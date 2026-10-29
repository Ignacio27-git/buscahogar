// ROADMAP 3.3 (decisión 253; D13) — comando `presweep-top-cities`: barre las N ciudades más pobladas (venta y
// alquiler) con topes EXPLÍCITOS, contra el carril batch del registro mensual de cuota. Uso (el responsable del
// proyecto, tras aplicar las migraciones 0017-0019 y fijar la cuota con `set-monthly-quota`):
//   pnpm --filter @buscahogar/ingestion presweep --top 100 --max-requests 500 --max-requests-per-sweep 20 [--dry-run]
//
// ÚNICO lector de `process.env` de esta herramienta (como scripts/sweep-zone.ts). `--top`, `--max-requests` y
// `--max-requests-per-sweep` son obligatorios y sin valor por defecto; el total y la reserva mensuales NO son
// flags: salen del registro. Es el shell de orquestación de piezas ya probadas por separado (argv, bucle con
// puertos falsos y bucle contra PostgreSQL con conector falso: test/presweep-options.test.ts,
// test/presweep-run.test.ts y test/db/presweep-run.db.test.ts). Los tests nunca llaman a la API real.
import { fileURLToPath } from 'node:url';

import { createDb } from '@buscahogar/db';
import { z } from 'zod';

import { createHttpSearchPort, createHttpTokenPort } from '../src/sources/idealista/index.js';
import type { IdealistaSearchPort, IdealistaTokenPort } from '../src/sources/idealista/ports.js';
import { createRealPresweepPorts } from '../src/presweep/presweep-ports.js';
import { parsePresweepArgs } from '../src/presweep/presweep-options.js';
import type { PresweepArgs } from '../src/presweep/presweep-options.js';
import { formatPresweepReport, presweepExitCode, runPresweep } from '../src/presweep/run-presweep.js';
import { resolveSourceUuid } from '../src/sweep/reference-store.js';

export interface PresweepIo {
  log(line: string): void;
}

// Puertos de la fuente inyectables: los tests pasan puertos falsos (cero red). En producción `main()` no los
// pasa y se usan los puertos HTTP reales de Idealista.
export interface PresweepSourcePorts {
  readonly searchPort: IdealistaSearchPort;
  readonly tokenPort: IdealistaTokenPort;
}

// Salida cuando el uso o el entorno son inválidos (como `sweep-zone` y `set-monthly-quota`).
const EXIT_USAGE = 2;

const DatabaseEnvSchema = z.object({ DATABASE_URL: z.string().min(1) });
const CredentialsEnvSchema = z.object({
  IDEALISTA_API_KEY: z.string().min(1),
  IDEALISTA_API_SECRET: z.string().min(1),
});

const USAGE =
  'Uso: presweep-top-cities --top <entero > 0> --max-requests <entero > 0> --max-requests-per-sweep <entero > 0> [--dry-run]';

// Nunca lee `process.env` directamente: recibe el entorno como parámetro. Devuelve el código de salida.
export async function runPresweepCommand(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: PresweepIo,
  ports?: PresweepSourcePorts
): Promise<number> {
  // 1. Argumentos: Zod ANTES de abrir ninguna conexión. Un argumento inválido no hace ninguna llamada ni
  // escribe nada en el registro (S3.1).
  let args: PresweepArgs;
  try {
    args = parsePresweepArgs(argv);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    io.log(USAGE);
    return EXIT_USAGE;
  }

  // 2. Entorno: la base de datos siempre; las credenciales de Idealista solo si se va a gastar (no en --dry-run)
  // y no se inyectan puertos.
  const database = DatabaseEnvSchema.safeParse(env);
  if (!database.success) {
    io.log('Falta la variable de entorno DATABASE_URL (definida y no vacía).');
    return EXIT_USAGE;
  }
  let sourcePorts: PresweepSourcePorts | undefined = ports;
  if (!args.dryRun && sourcePorts === undefined) {
    const credentials = CredentialsEnvSchema.safeParse(env);
    if (!credentials.success) {
      io.log('Faltan variables de entorno: IDEALISTA_API_KEY y IDEALISTA_API_SECRET deben estar definidas y no vacías.');
      return EXIT_USAGE;
    }
    sourcePorts = {
      searchPort: createHttpSearchPort(),
      tokenPort: createHttpTokenPort({
        apiKey: credentials.data.IDEALISTA_API_KEY,
        apiSecret: credentials.data.IDEALISTA_API_SECRET,
      }),
    };
  }
  // Con las credenciales ausentes y puertos inyectados (tests) también se exige la clave: el entorno de
  // producción nunca debe arrancar a medias.
  if (!args.dryRun && ports !== undefined && !CredentialsEnvSchema.safeParse(env).success) {
    io.log('Faltan variables de entorno: IDEALISTA_API_KEY y IDEALISTA_API_SECRET deben estar definidas y no vacías.');
    return EXIT_USAGE;
  }
  if (sourcePorts === undefined) {
    // --dry-run sin puertos: no se hace ninguna petición, así que los puertos de red son inertes.
    sourcePorts = { searchPort: INERT_SEARCH_PORT, tokenPort: INERT_TOKEN_PORT };
  }

  const { db, pool } = createDb(database.data.DATABASE_URL);
  try {
    let sourceUuid: string;
    try {
      sourceUuid = await resolveSourceUuid(db, 'idealista');
    } catch (error) {
      io.log(error instanceof Error ? error.message : 'No se pudo resolver la fuente.');
      return EXIT_USAGE;
    }

    const presweepPorts = createRealPresweepPorts({
      db,
      sourceUuid,
      searchPort: sourcePorts.searchPort,
      tokenPort: sourcePorts.tokenPort,
      log: (line) => {
        io.log(line);
      },
    });
    const report = await runPresweep(presweepPorts, args);
    for (const line of formatPresweepReport(report)) {
      io.log(line);
    }
    return presweepExitCode(report);
  } finally {
    await pool.end();
  }
}

// Puertos que nunca deberían invocarse (`--dry-run` no emite peticiones): si se llamaran, fallan en voz alta
// en lugar de salir a la red.
const INERT_SEARCH_PORT: IdealistaSearchPort = {
  search(): never {
    throw new Error('presweep --dry-run: no se permite ninguna petición de búsqueda.');
  },
};
const INERT_TOKEN_PORT: IdealistaTokenPort = {
  acquire(): never {
    throw new Error('presweep --dry-run: no se permite ninguna petición de token.');
  },
};

export async function main(): Promise<void> {
  const io: PresweepIo = {
    log: (line: string): void => {
      console.log(line);
    },
  };
  process.exitCode = await runPresweepCommand(process.argv.slice(2), process.env, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
