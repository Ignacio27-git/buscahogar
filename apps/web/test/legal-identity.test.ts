// ROADMAP 3.4 (decisión 263; R10.4, D21) — la identidad del titular del aviso legal sale de la
// configuración (`LEGAL_OWNER_*`), nunca del código. Sin definir, cada dato se sustituye por un marcador
// claramente visible y el arranque en producción avisa (sin fallar). Una identidad nunca se inventa.
import { describe, expect, it } from 'vitest';

import {
  InvalidLegalIdentityError,
  legalIdentityStartupWarning,
  parseLegalIdentity,
} from '../src/server/legal-identity.js';

const COMPLETE_ENV = {
  LEGAL_OWNER_NAME: 'Ana Pérez López',
  LEGAL_OWNER_TAX_ID: '12345678Z',
  LEGAL_OWNER_ADDRESS: 'Calle Mayor 1, 28013 Madrid',
  LEGAL_OWNER_EMAIL: 'contacto@example.test',
} as const;

describe('parseLegalIdentity — configurada', () => {
  it('devuelve los cuatro datos tal cual y los marca como configurados', () => {
    const identity = parseLegalIdentity(COMPLETE_ENV);
    expect(identity.name).toEqual({ value: 'Ana Pérez López', configured: true });
    expect(identity.taxId).toEqual({ value: '12345678Z', configured: true });
    expect(identity.address).toEqual({ value: 'Calle Mayor 1, 28013 Madrid', configured: true });
    expect(identity.email).toEqual({ value: 'contacto@example.test', configured: true });
    expect(identity.complete).toBe(true);
    expect(identity.missing).toEqual([]);
  });

  it('recorta los espacios de los extremos', () => {
    const identity = parseLegalIdentity({
      ...COMPLETE_ENV,
      LEGAL_OWNER_NAME: '  Ana Pérez López  ',
    });
    expect(identity.name.value).toBe('Ana Pérez López');
  });
});

describe('parseLegalIdentity — sin configurar', () => {
  it('sin variables: marcadores visibles y nada inventado', () => {
    const identity = parseLegalIdentity({});
    expect(identity.name).toEqual({
      value: '[Pendiente de configurar: nombre o razón social del titular]',
      configured: false,
    });
    expect(identity.taxId.value).toBe('[Pendiente de configurar: NIF o CIF del titular]');
    expect(identity.address.value).toBe('[Pendiente de configurar: domicilio del titular]');
    expect(identity.email.value).toBe('[Pendiente de configurar: correo electrónico de contacto]');
    expect(identity.complete).toBe(false);
    expect(identity.missing).toEqual([
      'LEGAL_OWNER_NAME',
      'LEGAL_OWNER_TAX_ID',
      'LEGAL_OWNER_ADDRESS',
      'LEGAL_OWNER_EMAIL',
    ]);
  });

  it('una variable vacía o solo con espacios cuenta como no definida', () => {
    const identity = parseLegalIdentity({
      ...COMPLETE_ENV,
      LEGAL_OWNER_TAX_ID: '',
      LEGAL_OWNER_ADDRESS: '   ',
    });
    expect(identity.taxId.configured).toBe(false);
    expect(identity.address.configured).toBe(false);
    expect(identity.name.configured).toBe(true);
    expect(identity.complete).toBe(false);
    expect(identity.missing).toEqual(['LEGAL_OWNER_TAX_ID', 'LEGAL_OWNER_ADDRESS']);
  });

  it('un solo dato definido deja el resto como marcadores', () => {
    const identity = parseLegalIdentity({ LEGAL_OWNER_EMAIL: 'contacto@example.test' });
    expect(identity.email).toEqual({ value: 'contacto@example.test', configured: true });
    expect(identity.name.configured).toBe(false);
    expect(identity.missing).toHaveLength(3);
  });
});

describe('parseLegalIdentity — valores inválidos', () => {
  it('un correo que no lo es falla nombrando la variable, sin el valor', () => {
    expect(() =>
      parseLegalIdentity({ ...COMPLETE_ENV, LEGAL_OWNER_EMAIL: 'no-es-un-correo' })
    ).toThrow(InvalidLegalIdentityError);
    try {
      parseLegalIdentity({ ...COMPLETE_ENV, LEGAL_OWNER_EMAIL: 'no-es-un-correo' });
    } catch (error) {
      expect((error as Error).message).toContain('LEGAL_OWNER_EMAIL');
      expect((error as Error).message).not.toContain('no-es-un-correo');
    }
  });

  it('un dato con marcado o caracteres de control falla (se pinta como texto, pero se rechaza)', () => {
    expect(() => parseLegalIdentity({ ...COMPLETE_ENV, LEGAL_OWNER_NAME: '<b>Ana</b>' })).toThrow(
      InvalidLegalIdentityError
    );
    expect(() =>
      parseLegalIdentity({ ...COMPLETE_ENV, LEGAL_OWNER_ADDRESS: 'Calle\u0000Mayor' })
    ).toThrow(InvalidLegalIdentityError);
  });

  it('un dato desmesurado falla', () => {
    expect(() =>
      parseLegalIdentity({ ...COMPLETE_ENV, LEGAL_OWNER_ADDRESS: 'x'.repeat(301) })
    ).toThrow(InvalidLegalIdentityError);
    expect(
      parseLegalIdentity({ ...COMPLETE_ENV, LEGAL_OWNER_ADDRESS: 'x'.repeat(300) }).address
        .configured
    ).toBe(true);
  });
});

describe('legalIdentityStartupWarning — aviso de arranque en producción (no es un fallo)', () => {
  it('producción con identidad incompleta: un aviso que nombra las variables que faltan', () => {
    const warning = legalIdentityStartupWarning(
      parseLegalIdentity({ LEGAL_OWNER_NAME: 'Ana' }),
      'production'
    );
    expect(warning).not.toBeNull();
    expect(warning).toContain('LEGAL_OWNER_TAX_ID');
    expect(warning).toContain('LEGAL_OWNER_ADDRESS');
    expect(warning).toContain('LEGAL_OWNER_EMAIL');
    expect(warning).not.toContain('LEGAL_OWNER_NAME');
  });

  it('producción con la identidad completa: sin aviso', () => {
    expect(legalIdentityStartupWarning(parseLegalIdentity(COMPLETE_ENV), 'production')).toBeNull();
  });

  it('fuera de producción no avisa aunque falte todo', () => {
    expect(legalIdentityStartupWarning(parseLegalIdentity({}), 'development')).toBeNull();
    expect(legalIdentityStartupWarning(parseLegalIdentity({}), undefined)).toBeNull();
    expect(legalIdentityStartupWarning(parseLegalIdentity({}), 'test')).toBeNull();
  });

  it('el aviso no incluye los valores configurados', () => {
    const warning = legalIdentityStartupWarning(
      parseLegalIdentity({ LEGAL_OWNER_EMAIL: 'contacto@example.test' }),
      'production'
    );
    expect(warning).not.toBeNull();
    expect(warning).not.toContain('contacto@example.test');
  });
});
