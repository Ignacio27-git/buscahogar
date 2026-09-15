import { describe, expect, it } from 'vitest';

import { body, head, isStreetLevel, normalise, scoreAddress } from '../src/strategies/rule-based/address.js';
import { STREET_TOKENS_OBSERVED } from '../src/strategies/rule-based/address.js';

// ADX-1: pipeline de normalización de direcciones (decisión 047).
//
// Todos los literales de este fichero son cadenas reales copiadas a mano de
// los fixtures comprometidos de ingesta (nunca importados —
// apps/ingestion/test/fixtures/idealista/search-{homes,premises}-2026-09-10.json
// cruzaría la frontera del paquete). Las líneas exactas están citadas junto
// a cada literal para que quede trazable.
describe('normalise', () => {
  it('pliega acentos (NFD), pasa a minúsculas, colapsa espacios y recorta', () => {
    expect(normalise('  Piso   en  Trafalgar,   Madrid  ')).toBe('piso en trafalgar, madrid');
    expect(normalise('Ático en Glorieta de Ruiz Giménez, Malasaña-Universidad, Madrid')).toBe(
      'atico en glorieta de ruiz gimenez, malasana-universidad, madrid'
    );
  });
});

describe('body — ancla en el ÚLTIMO " en " antes de la primera coma', () => {
  it('recorta el prefijo "<Tipo> en " en el caso simple', () => {
    // search-homes-2026-09-10.json, 10/50 anuncios, la cadena street-less
    // medida en obs #143.
    expect(body('Piso en Trafalgar, Madrid')).toBe('trafalgar, madrid');
  });

  it('ADX-1b: ancla en el último " en ", no en el primero, ante un doble " en "', () => {
    // apps/ingestion/test/fixtures/idealista/search-premises-2026-09-10.json:21
    const doubleEn = 'Local en rentabilidad en Calle del León, Huertas-Cortes, Madrid';

    expect(body(doubleEn)).toBe('calle del leon, huertas-cortes, madrid');
    // Anclar en el PRIMER " en " habría producido "rentabilidad en calle del
    // leon, ...", perdiendo la clasificación de nivel de calle.
    expect(body(doubleEn)).not.toContain('rentabilidad');
  });

  it('ADX-1c: sin "<Tipo> en " reconocible, body es la cadena normalizada completa', () => {
    // apps/ingestion/test/fixtures/idealista/search-premises-2026-09-10.json:2751 —
    // el portal despoja la palabra de tipo de vía ("de la Reina", no "Calle
    // de la Reina"), pero conserva el patrón "<Tipo> en ".
    expect(body('Local en de la Reina, 5, Sol, Madrid')).toBe('de la reina, 5, sol, madrid');
  });

  it('sin ningún " en ", body es toda la cadena normalizada (degradación sin excepción)', () => {
    expect(body('Calle Mayor 5, Madrid')).toBe('calle mayor 5, madrid');
  });
});

describe('head — primer segmento de body, hasta la primera coma', () => {
  it('devuelve el segmento antes de la primera coma', () => {
    expect(head('Piso en Calle de Sagasta, Trafalgar, Madrid')).toBe('calle de sagasta');
  });

  it('devuelve la cadena completa si no hay coma', () => {
    expect(head('Piso en Trafalgar')).toBe('trafalgar');
  });
});

describe('isStreetLevel — cada token de STREET_TOKENS_OBSERVED contra un literal real', () => {
  it('"calle" — search-homes-2026-09-10.json', () => {
    expect(isStreetLevel('Piso en Calle de Sagasta, Trafalgar, Madrid')).toBe(true);
  });

  it('"cl" (abreviatura) — search-homes-2026-09-10.json', () => {
    expect(isStreetLevel('Piso en CL Eguilaz, 6, Trafalgar, Madrid')).toBe(true);
  });

  it('"glorieta" — search-homes-2026-09-10.json', () => {
    expect(isStreetLevel('Ático en Glorieta de Ruiz Giménez, Malasaña-Universidad, Madrid')).toBe(true);
  });

  it('"plaza" — search-premises-2026-09-10.json', () => {
    expect(isStreetLevel('Local o nave en Plaza de Pedro Zerolo, Chueca-Justicia, Madrid')).toBe(true);
  });

  it('la lista OBSERVED contiene exactamente los cuatro tokens medidos, ni uno más', () => {
    expect(STREET_TOKENS_OBSERVED).toEqual(['calle', 'cl', 'glorieta', 'plaza']);
  });

  it('un nombre de calle sin ningún token no es de nivel de calle', () => {
    // search-homes-2026-09-10.json — aparece también con "Calle de" en otro
    // anuncio distinto; esta variante concreta carece de token.
    expect(isStreetLevel('Piso en San Andres, Malasaña-Universidad, Madrid')).toBe(false);
  });

  it('ADX-1c: el caso sin palabra de tipo tampoco es de nivel de calle', () => {
    expect(isStreetLevel('Local en de la Reina, 5, Sol, Madrid')).toBe(false);
  });

  it('ADX-1a: la presencia del token es una propiedad de la cadena compartida — nunca "en un lado sí, en el otro no"', () => {
    // Comparar `isStreetLevel(x)` consigo misma no demostraría nada: es pura y
    // determinista, así que esa igualdad se cumple con cualquier implementación,
    // correcta o no. Lo que ADX-1a exige probar es que DOS lados distintos de un
    // par ya considerado igual no pueden discrepar. `ladoA` es el literal real
    // (search-homes-2026-09-10.json); `ladoB` es una variante deliberada del
    // mismo, no una línea de fixture: cambia mayúsculas, acentos y espaciado,
    // que es justo lo que `normalise` neutraliza antes de anclar el cuerpo.
    const ladoA = 'Piso en Calle de Sagasta, Trafalgar, Madrid';
    const ladoB = 'PISO  EN   Cálle de Sagasta,  Trafalgar, Madrid ';

    expect(ladoA).not.toBe(ladoB);
    expect(body(ladoA)).toBe(body(ladoB));
    expect(isStreetLevel(ladoA)).toBe(isStreetLevel(ladoB));
    expect(isStreetLevel(ladoA)).toBe(true);
  });
});

describe('scoreAddress — la escalera completa de cuatro filas (ADX-2..ADX-5)', () => {
  it('ADX-2: cuerpos iguales y de nivel de calle → addressExact fuerte, addressZone ausente', () => {
    const result = scoreAddress('Piso en Calle de Sagasta 12, Madrid', 'Piso en Calle de Sagasta 12, Madrid');

    expect(result.addressExact).toEqual({ value: 1, weight: 25, detail: expect.any(String) as string });
    expect(result.addressZone.weight).toBe(0);
  });

  it('ADX-3: cuerpos iguales, sin nivel de calle (street-less) → addressZone débil, addressExact ausente', () => {
    // La cadena street-less medida: 10/50 anuncios, 45 pares (obs #143).
    const result = scoreAddress('Piso en Trafalgar, Madrid', 'Piso en Trafalgar, Madrid');

    expect(result.addressZone).toEqual({ value: 1, weight: 8, detail: expect.any(String) as string });
    expect(result.addressExact.weight).toBe(0);
  });

  it('ADX-4: cuerpos distintos → addressExact en desacuerdo, peso débil (8), nunca peso 0 ni el fuerte (25)', () => {
    const result = scoreAddress('Piso en Trafalgar, Madrid', 'Piso en Calle de Sagasta, Trafalgar, Madrid');

    expect(result.addressExact.value).toBe(0);
    expect(result.addressExact.weight).toBe(8);
    expect(result.addressZone.weight).toBe(0);
  });

  it('ADX-5: dirección ausente en un lado → ambas claves marcadas ausentes (peso 0), nunca en desacuerdo', () => {
    const result = scoreAddress(undefined, 'Piso en Trafalgar, Madrid');

    expect(result.addressExact).toEqual({ value: 0, weight: 0, detail: expect.any(String) as string });
    expect(result.addressZone).toEqual({ value: 0, weight: 0, detail: expect.any(String) as string });
  });

  it('ADX-5: dirección ausente en ambos lados → igual que ausente en uno solo', () => {
    const result = scoreAddress(undefined, undefined);

    expect(result.addressExact.weight).toBe(0);
    expect(result.addressZone.weight).toBe(0);
  });
});

// R8 (D11 del diseño): contraste ejecutable frente a la regla ingenua que
// docs/DECISIONS.md, decisión 047, prohíbe. packages/core/test/contracts.test.ts:51-63
// implementa `a.address === b.address` bajo el nombre 'acme-exact-address' —
// se queda como fixture de compilación de contratos (D6), pero este test
// demuestra por qué esa regla ingenua está mal, sin importar esa clase: la
// regla ingenua inlined aquí queda satisfecha por el mismo par que
// scoreAddress degrada a la banda de zona.
describe('R8 — contraste con la regla ingenua a.address === b.address', () => {
  it('un par que satisface la igualdad ingenua solo alcanza addressZone, nunca addressExact', () => {
    // Anotadas como `string` (no inferidas como el tipo literal): dos
    // anuncios reales distintos que EN TIEMPO DE EJECUCIÓN comparten la
    // misma cadena de dirección — el linter marcaría `a === b` como
    // siempre cierto si TypeScript viera ambas como el mismo literal.
    const addressA: string = 'Piso en Trafalgar, Madrid';
    const addressB: string = 'Piso en Trafalgar, Madrid';

    // La regla ingenua que decisión 047 prohíbe para una estrategia enviada.
    const naiveMatch = addressA === addressB;
    expect(naiveMatch).toBe(true);

    const result = scoreAddress(addressA, addressB);
    expect(result.addressZone.value).toBe(1);
    expect(result.addressZone.weight).toBe(8);
    expect(result.addressExact.weight).toBe(0);
  });
});
