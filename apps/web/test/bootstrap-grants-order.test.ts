// ROADMAP 3.4 (decisión 255, D5b; R5.5) — orden del bootstrap de privilegios, comprobado sobre el propio
// texto del fichero (no necesita base de datos): todos los GRANT y el `ALTER DEFAULT PRIVILEGES` van
// ANTES; el bloque REVOKE de las tablas solo del propietario o con acceso restringido va el ÚLTIMO.
// Moverlo antes anularía el REVOKE (los privilegios por defecto volverían a conceder SELECT).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const BOOTSTRAP = readFileSync(
  fileURLToPath(new URL('../../../packages/db/sql/bootstrap-roles-grants.sql', import.meta.url)),
  'utf8'
);

// Sin comentarios: las explicaciones también mencionan GRANT/REVOKE y falsearían las posiciones.
const CODE = BOOTSTRAP.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

function position(pattern: RegExp): number {
  const match = pattern.exec(CODE);
  if (match === null) {
    throw new Error(`El bootstrap no contiene ${pattern.source}`);
  }
  return match.index;
}

describe('bootstrap-roles-grants.sql — orden de GRANT y REVOKE (decisión 255, R5.5)', () => {
  it('concede SELECT/INSERT/UPDATE/DELETE sobre proxy_rate_limit a web_coverage, y a nadie más', () => {
    expect(CODE).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE proxy_rate_limit TO web_coverage;/);
    expect(CODE).not.toMatch(/GRANT[^;]*proxy_rate_limit[^;]*web_readonly/);
  });

  it('el GRANT sobre proxy_rate_limit va junto a los de web_coverage, antes de los privilegios por defecto', () => {
    expect(position(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE proxy_rate_limit/)).toBeLessThan(
      position(/ALTER DEFAULT PRIVILEGES/)
    );
  });

  it('el REVOKE de proxy_rate_limit a web_readonly va DESPUÉS de GRANT ON ALL TABLES y de los privilegios por defecto', () => {
    const revoke = position(/REVOKE ALL ON TABLE proxy_rate_limit FROM web_readonly/);
    expect(revoke).toBeGreaterThan(position(/GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_readonly/));
    expect(revoke).toBeGreaterThan(position(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT/));
  });

  it('alert_dispatch_log (decisión 259) es solo del propietario: REVOKE a AMBOS roles web, tras todos los GRANT, sin ningún GRANT', () => {
    expect(CODE).toMatch(/IF to_regclass\('public\.alert_dispatch_log'\) IS NOT NULL THEN/);
    const revoke = position(/REVOKE ALL ON TABLE alert_dispatch_log FROM web_readonly, web_coverage/);
    expect(revoke).toBeGreaterThan(position(/GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_readonly/));
    expect(revoke).toBeGreaterThan(position(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT/));
    expect(CODE).not.toMatch(/GRANT[^;]*alert_dispatch_log/);
  });

  it('el REVOKE no toca a web_coverage (conserva exactamente S/I/U/D) y está guardado por to_regclass', () => {
    expect(CODE).toMatch(/IF to_regclass\('public\.proxy_rate_limit'\) IS NOT NULL THEN/);
    expect(CODE).not.toMatch(/REVOKE[^;]*proxy_rate_limit[^;]*web_coverage/);
  });

  it('ningún GRANT ni ALTER DEFAULT PRIVILEGES aparece después del primer REVOKE: el bloque REVOKE es el último', () => {
    const firstRevoke = position(/REVOKE ALL ON TABLE/);
    const lastGrant = Math.max(
      CODE.lastIndexOf('GRANT SELECT'),
      CODE.lastIndexOf('GRANT INSERT'),
      CODE.lastIndexOf('GRANT USAGE'),
      CODE.lastIndexOf('GRANT CONNECT'),
      CODE.lastIndexOf('ALTER DEFAULT PRIVILEGES')
    );
    expect(firstRevoke).toBeGreaterThan(lastGrant);
    // El REVOKE de proxy_rate_limit va junto al de monthly_request_budget, ambos tras el último GRANT.
    expect(position(/REVOKE ALL ON TABLE monthly_request_budget/)).toBeGreaterThan(lastGrant);
    expect(position(/REVOKE ALL ON TABLE proxy_rate_limit/)).toBeGreaterThan(lastGrant);
  });

  it('el bloque de JIT tolera que el proveedor no permita ALTER ROLE ... SET (insufficient_privilege -> NOTICE)', () => {
    expect(CODE).toMatch(/EXCEPTION\s+WHEN insufficient_privilege THEN\s+RAISE NOTICE/);
  });
});
