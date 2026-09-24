// Paso 1.14 — parseFeed + rawPropertySchema sobre el fixture hand-authored
// (diseño D3/D5). RED inicial: ni feed-parser.ts ni raw-property.schema.ts
// existen todavía — el import de más abajo falla a fallar por el motivo
// correcto (módulo inexistente).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseFeed } from '../src/sources/kyero/feed-parser.js';
import { rawPropertySchema } from '../src/sources/kyero/raw-property.schema.js';
import { KyeroFeedParseError } from '../src/sources/kyero/errors.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/kyero/feed-sample.xml', import.meta.url));
const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

describe('parseFeed — feed hand-authored (7 propiedades, tarea 1.2)', () => {
  it('parsea el fixture a 7 elementos crudos', () => {
    const elements = parseFeed(FIXTURE_XML);
    expect(elements).toHaveLength(7);
  });

  it('una imagen única se convierte en array de longitud 1 (isArray, G3)', () => {
    const elements = parseFeed(FIXTURE_XML) as Record<string, unknown>[];
    const p1 = elements[0] as { images?: { image?: unknown[] } };
    expect(Array.isArray(p1.images?.image)).toBe(true);
    expect(p1.images?.image).toHaveLength(1);
  });

  it('<id>00123</id> se conserva como el string "00123", nunca como el número 123', () => {
    const elements = parseFeed(FIXTURE_XML) as Record<string, unknown>[];
    const p2 = elements[1] as { id: unknown };
    expect(p2.id).toBe('00123');
    expect(typeof p2.id).toBe('string');
  });

  it('un feed sin root <kyero> se rechaza sin producir ninguna página parcial', () => {
    expect(() => parseFeed('<notkyero><property><id>1</id></property></notkyero>')).toThrow(KyeroFeedParseError);
  });

  it('un feed mal formado (XML inválido) se rechaza', () => {
    expect(() => parseFeed('esto no es XML en absoluto')).toThrow(KyeroFeedParseError);
  });

  it('un feed sin ninguna propiedad devuelve un array vacío, no un rechazo', () => {
    const elements = parseFeed('<kyero><feed_generation>1</feed_generation></kyero>');
    expect(elements).toEqual([]);
  });
});

describe('rawPropertySchema — validación por-propiedad (tarea 2.1, D5)', () => {
  it('valida las 6 propiedades elegibles del fixture (todas salvo P7, sin price)', () => {
    const elements = parseFeed(FIXTURE_XML);
    const results = elements.map((element) => rawPropertySchema.safeParse(element));
    const validCount = results.filter((result) => result.success).length;
    expect(validCount).toBe(6);
  });

  it('P7 (sin <price>) falla la validación del esquema', () => {
    const elements = parseFeed(FIXTURE_XML) as Record<string, unknown>[];
    const p7 = elements[6];
    expect(p7).toBeDefined();
    expect((p7 as { id: unknown }).id).toBe('1007');
    expect(rawPropertySchema.safeParse(p7).success).toBe(false);
  });

  it('el price parseado de P1 es el número 185000, no el string "185000"', () => {
    const elements = parseFeed(FIXTURE_XML);
    const parsed = rawPropertySchema.parse(elements[0]);
    expect(parsed.price).toBe(185000);
    expect(typeof parsed.price).toBe('number');
  });

  it('un price no numérico (p.ej. "POA") falla la validación, nunca se coacciona a 0', () => {
    const malformed = { id: '999', price: 'POA', type: 'flat', url: 'https://example.test/999' };
    expect(rawPropertySchema.safeParse(malformed).success).toBe(false);
  });
});
