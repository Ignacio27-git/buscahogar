// ROADMAP 3.4 (decisión 257, D9; R2.3, R5.4; NF3) — lectura y validación Zod del entorno del despliegue. La
// URL directa es OBLIGATORIA y no tiene respaldo (jamás cae a `DATABASE_URL` ni a una URL del pooler); los dos
// secretos de rol son obligatorios y no pueden estar en blanco; la siembra de cuota es todo o nada. Los
// mensajes nombran variables, nunca valores.
import { describe, expect, it } from 'vitest';

import { readDeployConfig } from '../src/deploy/deploy-env.js';

const VALID_ENV = {
  DIRECT_DATABASE_URL: 'postgres://owner:owner-secret-9@db.internal:5432/buscahogar',
  WEB_READONLY_PASSWORD: 'readonly-secret-9',
  WEB_COVERAGE_PASSWORD: 'coverage-secret-9',
};

function expectInvalid(env: Record<string, string | undefined>): readonly string[] {
  const result = readDeployConfig(env);
  if (result.ok) {
    throw new Error('Se esperaba una configuración inválida');
  }
  return result.issues;
}

describe('readDeployConfig — entorno válido', () => {
  it('con lo mínimo: roles canónicos y sin siembra de cuota', () => {
    const result = readDeployConfig(VALID_ENV);

    expect(result).toEqual({
      ok: true,
      config: {
        ownerUrl: VALID_ENV.DIRECT_DATABASE_URL,
        roleNames: { readonly: 'web_readonly', coverage: 'web_coverage' },
        passwords: { readonly: 'readonly-secret-9', coverage: 'coverage-secret-9' },
        quotaSeed: null,
      },
    });
  });

  it('con nombres de rol y siembra de cuota explícitos', () => {
    const result = readDeployConfig({
      ...VALID_ENV,
      WEB_READONLY_ROLE: 'stg_readonly',
      WEB_COVERAGE_ROLE: 'stg_coverage',
      SEED_MONTHLY_QUOTA_TOTAL: '1000',
      SEED_MONTHLY_QUOTA_RESERVE: '200',
    });

    expect(result).toMatchObject({
      ok: true,
      config: {
        roleNames: { readonly: 'stg_readonly', coverage: 'stg_coverage' },
        quotaSeed: { totalCap: 1000, reserve: 200 },
      },
    });
  });

  it('variables de cuota vacías cuentan como ausentes (compose pasa cadenas vacías)', () => {
    const result = readDeployConfig({ ...VALID_ENV, SEED_MONTHLY_QUOTA_TOTAL: '', SEED_MONTHLY_QUOTA_RESERVE: '' });

    expect(result).toMatchObject({ ok: true, config: { quotaSeed: null } });
  });
});

describe('readDeployConfig — entorno inválido (exit 2)', () => {
  it('sin DIRECT_DATABASE_URL lo nombra y NO usa DATABASE_URL como respaldo', () => {
    const issues = expectInvalid({
      WEB_READONLY_PASSWORD: VALID_ENV.WEB_READONLY_PASSWORD,
      WEB_COVERAGE_PASSWORD: VALID_ENV.WEB_COVERAGE_PASSWORD,
      DATABASE_URL: 'postgres://owner:otra@localhost:5432/dev',
    });

    expect(issues.join('\n')).toMatch(/DIRECT_DATABASE_URL/);
    expect(issues.join('\n')).toMatch(/URL directa/);
  });

  it('una URL que no es postgres:// o postgresql:// se rechaza sin repetirla', () => {
    const issues = expectInvalid({ ...VALID_ENV, DIRECT_DATABASE_URL: 'mysql://usuario:clave-privada@host/db' });

    expect(issues.join('\n')).toMatch(/DIRECT_DATABASE_URL/);
    expect(issues.join('\n')).not.toContain('clave-privada');
  });

  it('secretos de rol ausentes o en blanco, cada uno nombrado', () => {
    const issues = expectInvalid({ ...VALID_ENV, WEB_READONLY_PASSWORD: '   ', WEB_COVERAGE_PASSWORD: undefined });

    expect(issues.join('\n')).toMatch(/WEB_READONLY_PASSWORD/);
    expect(issues.join('\n')).toMatch(/WEB_COVERAGE_PASSWORD/);
  });

  it('nombre de rol que no es un identificador simple', () => {
    const issues = expectInvalid({ ...VALID_ENV, WEB_READONLY_ROLE: 'Web-Readonly' });

    expect(issues.join('\n')).toMatch(/WEB_READONLY_ROLE/);
  });

  it('siembra de cuota a medias (solo total o solo reserva)', () => {
    expect(expectInvalid({ ...VALID_ENV, SEED_MONTHLY_QUOTA_TOTAL: '1000' }).join('\n')).toMatch(
      /SEED_MONTHLY_QUOTA_RESERVE/
    );
    expect(expectInvalid({ ...VALID_ENV, SEED_MONTHLY_QUOTA_RESERVE: '200' }).join('\n')).toMatch(
      /SEED_MONTHLY_QUOTA_TOTAL/
    );
  });

  it('siembra de cuota con valores inválidos: no entero, cero, reserva >= total', () => {
    const base = { ...VALID_ENV, SEED_MONTHLY_QUOTA_TOTAL: '1000', SEED_MONTHLY_QUOTA_RESERVE: '200' };

    expect(expectInvalid({ ...base, SEED_MONTHLY_QUOTA_TOTAL: '10.5' }).join('\n')).toMatch(/SEED_MONTHLY_QUOTA_TOTAL/);
    expect(expectInvalid({ ...base, SEED_MONTHLY_QUOTA_TOTAL: '0' }).join('\n')).toMatch(/SEED_MONTHLY_QUOTA_TOTAL/);
    expect(expectInvalid({ ...base, SEED_MONTHLY_QUOTA_RESERVE: '1000' }).join('\n')).toMatch(/SEED_MONTHLY_QUOTA_RESERVE/);
    expect(expectInvalid({ ...base, SEED_MONTHLY_QUOTA_TOTAL: '99999999999' }).join('\n')).toMatch(/SEED_MONTHLY_QUOTA_TOTAL/);
  });

  it('ningún mensaje contiene los valores de los secretos', () => {
    const issues = expectInvalid({ ...VALID_ENV, DIRECT_DATABASE_URL: 'no-es-una-url', WEB_READONLY_ROLE: 'MAL' });
    const text = issues.join('\n');

    expect(text).not.toContain('readonly-secret-9');
    expect(text).not.toContain('coverage-secret-9');
  });
});
