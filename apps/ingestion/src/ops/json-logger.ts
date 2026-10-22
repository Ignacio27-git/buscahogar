// ROADMAP 3.4 (decisión 258, D15; R6.4) — registro estructurado del worker: UNA línea JSON por evento,
// `{ts, level, component, msg, ...campos}`. Sin dependencias (nada de pino). Es una función pura sobre un
// `write` inyectado: `scripts/coverage-worker.ts` lo cablea a la salida estándar y los tests, a un array.
//
// Sin secretos: quien registra pasa mensajes (`describeError`), nunca objetos de error ni configuración, y
// además el logger sustituye por `[redacted]` cualquier valor secreto registrado (`redact`/`redactValues`)
// en el mensaje y en los campos de texto. `describeError` elimina por su cuenta las credenciales
// incrustadas en una URL de conexión (`postgresql://usuario:clave@host`).
export type LogLevel = 'info' | 'warn' | 'error' | 'fatal';
export type LogFieldValue = string | number | boolean | null;
export type LogFields = Readonly<Record<string, LogFieldValue>>;

export interface JsonLogger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  fatal(msg: string, fields?: LogFields): void;
  // Línea libre (los registros de prosa que ya emiten los módulos del worker) convertida en un evento `info`.
  line(text: string): void;
  // Registra más valores secretos tras leer la configuración (el logger existe antes que el entorno).
  redactValues(values: readonly string[]): void;
}

export interface JsonLoggerOptions {
  readonly component: string;
  readonly write: (line: string) => void;
  readonly now?: () => Date;
  readonly redact?: readonly string[];
}

const REDACTED = '[redacted]';
// `//usuario:clave@` de una URL de conexión; la clave puede contener cualquier carácter salvo `/` y `@`.
const URL_CREDENTIALS = /\/\/[^/\s:@]+:[^/\s@]+@/g;
const RESERVED_KEYS: ReadonlySet<string> = new Set(['ts', 'level', 'component', 'msg']);

export function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(URL_CREDENTIALS, '//***@');
}

export function createJsonLogger(options: JsonLoggerOptions): JsonLogger {
  const now = options.now ?? ((): Date => new Date());
  const secrets = new Set<string>();

  function addSecrets(values: readonly string[]): void {
    for (const value of values) {
      if (value !== '') {
        secrets.add(value);
      }
    }
  }
  addSecrets(options.redact ?? []);

  function scrub(text: string): string {
    let result = text;
    for (const secret of secrets) {
      result = result.split(secret).join(REDACTED);
    }
    return result;
  }

  function emit(level: LogLevel, msg: string, fields: LogFields = {}): void {
    const extra: Record<string, LogFieldValue> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!RESERVED_KEYS.has(key)) {
        extra[key] = typeof value === 'string' ? scrub(value) : value;
      }
    }
    options.write(JSON.stringify({ ts: now().toISOString(), level, component: options.component, msg: scrub(msg), ...extra }));
  }

  return {
    info: (msg: string, fields?: LogFields): void => {
      emit('info', msg, fields);
    },
    warn: (msg: string, fields?: LogFields): void => {
      emit('warn', msg, fields);
    },
    error: (msg: string, fields?: LogFields): void => {
      emit('error', msg, fields);
    },
    fatal: (msg: string, fields?: LogFields): void => {
      emit('fatal', msg, fields);
    },
    line: (text: string): void => {
      emit('info', text);
    },
    redactValues: addSecrets,
  };
}
