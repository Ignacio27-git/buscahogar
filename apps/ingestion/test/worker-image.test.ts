// ROADMAP 3.4 (decisión 258, D13; R6.1) — el worker en producción: JavaScript compilado, imagen multi-etapa de
// usuario no root, sin `tsx`, sin credenciales dentro de la imagen, y el servicio `ingestion` de Compose
// construido desde ella SIN política de reinicio (pertenece al host, paso 3.5). Pruebas ESTÁTICAS sobre los
// ficheros versionados: la construcción real (`docker compose --profile app build ingestion`) la ejecuta el
// paso de verificación del slice, no `pnpm test` (que debe quedar offline y sin Docker).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function read(path: string): string {
  return readFileSync(`${ROOT}${path}`, 'utf8').replace(/\r\n/g, '\n');
}

const dockerfile = read('apps/ingestion/Dockerfile');
const stages = dockerfile.split(/^(?=FROM )/m).filter((part) => part.startsWith('FROM '));
const runtimeStage = stages.at(-1) ?? '';
const rootPackage = JSON.parse(read('package.json')) as { packageManager: string; engines: { node: string } };

describe('apps/ingestion/Dockerfile — multi-etapa y reproducible', () => {
  it('tiene al menos dos etapas (construcción y ejecución)', () => {
    expect(stages.length).toBeGreaterThanOrEqual(2);
  });

  it('todas las etapas parten de una imagen de Node con etiqueta EXACTA (major.minor.patch), no flotante', () => {
    const froms = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((match) => match[1] ?? '');

    expect(froms.length).toBe(stages.length);
    for (const image of froms) {
      expect(image).toMatch(/^node:\d+\.\d+\.\d+-bookworm-slim(?: AS \w+)?$/);
    }
    expect(new Set(froms).size).toBe(1);
  });

  it('la versión de Node de la imagen satisface el engines del package.json raíz', () => {
    const major = Number(/^FROM node:(\d+)\./m.exec(dockerfile)?.[1]);
    const minimum = Number(/>=\s*(\d+)/.exec(rootPackage.engines.node)?.[1]);

    expect(major).toBeGreaterThanOrEqual(minimum);
  });

  it('instala la MISMA versión de pnpm que `packageManager` del package.json raíz', () => {
    const version = /^pnpm@(.+)$/.exec(rootPackage.packageManager)?.[1];

    expect(version).toBeDefined();
    expect(dockerfile).toContain(`pnpm@${String(version)}`);
  });

  it('instala con el lockfile congelado y compila el JavaScript de producción', () => {
    expect(dockerfile).toContain('--frozen-lockfile');
    expect(dockerfile).toMatch(/build:runtime/);
  });

  it('poda las dependencias a las de producción con `pnpm deploy --legacy --prod` (pnpm 11 lo exige sin inject-workspace-packages)', () => {
    expect(dockerfile).toMatch(/deploy\s+--legacy\s+--prod/);
  });
});

describe('apps/ingestion/Dockerfile — etapa de ejecución', () => {
  it('corre como usuario NO root', () => {
    const users = [...runtimeStage.matchAll(/^USER (\S+)/gm)].map((match) => match[1]);

    expect(users.length).toBeGreaterThan(0);
    expect(users.at(-1)).not.toBe('root');
    expect(users.at(-1)).not.toBe('0');
  });

  it('el directorio de trabajo es /app/apps/ingestion (coincide con el servicio deploy de Compose)', () => {
    expect(runtimeStage).toMatch(/^WORKDIR \/app\/apps\/ingestion$/m);
  });

  it('el comando por defecto ejecuta el worker COMPILADO con node (sin tsx ni pnpm)', () => {
    const instructions = runtimeStage
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n');

    expect(runtimeStage).toMatch(/^CMD \["node", "dist-runtime\/scripts\/coverage-worker\.js"\]$/m);
    expect(instructions).not.toMatch(/tsx/);
    expect(instructions).not.toMatch(/\bpnpm\b/);
  });

  it('declara NODE_ENV=production', () => {
    expect(runtimeStage).toMatch(/^ENV NODE_ENV=production$/m);
  });

  it('copia SOLO package.json, node_modules y dist-runtime: nunca el directorio entero del deploy (fuentes .ts, tests)', () => {
    const sources = [...runtimeStage.matchAll(/^COPY --from=build (?:--chown=\S+ )?(\S+) /gm)].map((match) => match[1]);

    expect(sources).toEqual([
      '/prod/ingestion/package.json',
      '/prod/ingestion/node_modules',
      '/app/apps/ingestion/dist-runtime',
    ]);
  });

  it('copia solo el resultado de la construcción: ni fuentes, ni .env, ni credenciales', () => {
    const copies = [...runtimeStage.matchAll(/^COPY (.+)$/gm)].map((match) => match[1] ?? '');

    expect(copies.length).toBeGreaterThan(0);
    for (const line of copies) {
      expect(line).toContain('--from=build');
      expect(line).not.toMatch(/\.env/);
    }
    expect(dockerfile).not.toMatch(/^ENV .*(KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)/im);
    expect(dockerfile).not.toMatch(/^ARG .*(KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)/im);
  });
});

describe('.dockerignore', () => {
  const ignore = read('.dockerignore');

  it('deja fuera el JavaScript compilado del host y los ficheros de entorno', () => {
    expect(ignore).toMatch(/^\*\*\/dist-runtime$/m);
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.env\.\*$/m);
  });
});

describe('apps/ingestion/tsconfig.runtime.json', () => {
  const config = JSON.parse(
    read('apps/ingestion/tsconfig.runtime.json')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
  ) as { include: string[] };

  it('compila los dos puntos de entrada de producción: despliegue y worker', () => {
    expect(config.include).toEqual(expect.arrayContaining(['scripts/deploy.ts', 'scripts/coverage-worker.ts']));
  });
});

function serviceBlock(compose: string, name: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) {
    throw new Error(`El servicio "${name}" no existe en docker-compose.yml`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line) && !line.startsWith('   ') && !line.startsWith('  #'));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

describe('docker-compose.yml — servicio ingestion (decisión 258)', () => {
  const compose = read('docker-compose.yml');
  const block = serviceBlock(compose, 'ingestion');

  it('sigue en el perfil `app` y se construye desde el Dockerfile propio con el monorepo como contexto', () => {
    expect(block).toMatch(/profiles:\s*\['app'\]/);
    expect(block).toMatch(/context:\s*\./);
    expect(block).toMatch(/dockerfile:\s*apps\/ingestion\/Dockerfile/);
  });

  it('NO lleva política de reinicio: pertenece al host (paso 3.5)', () => {
    expect(block).not.toMatch(/^\s+restart:/m);
  });

  it('conserva su `env_file` anterior y no añade variables de entorno nuevas con valores', () => {
    expect(block).toMatch(/env_file:\s*\n\s+- \.env/);
    expect(block).not.toMatch(/^\s+environment:/m);
  });

  it('espera a la base y usa `init` para recoger procesos huérfanos y reenviar señales', () => {
    expect(block).toMatch(/depends_on:\s*\n\s+db:\s*\n\s+condition:\s*service_healthy/);
    expect(block).toMatch(/^\s+init:\s*true$/m);
  });

  it('`stop_grace_period` supera el plazo de parada del worker (WORKER_STOP_GRACE_MS, 8 s por defecto)', () => {
    const seconds = Number(/^\s+stop_grace_period:\s*(\d+)s$/m.exec(block)?.[1]);

    expect(seconds).toBeGreaterThan(8);
  });

  it('el servicio deploy se construye desde el MISMO Dockerfile', () => {
    expect(serviceBlock(compose, 'deploy')).toMatch(/dockerfile:\s*apps\/ingestion\/Dockerfile/);
  });
});
