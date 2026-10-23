// ROADMAP 3.4 (decisión 260, D18; R8.1-R8.5) — comprobaciones ESTÁTICAS y herméticas de `ops/backup/` (sin Docker, sin
// red): las reglas de seguridad de los scripts de shell (`set -euo pipefail`, nunca `set -x`, limpieza por `trap`,
// secretos solo por entorno), la imagen con versiones fijadas, el compose de prueba sin volúmenes y la SELECCIÓN de
// retención (`ops/backup/test/retention.test.sh`, función pura). El e2e contra MinIO y PostGIS reales necesita Docker y
// lo ejecuta `bash ops/backup/test/e2e.sh` (CI: trabajo `backup`); aquí NO se lanza, para que `pnpm test` no dependa de
// Docker. La prueba de retención se OMITE, con motivo visible, si no hay `bash` con `date` de GNU.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const OPS = `${REPO_ROOT}ops/backup/`;

function read(relative: string): string {
  return readFileSync(`${REPO_ROOT}${relative}`, 'utf8');
}

const SCRIPTS = ['lib.sh', 'backup.sh', 'retention.sh', 'restore-drill.sh', 'test/retention.test.sh', 'test/e2e.sh'] as const;

// Líneas ejecutables: sin comentarios completos ni líneas en blanco.
function codeLines(source: string): string[] {
  return source.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
}

describe('ops/backup — reglas de los scripts de shell (R8.1, amenaza «shell/subproceso»)', () => {
  for (const script of SCRIPTS) {
    const source = read(`ops/backup/${script}`);

    it(`${script}: LF, sin retornos de carro, y entrada de shell`, () => {
      expect(source).not.toContain('\r');
      if (script !== 'lib.sh') {
        expect(source.startsWith('#!/usr/bin/env bash\n')).toBe(true);
      }
    });

    it(`${script}: nunca activa la traza (set -x / xtrace) ni evalúa texto`, () => {
      const code = codeLines(source).join('\n');
      expect(code).not.toMatch(/\bset\s+-[a-z]*x/);
      expect(code).not.toMatch(/xtrace/);
      expect(code).not.toMatch(/\beval\b/);
    });
  }

  it('los scripts ejecutables usan set -euo pipefail', () => {
    for (const script of ['backup.sh', 'retention.sh', 'restore-drill.sh', 'test/retention.test.sh', 'test/e2e.sh']) {
      expect(read(`ops/backup/${script}`), script).toMatch(/^set -euo pipefail$/m);
    }
  });

  it('backup.sh: limpieza por trap en EXIT, INT y TERM; volcado cifrado en tubería, sin texto plano en disco', () => {
    const source = read('ops/backup/backup.sh');
    expect(source).toMatch(/^trap cleanup EXIT$/m);
    expect(source).toMatch(/^trap '.*' INT$/m);
    expect(source).toMatch(/^trap '.*' TERM$/m);
    expect(source).toMatch(/pg_dump -Fc --no-password \| age -r "\$AGE_RECIPIENT" >"\$TMP\.age"/);
    // Nada de redirigir pg_dump a un fichero ni de `-f`/`--file`: el único fichero es el cifrado.
    expect(source).not.toMatch(/pg_dump[^|\n]*(\s-f\b|--file|>)/);
    expect(source).toMatch(/rm -rf -- "\$WORKDIR"/);
    // La poda va DESPUÉS de la publicación verificada de la subida.
    expect(source.indexOf('retention.sh')).toBeGreaterThan(source.indexOf('rclone moveto'));
    expect(source.indexOf('rclone moveto')).toBeGreaterThan(source.indexOf('rclone size --json'));
  });

  it('secretos solo por entorno: ni la URL ni las claves viajan por argumentos', () => {
    const joined = ['backup.sh', 'restore-drill.sh', 'retention.sh'].map((script) => codeLines(read(`ops/backup/${script}`)).join('\n')).join('\n');
    expect(joined).not.toMatch(/pg_(dump|restore)[^\n]*\$\{?(DIRECT|DRILL)_DATABASE_URL/);
    expect(joined).not.toMatch(/psql[^\n]*\$\{?(DIRECT|DRILL)_DATABASE_URL/);
    expect(joined).not.toMatch(/\$\{?BACKUP_S3_(SECRET_ACCESS_KEY|ACCESS_KEY_ID)\}?[^\n]*(rclone|age|pg_)/);
    // rclone se configura por RCLONE_CONFIG_BKP_* (entorno), nunca con una cadena de conexión en la orden.
    expect(joined).not.toMatch(/rclone[^\n]*(access_key|secret_access_key|:s3,)/i);
    expect(joined).not.toMatch(/--passphrase|-p\s+"\$/);
  });

  it('retención: 7 diarias, 4 semanales, 3 mensuales como CONSTANTES (no configurables)', () => {
    const source = read('ops/backup/retention.sh');
    expect(source).toMatch(/^KEEP_DAILY=7$/m);
    expect(source).toMatch(/^KEEP_WEEKLY=4$/m);
    expect(source).toMatch(/^KEEP_MONTHLY=3$/m);
  });

  it('.gitattributes fuerza LF en *.sh (los scripts se ejecutan en contenedores Linux)', () => {
    expect(read('.gitattributes')).toMatch(/^\*\.sh text eol=lf$/m);
  });
});

describe('ops/backup/Dockerfile — versiones fijadas, sin root', () => {
  const dockerfile = read('ops/backup/Dockerfile');

  it('las imágenes base llevan etiqueta exacta (nunca latest ni solo la mayor)', () => {
    expect(dockerfile).toMatch(/^ARG POSTGRES_IMAGE=postgres:17\.\d+-bookworm$/m);
    expect(dockerfile).toMatch(/^ARG NODE_IMAGE=node:22\.\d+\.\d+-bookworm-slim$/m);
    // La imagen de ingestion es local (se construye con apps/ingestion/Dockerfile): su etiqueta la fija quien construye.
    expect(dockerfile).not.toMatch(/^FROM [^\n]*:latest/m);
    expect(dockerfile).not.toMatch(/^ARG (POSTGRES|NODE)_IMAGE=[^\n]*:latest/m);
  });

  it('age y rclone con versión exacta de Debian', () => {
    expect(dockerfile).toMatch(/\bage=\d+\.\d+\.\d+-\S+/);
    expect(dockerfile).toMatch(/\brclone=\d+\.\d+\.\d+\S*/);
  });

  it('usuario no root en el destino por defecto y en el de simulacro; scripts de solo lectura', () => {
    expect(dockerfile).toMatch(/^USER dbbackup$/m);
    expect(dockerfile).toMatch(/^FROM base AS drill$/m);
    expect(dockerfile.trimEnd().split('\n').filter((line) => line.startsWith('FROM ')).at(-1)).toBe('FROM base AS backup');
    expect(dockerfile).toMatch(/chmod 0555 \/opt\/backup\/\*\.sh/);
  });

  it('no contiene claves ni secretos', () => {
    expect(dockerfile).not.toMatch(/AGE-SECRET-KEY|\bPASSWORD\b|\bSECRET\b/);
  });
});

describe('ops/backup/compose.yml — prueba aislada de la base de desarrollo', () => {
  const compose = read('ops/backup/compose.yml');
  const keys = compose
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('proyecto propio, sin volúmenes, sin .env y sin tocar el volumen de desarrollo', () => {
    expect(keys).toMatch(/^name: buscahogar-backup-e2e$/m);
    expect(keys).not.toMatch(/^volumes:/m);
    expect(keys).not.toMatch(/^\s+volumes:/m);
    expect(keys).not.toMatch(/env_file/);
    expect(keys).not.toMatch(/postgres_data/);
  });

  it('MinIO por digest y bases efímeras (tmpfs)', () => {
    expect(keys).toMatch(/image: cgr\.dev\/chainguard\/minio@sha256:[0-9a-f]{64}/);
    expect(keys.match(/tmpfs:/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('no publica puertos en el host', () => {
    expect(keys).not.toMatch(/^\s+ports:/m);
  });
});

const bash = spawnSync('bash', ['-c', 'date -u -d 2026-03-01 +%u'], { encoding: 'utf8' });
const hasGnuBash = bash.status === 0 && bash.stdout.trim() === '7';

describe.skipIf(!hasGnuBash)('ops/backup/retention.sh — selección de retención (R8.2) [requiere bash con date de GNU]', () => {
  it('test/retention.test.sh pasa entero', () => {
    const result = spawnSync('bash', [`${OPS}test/retention.test.sh`], { encoding: 'utf8', timeout: 120_000 });

    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/retention: \d+ comprobaciones OK/);
    expect(result.status).toBe(0);
  }, 130_000);
});
