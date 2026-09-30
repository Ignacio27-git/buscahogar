// Sonda de `adIds` de Idealista (ROADMAP 2.5, S3; decisión 105, U2/U3) — script
// OPERADO A MANO, UNA VEZ. Ni los tests, ni el código de producción, ni CI lo
// importan ni lo ejecutan (test/probe-adids-not-imported.test.ts lo comprueba).
// Hace como MUCHO 3 peticiones de búsqueda facturables (más 1 de token) y
// graba una fixture anonimizada con una meta que dice cómo responde la API a un
// anuncio dado de baja (`delistedIdBehaviour`).
//
// Mismas garantías que scripts/probe-idealista.ts (paso 1.5): sin estructuras de
// bucle (eslint.config.mjs), cada petición se cuenta con `ledger.spend` en la
// línea inmediatamente anterior a su `fetch` (una petición fallida cuenta igual)
// y el contador tiene un tope duro de 3 búsquedas: una cuarta es imposible sin
// una excepción. La copia cruda se escribe ANTES de parsear o anonimizar.
//
// Las tres peticiones (scripts/probe/adids-options.ts): el id vivo solo; el id
// vivo + el dado de baja; el id vivo bajo otro filtro. Si una petición falla, la
// sonda se DETIENE (no gasta las siguientes a ciegas).
//
// Tras ejecutarla: revisar las fixtures y, SOLO si la meta dice
// `delistedIdBehaviour: 'omitted'`, cambiar `DELISTED_OMISSION_CONFIRMED` a true
// en src/sources/idealista/presence-evidence.ts en el mismo commit.
import { mkdir, stat, writeFile as writeFileAsync } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { buildAdIdsProbeMeta } from './probe/adids-evidence.js';
import type { ProbeSearchOutcome } from './probe/adids-evidence.js';
import { ADIDS_PROBE_SEARCH_CAP, buildAdIdsProbePlan, parseAdIdsProbeArgs } from './probe/adids-options.js';
import type { AdIdsProbeOptions, AdIdsProbeStep } from './probe/adids-options.js';
import { anonymise } from './probe/anonymise.js';
import type { Json } from './probe/anonymise.js';
import { createRequestLedger, renderLedgerReport } from './probe/ledger.js';
import { toFormData } from './probe/options.js';

const TOKEN_URL = 'https://api.idealista.com/oauth/token';
const SEARCH_URL = 'https://api.idealista.com/3.5/es/search';
const FIXTURES_DIR = 'test/fixtures/idealista';

export interface AdIdsProbeCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
}

export interface AdIdsProbeIo {
  log(line: string): void;
  writeFile(path: string, contents: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
}

const CredentialsSchema = z.object({
  IDEALISTA_API_KEY: z.string().min(1),
  IDEALISTA_API_SECRET: z.string().min(1),
});

const TokenResponseSchema = z.looseObject({ access_token: z.string().min(1) });

function scrub(text: string, credentials: AdIdsProbeCredentials, accessToken?: string): string {
  const secrets: readonly (string | undefined)[] = [credentials.apiKey, credentials.apiSecret, accessToken];
  return secrets.reduce<string>(
    (scrubbed, secret) =>
      secret !== undefined && secret.length > 0 ? scrubbed.split(secret).join('[REDACTED]') : scrubbed,
    text
  );
}

interface StepResult {
  readonly outcome: ProbeSearchOutcome;
  // Texto crudo de la respuesta (null si no llegó respuesta).
  readonly rawText: string | null;
  // Cuerpo JSON (null si no era JSON válido o no hubo respuesta).
  readonly json: unknown;
}

const SKIPPED: StepResult = { outcome: { kind: 'skipped' }, rawText: null, json: null };

// UNA petición de búsqueda. `ledger.spend('search')` va en la línea inmediatamente
// anterior al `fetch` (contar SIEMPRE antes de enviar).
async function searchOnce(
  step: AdIdsProbeStep,
  accessToken: string,
  spendSearch: () => void
): Promise<StepResult> {
  spendSearch();
  let response: Response;
  try {
    response = await fetch(SEARCH_URL, {
      method: 'POST',
      // NUNCA se fija Content-Type a mano: con un FormData el runtime genera el
      // boundary del multipart (mismo hallazgo que scripts/probe-idealista.ts).
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      body: toFormData(step.fields),
    });
  } catch {
    return { outcome: { kind: 'failed', status: null }, rawText: null, json: null };
  }

  const rawText = await response.text();
  if (!response.ok) {
    return { outcome: { kind: 'failed', status: response.status }, rawText, json: null };
  }
  try {
    const json = JSON.parse(rawText) as unknown;
    return { outcome: { kind: 'ok', status: response.status, body: json }, rawText, json };
  } catch {
    return { outcome: { kind: 'failed', status: response.status }, rawText, json: null };
  }
}

function describeStep(step: AdIdsProbeStep, io: AdIdsProbeIo): void {
  io.log(`  [${step.name}]`);
  step.fields.forEach((field) => {
    io.log(`    ${field.name} = ${field.value}`);
  });
}

function printPlan(options: AdIdsProbeOptions, plan: readonly AdIdsProbeStep[], io: AdIdsProbeIo): void {
  io.log('Modo: dry-run — no se abrirá ninguna conexión de red.');
  io.log(`Filtro: ${options.filter} (alternativo: ${options.otherFilter}) — operación: ${options.operation}`);
  io.log('');
  io.log('Petición de token (planeada, no enviada):');
  io.log(`  POST ${TOKEN_URL}`);
  io.log('');
  io.log(`Peticiones de búsqueda planeadas (${String(plan.length)}, tope duro ${String(ADIDS_PROBE_SEARCH_CAP)}; FACTURABLES con --execute):`);
  io.log(`  POST ${SEARCH_URL}  (multipart/form-data)`);
  plan.forEach((step) => {
    describeStep(step, io);
  });
}

export async function runAdIdsProbe(
  options: AdIdsProbeOptions,
  credentials: AdIdsProbeCredentials,
  io: AdIdsProbeIo
): Promise<number> {
  const plan = buildAdIdsProbePlan(options);
  if (options.mode === 'dry-run') {
    printPlan(options, plan, io);
    return 0;
  }

  const [stepOwn, stepCombined, stepOther] = plan;
  if (stepOwn === undefined || stepCombined === undefined || stepOther === undefined) {
    io.log('Error interno: el plan de la sonda no tiene tres pasos.');
    return 2;
  }

  const isoDate = new Date().toISOString().slice(0, 10);
  const base = `${FIXTURES_DIR}/adids-${isoDate}`;
  const fixturePath = `${base}.json`;
  const metaPath = `${base}.meta.json`;
  const rawPath = `${FIXTURES_DIR}/raw/adids-${isoDate}.raw.json`;

  if (!options.overwrite && (await io.fileExists(metaPath))) {
    io.log(`Ya existe una fixture de la sonda en ${metaPath}. Usa --overwrite para repetir la ejecución.`);
    return 2;
  }

  // Tope duro: 3 búsquedas (U3) y 1 token.
  const ledger = createRequestLedger({ search: ADIDS_PROBE_SEARCH_CAP });

  // --- Intercambio de token ---
  const basicAuth = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64');
  ledger.spend('token'); // contar SIEMPRE antes de enviar
  let tokenText: string;
  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'read' }),
    });
    tokenText = await tokenResponse.text();
    if (!tokenResponse.ok) {
      io.log(`El intercambio de token respondió con estado ${String(tokenResponse.status)}.`);
      io.log(scrub(tokenText.slice(0, 500), credentials));
      io.log(renderLedgerReport(ledger.snapshot(), 'error'));
      return 3;
    }
  } catch {
    io.log('El intercambio de token lanzó una excepción de red.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 3;
  }

  let accessToken: string;
  try {
    accessToken = TokenResponseSchema.parse(JSON.parse(tokenText) as unknown).access_token;
  } catch {
    io.log('La respuesta del token no contiene un access_token no vacío: no se envía ninguna búsqueda.');
    io.log(renderLedgerReport(ledger.snapshot(), 'error'));
    return 3;
  }

  const spendSearch = (): void => {
    ledger.spend('search');
  };
  const raw: Record<string, string | null> = {};

  // --- Tres peticiones, en orden y SIN bucle. Si una falla, las siguientes no se envían. ---
  const own = await searchOnce(stepOwn, accessToken, spendSearch);
  raw[stepOwn.name] = own.rawText;
  await io.writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const combined = own.outcome.kind === 'ok' ? await searchOnce(stepCombined, accessToken, spendSearch) : SKIPPED;
  raw[stepCombined.name] = combined.rawText;
  await io.writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const other = combined.outcome.kind === 'ok' ? await searchOnce(stepOther, accessToken, spendSearch) : SKIPPED;
  raw[stepOther.name] = other.rawText;
  await io.writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const meta = buildAdIdsProbeMeta({
    timestamp: new Date().toISOString(),
    counters: ledger.snapshot(),
    requests: plan.map((step) => ({ step: step.name, fields: step.fields })),
    liveId: options.liveId,
    delistedId: options.delistedId,
    outcomes: { liveAlone: own.outcome, liveAndDelisted: combined.outcome, liveOtherFilter: other.outcome },
  });
  await io.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  // Fixture anonimizada: un documento por paso que devolvió JSON.
  const documents: Record<string, Json | null> = {
    [stepOwn.name]: own.json === null ? null : anonymise(own.json as Json).document,
    [stepCombined.name]: combined.json === null ? null : anonymise(combined.json as Json).document,
    [stepOther.name]: other.json === null ? null : anonymise(other.json as Json).document,
  };
  await io.writeFile(fixturePath, `${JSON.stringify(documents, null, 2)}\n`);

  io.log(`delistedIdBehaviour: ${meta.delistedIdBehaviour}`);
  io.log(`propertyTypeConstrainsAdIds: ${String(meta.propertyTypeConstrainsAdIds)}`);
  io.log(`adIdsListHonoured: ${String(meta.adIdsListHonoured)}`);
  io.log(`Fixture: ${fixturePath}`);
  io.log(`Meta:    ${metaPath}`);
  io.log(`Cruda:   ${rawPath} (local; no commitear sin revisar)`);
  io.log(
    meta.delistedIdBehaviour === 'omitted'
      ? 'Siguiente paso: revisar las fixtures y cambiar DELISTED_OMISSION_CONFIRMED a true en presence-evidence.ts (mismo commit).'
      : 'DELISTED_OMISSION_CONFIRMED debe seguir en false: la sonda NO demuestra omisión.'
  );
  io.log(renderLedgerReport(ledger.snapshot(), own.outcome.kind === 'ok' && combined.outcome.kind === 'ok' ? 'ok' : 'error'));

  return meta.delistedIdBehaviour === 'error' || own.outcome.kind !== 'ok' ? 4 : 0;
}

function createNodeIo(): AdIdsProbeIo {
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
  };
}

export async function main(): Promise<void> {
  const io = createNodeIo();
  let options: AdIdsProbeOptions;
  try {
    options = parseAdIdsProbeArgs(process.argv.slice(2));
  } catch (error) {
    io.log(error instanceof Error ? error.message : 'Argumentos inválidos.');
    process.exitCode = 2;
    return;
  }

  if (options.mode === 'dry-run') {
    process.exitCode = await runAdIdsProbe(options, { apiKey: '', apiSecret: '' }, io);
    return;
  }

  const parsed = CredentialsSchema.safeParse(process.env);
  if (!parsed.success) {
    io.log('Faltan credenciales: IDEALISTA_API_KEY e IDEALISTA_API_SECRET deben estar definidas y no vacías en el entorno.');
    process.exitCode = 2;
    return;
  }
  process.exitCode = await runAdIdsProbe(
    options,
    { apiKey: parsed.data.IDEALISTA_API_KEY, apiSecret: parsed.data.IDEALISTA_API_SECRET },
    io
  );
}

// Se ejecuta solo como entrypoint, nunca al importarlo.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
