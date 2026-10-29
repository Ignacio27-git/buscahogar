// ROADMAP 3.4 (decisión 257) — el servicio `deploy` de `docker-compose.yml` es de UN SOLO USO: perfil propio
// (nunca se levanta con `docker compose up -d`), sin política de reinicio, esperando a que la base esté sana y
// con un entorno explícito (nunca `env_file`, que le daría credenciales de fuentes que el despliegue no usa).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const COMPOSE_PATH = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

// Bloque de un servicio: desde su clave (2 espacios) hasta la siguiente clave de servicio o de nivel superior.
function serviceBlock(compose: string, name: string): string {
  const lines = compose.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) {
    throw new Error(`El servicio "${name}" no existe en docker-compose.yml`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line) && !line.startsWith('   ') && !line.startsWith('  #'));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

describe('docker-compose.yml — servicio deploy (decisión 257)', () => {
  const compose = readFileSync(COMPOSE_PATH, 'utf8');
  const block = serviceBlock(compose, 'deploy');

  it('tiene su propio perfil y no se reinicia', () => {
    expect(block).toMatch(/profiles:\s*\['deploy'\]/);
    expect(block).toMatch(/restart:\s*'no'/);
  });

  it('espera a que la base esté sana', () => {
    expect(block).toMatch(/depends_on:\s*\n\s+db:\s*\n\s+condition:\s*service_healthy/);
  });

  it('no usa env_file y recibe solo las variables del despliegue', () => {
    expect(block).not.toMatch(/env_file/);
    for (const name of [
      'DIRECT_DATABASE_URL',
      'WEB_READONLY_PASSWORD',
      'WEB_COVERAGE_PASSWORD',
      'SEED_MONTHLY_QUOTA_TOTAL',
      'SEED_MONTHLY_QUOTA_RESERVE',
    ]) {
      expect(block).toContain(`${name}:`);
    }
    expect(block).not.toMatch(/IDEALISTA|NEXT_PUBLIC/);
  });

  it('ejecuta el JavaScript compilado (sin tsx)', () => {
    expect(block).toContain('dist-runtime/scripts/deploy.js');
    expect(block).not.toMatch(/tsx/);
  });

  it('ningún servicio nuevo añade una política de reinicio (solo `db` conserva la suya)', () => {
    const restartLines = compose.split('\n').filter((line) => /^\s+restart:/.test(line));

    expect(restartLines).toHaveLength(2);
    expect(compose).not.toMatch(/restart:\s*(always|on-failure)/);
  });
});
