// ROADMAP 3.4 (decisión 263 parte C; D22; R11.1-R11.3) — el flujo de CI, comprobado de forma ESTÁTICA sobre
// `.github/workflows/ci.yml` (no se puede ejecutar GitHub Actions aquí; las órdenes de cada job se ejecutan a mano
// contra Docker en la verificación del paso). No hay analizador de YAML en el repositorio: el fichero usa una
// forma regular (claves de job con dos espacios, pasos con `- name:`) y este test la exige.
//
// Lo que garantiza: instalación con lockfile congelado, lint/typecheck/test/build/check:public-env en `checks`,
// despliegue DOS veces y suites con PostGIS en `db`, el e2e de copias contra MinIO en `backup`; caché ligada al
// lockfile; acciones fijadas por SHA; y NINGUNA credencial, despliegue ni publicación.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function read(path: string): string {
  return readFileSync(`${ROOT}${path}`, 'utf8').replace(/\r\n/g, '\n');
}

// Sin las líneas que son solo comentario: las comprobaciones negativas miran lo que se ejecuta, no lo que se explica.
const workflow = read('.github/workflows/ci.yml')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');
const rootPackage = JSON.parse(read('package.json')) as { packageManager: string };
const dockerfile = read('apps/ingestion/Dockerfile');

interface Job {
  readonly name: string;
  readonly text: string;
}

function jobsOf(text: string): Job[] {
  const region = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const parts = region.split(/^(?=  [a-z][a-z0-9-]*:\s*$)/m).filter((part) => /^ {2}[a-z]/.test(part));
  return parts.map((part) => ({ name: /^ {2}([a-z][a-z0-9-]*):/.exec(part)?.[1] ?? '', text: part }));
}

// Órdenes de `run:` (una línea o bloque `|`/`>-`), en orden de aparición.
function runCommands(text: string): string[] {
  const commands: string[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    const indent = (match[1] ?? '').length;
    const inline = (match[2] ?? '').trim();
    if (inline !== '' && !/^[|>][+-]?$/.test(inline)) {
      commands.push(inline);
      continue;
    }
    const block: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next] ?? '';
      if (candidate.trim() !== '' && candidate.length - candidate.trimStart().length <= indent) {
        break;
      }
      block.push(candidate.trim());
    }
    commands.push(block.filter((entry) => entry !== '').join('\n'));
  }
  return commands;
}

const jobs = jobsOf(workflow);
const job = (name: string): Job => {
  const found = jobs.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`ci.yml no define el job «${name}».`);
  }
  return found;
};

describe('ci.yml — forma general (R11.1, R11.3)', () => {
  it('se dispara en push y en pull_request', () => {
    expect(workflow).toMatch(/^on:\n {2}push:/m);
    expect(workflow).toMatch(/^ {2}pull_request:/m);
  });

  it('define exactamente los jobs checks, db y backup', () => {
    expect(jobs.map((candidate) => candidate.name)).toEqual(['checks', 'db', 'backup']);
  });

  it('permisos mínimos: solo contents: read, sin id-token ni escritura', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n(?! +\w)/m);
    expect(workflow).not.toMatch(/:\s*write\b/);
    expect(workflow).not.toMatch(/id-token/);
  });

  it('cada job tiene un plazo (timeout-minutes) y ningún paso puede fallar en silencio', () => {
    for (const candidate of jobs) {
      expect(candidate.text, candidate.name).toMatch(/^ {4}timeout-minutes: \d+$/m);
    }
    expect(workflow).not.toMatch(/continue-on-error/);
    expect(workflow).not.toMatch(/\|\|\s*true/);
    expect(workflow).not.toMatch(/if:\s*(always|failure|cancelled)\(\)/);
  });
});

describe('ci.yml — acciones fijadas y caché ligada al lockfile (R11.3)', () => {
  const uses = [...workflow.matchAll(/^\s*(?:- )?uses:\s*(\S+)(?:\s+#\s*(\S+))?/gm)];

  it('solo usa acciones oficiales de GitHub, fijadas por SHA completo con la versión en un comentario', () => {
    expect(uses.length).toBeGreaterThanOrEqual(3);
    for (const match of uses) {
      expect(match[1], match[0]).toMatch(/^actions\/(checkout|setup-node)@[0-9a-f]{40}$/);
      expect(match[2], match[0]).toMatch(/^v\d+\.\d+\.\d+$/);
    }
  });

  it.each(['checks', 'db'])('el job %s cachea el almacén de pnpm con una clave ligada a pnpm-lock.yaml', (name) => {
    const text = job(name).text;
    expect(text).toMatch(/^\s+cache: pnpm$/m);
    expect(text).toMatch(/^\s+cache-dependency-path: pnpm-lock\.yaml$/m);
  });

  it('toda instalación de dependencias usa el lockfile congelado', () => {
    const installs = runCommands(workflow).flatMap((command) => command.split('\n')).filter((line) => /\bpnpm install\b/.test(line));
    expect(installs.length).toBeGreaterThanOrEqual(2);
    for (const line of installs) {
      expect(line).toContain('--frozen-lockfile');
    }
  });

  it('las versiones de Node y de pnpm son las del proyecto (Dockerfile y packageManager)', () => {
    const imageNode = /^FROM node:(\d+\.\d+\.\d+)-bookworm-slim/m.exec(dockerfile)?.[1];
    const pnpm = /^pnpm@(\d+\.\d+\.\d+)$/.exec(rootPackage.packageManager)?.[1];
    expect(imageNode).toBeDefined();
    expect(pnpm).toBeDefined();
    expect(workflow).toContain(`node-version: ${imageNode ?? ''}`);
    expect(workflow).toContain(`npm install --global pnpm@${pnpm ?? ''}`);
    expect(workflow).not.toMatch(/node-version: (?!\d+\.\d+\.\d+$)/m);
  });
});

describe('ci.yml — job checks (R11.1)', () => {
  const commands = runCommands(job('checks').text);

  it('ejecuta, en este orden: instalación, lint, typecheck, test, build y check:public-env', () => {
    const wanted = ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build', 'pnpm check:public-env'];
    const positions = wanted.map((command) => commands.findIndex((candidate) => candidate === command));
    expect(positions.every((position) => position >= 0), JSON.stringify(commands)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('no necesita servicios ni credenciales: sin `services:` ni variables de base de datos', () => {
    const text = job('checks').text;
    expect(text).not.toMatch(/^ {4}services:/m);
    expect(text).not.toMatch(/DATABASE_URL/);
  });
});

describe('ci.yml — job db (R11.2, R5.2)', () => {
  const text = job('db').text;
  const commands = runCommands(text);

  it('usa un servicio PostGIS 17-3.5 (el mismo que Compose) con comprobación de salud', () => {
    expect(text).toMatch(/^ {4}services:\n {6}postgres:\n {8}image: postgis\/postgis:17-3\.5$/m);
    expect(text).toMatch(/--health-cmd/);
  });

  it('despliega DOS veces y exige que la segunda no cambie nada', () => {
    const deploys = commands.filter((command) => command.includes('deploy:runtime'));
    expect(deploys.length).toBe(2);
    const second = deploys[1] ?? '';
    expect(second).toContain('0 migrations, roles unchanged, privileges unchanged, seeds skipped');
    expect(second).toMatch(/grep -q/);
    expect(commands.some((command) => command.includes('build:runtime'))).toBe(true);
  });

  it('ejecuta las suites con base de datos de todos los paquetes tras desplegar', () => {
    const joined = commands.join('\n');
    const wanted = [
      'pnpm --filter @buscahogar/db test',
      'pnpm --filter @buscahogar/db test:blocking',
      'pnpm --filter @buscahogar/db test:consolidation',
      'pnpm --filter @buscahogar/db test:detail',
      'pnpm --filter @buscahogar/ingestion test:db',
      'pnpm --filter @buscahogar/web test',
    ];
    for (const command of wanted) {
      expect(joined, command).toMatch(new RegExp(`^${command.replaceAll('/', '\\/')}$`, 'm'));
    }
    const lastDeploy = commands.map((command) => command.includes('deploy:runtime')).lastIndexOf(true);
    const firstSuite = commands.findIndex((command) => command.includes('test:db') || command.includes('@buscahogar/db test'));
    expect(firstSuite).toBeGreaterThan(lastDeploy);
  });

  it('las credenciales de la base son literales de prueba del propio job, nunca secretos del repositorio', () => {
    expect(text).toMatch(/DIRECT_DATABASE_URL: postgresql:\/\/postgres:[\w-]+@localhost:5432\/buscahogar/);
    expect(text).toMatch(/WEB_READONLY_PASSWORD: [\w-]+/);
    expect(text).toMatch(/WEB_COVERAGE_PASSWORD: [\w-]+/);
    expect(text).not.toContain('secrets.');
  });
});

describe('ci.yml — job backup (R8.5, R11.2)', () => {
  it('ejecuta el e2e de copias contra MinIO local', () => {
    expect(runCommands(job('backup').text)).toContain('bash ops/backup/test/e2e.sh');
  });
});

describe('ci.yml — ni despliegue, ni publicación, ni credenciales de nube (R11.1)', () => {
  it('no referencia secretos, entornos de despliegue ni variables de proveedores', () => {
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).not.toMatch(/^\s*environment:/m);
    expect(workflow).not.toMatch(/\b(AWS_|VERCEL_|NEON_|TELEGRAM_|IDEALISTA_|BACKUP_S3_|AGE_)\w*/);
  });

  it('ninguna orden despliega, publica ni sube imágenes', () => {
    const commands = runCommands(workflow).join('\n');
    expect(commands).not.toMatch(/\b(vercel|neonctl|npm publish|pnpm publish|docker push|docker login|gh release|aws |gcloud |az |flyctl|kubectl)\b/);
    expect(commands).not.toMatch(/docker compose --profile deploy/);
  });

  it('no usa acciones de publicación ni de nube', () => {
    expect(workflow).not.toMatch(/uses:\s*(docker\/|aws-actions\/|azure\/|google-github-actions\/|vercel\/|softprops\/|pnpm\/action-setup)/);
  });
});
