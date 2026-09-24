// Sonda de la API de Idealista (paso 1.5) — anonimizador.
//
// Todos los casos usan objetos sintéticos escritos a mano: nunca una fixture
// real ni una llamada de red (REQ-ANON, "Anonymiser tests use synthetic data
// only"). El anonimizador es puro, así que cada caso puede fallar de verdad.
import { describe, expect, it } from 'vitest';

import { anonymise, type Json, type RedactionFinding } from '../scripts/probe/anonymise.js';

// Helpers de estrechado de tipos para no usar `any` al inspeccionar la salida,
// que es `Json` (un tipo unión). Aceptan `undefined` porque
// `noUncheckedIndexedAccess` tipa el acceso por clave a un objeto indexado
// como `Json | undefined`, aunque la clave exista siempre en estos casos
// sintéticos controlados por el propio test.
function asObject(value: Json | undefined): { readonly [key: string]: Json } {
  if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  throw new TypeError('se esperaba un objeto JSON');
}

function asArray(value: Json | undefined): readonly Json[] {
  if (Array.isArray(value)) return value;
  throw new TypeError('se esperaba un array JSON');
}

function asString(value: Json | undefined): string {
  if (typeof value === 'string') return value;
  throw new TypeError('se esperaba una cadena JSON');
}

function findFinding(
  findings: readonly RedactionFinding[],
  path: string
): RedactionFinding | undefined {
  return findings.find((finding) => finding.path === path);
}

describe('anonymise', () => {
  it('abre una zona PII cuando una clave coincide con el patrón, heredada por los descendientes', () => {
    const input: Json = {
      contactInfo: {
        commercialName: 'Juan Pérez',
        nested: { deeplyNestedName: 'Ana López' },
      },
    };

    const { document } = anonymise(input);
    const contactInfo = asObject(asObject(document).contactInfo);
    const nested = asObject(contactInfo.nested);

    expect(asString(contactInfo.commercialName)).toBe('[REDACTED]');
    expect(asString(nested.deeplyNestedName)).toBe('[REDACTED]');
  });

  it('conserva userType y los booleanos, preserva null y sustituye number por 0 dentro de una zona', () => {
    const input: Json = {
      contactInfo: {
        userType: 'agency',
        isPro: true,
        photo: null,
        extensions: 3,
      },
    };

    const { document } = anonymise(input);
    const contactInfo = asObject(asObject(document).contactInfo);

    expect(contactInfo.userType).toBe('agency');
    expect(contactInfo.isPro).toBe(true);
    expect(contactInfo.photo).toBeNull();
    expect(contactInfo.extensions).toBe(0);
  });

  it('redacta una clave no reconocida dentro de una zona en lugar de dejarla pasar', () => {
    const input: Json = {
      contactInfo: { brandNewField: 'sensitive-value' },
    };

    const { document } = anonymise(input);
    const contactInfo = asObject(asObject(document).contactInfo);

    expect(asString(contactInfo.brandNewField)).toBe('[REDACTED]');
  });

  it('enmascara los dígitos de una cadena con forma de teléfono dentro de una zona, preservando puntuación y longitud', () => {
    const original = '+34 612 345 678';
    const input: Json = { contactInfo: { phone1: original } };

    const { document } = anonymise(input);
    const contactInfo = asObject(asObject(document).contactInfo);
    const masked = asString(contactInfo.phone1);

    expect(masked).toBe('+00 000 000 000');
    expect(masked).toHaveLength(original.length);
  });

  it('redacta cualquier otra cadena dentro de una zona al literal [REDACTED]', () => {
    const input: Json = { contactInfo: { commercialName: 'Some Agency S.L.' } };

    const { document } = anonymise(input);
    const contactInfo = asObject(asObject(document).contactInfo);

    expect(asString(contactInfo.commercialName)).toBe('[REDACTED]');
  });

  it('reescribe un email encontrado en texto libre a [REDACTED_EMAIL]', () => {
    const input: Json = {
      description: 'Piso luminoso. Contactar a ventas@ejemplo.com para más información.',
    };

    const { document, report } = anonymise(input);

    expect(document).toEqual({
      description: 'Piso luminoso. Contactar a [REDACTED_EMAIL] para más información.',
    });
    expect(findFinding(report.findings, 'description')).toEqual({
      path: 'description',
      kind: 'email',
      action: 'rewritten',
    });
  });

  it('reescribe un patrón de teléfono en description/title/subtitle a [REDACTED_PHONE]', () => {
    const input: Json = { description: 'Llamar al 612345678 para visitar el piso.' };

    const { document, report } = anonymise(input);

    expect(document).toEqual({ description: 'Llamar al [REDACTED_PHONE] para visitar el piso.' });
    expect(findFinding(report.findings, 'description')).toEqual({
      path: 'description',
      kind: 'phone',
      action: 'rewritten',
    });
  });

  it('reescribe un patrón de teléfono en cualquier campo cuyo valor mida 40 caracteres o más', () => {
    const longValue = 'Referencia interna del inmueble, contactar al 612345678 si hay dudas.';
    expect(longValue.length).toBeGreaterThanOrEqual(40);
    const input: Json = { notes: longValue };

    const { document } = anonymise(input);

    expect(document).toEqual({ notes: longValue.replace('612345678', '[REDACTED_PHONE]') });
  });

  it('conserva un valor con forma de teléfono en un campo identificador corto y lo marca para revisión manual sin registrar el valor', () => {
    const input: Json = { propertyCode: '912345678' };

    const { document, report } = anonymise(input);

    expect(document).toEqual({ propertyCode: '912345678' });
    expect(findFinding(report.findings, 'propertyCode')).toEqual({
      path: 'propertyCode',
      kind: 'phone',
      action: 'review-required',
    });
    expect(JSON.stringify(report.findings)).not.toContain('912345678');
  });

  it('preserva el conjunto de claves, la longitud de los arrays y el tipo de cada hoja en objetos y arrays anidados', () => {
    const inputItem = {
      propertyCode: '912345678',
      price: 250000,
      description: 'Bonito piso, contactar a agente@ejemplo.com',
      detailedType: { typology: 'flat', subTypology: null },
      tags: ['exterior', 'reformado'],
      contactInfo: { commercialName: 'Agencia X', userType: 'agency', showAddress: true },
    };
    const input: Json = { elementList: [inputItem], total: 1 };

    const { document } = anonymise(input);
    const elementList = asArray(asObject(document).elementList);
    expect(elementList).toHaveLength(1);

    const item = asObject(elementList[0]);
    expect(Object.keys(item).sort()).toEqual(Object.keys(inputItem).sort());

    const tags = asArray(item.tags);
    expect(tags).toHaveLength(inputItem.tags.length);

    expect(typeof item.propertyCode).toBe('string');
    expect(typeof item.price).toBe('number');
    expect(typeof item.description).toBe('string');

    const detailedType = asObject(item.detailedType);
    expect(detailedType.subTypology).toBeNull();

    const contactInfo = asObject(item.contactInfo);
    expect(Object.keys(contactInfo).sort()).toEqual(Object.keys(inputItem.contactInfo).sort());
    expect(typeof contactInfo.showAddress).toBe('boolean');
  });
});
