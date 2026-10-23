// ROADMAP 3.4 (decisión 263 parte C; D22; R12.3, NF2) — ninguna credencial se expone como variable
// `NEXT_PUBLIC_*`: cualquier cosa con ese prefijo acaba en el JavaScript que recibe cada navegador. El
// escáner mira los nombres del entorno y el contenido de los ficheros versionados (sin tocar jamás los `.env*`).
//
// Los nombres prohibidos se construyen por concatenación: este fichero también lo escanea `check:public-env`.
import { describe, expect, it } from 'vitest';

import {
  forbiddenPublicEnvNames,
  isEnvFile,
  scanFilesForPublicEnv,
  scanTextForPublicEnv,
} from '../src/lib/public-env.js';

const PREFIX = 'NEXT_PUBLIC_';
const FORBIDDEN_SUFFIXES = [
  'SECRET',
  'TOKEN',
  'PASSWORD',
  'PASS',
  'KEY',
  'PRIVATE',
  'CREDENTIAL',
  'AUTH',
  'DATABASE',
  'DB_URL',
] as const;

describe('forbiddenPublicEnvNames', () => {
  it.each(FORBIDDEN_SUFFIXES)('rechaza NEXT_PUBLIC_ con %s (solo y dentro de un nombre más largo)', (suffix) => {
    expect(forbiddenPublicEnvNames([`${PREFIX}${suffix}`])).toEqual([`${PREFIX}${suffix}`]);
    expect(forbiddenPublicEnvNames([`${PREFIX}MAPBOX_${suffix}_V2`])).toEqual([`${PREFIX}MAPBOX_${suffix}_V2`]);
  });

  it('acepta nombres públicos sin ninguna palabra de credencial', () => {
    expect(forbiddenPublicEnvNames([`${PREFIX}SITE_NAME`, `${PREFIX}ANALYTICS_ENABLED`, 'DATABASE_URL'])).toEqual([]);
  });

  it('solo mira el prefijo: una credencial sin él no es asunto de este escáner', () => {
    expect(forbiddenPublicEnvNames(['IDEALISTA_API_KEY', 'WEB_COVERAGE_PASSWORD', 'TELEGRAM_BOT_TOKEN'])).toEqual([]);
  });

  it('devuelve cada nombre una vez y en orden alfabético', () => {
    const b = `${PREFIX}B_TOKEN`;
    const a = `${PREFIX}A_SECRET`;
    expect(forbiddenPublicEnvNames([b, a, b])).toEqual([a, b]);
  });
});

describe('scanTextForPublicEnv', () => {
  it('localiza fichero, línea y nombre; nunca el resto de la línea', () => {
    const name = `${PREFIX}STRIPE_SECRET`;
    const text = ['const ok = 1;', `const x = process.env.${name}; // valor privado`, ''].join('\n');

    const findings = scanTextForPublicEnv('apps/web/src/a.ts', text);

    expect(findings).toEqual([{ file: 'apps/web/src/a.ts', line: 2, name }]);
    expect(JSON.stringify(findings)).not.toContain('valor privado');
  });

  it('encuentra varios en una línea y ninguno cuando el texto está limpio', () => {
    const one = `${PREFIX}X_KEY`;
    const two = `${PREFIX}Y_TOKEN`;
    expect(scanTextForPublicEnv('f.md', `${one} y ${two}`)).toHaveLength(2);
    expect(scanTextForPublicEnv('f.md', `${PREFIX}SITE_NAME y NEXT_PUBLIC_*`)).toEqual([]);
  });

  it('la propia expresión regular escrita en el código no se señala a sí misma', () => {
    const source = String.raw`const pattern = /NEXT_PUBLIC_\w*(SECRET|TOKEN|PASSWORD)/;`;
    expect(scanTextForPublicEnv('scan.ts', source)).toEqual([]);
  });
});

describe('isEnvFile', () => {
  it.each(['.env', '.env.local', '.env.production.local', 'apps/web/.env', 'apps/web/.env.example', '.env.test'])(
    '%s es un fichero de entorno (se excluye y nunca se lee)',
    (path) => {
      expect(isEnvFile(path)).toBe(true);
    }
  );

  it.each(['README.md', 'apps/web/src/server/env.ts', 'docs/environment.md', 'src/dotenv-notes.txt'])(
    '%s no lo es',
    (path) => {
      expect(isEnvFile(path)).toBe(false);
    }
  );
});

describe('scanFilesForPublicEnv', () => {
  const leaked = `${PREFIX}ADMIN_PASSWORD`;

  it('lee los ficheros versionados y señala los que contienen un nombre prohibido', () => {
    const files = new Map([
      ['a.ts', `export const v = '${leaked}';`],
      ['b.ts', 'export const w = 1;'],
    ]);

    const findings = scanFilesForPublicEnv(['a.ts', 'b.ts'], (path) => files.get(path) ?? null);

    expect(findings).toEqual([{ file: 'a.ts', line: 1, name: leaked }]);
  });

  it('NUNCA pide el contenido de un .env*, aunque esté en la lista', () => {
    const requested: string[] = [];
    const findings = scanFilesForPublicEnv(['.env', 'apps/web/.env.local', 'c.ts'], (path) => {
      requested.push(path);
      return `${leaked}=1`;
    });

    expect(requested).toEqual(['c.ts']);
    expect(findings.map((finding) => finding.file)).toEqual(['c.ts']);
  });

  it('un fichero ilegible o binario (lector devuelve null) se salta sin fallar', () => {
    expect(scanFilesForPublicEnv(['logo.png', 'a.ts'], (path) => (path === 'a.ts' ? 'ok' : null))).toEqual([]);
  });
});
