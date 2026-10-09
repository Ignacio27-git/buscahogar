// D.15 (F7, R12, decisión 199) — el prefijo de la atribución de Leaflet lleva un
// `title` en inglés («A JavaScript library for interactive maps») que incumple
// 3.1.2 en una aplicación en español. Quitar el atributo no cambia nada de lo visible.
import { describe, expect, it } from 'vitest';

import { stripPrefixTitles } from '@/lib/map-attribution';

// Forma del prefijo por defecto de Leaflet 1.9.4: enlace con `title` + bandera en línea.
const LEAFLET_PREFIX =
  '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">' +
  '<svg aria-hidden="true" class="leaflet-attribution-flag"></svg> Leaflet</a>';

describe('stripPrefixTitles (D.15)', () => {
  it('quita el título en inglés y conserva el enlace, la bandera y el texto', () => {
    const result = stripPrefixTitles(LEAFLET_PREFIX);
    expect(result).not.toContain('title=');
    expect(result).not.toContain('A JavaScript library');
    expect(result).toBe(
      '<a href="https://leafletjs.com"><svg aria-hidden="true" class="leaflet-attribution-flag"></svg> Leaflet</a>'
    );
  });

  it('quita todos los títulos si hay varios y deja intacto un prefijo sin título', () => {
    expect(stripPrefixTitles('<a href="/a" title="uno">A</a><a href="/b" title="dos">B</a>')).toBe(
      '<a href="/a">A</a><a href="/b">B</a>'
    );
    expect(stripPrefixTitles('<a href="/a">A</a>')).toBe('<a href="/a">A</a>');
  });
});
