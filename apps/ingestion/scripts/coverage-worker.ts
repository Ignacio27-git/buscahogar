// ROADMAP 1.13 Unit C (diseño DD-17, DD-18, CR-1) — composition root y
// ÚNICO punto de entrada real del daemon de cobertura bajo demanda. ÚNICO
// lector de `process.env` de este módulo (D5/D8, mismo contrato que
// scripts/sweep-zone.ts): cablea el puerto HTTP real de Idealista (1.6), el
// resto de puertos reales (`src/sweep/coverage-worker-ports.ts`) y el
// driver puro del worker (`src/sweep/coverage-worker.ts`) sobre UN pool
// compartido para la vida entera del proceso — nunca un pool por trabajo
// (CR-1/CR-2: ese es exactamente el defecto que `runSweepZone` tendría si
// se reutilizara entero para esto).
//
// Sin test de proceso dedicado — mismo precedente que `scripts/sweep-zone.ts:9-15`: es el shell de
// orquestación de módulos que YA están testeados por separado (coverage-worker.ts contra fakes,
// coverage-worker-ports.ts contra PostgreSQL real con Idealista falso). ROADMAP 3.4 (decisión 258): la lógica
// de PROCESO (códigos de salida, backoff, supervisor, apagado) se extrajo a `src/ops/worker-process.ts` y se
// prueba allí contra una sesión falsa; `readEnv` se prueba en test/coverage-worker-env.test.ts.
//
// CR-1 (arbitraje, vinculante): `src/index.ts` es el barril del paquete, no
// este entrypoint — ver el comentario que reemplaza su `main()` placeholder.
import { fileURLToPath } from 'node:url';

import { COVERAGE_JOB_MAX_ATTEMPTS, blockingThresholdsSchema } from '@buscahogar/core';
import { createDb } from '@buscahogar/db';
import { z } from 'zod';

import type { Alerting } from '../src/alerts/alerting.js';
import { composeAlerting, withAlerting } from '../src/alerts/compose.js';
import { createAbortableSleep } from '../src/ops/abortable-sleep.js';
import { classifyWorkerEnv } from '../src/ops/env-warnings.js';
import {
  createHeartbeat,
  DEFAULT_HEARTBEAT_MIN_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../src/ops/heartbeat.js';
import { createJsonLogger, describeError } from '../src/ops/json-logger.js';
import { DEFAULT_MAX_OUTBOUND_CALLS_PER_TICK } from '../src/ops/outbound-budget.js';
import { createShutdown } from '../src/ops/shutdown.js';
import { runWorkerProcess } from '../src/ops/worker-process.js';
import { createRealCoverageWorkerPorts } from '../src/sweep/coverage-worker-ports.js';
import { runCoverageWorker } from '../src/sweep/coverage-worker.js';
import type { CoverageWorkerOptions } from '../src/sweep/coverage-worker.js';
import { resolveSourceUuid } from '../src/sweep/reference-store.js';
import {
  DEFAULT_STALE_RUNNING_JOB_AFTER_MS,
  MIN_STALE_RUNNING_JOB_AFTER_MS,
} from '../src/sweep/stale-job-reclaim.js';
import { createHttpSearchPort, createHttpTokenPort } from '../src/sources/idealista/index.js';

export class WorkerEnvError extends Error {}

// Ampliación deliberada y documentada de las variables de sweep-zone.ts
// (IDEALISTA_API_KEY/SECRET, DATABASE_URL, reutilizadas sin cambio): los tres
// umbrales de bloqueo son genuinamente nuevos. La operación (sale/rent) ya NO
// es una variable: cada job lleva la suya (decisión 252, `readEnv` rechaza
// `OPERATION`). DAILY_SEARCH_CAP nunca lleva un valor por defecto (decisión 066: la
// cuota mensual real de Idealista no está confirmada por ninguna fuente
// oficial, así que este número es SIEMPRE responsabilidad del operador).
const EnvSchema = z.object({
  IDEALISTA_API_KEY: z.string().min(1),
  IDEALISTA_API_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  DAILY_SEARCH_CAP: z.string().min(1),
  BLOCKING_RADIUS_METERS: z.string().min(1),
  BLOCKING_PRICE_BAND_CENTS: z.string().min(1),
  BLOCKING_SURFACE_TOLERANCE_M2: z.string().min(1),
  POLL_INTERVAL_MS: z.string().min(1).optional(),
  MAX_SEARCH_REQUESTS_PER_SWEEP: z.string().min(1).optional(),
  // ROADMAP 2.5 (decisión 104). Se validan con Zod más abajo (mensaje que
  // nombra la variable); aquí solo se declara que existen. Sin `.min(1)` a
  // propósito: una cadena vacía debe llegar al validador y rechazarse, no
  // tratarse como ausente.
  REFRESH_BUDGET_FRACTION: z.string().optional(),
  MAINTENANCE_EVERY_TICKS: z.string().min(1).optional(),
  // ROADMAP 2.5 (S3; decisión 105): verificación de presencia por `adIds`.
  // Validadas más abajo; una cadena vacía se rechaza, no se trata como ausente.
  MAX_VERIFICATION_REQUESTS_PER_TICK: z.string().optional(),
  VERIFICATION_RADIUS_MARGIN_M: z.string().optional(),
  // ROADMAP 3.4 (decisión 258; D14, D16): modo producción. Validadas más abajo (mensaje que nombra la
  // variable, sin repetir su valor); una cadena vacía llega al validador, salvo HEARTBEAT_URL (en blanco = no
  // configurada).
  WORKER_STOP_GRACE_MS: z.string().optional(),
  HEARTBEAT_URL: z.string().optional(),
  HEARTBEAT_MIN_INTERVAL_MS: z.string().optional(),
  MAX_OUTBOUND_CALLS_PER_TICK: z.string().optional(),
  // ROADMAP 3.4 (decisión 258, parte 2; D14b): antigüedad del arrendamiento a partir de la cual un job `running`
  // se da por abandonado. Validada más abajo (mínimo 120000).
  STALE_RUNNING_JOB_AFTER_MS: z.string().optional(),
  // ROADMAP 3.4 (decisión 259, D17): avisos operativos por Telegram. Las dos variables o ninguna (en blanco =
  // no definida); el resto, umbrales de las comprobaciones. Validadas más abajo sin repetir nunca el valor.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  ALERT_FAILED_JOBS_THRESHOLD: z.string().optional(),
  ALERT_FAILED_JOBS_WINDOW_MS: z.string().optional(),
  ALERT_COOLDOWN_MS: z.string().optional(),
  // Solo para el Telegram falso (`scripts/fake-telegram.ts`); sin definir, la API real.
  TELEGRAM_API_BASE_URL: z.string().optional(),
});

// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 104, S-ZRS-18) —
// fracción del tope diario que el refresco puede gastar EN TOTAL. Es una
// decisión de operación (decisión 066: nunca un número inventado en código):
// AUSENTE = 0, el refresco queda desactivado y no gasta cuota. `0` lo
// desactiva explícitamente; `1` deja todo el tope al refresco.
const refreshBudgetFractionSchema = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .pipe(z.number().min(0).max(1));
const DEFAULT_REFRESH_BUDGET_FRACTION = 0;
// El worker sondea cada `POLL_INTERVAL_MS` (15 s por defecto): 20 ticks ≈ 5
// minutos entre pasadas de mantenimiento, con el primer tick incluido.
const DEFAULT_MAINTENANCE_EVERY_TICKS = 20;
// ROADMAP 2.5 (S3; decisión 105) — valores PRUDENTES por defecto: cada petición
// de verificación es facturable y la cuota es mensual. Con la fracción de
// refresco en 0 la verificación no corre, así que estos valores no gastan nada
// por sí solos.
const DEFAULT_MAX_VERIFICATION_REQUESTS_PER_TICK = 2;
// Margen sobre el radio de barrido: evita que un anuncio cerca del borde (o con
// coordenada ofuscada) quede fuera de la petición de verificación.
const DEFAULT_VERIFICATION_RADIUS_MARGIN_M = 500;

function parseNonNegativeInteger(name: string, value: string): number {
  const parsed = z
    .string()
    .trim()
    .regex(/^\d+$/)
    .safeParse(value);
  if (!parsed.success) {
    throw new WorkerEnvError(`${name} inválido "${value}": se espera un entero no negativo.`);
  }
  return Number(parsed.data);
}

function parseRefreshBudgetFraction(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REFRESH_BUDGET_FRACTION;
  }
  const parsed = refreshBudgetFractionSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkerEnvError(
      `REFRESH_BUDGET_FRACTION inválido "${value}": se espera un número entre 0 y 1 (0 desactiva el refresco).`
    );
  }
  return parsed.data;
}

// Plazo (ms) entre la primera señal de parada y la salida forzada con código 1 (decisión 258, D14). Por debajo
// del tiempo típico que un proveedor da antes del SIGKILL.
const DEFAULT_WORKER_STOP_GRACE_MS = 8000;
// Plazo para obtener una conexión del pool (sin él, una base que no responde dejaría la sonda colgada).
const WORKER_DB_CONNECT_TIMEOUT_MS = 10_000;

// Latido (D16): URL https opcional; mínimo entre intentos. El valor de la URL es secreto: nunca va en un mensaje.
function parseHeartbeatUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = z.url({ protocol: /^https$/, hostname: z.regexes.hostname }).safeParse(value.trim());
  if (!parsed.success) {
    throw new WorkerEnvError(
      'HEARTBEAT_URL inválida: se espera una URL absoluta con esquema https y host (o déjala sin definir).'
    );
  }
  return value.trim();
}

// D14b: el mínimo debe exceder con holgura lo que tarda una página; por debajo, un worker vivo vería su job
// reclamado.
function parseStaleRunningJobAfterMs(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_STALE_RUNNING_JOB_AFTER_MS;
  }
  const parsed = Number(value.trim() === '' ? Number.NaN : value);
  if (!Number.isInteger(parsed) || parsed < MIN_STALE_RUNNING_JOB_AFTER_MS) {
    throw new WorkerEnvError(
      `STALE_RUNNING_JOB_AFTER_MS inválido "${value}": se espera un entero de milisegundos no menor que ${String(MIN_STALE_RUNNING_JOB_AFTER_MS)}.`
    );
  }
  return parsed;
}

// Avisos operativos (decisión 259, D17). El token es un secreto: los mensajes nombran la variable, nunca el valor.
const TELEGRAM_TOKEN_PATTERN = /^\d{3,}:[A-Za-z0-9_-]{10,}$/;
// Id numérico de chat/grupo/canal (los grupos son negativos) o @usuario de canal público.
const TELEGRAM_CHAT_PATTERN = /^(-?\d+|@[A-Za-z]\w{3,})$/;
const DEFAULT_ALERT_FAILED_JOBS_THRESHOLD = 5;
const DEFAULT_ALERT_FAILED_JOBS_WINDOW_MS = 24 * 3_600_000;
const DEFAULT_ALERT_COOLDOWN_MS = 6 * 3_600_000;
const MIN_ALERT_WINDOW_MS = 60_000;

function parseTelegram(
  tokenRaw: string | undefined,
  chatRaw: string | undefined
): { readonly botToken: string; readonly chatId: string } | undefined {
  const token = (tokenRaw ?? '').trim();
  const chat = (chatRaw ?? '').trim();
  if (token === '' && chat === '') {
    return undefined;
  }
  if (token === '' || chat === '') {
    throw new WorkerEnvError(
      'TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID deben definirse las dos o ninguna (sin ellas, los avisos quedan desactivados).'
    );
  }
  if (!TELEGRAM_TOKEN_PATTERN.test(token)) {
    throw new WorkerEnvError('TELEGRAM_BOT_TOKEN inválido: se espera el formato <id numérico>:<clave> que entrega BotFather.');
  }
  if (!TELEGRAM_CHAT_PATTERN.test(chat)) {
    throw new WorkerEnvError('TELEGRAM_CHAT_ID inválido: se espera un id numérico de chat (los grupos son negativos) o @canal.');
  }
  return { botToken: token, chatId: chat };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Base alternativa de la API de Telegram: solo HTTPS, salvo bucle local en claro para el Telegram falso. Sin
// credenciales, ruta, consulta ni fragmento. El error nombra la variable y NUNCA repite el valor.
function parseTelegramApiBaseUrl(value: string | undefined): string | undefined {
  const raw = (value ?? '').trim();
  if (raw === '') {
    return undefined;
  }
  const invalid = (): WorkerEnvError =>
    new WorkerEnvError(
      'TELEGRAM_API_BASE_URL inválida: se espera https://<host> (o http://127.0.0.1:<puerto> para el Telegram falso), sin credenciales, ruta ni consulta.'
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  const secure = url.protocol === 'https:';
  const loopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if ((!secure && !loopback) || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw invalid();
  }
  if (url.pathname !== '/') {
    throw invalid();
  }
  return url.origin;
}

function parseAtLeast(name: string, value: string | undefined, fallback: number, minimum: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value.trim() === '' ? Number.NaN : value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new WorkerEnvError(`${name} inválido "${value}": se espera un entero no menor que ${String(minimum)}.`);
  }
  return parsed;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP = 10;

export interface WorkerEnv {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly databaseUrl: string;
  readonly options: CoverageWorkerOptions;
  // Margen (m) que la verificación suma al radio de la zona (S3).
  readonly verificationRadiusMarginM: number;
  // Modo producción (decisión 258): plazo de parada ordenada y latido.
  readonly stopGraceMs: number;
  // Modo producción (decisión 258, parte 2): antigüedad del arrendamiento que da un job `running` por abandonado.
  readonly staleRunningJobAfterMs: number;
  readonly heartbeat: { readonly url: string | undefined; readonly minIntervalMs: number };
  // Avisos operativos (decisión 259): `telegram` ausente = desactivados (el worker corre igual).
  readonly alerts: {
    readonly telegram: { readonly botToken: string; readonly chatId: string } | undefined;
    readonly failedJobsThreshold: number;
    readonly failedJobsWindowMs: number;
    readonly cooldownMs: number;
    // Base alternativa de la API de Telegram (solo el Telegram falso); `undefined` = la real.
    readonly apiBaseUrl: string | undefined;
  };
  readonly blockingThresholds: ReturnType<typeof blockingThresholdsSchema.parse>;
}

function parsePositiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new WorkerEnvError(`${name} inválido "${value}": se espera un entero positivo.`);
  }
  return parsed;
}

// Nunca lee `process.env` directamente: recibe el entorno como parámetro,
// igual que `readEnv` de scripts/sweep-zone.ts, para que el fallo se pueda
// testear sin tocar el proceso real. `main()` es el único llamador con
// `process.env` de verdad.
export function readEnv(env: Readonly<Record<string, string | undefined>>): WorkerEnv {
  // Decisión 252: un único worker sirve las dos operaciones. Un `OPERATION`
  // heredado de un `.env` antiguo se RECHAZA (no se ignora en silencio): el
  // operador creería acotar el gasto por proceso y el worker barrería `sale`
  // sin que lo supiera.
  if (env.OPERATION !== undefined) {
    throw new WorkerEnvError(
      'OPERATION fue retirada: un único worker sirve venta y alquiler y cada job lleva su operación. ' +
        'Elimina OPERATION del entorno (.env) y vuelve a arrancar.'
    );
  }
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new WorkerEnvError(
      'Faltan variables de entorno: IDEALISTA_API_KEY, IDEALISTA_API_SECRET, DATABASE_URL, ' +
        'DAILY_SEARCH_CAP, BLOCKING_RADIUS_METERS, BLOCKING_PRICE_BAND_CENTS y BLOCKING_SURFACE_TOLERANCE_M2 ' +
        'deben estar definidas y no vacías.'
    );
  }
  const raw = parsed.data;

  const blockingThresholds = blockingThresholdsSchema.safeParse({
    radiusMeters: parsePositiveInteger('BLOCKING_RADIUS_METERS', raw.BLOCKING_RADIUS_METERS),
    priceBandCents: parsePositiveInteger('BLOCKING_PRICE_BAND_CENTS', raw.BLOCKING_PRICE_BAND_CENTS),
    surfaceToleranceM2: parsePositiveInteger('BLOCKING_SURFACE_TOLERANCE_M2', raw.BLOCKING_SURFACE_TOLERANCE_M2),
  });
  if (!blockingThresholds.success) {
    const firstIssue = blockingThresholds.error.issues[0];
    throw new WorkerEnvError(
      `Umbral de bloqueo inválido (campo: ${String(firstIssue?.path[0] ?? '?')}): ${firstIssue?.message ?? 'sin detalle'}.`
    );
  }

  return {
    apiKey: raw.IDEALISTA_API_KEY,
    apiSecret: raw.IDEALISTA_API_SECRET,
    databaseUrl: raw.DATABASE_URL,
    blockingThresholds: blockingThresholds.data,
    options: {
      pollIntervalMs:
        raw.POLL_INTERVAL_MS !== undefined
          ? parsePositiveInteger('POLL_INTERVAL_MS', raw.POLL_INTERVAL_MS)
          : DEFAULT_POLL_INTERVAL_MS,
      maxSearchRequestsPerSweep:
        raw.MAX_SEARCH_REQUESTS_PER_SWEEP !== undefined
          ? parsePositiveInteger('MAX_SEARCH_REQUESTS_PER_SWEEP', raw.MAX_SEARCH_REQUESTS_PER_SWEEP)
          : DEFAULT_MAX_SEARCH_REQUESTS_PER_SWEEP,
      dailySearchCap: parsePositiveInteger('DAILY_SEARCH_CAP', raw.DAILY_SEARCH_CAP),
      // D.13b (decisión 184): el tope es una constante de core, ya no una variable de entorno.
      maxAttempts: COVERAGE_JOB_MAX_ATTEMPTS,
      refreshBudgetFraction: parseRefreshBudgetFraction(raw.REFRESH_BUDGET_FRACTION),
      maintenanceEveryTicks:
        raw.MAINTENANCE_EVERY_TICKS !== undefined
          ? parsePositiveInteger('MAINTENANCE_EVERY_TICKS', raw.MAINTENANCE_EVERY_TICKS)
          : DEFAULT_MAINTENANCE_EVERY_TICKS,
      maxVerificationRequestsPerTick:
        raw.MAX_VERIFICATION_REQUESTS_PER_TICK !== undefined
          ? parsePositiveInteger('MAX_VERIFICATION_REQUESTS_PER_TICK', raw.MAX_VERIFICATION_REQUESTS_PER_TICK)
          : DEFAULT_MAX_VERIFICATION_REQUESTS_PER_TICK,
      maxOutboundCallsPerTick:
        raw.MAX_OUTBOUND_CALLS_PER_TICK !== undefined
          ? parseNonNegativeInteger('MAX_OUTBOUND_CALLS_PER_TICK', raw.MAX_OUTBOUND_CALLS_PER_TICK)
          : DEFAULT_MAX_OUTBOUND_CALLS_PER_TICK,
    },
    verificationRadiusMarginM:
      raw.VERIFICATION_RADIUS_MARGIN_M !== undefined
        ? parseNonNegativeInteger('VERIFICATION_RADIUS_MARGIN_M', raw.VERIFICATION_RADIUS_MARGIN_M)
        : DEFAULT_VERIFICATION_RADIUS_MARGIN_M,
    staleRunningJobAfterMs: parseStaleRunningJobAfterMs(raw.STALE_RUNNING_JOB_AFTER_MS),
    alerts: {
      telegram: parseTelegram(raw.TELEGRAM_BOT_TOKEN, raw.TELEGRAM_CHAT_ID),
      failedJobsThreshold: parseAtLeast(
        'ALERT_FAILED_JOBS_THRESHOLD',
        raw.ALERT_FAILED_JOBS_THRESHOLD,
        DEFAULT_ALERT_FAILED_JOBS_THRESHOLD,
        1
      ),
      failedJobsWindowMs: parseAtLeast(
        'ALERT_FAILED_JOBS_WINDOW_MS',
        raw.ALERT_FAILED_JOBS_WINDOW_MS,
        DEFAULT_ALERT_FAILED_JOBS_WINDOW_MS,
        MIN_ALERT_WINDOW_MS
      ),
      cooldownMs: parseAtLeast('ALERT_COOLDOWN_MS', raw.ALERT_COOLDOWN_MS, DEFAULT_ALERT_COOLDOWN_MS, MIN_ALERT_WINDOW_MS),
      apiBaseUrl: parseTelegramApiBaseUrl(raw.TELEGRAM_API_BASE_URL),
    },
    stopGraceMs:
      raw.WORKER_STOP_GRACE_MS !== undefined
        ? parsePositiveInteger('WORKER_STOP_GRACE_MS', raw.WORKER_STOP_GRACE_MS)
        : DEFAULT_WORKER_STOP_GRACE_MS,
    heartbeat: {
      url: parseHeartbeatUrl(raw.HEARTBEAT_URL),
      minIntervalMs:
        raw.HEARTBEAT_MIN_INTERVAL_MS !== undefined
          ? parseNonNegativeInteger('HEARTBEAT_MIN_INTERVAL_MS', raw.HEARTBEAT_MIN_INTERVAL_MS)
          : DEFAULT_HEARTBEAT_MIN_INTERVAL_MS,
    },
  };
}

// Composition root del PROCESO (decisión 258, ROADMAP 3.4). La lógica de proceso (configuración inválida, conexión
// inicial con backoff, supervisor, códigos de salida) vive en `src/ops/worker-process.ts` y se prueba con una
// sesión falsa; aquí solo se cablea lo real: señales, pool, puertos de Idealista, latido y registro JSON.
//
// Registro: UNA línea JSON por evento en la salida estándar (un solo flujo conserva el orden); sin secretos
// (`createJsonLogger` sustituye los valores de `secretsOf`).
// Códigos de salida: 0 parada limpia · 1 10 caídas seguidas o salida forzada (plazo / segunda señal) ·
// 2 configuración inválida (tras 30 s de espera) · 3 base inaccesible tras el backoff de arranque.
//
// Devuelve el código de salida; `main` no llama a `process.exit` salvo en la salida forzada del apagado.
export async function main(env: Readonly<Record<string, string | undefined>> = process.env): Promise<number> {
  const log = createJsonLogger({
    component: 'coverage-worker',
    write: (line) => {
      process.stdout.write(`${line}
`);
    },
  });
  const shutdown = createShutdown({
    graceMs: DEFAULT_WORKER_STOP_GRACE_MS,
    log,
    exit: (code) => {
      process.exit(code);
    },
  });
  process.on('SIGINT', () => {
    shutdown.request('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown.request('SIGTERM');
  });

  const sleep = createAbortableSleep(shutdown.signal);

  return runWorkerProcess<WorkerEnv>({
    log,
    shutdown,
    sleep,
    now: () => Date.now(),
    loadConfig: () => readEnv(env),
    secretsOf: (config) =>
      [
        config.apiKey,
        config.apiSecret,
        config.databaseUrl,
        config.heartbeat.url,
        config.alerts.telegram?.botToken,
        config.alerts.telegram?.chatId,
      ].filter(
        (value): value is string => value !== undefined
      ),
    warnings: classifyWorkerEnv(env),
    createSession: (config) => {
      const { db, pool } = createDb(config.databaseUrl, { connectionTimeoutMillis: WORKER_DB_CONNECT_TIMEOUT_MS });
      // Sin este manejador, un error de un cliente ocioso (p. ej. reinicio de la base) sería una excepción no
      // capturada y mataría el proceso.
      pool.on('error', (error) => {
        log.error('pool-error', { reason: describeError(error) });
      });
      // UNA instancia por sesión: el intervalo mínimo del latido sobrevive a los reinicios del supervisor.
      const heartbeat = createHeartbeat({
        url: config.heartbeat.url,
        minIntervalMs: config.heartbeat.minIntervalMs,
        timeoutMs: HEARTBEAT_TIMEOUT_MS,
        fetchFn: (url, init) => fetch(url, init),
        now: () => Date.now(),
        log,
      });
      // UNA instancia por sesión (como el latido): el estado de "arranque pendiente" y de espera tras un fallo
      // sobrevive a los reinicios del supervisor. Se crea al primer `run`, cuando ya se conoce el id de la fuente.
      let alerting: Alerting | undefined;
      return {
        probe: async (): Promise<void> => {
          await pool.query('select 1');
        },
        run: async (): Promise<void> => {
          const sourceUuid = await resolveSourceUuid(db, 'idealista');
          const ports = createRealCoverageWorkerPorts({
            db,
            sourceUuid,
            searchPort: createHttpSearchPort(),
            tokenPort: createHttpTokenPort({ apiKey: config.apiKey, apiSecret: config.apiSecret }),
            maxSearchRequestsPerSweep: config.options.maxSearchRequestsPerSweep,
            maxAttempts: config.options.maxAttempts,
            dailySearchCap: config.options.dailySearchCap,
            refreshBudgetFraction: config.options.refreshBudgetFraction,
            presenceVerification: { radiusMarginM: config.verificationRadiusMarginM },
            blockingThresholds: config.blockingThresholds,
            shouldStop: () => shutdown.requested(),
            staleRunningJobAfterMs: config.staleRunningJobAfterMs,
            io: {
              log: (line: string): void => {
                log.line(line);
              },
            },
          });

          // Decisión 259 (D17): avisos operativos por Telegram. Sin token/chat quedan desactivados (aviso de
          // arranque del clasificador) y `withAlerting` devuelve los puertos intactos.
          alerting ??= composeAlerting({
            db,
            sourceId: sourceUuid,
            telegram: config.alerts.telegram,
            alerts: config.alerts,
            apiBaseUrl: config.alerts.apiBaseUrl,
            fetchFn: (url, init) => fetch(url, init),
            sleep,
            now: () => new Date(),
            log,
          });

          // R11/D14: `shouldContinue` se mira entre ticks; `shouldStop`, dentro del tick y en cada límite de
          // página del barrido. La espera del sondeo se interrumpe con la señal de apagado.
          await runCoverageWorker(
            {
              ...withAlerting(ports, alerting),
              sleep,
              onTickSuccess: (budget) => heartbeat.afterSuccessfulTick(budget),
            },
            {
              ...config.options,
              shouldContinue: () => !shutdown.requested(),
              shouldStop: () => shutdown.requested(),
            }
          );
        },
        close: () => pool.end(),
      };
    },
  });
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/sweep-zone.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
