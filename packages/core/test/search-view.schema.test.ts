// ROADMAP 2.6 (map-view-search, decisión 118) — `view` tiene su propio
// esquema y no forma parte del criterio de búsqueda.
import { describe, expect, it } from 'vitest';

import { searchViewSchema } from '../src/schemas/search-view.schema.js';

describe('searchViewSchema', () => {
  it('ausente equivale a list', () => {
    expect(searchViewSchema.parse(undefined)).toBe('list');
  });

  it.each(['list', 'map'] as const)('acepta %s', (value) => {
    expect(searchViewSchema.parse(value)).toBe(value);
  });

  it.each(['satellite', '', 'MAP', ' map', ['map', 'list']])('rechaza %j con mensaje que nombra view', (value) => {
    const result = searchViewSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('view');
  });
});
