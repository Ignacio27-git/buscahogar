// ROADMAP 3.4 (decisión 258, D14, D15; R6.2, R6.3) — orquestación del PROCESO del worker, separada del
// composition root (`scripts/coverage-worker.ts`, único lector de `process.env`) para poder probarla contra una
// sesión falsa y relojes falsos:
//
//   configuración  → inválida: `fatal` JSON, espera 30 s (abortable) y sale con 2 (el retardo acota el ritmo de
//                    reinicios del host: Docker `on-failure` no distingue códigos de salida).
//   avisos         → los de producción, una vez, como `warn`.
//   base de datos  → conexión inicial con backoff 1 → 60 s y 8 intentos; inaccesible ⇒ salida 3.
//   supervisor     → `runSupervised`: caídas con backoff 1 s → 300 s, 10 seguidas ⇒ salida 1.
//   parada         → `ShutdownController` (plazo `WORKER_STOP_GRACE_MS`, segunda señal ⇒ salida forzada 1).
//
// Códigos de salida: 0 parada limpia · 1 10 caídas seguidas (o salida forzada por plazo/segunda señal) ·
// 2 configuración inválida · 3 base inaccesible tras el backoff de arranque.
import { describeError } from './json-logger.js';
import type { JsonLogger } from './json-logger.js';
import type { EnvIssue } from './env-warnings.js';
import type { ShutdownController } from './shutdown.js';
import { connectWithBackoff, STARTUP_DEFAULTS } from './startup-backoff.js';
import { runSupervised, SUPERVISOR_DEFAULTS } from './supervisor.js';

export const WORKER_EXIT = { ok: 0, crashLoop: 1, config: 2, dbUnreachable: 3 } as const;
export const CONFIG_ERROR_WAIT_MS = 30_000;

// Todo lo que toca la base de datos y la fuente vive detrás de esta sesión (la cablea el composition root).
export interface WorkerSession {
  // Una consulta trivial: ¿es alcanzable la base?
  probe(): Promise<void>;
  // Construye los puertos y ejecuta `runCoverageWorker` hasta que termine (parada ordenada) o lance.
  run(): Promise<void>;
  // Cierra el pool. Se llama en todos los caminos.
  close(): Promise<void>;
}

export interface WorkerProcessConfig {
  readonly stopGraceMs: number;
}

export interface WorkerProcessDeps<C extends WorkerProcessConfig> {
  readonly log: JsonLogger;
  readonly shutdown: ShutdownController;
  // Debe ser abortable por la señal de `shutdown` (createAbortableSleep).
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  // Lanza si la configuración es inválida.
  readonly loadConfig: () => C;
  // Valores secretos de la configuración, para que el registro los sustituya por `[redacted]`.
  readonly secretsOf: (config: C) => readonly string[];
  readonly warnings: readonly EnvIssue[];
  readonly createSession: (config: C) => WorkerSession;
}

export async function runWorkerProcess<C extends WorkerProcessConfig>(deps: WorkerProcessDeps<C>): Promise<number> {
  try {
    return await runProcess(deps);
  } finally {
    // En TODOS los caminos (también configuración inválida): un plazo de parada que siga armado mantendría vivo el
    // proceso y lo forzaría a salir con 1 tras una parada que ya terminó bien.
    deps.shutdown.dispose();
  }
}

async function runProcess<C extends WorkerProcessConfig>(deps: WorkerProcessDeps<C>): Promise<number> {
  const { log, shutdown, sleep } = deps;
  const shouldContinue = (): boolean => !shutdown.requested();

  let config: C;
  try {
    config = deps.loadConfig();
  } catch (error) {
    log.fatal('config-invalid', {
      reason: describeError(error),
      exit_code: WORKER_EXIT.config,
      retry_in_ms: CONFIG_ERROR_WAIT_MS,
    });
    await sleep(CONFIG_ERROR_WAIT_MS);
    return WORKER_EXIT.config;
  }

  log.redactValues(deps.secretsOf(config));
  shutdown.setGraceMs(config.stopGraceMs);
  for (const issue of deps.warnings) {
    log.warn('production-warning', { name: issue.name, reason: issue.reason });
  }
  log.info('worker-starting', { stop_grace_ms: config.stopGraceMs });

  const session = deps.createSession(config);
  try {
    const connected = await connectWithBackoff(() => session.probe(), {
      ...STARTUP_DEFAULTS,
      sleep,
      shouldContinue,
      onRetry: (event) => {
        log.warn('db-connect-retry', { attempt: event.attempt, delay_ms: event.delayMs, reason: describeError(event.message) });
      },
    });
    if (connected === 'unreachable') {
      log.fatal('db-unreachable', { attempts: STARTUP_DEFAULTS.maxAttempts, exit_code: WORKER_EXIT.dbUnreachable });
      return WORKER_EXIT.dbUnreachable;
    }
    if (connected === 'stopped') {
      return WORKER_EXIT.ok;
    }

    const result = await runSupervised(() => session.run(), {
      ...SUPERVISOR_DEFAULTS,
      sleep,
      now: deps.now,
      shouldContinue,
      onCrash: (event) => {
        log.error('worker-crashed', {
          consecutive: event.consecutive,
          delay_ms: event.delayMs,
          reason: describeError(event.message),
        });
      },
    });
    if (result === 'gave-up') {
      log.fatal('worker-gave-up', { consecutive: SUPERVISOR_DEFAULTS.maxConsecutive, exit_code: WORKER_EXIT.crashLoop });
      return WORKER_EXIT.crashLoop;
    }
    log.info('worker-stopped');
    return WORKER_EXIT.ok;
  } finally {
    try {
      await session.close();
    } catch (error) {
      log.error('session-close-failed', { reason: describeError(error) });
    }
  }
}
