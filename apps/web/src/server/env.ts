// ROADMAP 1.15 (security-hardening, spec #261 "apps/web's Three
// Hand-Rolled Env Reads Become One Zod Schema, Validated Once", diseño
// decisión 078) — UN lector Zod por variable de entorno, cada uno parseado
// en el MOMENTO DE LA LLAMADA, nunca en la carga del módulo (docs/
// DECISIONS.md, decisión 066: nada se fabrica en código, nada se cachea
// antes de que alguien lo pida). Las clases de error y sus mensajes
// EXACTOS vivían antes en `db.ts`/`coverage-db.ts`/`coverage.ts`; ahora
// viven aquí, y esos tres ficheros las RE-EXPORTAN desde esta ruta — ningún
// test ni consumidor externo cambia su import (`db.test.ts`,
// `coverage-db.test.ts`, `coverage-env.test.ts` siguen importando de sus
// ficheros originales, sin cambios).
import { z } from 'zod';

import { parseSiteIndexing } from '../lib/site-indexing';
import type { SiteIndexing } from '../lib/site-indexing';
import { parseTileConfig } from '../lib/tile-config';
import type { TileConfig } from '../lib/tile-config';

export class MissingDatabaseUrlError extends Error {}
export class MissingCoverageDatabaseUrlError extends Error {}
export class MissingNewZonesDailyCapError extends Error {}
// PR2 (spec #261 "Limiter Parameters Are Required Only When The Trusted
// Header Is Configured", decisión 078/D7) — un único error para los cuatro
// parámetros del limitador por cliente: todos comparten el mismo
// required-ness condicional, así que un fallo de cualquiera de ellos es el
// mismo fallo de configuración, nunca cuatro clases distintas para una sola
// decisión de operación.
export class MissingClientLimitConfigError extends Error {}

// Entorno que leen los lectores de este módulo. Por defecto `process.env`; el clasificador de entorno
// (`env-classifier.ts`, decisión 263) pasa el suyo para validar con EXACTAMENTE las mismas reglas.
export type EnvSource = Readonly<Record<string, string | undefined>>;

const nonEmptyStringSchema = z.string().min(1);
const positiveIntegerStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number);
// Alfabeto de un `token` HTTP válido (RFC 7230 §3.2.6) — el mismo conjunto
// de caracteres permitido en un nombre de cabecera. Normalizado a
// minúsculas porque `Headers`/`NextRequest.headers.get()` ya comparan en
// minúsculas internamente: comparar en el mismo caso evita un desajuste
// silencioso entre lo configurado y lo que el runtime resuelve.
const httpTokenSchema = z
  .string()
  .regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/)
  .transform((value) => value.toLowerCase());
const hmacKeySchema = z.string().min(32);

export function readDatabaseUrl(env: EnvSource = process.env): string {
  const result = nonEmptyStringSchema.safeParse(env.DATABASE_URL);
  if (!result.success) {
    throw new MissingDatabaseUrlError(
      'DATABASE_URL no está definida: apps/web necesita su propio rol de solo lectura ' +
        '(docs/DECISIONS.md, decisión 056).'
    );
  }
  return result.data;
}

export function readCoverageDatabaseUrl(env: EnvSource = process.env): string {
  const result = nonEmptyStringSchema.safeParse(env.WEB_COVERAGE_DATABASE_URL);
  if (!result.success) {
    throw new MissingCoverageDatabaseUrlError(
      'WEB_COVERAGE_DATABASE_URL no está definida: el registro de barridos bajo demanda ' +
        'necesita su propio rol INSERT-only sobre coverage_jobs, distinto del rol de solo ' +
        'lectura de DATABASE_URL (docs/DECISIONS.md, decisión 064).'
    );
  }
  return result.data;
}

export function readNewZonesDailyCap(env: EnvSource = process.env): number {
  const result = positiveIntegerStringSchema.safeParse(env.NEW_ZONES_DAILY_CAP);
  if (!result.success) {
    throw new MissingNewZonesDailyCapError(
      'NEW_ZONES_DAILY_CAP no está definida o no es un entero positivo: el tope de zonas ' +
        'nuevas por día (DD-14) es una decisión de operación, nunca un valor inventado en código.'
    );
  }
  return result.data;
}

export interface ClientLimitConfig {
  readonly headerName: string;
  readonly hmacKey: string;
  readonly dailyCap: number;
  readonly proxyMax: number;
  readonly proxyWindowSeconds: number;
}

// spec #261 "Client Network Identity Comes Only From A Configured Trusted
// Header" (D1a) + "Limiter Parameters Are Required Only When The Trusted
// Header Is Configured" (D7/decisión 078): CLIENT_IP_HEADER ausente o vacía
// desactiva AMBOS limitadores por IP (proxy y registro de cobertura) — null,
// sin evaluar siquiera el resto de variables, aunque estén ausentes o sean
// inválidas. Definida (no vacía), las cuatro restantes pasan a ser
// obligatorias: un fallo de arranque nombrado, nunca un valor sustituido en
// silencio.
type ParseResult<T> = ReturnType<z.ZodType<T>['safeParse']>;

interface ClientLimitResults {
  readonly headerResult: ParseResult<string>;
  readonly hmacResult: ParseResult<string>;
  readonly dailyCapResult: ParseResult<number>;
  readonly proxyMaxResult: ParseResult<number>;
  readonly proxyWindowResult: ParseResult<number>;
}

function evaluateClientLimitVariables(env: EnvSource, rawHeader: string): ClientLimitResults {
  return {
    headerResult: httpTokenSchema.safeParse(rawHeader),
    hmacResult: hmacKeySchema.safeParse(env.CLIENT_IP_HMAC_KEY),
    dailyCapResult: positiveIntegerStringSchema.safeParse(env.COVERAGE_PER_CLIENT_DAILY_CAP),
    proxyMaxResult: positiveIntegerStringSchema.safeParse(env.PROXY_RATE_LIMIT_MAX),
    proxyWindowResult: positiveIntegerStringSchema.safeParse(env.PROXY_RATE_LIMIT_WINDOW_SECONDS),
  };
}

// Nombres (nunca valores) de las variables del limitador que `readClientLimitConfig` rechazaría. Vacío cuando
// `CLIENT_IP_HEADER` no está definida (limitadores desactivados) o cuando las cinco son válidas.
export function invalidClientLimitVariables(env: EnvSource = process.env): readonly string[] {
  const rawHeader = env.CLIENT_IP_HEADER;
  if (rawHeader === undefined || rawHeader === '') {
    return [];
  }
  const results = evaluateClientLimitVariables(env, rawHeader);
  const checks: ReadonlyArray<readonly [string, { readonly success: boolean }]> = [
    ['CLIENT_IP_HEADER', results.headerResult],
    ['CLIENT_IP_HMAC_KEY', results.hmacResult],
    ['COVERAGE_PER_CLIENT_DAILY_CAP', results.dailyCapResult],
    ['PROXY_RATE_LIMIT_MAX', results.proxyMaxResult],
    ['PROXY_RATE_LIMIT_WINDOW_SECONDS', results.proxyWindowResult],
  ];
  return checks.filter(([, result]) => !result.success).map(([name]) => name);
}

export function readClientLimitConfig(env: EnvSource = process.env): ClientLimitConfig | null {
  const rawHeader = env.CLIENT_IP_HEADER;
  if (rawHeader === undefined || rawHeader === '') {
    return null;
  }

  const { headerResult, hmacResult, dailyCapResult, proxyMaxResult, proxyWindowResult } =
    evaluateClientLimitVariables(env, rawHeader);

  if (
    !headerResult.success ||
    !hmacResult.success ||
    !dailyCapResult.success ||
    !proxyMaxResult.success ||
    !proxyWindowResult.success
  ) {
    throw new MissingClientLimitConfigError(
      'CLIENT_IP_HEADER está definida: CLIENT_IP_HMAC_KEY (mínimo 32 caracteres), ' +
        'COVERAGE_PER_CLIENT_DAILY_CAP, PROXY_RATE_LIMIT_MAX y PROXY_RATE_LIMIT_WINDOW_SECONDS ' +
        '(enteros positivos) pasan a ser obligatorias — ninguna admite un valor por defecto ' +
        'silencioso (docs/DECISIONS.md, decisión 078).'
    );
  }

  return {
    headerName: headerResult.data,
    hmacKey: hmacResult.data,
    dailyCap: dailyCapResult.data,
    proxyMax: proxyMaxResult.data,
    proxyWindowSeconds: proxyWindowResult.data,
  };
}

// ROADMAP 3.4 (decisión 261, PD6/PD11): configuración de teselas validada con Zod en `lib/tile-config.ts`.
// Se lee en el momento de la llamada, como el resto; inválida, lanza `InvalidTileConfigError` (500 en la
// página, error de arranque en `next.config.ts`).
export function readTileConfig(env: EnvSource = process.env): TileConfig {
  return parseTileConfig(env);
}

// ROADMAP 3.4 (decisión 262, PD7): interruptor de indexación (apagado por defecto).
export function readSiteIndexing(env: EnvSource = process.env): SiteIndexing {
  return parseSiteIndexing(env);
}
