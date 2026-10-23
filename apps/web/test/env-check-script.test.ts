// ROADMAP 3.4 (decisión 263 parte C; D22; R12.2, R12.3) — `pnpm env:check` y `pnpm check:public-env` como
// PROCESOS. Se lanzan con `node --import tsx` y un entorno construido a mano (nunca el del test), y se comprueba
// el código de salida, que solo salen nombres y que no se lee ni se escribe ningún `.env*`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const ENV_CHECK = join(WEB_DIR, 'scripts', 'env-check.ts');
const CHECK_PUBLIC_ENV = join(WEB_DIR, 'scripts', 'check-public-env.ts');
// Ruta absoluta de tsx: el directorio de trabajo de algunas pruebas no es el del paquete.
const TSX_LOADER = import.meta.resolve('tsx');

const MINIMUM_ENV = {
  DATABASE_URL: 'postgresql://web_readonly:valor-secreto-uno@pooler.example.test/buscahogar',
  WEB_COVERAGE_DATABASE_URL: 'postgresql://web_coverage:valor-secreto-dos@pooler.example.test/buscahogar',
  NEW_ZONES_DAILY_CAP: '20',
} as const;

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(script: string, args: readonly string[], env: Readonly<Record<string, string>>, cwd: string): RunResult {
  // Entorno mínimo explícito: ni el del test (que puede traer un .env cargado) ni variables heredadas.
  // `NODE_ENV` es obligatoria en el tipo de `process.env` que declara Next; los scripts no la leen.
  const baseEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', NODE_ENV: 'test' };
  if (process.env.SystemRoot !== undefined) {
    baseEnv.SystemRoot = process.env.SystemRoot;
  }
  const result = spawnSync(process.execPath, ['--import', TSX_LOADER, script, ...args], {
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

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'env-check-'));
  tempDirs.push(dir);
  return dir;
}

// Copia del entorno sin una variable (para probar que su ausencia se nombra).
function omit(source: Readonly<Record<string, string>>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== name));
}

describe('env:check como proceso', () => {
  it('local con el entorno mínimo: sale 0 aunque haya avisos de producción', () => {
    const result = run(ENV_CHECK, ['--target', 'local'], MINIMUM_ENV, WEB_DIR);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/sin problemas/i);
  });

  it('producción con el entorno mínimo: sale 1 y nombra los avisos de identidad y teselas', () => {
    const result = run(ENV_CHECK, ['--target', 'production'], MINIMUM_ENV, WEB_DIR);

    expect(result.status).toBe(1);
    for (const name of ['LEGAL_OWNER_NAME', 'LEGAL_OWNER_EMAIL', 'TILE_URL_TEMPLATE']) {
      expect(result.stdout).toContain(name);
    }
  });

  it('falta una variable obligatoria: sale 1 y la nombra, también en local', () => {
    const withoutDatabase = omit(MINIMUM_ENV, 'DATABASE_URL');

    const result = run(ENV_CHECK, ['--target', 'local'], withoutDatabase, WEB_DIR);

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/ERROR\s+DATABASE_URL/);
  });

  it('NUNCA imprime un valor, ni siquiera de las variables que fallan o de las válidas', () => {
    const result = run(
      ENV_CHECK,
      ['--target', 'production'],
      { ...MINIMUM_ENV, NEW_ZONES_DAILY_CAP: 'valor-no-numerico', LEGAL_OWNER_NAME: 'Titular Privado' },
      WEB_DIR
    );

    const output = `${result.stdout}\n${result.stderr}`;
    for (const secret of ['valor-secreto-uno', 'valor-secreto-dos', 'valor-no-numerico', 'Titular Privado']) {
      expect(output).not.toContain(secret);
    }
    expect(result.stdout).toContain('NEW_ZONES_DAILY_CAP');
  });

  it('un destino desconocido sale 2 con una línea de uso y no clasifica nada', () => {
    const result = run(ENV_CHECK, ['--target', 'staging'], MINIMUM_ENV, WEB_DIR);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--target local\|production/);
  });

  it('no lee ni escribe ningún .env*: un .env con una variable marcada en el directorio de trabajo no tiene efecto', () => {
    const dir = scratchDir();
    const envFile = join(dir, '.env');
    const contents = 'DATABASE_URL=postgresql://marcador-env-file@host/db\nNEW_ZONES_DAILY_CAP=7\n';
    writeFileSync(envFile, contents);

    const result = run(ENV_CHECK, ['--target', 'local'], {}, dir);

    // Si hubiera leído el fichero, DATABASE_URL y NEW_ZONES_DAILY_CAP no faltarían.
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/ERROR\s+DATABASE_URL/);
    expect(result.stdout).toMatch(/ERROR\s+NEW_ZONES_DAILY_CAP/);
    expect(result.stdout).not.toContain('marcador-env-file');
    expect(readFileSync(envFile, 'utf8')).toBe(contents);
    expect(readdirSync(dir)).toEqual(['.env']);
  });

  it('una variable NEXT_PUBLIC_ con nombre de credencial en el entorno comprobado falla y se nombra', () => {
    const leaked = 'NEXT_PUBLIC_' + 'DATABASE_URL';
    const result = run(ENV_CHECK, ['--target', 'local'], { ...MINIMUM_ENV, [leaked]: 'postgresql://valor-expuesto' }, WEB_DIR);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(leaked);
    expect(result.stdout).not.toContain('valor-expuesto');
  });
});

describe('check:public-env como proceso', () => {
  it('sobre el repositorio real (git ls-files) no encuentra ninguna credencial NEXT_PUBLIC_*', () => {
    const result = run(CHECK_PUBLIC_ENV, [], {}, WEB_DIR);

    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/sin credenciales/i);
    expect(result.status).toBe(0);
  });

  it('el entorno comprobado con un nombre prohibido hace fallar (solo el nombre, nada del valor)', () => {
    const leaked = 'NEXT_PUBLIC_' + 'SERVICE_TOKEN';
    const result = run(CHECK_PUBLIC_ENV, [], { [leaked]: 'valor-privado-xyz' }, WEB_DIR);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(leaked);
    expect(result.stdout + result.stderr).not.toContain('valor-privado-xyz');
  });
});
