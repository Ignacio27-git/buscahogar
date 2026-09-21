// ROADMAP 1.13 (diseño DD-4, DD-8, Q2) — une el registro INE con las
// entidades NGMEP por el prefijo de 5 dígitos, resuelve la fila
// representante por municipio con tres niveles deterministas y reporta QUÉ
// nivel resolvió cada uno (nunca asumido "exactamente una fila", medido).
import { describe, expect, it } from 'vitest';

import type { IneRegisterRow } from '../../src/catalogue/ine-register.js';
import { joinCatalogue, MalformedIneCodeError } from '../../src/catalogue/join.js';
import type { NgmepRow } from '../../src/catalogue/ngmep-parse.js';

function ine(overrides: Partial<IneRegisterRow> = {}): IneRegisterRow {
  return {
    ineCode: '18087',
    municipality: 'Granada',
    province: 'Granada',
    provinceCode: '18',
    autonomousCommunity: 'Andalucia',
    ...overrides,
  };
}

function ngmep(overrides: Partial<NgmepRow> = {}): NgmepRow {
  return { entityCode: '18087000000', name: 'Granada', latitude: 37.177336, longitude: -3.598557, ...overrides };
}

describe('joinCatalogue (DD-4, Q2) — tier 1/2/3 deterministas, reportados por municipio', () => {
  it('TIER 1: prefiere la entidad con sufijo "000000" (la fila municipal propiamente dicha), aunque haya otras hermanas', () => {
    const result = joinCatalogue(
      [ine()],
      [ngmep({ entityCode: '18087000000', name: 'Granada' }), ngmep({ entityCode: '18087010001', name: 'Zaidin' })]
    );

    expect(result.municipalities).toHaveLength(1);
    const granada = result.municipalities[0];
    expect(granada?.tier).toBe('tier-1');
    expect(granada?.centroidCandidate).toEqual({ latitude: 37.177336, longitude: -3.598557 });
    expect(granada?.siblingCoordinates).toHaveLength(2); // incluye la propia tier-1 como hermana para geo.ts
  });

  it('TIER 2: sin sufijo "000000", elige la hermana cuyo nombre normalizado coincide con el municipio — aunque tenga un código MÁS ALTO que otra hermana', () => {
    const result = joinCatalogue(
      [ine({ ineCode: '07040', municipality: 'Palma', province: 'Illes Balears', provinceCode: '07' })],
      [
        ngmep({ entityCode: '07040010001', name: 'Genova', latitude: 39.55, longitude: 2.6 }), // código más bajo, NO coincide
        ngmep({ entityCode: '07040090009', name: 'Palma', latitude: 39.5696, longitude: 2.6502 }), // coincide, código más alto
      ]
    );

    const palma = result.municipalities[0];
    expect(palma?.tier).toBe('tier-2');
    expect(palma?.centroidCandidate).toEqual({ latitude: 39.5696, longitude: 2.6502 });
  });

  it('TIER 3: sin "000000" y sin coincidencia de nombre, elige el código de entidad MÁS BAJO — un orden total, nunca arbitrario', () => {
    const result = joinCatalogue(
      [ine({ ineCode: '29067', municipality: 'Malaga', province: 'Malaga', provinceCode: '29' })],
      [
        ngmep({ entityCode: '29067020002', name: 'Malaga Norte', latitude: 36.75, longitude: -4.4 }),
        ngmep({ entityCode: '29067010001', name: 'Malaga Centro', latitude: 36.7213, longitude: -4.4213 }),
      ]
    );

    const malaga = result.municipalities[0];
    expect(malaga?.tier).toBe('tier-3');
    expect(malaga?.centroidCandidate).toEqual({ latitude: 36.7213, longitude: -4.4213 }); // '...010001' < '...020002'
  });

  it('UNMATCHED: un municipio sin ninguna entidad NGMEP hermana se reporta sin centroide candidato, nunca se cae del catálogo', () => {
    const result = joinCatalogue([ine({ ineCode: '99999', municipality: 'Sin NGMEP' })], []);

    const row = result.municipalities[0];
    expect(row?.tier).toBe('unmatched');
    expect(row?.centroidCandidate).toBeNull();
    expect(row?.siblingCoordinates).toHaveLength(0);
  });

  it('cada municipio de entrada produce exactamente una fila de salida ("exactamente una representante por municipio" queda MEDIDO, no asumido)', () => {
    const result = joinCatalogue(
      [ine({ ineCode: '18087' }), ine({ ineCode: '29067', municipality: 'Malaga', provinceCode: '29' })],
      [ngmep({ entityCode: '18087000000' }), ngmep({ entityCode: '29067010001', name: 'X' })]
    );

    expect(result.municipalities).toHaveLength(2);
  });

  it('DD-8: un ine_code de 6 dígitos aborta el join entero de forma explícita, nombrando el código ofensivo', () => {
    expect(() => joinCatalogue([ine({ ineCode: '180870' })], [])).toThrow(MalformedIneCodeError);
    try {
      joinCatalogue([ine({ ineCode: '180870' })], []);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('180870');
    }
  });

  it('DD-8: con --ine-code-width=6 explícito, el código de 6 dígitos se TRUNCA a sus 5 primeros y el recuento de truncados queda registrado', () => {
    const result = joinCatalogue([ine({ ineCode: '180870' })], [ngmep({ entityCode: '18087000000' })], {
      ineCodeWidth: 6,
    });

    expect(result.municipalities[0]?.ineCode).toBe('18087');
    expect(result.truncatedCount).toBe(1);
  });

  it('un ine_code que no tiene 5 NI 6 dígitos también aborta explícito', () => {
    expect(() => joinCatalogue([ine({ ineCode: '187' })], [])).toThrow(MalformedIneCodeError);
  });
});
