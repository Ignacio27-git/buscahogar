// ROADMAP 3.4 (decisión 260, D18; R8.4; NF3) — entorno de las comprobaciones del simulacro de restauración. La URL
// directa es obligatoria y SIN respaldo (la misma regla que el despliegue, R2.3); los nombres de rol y los
// recuentos esperados son opcionales. Los mensajes nombran variables, nunca valores.
import { describe, expect, it } from 'vitest';

import { readRestoreVerifyConfig } from '../src/deploy/restore-verify-env.js';

const URL_WITH_SECRET = 'postgres://owner:owner-secret-9@db.internal:5432/drill';

function expectInvalid(env: Record<string, string | undefined>): readonly string[] {
  const result = readRestoreVerifyConfig(env);
  if (result.ok) {
    throw new Error('Se esperaba una configuración inválida');
  }
  return result.issues;
}

describe('readRestoreVerifyConfig', () => {
  it('con lo mínimo: roles canónicos y sin recuentos esperados', () => {
    expect(readRestoreVerifyConfig({ DIRECT_DATABASE_URL: URL_WITH_SECRET })).toEqual({
      ok: true,
      config: {
        url: URL_WITH_SECRET,
        names: { readonly: 'web_readonly', coverage: 'web_coverage' },
        expectedRowCounts: {},
      },
    });
  });

  it('con roles y recuentos explícitos (las variables en blanco equivalen a ausentes)', () => {
    expect(
      readRestoreVerifyConfig({
        DIRECT_DATABASE_URL: URL_WITH_SECRET,
        WEB_READONLY_ROLE: 'drill_ro',
        WEB_COVERAGE_ROLE: '',
        DRILL_EXPECTED_ROW_COUNTS: 'listings=12,sources=1',
      })
    ).toEqual({
      ok: true,
      config: {
        url: URL_WITH_SECRET,
        names: { readonly: 'drill_ro', coverage: 'web_coverage' },
        expectedRowCounts: { listings: 12, sources: 1 },
      },
    });
  });

  it('sin DIRECT_DATABASE_URL falla nombrándola y NO cae a DATABASE_URL', () => {
    const issues = expectInvalid({ DATABASE_URL: URL_WITH_SECRET });

    expect(issues.join(' ')).toContain('DIRECT_DATABASE_URL');
  });

  it('una URL que no es postgres:// falla sin repetir su valor', () => {
    const issues = expectInvalid({ DIRECT_DATABASE_URL: 'mysql://owner:owner-secret-9@db/x' });

    expect(issues.join(' ')).toContain('DIRECT_DATABASE_URL');
    expect(issues.join(' ')).not.toContain('owner-secret-9');
  });

  it('un nombre de rol que no es un identificador simple falla nombrando la variable', () => {
    const issues = expectInvalid({ DIRECT_DATABASE_URL: URL_WITH_SECRET, WEB_READONLY_ROLE: 'a;drop table x' });

    expect(issues.join(' ')).toContain('WEB_READONLY_ROLE');
    expect(issues.join(' ')).not.toContain('drop table');
  });

  it('unos recuentos mal formados fallan nombrando DRILL_EXPECTED_ROW_COUNTS', () => {
    const issues = expectInvalid({ DIRECT_DATABASE_URL: URL_WITH_SECRET, DRILL_EXPECTED_ROW_COUNTS: 'listings' });

    expect(issues.join(' ')).toContain('DRILL_EXPECTED_ROW_COUNTS');
  });
});
