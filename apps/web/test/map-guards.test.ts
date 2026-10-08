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
// D.11 (decisión 179): el host de teselas vive en un único módulo que importan
// el lienzo interactivo y el mapa estático de la ficha.
const TILE_MODULE = 'lib/osm-tiles.ts';
// D.8a (decisión 165): hoja de reglas propia del mapa, sin literales de color.
const MAP_STYLESHEET = 'components/search-map-canvas.css';
const DRAW_STATE = 'components/draw-polygon-state.ts';
const MAP_FILES = [WRAPPER, CANVAS, 'components/map-cluster-layer.tsx', 'components/map-draw-control.tsx'] as const;
// Marcado de servidor de la sección de mapa (atribución en el HTML del servidor).
const SERVER_MARKUP = 'app/page.tsx';
// D.11 (decisión 179): mapa estático de la ficha. Va FUERA de MAP_FILES a propósito: SMV-22
// (sin trama de aproximación en el mapa interactivo) debe seguir intacta.
const STATIC_MAP = 'components/property-location.tsx';

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
  const guarded = [...MAP_FILES, 'components/draw-polygon-state.ts', STATIC_MAP] as const;

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

describe('host de teselas — solo en lib/osm-tiles.ts (SMV-9, decisiones 112 y 179)', () => {
  it('ningún otro fichero de src/ contiene el host de teselas', () => {
    const tileModuleAbsolute = `${SRC_DIR}${TILE_MODULE}`;
    for (const file of collectSourceFiles(SRC_DIR)) {
      if (file === tileModuleAbsolute) {
        continue;
      }
      expect(readFileSync(file, 'utf8'), file).not.toContain(TILE_HOST);
    }
  });

  it('el módulo de teselas SÍ contiene la plantilla https', () => {
    expect(read(TILE_MODULE)).toContain(`https://${TILE_HOST}/{z}/{x}/{y}.png`);
  });

  it('el canvas importa la plantilla del módulo y la pasa a la <TileLayer>', () => {
    const source = read(CANVAS);
    expect(source).toMatch(/import \{[^}]*\bOSM_TILE_URL_TEMPLATE\b[^}]*\} from '@\/lib\/osm-tiles'/);
    expect(source).toContain('<TileLayer url={OSM_TILE_URL_TEMPLATE}');
  });

  it('el mapa estático de la ficha importa osmTileUrl del módulo de teselas', () => {
    expect(read(STATIC_MAP)).toMatch(/import \{[^}]*\bosmTileUrl\b[^}]*\} from '@\/lib\/osm-tiles'/);
  });

  it('el módulo de teselas no usa fetch ni HTML de cadena', () => {
    const source = read(TILE_MODULE);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
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

describe('atribución OSM del mapa estático de la ficha (D.11, decisión 179)', () => {
  it('contiene el literal "© OpenStreetMap" y el enlace exacto de copyright', () => {
    const source = read(STATIC_MAP);
    expect(source).toContain('© ');
    expect(source).toContain('OpenStreetMap');
    expect(source).toContain(`href="${COPYRIGHT_LINK}"`);
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

// D.8a (SMV-19, SMV-22; decisión 165) — el aspecto del mapa va en una hoja con tokens.
describe('estilos del mapa — tokens, sin literales ni estilos en línea (SMV-19)', () => {
  const styled = [...MAP_FILES, DRAW_STATE] as const;
  // Hex, rgb()/rgba(), hsl()/hsla() y oklch() escritos a mano.
  const COLOUR_LITERAL = /['"`:\s]#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;

  it('la hoja del mapa existe', () => {
    expect(existsSync(`${SRC_DIR}${MAP_STYLESHEET}`)).toBe(true);
  });

  it.each(styled)('%s no lleva literales de color', (relative) => {
    expect(read(relative)).not.toMatch(COLOUR_LITERAL);
  });

  it.each(styled)('%s no usa cssText, `style={` ni asigna propiedades de estilo', (relative) => {
    const source = read(relative);
    expect(source).not.toMatch(/cssText/);
    expect(source).not.toMatch(/\bstyle\s*=\s*\{/);
    // `elemento.style.propiedad = …`: el cursor del lienzo pasa a una clase.
    expect(source).not.toMatch(/\.style\.\w+\s*=/);
  });

  it('la hoja no usa !important ni literales de color y los colores salen de var()', () => {
    const sheet = read(MAP_STYLESHEET);
    expect(sheet).not.toMatch(/!important/);
    expect(sheet).not.toMatch(COLOUR_LITERAL);
    const colourDeclarations =
      sheet.match(
        /(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-color)?|outline(?:-color)?|fill|stroke)\s*:[^;]+;/gm
      ) ?? [];
    expect(colourDeclarations.length).toBeGreaterThan(0);
    for (const declaration of colourDeclarations) {
      expect(declaration, declaration).toMatch(/var\(--|none|transparent|inherit|currentColor/);
    }
  });

  it('la barra de dibujo usa la capa de controles del mapa por token', () => {
    const sheet = read(MAP_STYLESHEET);
    const toolbar = /\.map-draw-toolbar\s*\{[^}]*\}/.exec(sheet)?.[0] ?? '';
    expect(toolbar).toMatch(/z-index:\s*var\(--z-map-controls\)/);
    expect(sheet).not.toMatch(/z-index:\s*\d/);
  });

  it('la barra se monta fuera del contenedor de Leaflet, en el marco', () => {
    const source = read('components/map-draw-control.tsx');
    expect(source).toMatch(/createPortal\(/);
    expect(source).toMatch(/getContainer\(\)\.parentElement/);
  });

  it('las clases de las capas vectoriales van como prop del constructor, no en pathOptions', () => {
    // react-leaflet aplica `pathOptions` con `setStyle` DESPUÉS de crear la capa y el
    // renderizador SVG de Leaflet 1.9.4 solo lee `className` al crearla (`_initPath`): la clase
    // nunca llegaba al `<path>` y las reglas de la hoja no se aplicaban (D.8b).
    for (const file of ['components/map-draw-control.tsx', CANVAS]) {
      expect(read(file), file).not.toMatch(/pathOptions=\{\{\s*className/);
    }
  });

  it('la hoja propia se importa DESPUÉS de las tres hojas de terceros, que se conservan', () => {
    const source = read(CANVAS);
    const order = [
      "import 'leaflet/dist/leaflet.css'",
      "import 'leaflet.markercluster/dist/MarkerCluster.css'",
      "import 'leaflet.markercluster/dist/MarkerCluster.Default.css'",
      "import './search-map-canvas.css'",
    ].map((statement) => source.indexOf(statement));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('`import L from leaflet` va antes de `leaflet.markercluster` (efecto lateral sobre L)', () => {
    const source = read('components/map-cluster-layer.tsx');
    const leaflet = source.indexOf("import L from 'leaflet'");
    const cluster = source.indexOf("import 'leaflet.markercluster'");
    expect(leaflet).toBeGreaterThanOrEqual(0);
    expect(cluster).toBeGreaterThan(leaflet);
  });

  it('las etiquetas y el popup se rellenan con textContent', () => {
    const source = read('components/map-cluster-layer.tsx');
    expect(source).toMatch(/\.textContent\s*=/);
    expect(source).toMatch(/createElement\(/);
  });
});

describe('fuera de alcance D.8a (SMV-22)', () => {
  it('ninguna clase ni trama distingue las posiciones aproximadas en el mapa', () => {
    for (const relative of [...MAP_FILES, MAP_STYLESHEET]) {
      expect(read(relative), relative).not.toMatch(/approx|aproxim|hatch|trama/i);
    }
  });

  it('no hay capa de teselas oscura: una sola <TileLayer>', () => {
    expect(read(CANVAS).match(/<TileLayer/g)).toHaveLength(1);
  });

  it('ningún filtro, desenfoque ni mezcla sobre las teselas (decisión 140)', () => {
    const sheet = read(MAP_STYLESHEET);
    expect(sheet).not.toMatch(/(?<![\w-])filter\s*:|backdrop-filter|mix-blend-mode/);
  });
});

// D.8b (SMV-22', SMV-23) — el teclado se admite SOLO en el manejador acotado del control
// de dibujo; la regla anterior («sin keydown») se reescribe, no se borra.
describe("teclado acotado al control de dibujo (SMV-22', SMV-23)", () => {
  const DRAW_CONTROL = 'components/map-draw-control.tsx';
  const KEY_API = /keydown|keyup|keypress|onKeyDown|onKeyUp|onKeyPress/;

  it('el manejador existe en el control y compara event.target con el contenedor', () => {
    const source = read(DRAW_CONTROL);
    expect(source).toMatch(/addEventListener\(\s*'keydown'/);
    expect(source).toMatch(/event\.target\s*!==\s*container/);
    expect(source).toMatch(/removeEventListener\(\s*'keydown'/);
  });

  it('ningún otro módulo del mapa ni la hoja contiene teclado', () => {
    for (const relative of MAP_FILES.filter((entry) => entry !== DRAW_CONTROL)) {
      expect(read(relative), relative).not.toMatch(KEY_API);
    }
  });

  it('sin escucha en document ni window', () => {
    const source = read(DRAW_CONTROL);
    expect(source).not.toMatch(/\b(?:document|window)\.addEventListener/);
  });

  it('el manejador ignora Ctrl/Alt/Meta y solo llama a preventDefault al actuar', () => {
    const source = read(DRAW_CONTROL);
    expect(source).toMatch(/ctrlKey/);
    expect(source).toMatch(/altKey/);
    expect(source).toMatch(/metaKey/);
  });

  it('la ventana emergente abierta se consulta por la API de Leaflet, no por el DOM', () => {
    const source = read(DRAW_CONTROL);
    expect(source).toMatch(/popupopen/);
    expect(source).toMatch(/popupclose/);
    expect(source).not.toMatch(/querySelector\([^)]*leaflet-popup/);
  });
});

describe('mira de dibujo y botones (SMV-26)', () => {
  it('la mira es aria-hidden y la hoja le quita los eventos de puntero', () => {
    expect(read('components/map-draw-control.tsx')).toMatch(
      /className="map-draw-crosshair"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*className="map-draw-crosshair"/s
    );
    const crosshair = /\.map-draw-crosshair\s*\{[^}]*\}/.exec(read(MAP_STYLESHEET))?.[0] ?? '';
    expect(crosshair).toMatch(/pointer-events:\s*none/);
    expect(crosshair).toMatch(/z-index:\s*var\(--z-map-controls\)/);
  });

  it('los botones de la barra declaran 1.5rem como mínimo en ambos ejes', () => {
    const button = /\.map-draw-toolbar button\s*\{[^}]*\}/.exec(read(MAP_STYLESHEET))?.[0] ?? '';
    expect(button).toMatch(/min-block-size:\s*1\.5rem/);
    expect(button).toMatch(/min-inline-size:\s*1\.5rem/);
  });

  it('el aviso role="status" nunca se monta de forma condicional y es el último hijo de la barra (SMV-24)', () => {
    const source = read('components/map-draw-control.tsx');
    expect(source).toMatch(/<p role="status" className="map-draw-status">/);
    // Sin `&&` ni ternario inmediatamente antes de la etiqueta.
    expect(source).not.toMatch(/(?:&&|\?|:)\s*\(?\s*<p role="status"/);
    expect(source).toMatch(/<\/p>\s*<\/div>\s*\);/);
  });
});

// D.13b (decisión 185) — el zoom y el cierre del popup usan el conjunto de iconos dibujados.
describe('iconos del mapa (D.13b)', () => {
  it('el lienzo importa los marcados del zoom de ./icon y los pasa al ZoomControl', () => {
    const source = read(CANVAS);
    expect(source).toMatch(/import \{[^}]*\bZOOM_IN_MARKUP\b[^}]*\bZOOM_OUT_MARKUP\b[^}]*\} from '\.\/icon'/);
    expect(source).toContain('zoomInText={ZOOM_IN_MARKUP}');
    expect(source).toContain('zoomOutText={ZOOM_OUT_MARKUP}');
  });

  it('el cierre del popup cambia el glifo por un svg dibujado, una sola vez y con nombre «Cerrar»', () => {
    const source = read('components/map-cluster-layer.tsx');
    expect(source).toMatch(/createIconElement\('close'\)/);
    expect(source).toMatch(/querySelector\('svg'\)/);
    expect(source).toContain("'Cerrar'");
  });

  it('el módulo de iconos no es de cliente y no compone HTML de cadena con datos', () => {
    const source = read('components/icon.tsx');
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });

  it('la hoja del mapa centra y dimensiona el icono de zoom y de cierre', () => {
    const sheet = read(MAP_STYLESHEET);
    expect(sheet).toMatch(/\.leaflet-bar a\s*\{[^}]*display:\s*grid/);
    expect(sheet).toMatch(/\.leaflet-popup-close-button\s*\{[^}]*display:\s*grid/);
    expect(sheet).toMatch(/\.icon\s*\{[^}]*inline-size:\s*1rem/);
  });
});
