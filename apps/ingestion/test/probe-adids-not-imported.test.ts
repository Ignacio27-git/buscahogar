// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105, U3) — la sonda de
// `adIds` hace peticiones REALES y facturables: es un script que opera una
// persona, nunca algo que un test, el código de producción o CI puedan
// importar o ejecutar. Esta prueba estática recorre el workspace y falla si
// algún otro fichero la IMPORTA (un comentario que la nombra no cuenta).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKSPACE = fileURLToPath(new URL('../', import.meta.url));
const PROBE_SCRIPT = 'scripts/probe-idealista-adids.ts';
// El nombre se arma por partes para que ESTE fichero no sea un falso positivo.
const NEEDLE = ['probe', 'idealista', 'adids'].join('-');
// `from '…needle…'`, `import('…needle…')` o `require('…needle…')`.
const IMPORT_OF_PROBE = new RegExp(String.raw`(?:from|import\(|require\()\s*['"][^'"]*` + NEEDLE);
const SCANNED_DIRS = ['src', 'test', 'scripts'] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'fixtures' || name === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.(ts|mts|js|mjs|json)$/.test(name) ? [path] : [];
  });
}

describe('probe-idealista-adids.ts — operada por una persona, nunca importada (U3)', () => {
  const script = join(WORKSPACE, PROBE_SCRIPT);

  it('el script existe y arranca SOLO como entrypoint (no ejecuta nada al importarlo)', () => {
    const text = readFileSync(script, 'utf8');

    expect(text).toMatch(/if \(process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)\)/);
    expect(text).toContain("ledger.spend('search')");
  });

  it('ningún fichero de src/, test/ ni del resto de scripts/ lo importa', () => {
    const scanned = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(WORKSPACE, dir))).filter((path) => path !== script);
    const importing = scanned
      .filter((path) => IMPORT_OF_PROBE.test(readFileSync(path, 'utf8')))
      .map((path) => relative(WORKSPACE, path));

    // La búsqueda recorre ficheros reales (no es un recorrido vacío)...
    expect(scanned.length).toBeGreaterThan(50);
    expect(importing).toEqual([]);
  });

  it('el detector SÍ reconoce un import del script (triangulación: no pasa por no encontrar nada)', () => {
    expect(IMPORT_OF_PROBE.test(`import { main } from '../scripts/${NEEDLE}.js';`)).toBe(true);
    expect(IMPORT_OF_PROBE.test(`await import("../scripts/${NEEDLE}.js")`)).toBe(true);
    expect(IMPORT_OF_PROBE.test(`// sonda: scripts/${NEEDLE}.ts`)).toBe(false);
  });

  it('package.json lo expone solo como script de operador (nunca en test, build ni start)', () => {
    const pkg = JSON.parse(readFileSync(join(WORKSPACE, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const uses = Object.entries(pkg.scripts)
      .filter(([, command]) => command.includes(NEEDLE))
      .map(([name]) => name);

    expect(uses).toEqual(['probe:adids']);
  });
});
