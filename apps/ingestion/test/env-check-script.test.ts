// ROADMAP 3.4 (decisión 263 parte C; D22; R12.2) — `pnpm env:check` de apps/ingestion como PROCESO: se lanza con
// `node --import tsx` y un entorno construido a mano (nunca el del test), y se comprueba el código de salida, que
// solo salen nombres (jamás valores) y que no se lee ni se escribe ningún `.env*`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const INGESTION_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENV_CHECK = join(INGESTION_DIR, 'scripts', 'env-check.ts');
// Ruta absoluta de tsx: el directorio de trabajo de algunas pruebas no es el del paquete.
const TSX_LOADER = import.meta.resolve('tsx');

const WORKER_ENV = {
  IDEALISTA_API_KEY: 'clave-idealista-privada',
  IDEALISTA_API_SECRET: 'secreto-idealista-privado',
  DATABASE_URL: 'postgresql://owner:secreto-bd@db.example.test/buscahogar',
  DAILY_SEARCH_CAP: '100',
  BLOCKING_RADIUS_METERS: '150',
  BLOCKING_PRICE_BAND_CENTS: '2000000',
  BLOCKING_SURFACE_TOLERANCE_M2: '10',
} as const;

const DEPLOY_ENV = {
  DIRECT_DATABASE_URL: 'postgresql://owner:secreto-directo@db.example.test/buscahogar',
  WEB_READONLY_PASSWORD: 'secreto-readonly',
  WEB_COVERAGE_PASSWORD: 'secreto-coverage',
} as const;

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(args: readonly string[], env: Readonly<Record<string, string>>, cwd: string): RunResult {
  const baseEnv: Record<string, string> = { PATH: process.env.PATH ?? '' };
  if (process.env.SystemRoot !== undefined) {
    baseEnv.SystemRoot = process.env.SystemRoot;
  }
  const result = spawnSync(process.execPath, ['--import', TSX_LOADER, ENV_CHECK, ...args], {
    cwd,
    env: { ...baseEnv, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Copia del entorno sin una variable (para probar que su ausencia se nombra).
function omit(source: Readonly<Record<string, string>>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== name));
}

describe('env:check (ingestion) como proceso', () => {
  it('worker en local con el entorno mínimo: sale 0 aunque falten latido y Telegram', () => {
    const result = run(['--target', 'local'], WORKER_ENV, INGESTION_DIR);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/sin problemas/i);
  });

  it('worker en producción sin latido ni Telegram: sale 1 y nombra HEARTBEAT_URL y TELEGRAM_BOT_TOKEN', () => {
    const result = run(['--target', 'production'], WORKER_ENV, INGESTION_DIR);

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/AVISO DE PRODUCCIÓN\s+HEARTBEAT_URL/);
    expect(result.stdout).toMatch(/AVISO DE PRODUCCIÓN\s+TELEGRAM_BOT_TOKEN/);
  });

  it('despliegue sin DIRECT_DATABASE_URL: sale 1 y la nombra, aunque DATABASE_URL exista', () => {
    const withoutDirect = omit(DEPLOY_ENV, 'DIRECT_DATABASE_URL');

    const result = run(
      ['--service', 'deploy'],
      { ...withoutDirect, DATABASE_URL: 'postgresql://pooler.example.test/db' },
      INGESTION_DIR
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/ERROR\s+DIRECT_DATABASE_URL\s+falta/);
    expect(result.stdout).not.toContain('pooler.example.test');
  });

  it('despliegue completo: sale 0 también con --target production', () => {
    const result = run(['--service', 'deploy', '--target', 'production'], DEPLOY_ENV, INGESTION_DIR);

    expect(result.status).toBe(0);
  });

  it('NUNCA imprime un valor: ni de las variables válidas ni de las que fallan', () => {
    const result = run(
      ['--target', 'production'],
      { ...WORKER_ENV, DAILY_SEARCH_CAP: 'valor-no-numerico', HEARTBEAT_URL: 'https://hc-ping.example/uuid-privado' },
      INGESTION_DIR
    );

    const output = `${result.stdout}\n${result.stderr}`;
    for (const secret of ['clave-idealista-privada', 'secreto-idealista-privado', 'secreto-bd', 'valor-no-numerico', 'uuid-privado']) {
      expect(output).not.toContain(secret);
    }
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('DAILY_SEARCH_CAP');
  });

  it('un argumento desconocido sale 2 con una línea de uso', () => {
    const result = run(['--target', 'staging'], WORKER_ENV, INGESTION_DIR);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--target local\|production/);
  });

  it('no lee ni escribe ningún .env*: un .env con las variables en el directorio de trabajo no tiene efecto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-check-ing-'));
    tempDirs.push(dir);
    const envFile = join(dir, '.env');
    const contents = Object.entries(WORKER_ENV)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n');
    writeFileSync(envFile, contents);

    const result = run(['--target', 'local'], {}, dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/ERROR\s+IDEALISTA_API_KEY/);
    expect(result.stdout).not.toContain('clave-idealista-privada');
    expect(readFileSync(envFile, 'utf8')).toBe(contents);
    expect(readdirSync(dir)).toEqual(['.env']);
  });
});
