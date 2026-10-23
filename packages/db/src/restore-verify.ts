// ROADMAP 3.4 (decisión 260, D18; R8.4) — comprobaciones del simulacro de restauración. Una copia que nunca se
// ha restaurado es una esperanza, no una copia: el simulacro (`ops/backup/restore-drill.sh`) restaura la última
// copia en una base VACÍA, repite el aprovisionamiento de roles y privilegios (la ruta del despliegue: el volcado
// no lleva roles ni privilegios) y llama aquí. Cada comprobación tiene nombre propio para que un fallo diga qué
// falló (el script sale con el código 4 y lo imprime):
//   postgis-extension  la extensión PostGIS está instalada y responde.
//   core-tables        existen las tablas núcleo del dominio.
//   row-counts         los recuentos de filas coinciden con los esperados (si se facilitan) y se informan siempre.
//   migration-journal  el diario de migraciones restaurado = los ficheros de migración del paquete.
//   privilege-matrix   la MISMA matriz que el despliegue (`checkPrivilegeMatrix`): tablas solo del propietario
//                      invisibles para ambos roles web, `proxy_rate_limit` invisible para `web_readonly`,
//                      `web_coverage` exactamente sus cuatro tablas.
// Este módulo no lee `process.env` (decisión 024).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type pg from 'pg';

import { checkPrivilegeMatrix } from './deploy-verify.js';
import { MIGRATIONS_FOLDER } from './migrate.js';
import { DEFAULT_ROLE_NAMES } from './privilege-fingerprint.js';
import type { RoleNames } from './privilege-fingerprint.js';

export const RESTORE_CHECKS = [
  'postgis-extension',
  'core-tables',
  'row-counts',
  'migration-journal',
  'privilege-matrix',
] as const;

export type RestoreCheckName = (typeof RESTORE_CHECKS)[number];

// Tablas núcleo del dominio (listings/properties separadas, decisión de la cabecera de CLAUDE.md, y lo que las
// alimenta). Las de infraestructura (cuotas, limitador, avisos) las cubre la matriz de privilegios.
export const CORE_TABLES: readonly string[] = [
  'sources',
  'locations',
  'zones',
  'listings',
  'listing_versions',
  'properties',
  'property_listings',
  'coverage_jobs',
];

export interface RestoreCheckResult {
  readonly check: RestoreCheckName;
  readonly ok: boolean;
  readonly detail: string;
}

export interface RestoreCheckOptions {
  readonly names?: RoleNames;
  // `tabla -> filas esperadas`; las tablas no incluidas solo se informan.
  readonly expectedRowCounts?: Readonly<Record<string, number>>;
  readonly migrationsFolder?: string;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

// «tabla=n,tabla=n». Una cadena vacía o ausente = sin recuentos esperados. Lanza un `Error` que nombra la
// variable `DRILL_EXPECTED_ROW_COUNTS` ante cualquier formato inválido (el simulacro sale con 2 antes de tocar nada).
export function parseExpectedRowCounts(raw: string | undefined): Readonly<Record<string, number>> {
  const text = raw?.trim() ?? '';
  if (text === '') {
    return {};
  }
  const counts: Record<string, number> = {};
  for (const pair of text.split(',')) {
    const [table, value, ...rest] = pair.split('=').map((part) => part.trim());
    if (
      table === undefined ||
      value === undefined ||
      rest.length > 0 ||
      !IDENTIFIER.test(table) ||
      !/^(0|[1-9]\d*)$/.test(value)
    ) {
      throw new Error('DRILL_EXPECTED_ROW_COUNTS debe tener la forma tabla=n,tabla=n (n entero >= 0).');
    }
    counts[table] = Number(value);
  }
  return counts;
}

async function checkPostgis(db: Pick<pg.Pool, 'query'>): Promise<RestoreCheckResult> {
  const { rows } = await db.query<{ present: boolean }>(
    `select exists (select 1 from pg_extension where extname = 'postgis') as present`
  );
  if (rows[0]?.present !== true) {
    return { check: 'postgis-extension', ok: false, detail: 'la extensión postgis no está instalada' };
  }
  try {
    const version = await db.query<{ version: string }>('select postgis_version() as version');
    return { check: 'postgis-extension', ok: true, detail: `postgis ${version.rows[0]?.version ?? ''}`.trim() };
  } catch {
    return { check: 'postgis-extension', ok: false, detail: 'postgis_version() no responde' };
  }
}

async function existingTables(db: Pick<pg.Pool, 'query'>, tables: readonly string[]): Promise<ReadonlySet<string>> {
  const { rows } = await db.query<{ relname: string }>(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind in ('r', 'p') and c.relname = any ($1::text[])`,
    [[...tables]]
  );
  return new Set(rows.map((row) => row.relname));
}

async function checkCoreTables(db: Pick<pg.Pool, 'query'>): Promise<RestoreCheckResult> {
  const present = await existingTables(db, CORE_TABLES);
  const missing = CORE_TABLES.filter((table) => !present.has(table));
  return missing.length === 0
    ? { check: 'core-tables', ok: true, detail: `${String(CORE_TABLES.length)} tablas presentes` }
    : { check: 'core-tables', ok: false, detail: `faltan tablas núcleo: ${missing.join(', ')}` };
}

async function countRows(db: Pick<pg.Pool, 'query'>, table: string): Promise<number> {
  // `table` ya pasó `IDENTIFIER` y se comprobó que existe; el nombre se cita igualmente.
  const { rows } = await db.query<{ total: string }>(`select count(*)::text as total from public."${table}"`);
  return Number(rows[0]?.total ?? '0');
}

async function checkRowCounts(
  db: Pick<pg.Pool, 'query'>,
  expected: Readonly<Record<string, number>>
): Promise<RestoreCheckResult> {
  const wanted = Object.keys(expected);
  const present = await existingTables(db, [...CORE_TABLES, ...wanted.filter((table) => IDENTIFIER.test(table))]);
  const problems: string[] = [];
  const found: string[] = [];

  for (const table of CORE_TABLES) {
    if (!present.has(table)) {
      continue;
    }
    const total = await countRows(db, table);
    found.push(`${table}=${String(total)}`);
    const want = expected[table];
    if (want !== undefined && want !== total) {
      problems.push(`${table}: expected ${String(want)}, found ${String(total)}`);
    }
  }
  for (const table of wanted.filter((name) => !CORE_TABLES.includes(name))) {
    if (!IDENTIFIER.test(table) || !present.has(table)) {
      problems.push(`${table}: table not found`);
      continue;
    }
    const total = await countRows(db, table);
    found.push(`${table}=${String(total)}`);
    const want = expected[table];
    if (want !== undefined && want !== total) {
      problems.push(`${table}: expected ${String(want)}, found ${String(total)}`);
    }
  }

  return problems.length === 0
    ? { check: 'row-counts', ok: true, detail: found.join(' ') }
    : { check: 'row-counts', ok: false, detail: `${problems.join('; ')} (${found.join(' ')})` };
}

interface JournalEntry {
  readonly when: number;
  readonly tag: string;
}

function readJournal(migrationsFolder: string): readonly JournalEntry[] {
  const raw = readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    throw new Error('El diario de migraciones del paquete no tiene «entries».');
  }
  return entries.map((entry: unknown) => {
    const { when, tag } = entry as { when: unknown; tag: unknown };
    if (typeof when !== 'number' || typeof tag !== 'string') {
      throw new Error('Entrada ilegible en el diario de migraciones del paquete.');
    }
    return { when, tag };
  });
}

async function checkJournal(db: Pick<pg.Pool, 'query'>, migrationsFolder: string): Promise<RestoreCheckResult> {
  const files = readJournal(migrationsFolder);
  const registry = await db.query<{ present: boolean }>(
    `select to_regclass('drizzle.__drizzle_migrations') is not null as present`
  );
  if (registry.rows[0]?.present !== true) {
    return { check: 'migration-journal', ok: false, detail: 'la base no tiene diario de migraciones (drizzle.__drizzle_migrations)' };
  }
  const { rows } = await db.query<{ created_at: string }>(
    'select created_at::text as created_at from drizzle.__drizzle_migrations'
  );
  const applied = new Set(rows.map((row) => Number(row.created_at)));
  const expected = new Set(files.map((entry) => entry.when));
  const missing = files.filter((entry) => !applied.has(entry.when)).map((entry) => entry.tag);
  const extra = rows.length - [...expected].filter((when) => applied.has(when)).length;
  if (missing.length === 0 && extra === 0) {
    return { check: 'migration-journal', ok: true, detail: `${String(files.length)} migraciones = ${String(rows.length)} filas del journal` };
  }
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`journal missing ${missing.join(', ')}`);
  }
  if (extra > 0) {
    parts.push(`journal has ${String(extra)} rows without a migration file`);
  }
  return { check: 'migration-journal', ok: false, detail: parts.join('; ') };
}

async function checkPrivileges(db: Pick<pg.Pool, 'query'>, names: RoleNames): Promise<RestoreCheckResult> {
  const failures = await checkPrivilegeMatrix(db, names);
  return failures.length === 0
    ? { check: 'privilege-matrix', ok: true, detail: 'matriz de privilegios = la documentada' }
    : { check: 'privilege-matrix', ok: false, detail: failures.join('; ') };
}

// Ejecuta TODAS las comprobaciones (no se detiene en la primera: el informe del simulacro lista cada fallo).
export async function runRestoreChecks(
  db: Pick<pg.Pool, 'query'>,
  options: RestoreCheckOptions = {}
): Promise<readonly RestoreCheckResult[]> {
  const names = options.names ?? DEFAULT_ROLE_NAMES;
  return [
    await checkPostgis(db),
    await checkCoreTables(db),
    await checkRowCounts(db, options.expectedRowCounts ?? {}),
    await checkJournal(db, options.migrationsFolder ?? MIGRATIONS_FOLDER),
    await checkPrivileges(db, names),
  ];
}
