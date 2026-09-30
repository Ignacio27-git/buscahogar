// ROADMAP 2.6 (decisiones 112, 113 y 119; SMV-6, SMV-9, SMV-11, SMV-12) —
// guardas ESTÁTICAS de los ficheros del mapa. Recorren el código fuente, sin
// renderizar nada. Las aserciones de existencia fallan EN VOZ ALTA si falta
// alguno de los ficheros (una guarda que pasara sin fichero que vigilar sería
// un verde sin valor).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

const TILE_HOST = 'tile.openstreetmap.org';
const ATTRIBUTION_LITERAL = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const COPYRIGHT_LINK = 'https://www.openstreetmap.org/copyright';

// Rutas exactas relativas a `src/`.
const CANVAS = 'components/search-map-canvas.tsx';
const WRAPPER = 'components/search-map.tsx';
const MAP_FILES = [WRAPPER, CANVAS, 'components/map-cluster-layer.tsx', 'components/map-draw-control.tsx'] as const;
// Marcado de servidor de la sección de mapa (atribución en el HTML del servidor).
const SERVER_MARKUP = 'app/page.tsx';

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(`${fullPath}/`));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function read(relative: string): string {
  return readFileSync(`${SRC_DIR}${relative}`, 'utf8');
}

describe('ficheros del mapa — existencia', () => {
  it.each(MAP_FILES)('%s existe', (relative) => {
    expect(existsSync(`${SRC_DIR}${relative}`)).toBe(true);
  });
});

describe('ficheros del mapa — sin HTML de cadena y sin fetch (SMV-6, SMV-12)', () => {
  const guarded = [...MAP_FILES, 'components/draw-polygon-state.ts'] as const;

  it.each(guarded)('%s no usa innerHTML ni `html:` con cadena', (relative) => {
    const source = read(relative);
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    // `L.divIcon({ html: '<b>…' })` o con plantilla: solo se admite un nodo DOM.
    expect(source).not.toMatch(/\bhtml\s*:\s*['"`]/);
  });

  it.each(guarded)('%s no llama a fetch(', (relative) => {
    expect(read(relative)).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('host de teselas — solo en search-map-canvas.tsx (SMV-9, decisión 112)', () => {
  it('ningún otro fichero de src/ contiene el host de teselas', () => {
    const canvasAbsolute = `${SRC_DIR}${CANVAS}`;
    for (const file of collectSourceFiles(SRC_DIR)) {
      if (file === canvasAbsolute) {
        continue;
      }
      expect(readFileSync(file, 'utf8'), file).not.toContain(TILE_HOST);
    }
  });

  it('el canvas SÍ contiene la URL de teselas https', () => {
    expect(read(CANVAS)).toContain(`https://${TILE_HOST}/{z}/{x}/{y}.png`);
  });
});

describe('atribución OSM — literal y enlace de copyright (SMV-9, decisión 112)', () => {
  it('el canvas contiene el literal "© OpenStreetMap" enlazado a la página de copyright', () => {
    const source = read(CANVAS);
    expect(source).toContain(ATTRIBUTION_LITERAL);
    expect(source).toContain(COPYRIGHT_LINK);
  });

  it('el marcado de servidor de la sección de mapa contiene el literal y el enlace', () => {
    const source = read(SERVER_MARKUP);
    expect(source).toContain('© ');
    expect(source).toContain('OpenStreetMap');
    expect(source).toContain(COPYRIGHT_LINK);
  });
});

describe('frontera de cliente del mapa (SMV-11, decisión 113)', () => {
  it('solo search-map.tsx declara "use client"; canvas, capa de clústeres y control de dibujo no', () => {
    expect(read(WRAPPER)).toMatch(/^\s*['"]use client['"]/m);
    for (const relative of MAP_FILES.filter((entry) => entry !== WRAPPER)) {
      expect(read(relative), relative).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });

  it('el wrapper carga el canvas con next/dynamic y ssr:false', () => {
    const source = read(WRAPPER);
    expect(source).toMatch(/from\s+['"]next\/dynamic['"]/);
    expect(source).toMatch(/ssr\s*:\s*false/);
  });

  it('ningún fichero fuera del grafo del mapa importa leaflet ni react-leaflet', () => {
    const mapAbsolute = new Set(MAP_FILES.map((relative) => `${SRC_DIR}${relative}`));
    for (const file of collectSourceFiles(SRC_DIR)) {
      if (mapAbsolute.has(file)) {
        continue;
      }
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/from\s+['"](react-)?leaflet/);
    }
  });
});
