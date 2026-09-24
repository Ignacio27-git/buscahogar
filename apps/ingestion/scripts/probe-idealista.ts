// Sonda de la API de Idealista (paso 1.5) — ÚNICO fichero que abre una
// conexión de red. Exactamente dos `await fetch(...)`, ninguna estructura de
// bucle (garantía estática vía eslint.config.mjs, D5) y ningún
// `process.exit()` a mitad de ejecución (el informe del contador de
// peticiones se perdería si el proceso terminase antes de imprimirlo).
//
// El parseo de argumentos, la construcción de parámetros, la contabilidad de
// peticiones y la anonimización viven en módulos puros bajo `scripts/probe/`,
// testeados sin red ni disco. Aquí solo queda la orquestación y las dos
// llamadas reales.
import { mkdir, readFile as readFileAsync, stat, writeFile as writeFileAsync } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { anonymise, type Json } from './probe/anonymise.js';
import { createRequestLedger, renderLedgerReport } from './probe/ledger.js';
import { buildSearchFields, parseProbeArgs, toFormData } from './probe/options.js';
import type { ProbeOptions, ProbeProfile, SearchField } from './probe/options.js';
import { crossTabulate, renderAnalysisReport, summarise } from './probe/summarise.js';

const TOKEN_URL = 'https://api.idealista.com/oauth/token';
const SEARCH_URL = 'https://api.idealista.com/3.5/es/search';
const FIXTURES_DIR = 'test/fixtures/idealista';

export interface ProbeCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
}

export interface ProbeIo {
  log(line: string): void;
  writeFile(path: string, contents: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
}

const CredentialsSchema = z.object({
  IDEALISTA_API_KEY: z.string().min(1),
  IDEALISTA_API_SECRET: z.string().min(1),
});

export class ProbeCredentialsError extends Error {}

// Nunca lee `process.env` directamente: recibe el entorno como parámetro,
// así que un test puede ejercitar el fallo sin credenciales reales ni tocar
// el proceso. `main()` es el único llamador con `process.env` de verdad.
export function readCredentials(env: Readonly<Record<string, string | undefined>>): ProbeCredentials {
  const parsed = CredentialsSchema.safeParse(env);
  if (!parsed.success) {
    throw new ProbeCredentialsError(
      'Faltan credenciales: IDEALISTA_API_KEY e IDEALISTA_API_SECRET deben estar definidas y no vacías en el entorno.'
    );
  }
  return { apiKey: parsed.data.IDEALISTA_API_KEY, apiSecret: parsed.data.IDEALISTA_API_SECRET };
}

// Comprobación no estricta a propósito (D4): el objetivo de la sonda es
// descubrir la forma real de la respuesta, así que una clave desconocida
// nunca debe hacer fallar el parseo. Son las cuatro líneas de más valor del
// cambio: sin esto, un token vacío llegaría como `Bearer undefined` y
// quemaría la petición de búsqueda con un 401.
const TokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

function scrubCredentials(text: string, credentials: ProbeCredentials): string {
  let scrubbed = text;
  if (credentials.apiKey.length > 0) {
    scrubbed = scrubbed.split(credentials.apiKey).join('[REDACTED]');
  }
  if (credentials.apiSecret.length > 0) {
    scrubbed = scrubbed.split(credentials.apiSecret).join('[REDACTED]');
  }
  return scrubbed;
}

interface FixturePaths {
  readonly fixturePath: string;
  readonly metaPath: string;
  readonly rawPath: string;
}

function buildFixturePaths(profile: ProbeProfile): FixturePaths {
  const isoDate = new Date().toISOString().slice(0, 10);
  const base = `${FIXTURES_DIR}/search-${profile}-${isoDate}`;
  return {
    fixturePath: `${base}.json`,
    metaPath: `${base}.meta.json`,
    rawPath: `${FIXTURES_DIR}/raw/search-${profile}-${isoDate}.raw.json`,
  };
}

function printRequestPlan(profile: ProbeProfile, fields: readonly SearchField[], io: ProbeIo): void {
  io.log('Modo: dry-run — no se abrirá ninguna conexión de red.');
  io.log(`Perfil: ${profile}`);
  io.log('');
  io.log('Petición de token (planeada, no enviada):');
  io.log(`  POST ${TOKEN_URL}`);
  io.log('  Cuerpo (application/x-www-form-urlencoded): grant_type=client_credentials, scope=read');
  io.log('');
  io.log('Petición de búsqueda (planeada, no enviada):');
  io.log(`  POST ${SEARCH_URL}`);
  io.log('  Cuerpo (multipart/form-data):');
  fields.forEach((field) => {
    io.log(`    ${field.name} = ${field.value}`);
  });
}

interface ProbeMeta {
  readonly profile: ProbeProfile;
  readonly requestParameters: readonly SearchField[];
  readonly counters: { readonly token: number; readonly search: number };
  readonly endpoint: string;
  readonly httpStatus: number | null;
  readonly timestamp: string;
  readonly outcome: 'ok' | 'http-error' | 'network-error' | 'unparseable';
  readonly tokenQuotaImpact: 'unknown';
  readonly searchQuotaImpact: 'billable';
  readonly token: {
    readonly tokenType?: string;
    readonly expiresIn?: number;
    readonly scope?: string;
  };
}

async function writeMetaSafely(path: string, meta: ProbeMeta, io: ProbeIo): Promise<void> {
  await io.writeFile(path, `${JSON.stringify(meta, null, 2)}\n`);
}

async function runExecute(
  profile: ProbeProfile,
  fields: readonly SearchField[],
  overwrite: boolean,
  credentials: ProbeCredentials,
  io: ProbeIo
): Promise<number> {
  const paths = buildFixturePaths(profile);

  if (!overwrite && (await io.fileExists(paths.fixturePath))) {
    io.log(
      `Ya existe una fixture para el perfil "${profile}" en ${paths.fixturePath}. Usa --overwrite para repetir la ejecución.`
    );
    return 2;
  }

  const ledger = createRequestLedger();

  // --- Intercambio de token ---
  const basicAuth = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64');
  const tokenBody = new URLSearchParams({ grant_type: 'client_credentials', scope: 'read' });

  ledger.spend('token'); // contar SIEMPRE antes de enviar (D6)
  let tokenRaw: string;
  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' },
      body: tokenBody,
    });
    tokenRaw = await tokenResponse.text();
    if (!tokenResponse.ok) {
      io.log(`El intercambio de token respondió con estado ${String(tokenResponse.status)}.`);
      io.log(scrubCredentials(tokenRaw.slice(0, 500), credentials));
      io.log(renderLedgerReport(ledger.snapshot(), 'error'));
      return 3;
    }
  } catch {
    io.log('El intercambio de token lanzó una excepción de red.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 3;
  }

  let tokenJson: unknown;
  try {
    tokenJson = JSON.parse(tokenRaw) as unknown;
  } catch {
    io.log('La respuesta del token no es JSON válido.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 3;
  }

  const parsedToken = TokenResponseSchema.safeParse(tokenJson);
  if (!parsedToken.success) {
    io.log('La respuesta del token no contiene un access_token no vacío: no se envía la búsqueda.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 3;
  }

  const accessToken = parsedToken.data.access_token;
  const tokenMeta = {
    tokenType: parsedToken.data.token_type,
    expiresIn: parsedToken.data.expires_in,
    scope: parsedToken.data.scope,
  };

  // --- Petición de búsqueda ---
  ledger.spend('search'); // contar SIEMPRE antes de enviar (D6)
  let searchResponse: Response;
  try {
    searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      // NUNCA se fija Content-Type a mano: con un FormData, el runtime genera
      // el boundary del multipart. Un valor escrito a mano lo sustituye,
      // pierde el boundary, y el 4xx resultante llega DESPUÉS de haberse
      // contado y muy probablemente facturado (ver comentario de diseño).
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      body: toFormData(fields),
    });
  } catch {
    io.log('La petición de búsqueda lanzó una excepción de red.');
    await writeMetaSafely(
      paths.metaPath,
      {
        profile,
        requestParameters: fields,
        counters: ledger.snapshot(),
        endpoint: SEARCH_URL,
        httpStatus: null,
        timestamp: new Date().toISOString(),
        outcome: 'network-error',
        tokenQuotaImpact: 'unknown',
        searchQuotaImpact: 'billable',
        token: tokenMeta,
      },
      io
    );
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 4;
  }

  const searchStatus = searchResponse.status;
  const searchRaw = await searchResponse.text();

  if (!searchResponse.ok) {
    await io.writeFile(paths.rawPath, searchRaw);
    await writeMetaSafely(
      paths.metaPath,
      {
        profile,
        requestParameters: fields,
        counters: ledger.snapshot(),
        endpoint: SEARCH_URL,
        httpStatus: searchStatus,
        timestamp: new Date().toISOString(),
        outcome: 'http-error',
        tokenQuotaImpact: 'unknown',
        searchQuotaImpact: 'billable',
        token: tokenMeta,
      },
      io
    );
    io.log(`La búsqueda respondió con estado ${String(searchStatus)}.`);
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 4;
  }

  // El orden es deliberado (diseño, "Write ordering after a 2xx"): la copia
  // cruda se escribe ANTES de parsear y ANTES de anonimizar, para minimizar
  // el tiempo en que los únicos bytes pagados existen solo en memoria.
  try {
    await io.writeFile(paths.rawPath, searchRaw);
  } catch {
    io.log('No se pudo escribir la copia cruda de la respuesta: la cuota ya se ha gastado y los datos se han perdido.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 6;
  }

  let searchJson: unknown;
  try {
    searchJson = JSON.parse(searchRaw) as unknown;
  } catch {
    await writeMetaSafely(
      paths.metaPath,
      {
        profile,
        requestParameters: fields,
        counters: ledger.snapshot(),
        endpoint: SEARCH_URL,
        httpStatus: searchStatus,
        timestamp: new Date().toISOString(),
        outcome: 'unparseable',
        tokenQuotaImpact: 'unknown',
        searchQuotaImpact: 'billable',
        token: tokenMeta,
      },
      io
    );
    io.log('La respuesta de búsqueda tiene estado 2xx pero no es JSON válido; se conserva la copia cruda.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 5;
  }

  const { document, report } = anonymise(searchJson as Json);

  await io.writeFile(paths.fixturePath, `${JSON.stringify(document, null, 2)}\n`);
  await writeMetaSafely(
    paths.metaPath,
    {
      profile,
      requestParameters: fields,
      counters: ledger.snapshot(),
      endpoint: SEARCH_URL,
      httpStatus: searchStatus,
      timestamp: new Date().toISOString(),
      outcome: 'ok',
      tokenQuotaImpact: 'unknown',
      searchQuotaImpact: 'billable',
      token: tokenMeta,
    },
    io
  );

  io.log('Anonimización:');
  io.log(`  hojas redactadas: ${String(report.redactedLeaves)}`);
  const rewritten = report.findings.filter((finding) => finding.action === 'rewritten');
  const reviewRequired = report.findings.filter((finding) => finding.action === 'review-required');
  io.log(`  hallazgos reescritos (teléfono/email en texto libre): ${String(rewritten.length)}`);
  if (reviewRequired.length > 0) {
    io.log(`  HALLAZGOS QUE REQUIEREN REVISIÓN MANUAL: ${String(reviewRequired.length)}`);
    reviewRequired.forEach((finding) => {
      io.log(`    ${finding.path} — patrón de ${finding.kind} detectado, valor NO reescrito`);
    });
  }
  io.log(`  claves conservadas fuera de zona PII: ${String(report.keptKeyPaths.length)} (revisar la lista antes de commitear)`);
  io.log(renderLedgerReport(ledger.snapshot(), 'ok'));

  return 0;
}

async function runAnalyse(paths: readonly string[], io: ProbeIo): Promise<number> {
  if (paths.length === 0) {
    io.log('Modo --analyse: no se ha indicado ninguna ruta de fixture que leer.');
    return 2;
  }

  const contents = await Promise.all(paths.map((path) => io.readFile(path)));
  const documents = contents.map((text) => JSON.parse(text) as unknown as Json);
  const summaries = documents.map((document) => summarise(document));

  summaries.forEach((summary, index) => {
    io.log(`--- ${paths[index] ?? '(ruta desconocida)'} ---`);
    io.log(renderAnalysisReport(summary));
  });

  if (summaries.length >= 2 && summaries[0] !== undefined && summaries[1] !== undefined) {
    const crossTab = crossTabulate(summaries[0], summaries[1]);
    io.log('--- comparación entre perfiles (campos observados solo en uno de los dos) ---');
    crossTab.forEach((entry) => {
      io.log(`  ${entry.field}: presente en ${entry.presentIn.join(' y ')}`);
    });
  }

  return 0;
}

export async function runProbe(options: ProbeOptions, credentials: ProbeCredentials, io: ProbeIo): Promise<number> {
  if (options.mode === 'analyse') {
    return runAnalyse(options.analysePaths, io);
  }

  const profile = options.profile;
  if (profile === null) {
    io.log('Error interno: falta el perfil fuera del modo --analyse.');
    return 2;
  }

  const fields = buildSearchFields(profile);

  if (options.mode === 'dry-run') {
    printRequestPlan(profile, fields, io);
    return 0;
  }

  return runExecute(profile, fields, options.overwrite, credentials, io);
}

function createNodeIo(): ProbeIo {
  return {
    log(line: string): void {
      console.log(line);
    },
    async writeFile(path: string, contents: string): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      await writeFileAsync(path, contents, 'utf8');
    },
    async fileExists(path: string): Promise<boolean> {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
    async readFile(path: string): Promise<string> {
      return readFileAsync(path, 'utf8');
    },
  };
}

export async function main(): Promise<void> {
  const io = createNodeIo();
  let options: ProbeOptions;
  try {
    options = parseProbeArgs(process.argv.slice(2));
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    process.exitCode = 2;
    return;
  }

  if (options.mode !== 'execute') {
    process.exitCode = await runProbe(options, { apiKey: '', apiSecret: '' }, io);
    return;
  }

  let credentials: ProbeCredentials;
  try {
    credentials = readCredentials(process.env);
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Credenciales inválidas.');
    process.exitCode = 2;
    return;
  }

  process.exitCode = await runProbe(options, credentials, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test —mismo
// patrón que src/index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
