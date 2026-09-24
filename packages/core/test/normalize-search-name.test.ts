import { describe, expect, it } from 'vitest';

import { normalizeSearchName } from '../src/normalize-search-name.js';

// ROADMAP 1.13 (diseño DD-1/DD-22, arbitraje CR-13) — plegado de acentos y
// minúsculas compartido entre el conversor del catálogo (packages/db,
// `locations.search_name`) y la web (pliega la consulta del usuario). Una
// sola implementación para que ambos lados nunca diverjan.
//
// Sin ella el autocompletado falla para una fracción grande de España:
// Málaga, Cádiz y cualquier nombre con Á/À. `unaccent()` de PostgreSQL es
// STABLE, no IMMUTABLE, así que no puede respaldar una columna generada ni
// un índice de expresión — de ahí que el plegado viva en TypeScript, no en
// SQL (CR-13).
describe('normalizeSearchName (DD-22, CR-13)', () => {
  it('pliega un nombre con tilde y lo pasa a minúsculas: "Málaga" → "malaga"', () => {
    expect(normalizeSearchName('Málaga')).toBe('malaga');
  });

  it('pliega la cedilla y la tilde de "Cádiz" → "cadiz"', () => {
    expect(normalizeSearchName('Cádiz')).toBe('cadiz');
  });

  it('colapsa espacios internos múltiples a uno solo, tras recortar los extremos', () => {
    expect(normalizeSearchName('  San   Sebastián  ')).toBe('san sebastian');
  });

  it('dos formas de escritura distintas del mismo nombre acentuado normalizan igual (invariante que evita el drift converter/web)', () => {
    const decomposed = 'Alcalá de Henares'; // 'á' como 'a' + combining acute (NFD)
    const precomposed = 'Alcalá de Henares'; // 'á' como carácter precompuesto (NFC)

    expect(normalizeSearchName(decomposed)).toBe(normalizeSearchName(precomposed));
    expect(normalizeSearchName(precomposed)).toBe('alcala de henares');
  });

  it('un nombre ya en minúsculas y sin acentos queda invariante', () => {
    expect(normalizeSearchName('granada')).toBe('granada');
  });
});
