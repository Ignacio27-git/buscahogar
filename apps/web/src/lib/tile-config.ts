// ROADMAP 3.4 (decisión 261, enmienda la 112; R9.1, R9.2, PD6, PD11) — configuración de las teselas del
// mapa: plantilla de URL, origen que la CSP admite en `img-src` y atribución. TODO sale de aquí: lo leen
// `next.config.ts` (CSP), el servidor (props de los mapas) y los tests, así que el host de la CSP y el de las
// imágenes no pueden divergir.
//
// Sin dependencias de Next ni de `server-only`: `next.config.ts` lo importa al arrancar. Las variables son
// `TILE_URL_TEMPLATE` y `TILE_ATTRIBUTION` (de servidor, nunca `NEXT_PUBLIC_*`). Sin definir, las teselas
// estándar de OpenStreetMap (NF5). Una plantilla propia:
//   - es https, con UN solo host (sin `{s}`), sin credenciales ni fragmento;
//   - contiene `{z}`, `{x}` y `{y}` y ningún otro marcador;
//   - PUEDE llevar una cadena de consulta con parámetros literales: una clave PUBLICABLE restringida por
//     dominio. Esa clave llega a todos los navegadores; jamás debe ser un secreto (decisión 261, PD11).
// La cadena de consulta no entra en la CSP: solo el origen.
import { z } from 'zod';

export const DEFAULT_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_COPYRIGHT_HREF = 'https://www.openstreetmap.org/copyright';
const MAX_ATTRIBUTION_LENGTH = 200;
const TEMPLATE_PLACEHOLDER = /\{([^{}]*)\}/g;
const REQUIRED_PLACEHOLDERS = ['z', 'x', 'y'] as const;

// SMV-9 (ODbL): enlace de copyright obligatorio mientras se usen las teselas de OpenStreetMap.
export interface TileAttribution {
  readonly prefix: string;
  readonly label: string;
  // null: la atribución de un proveedor propio es texto plano, sin enlace.
  readonly href: string | null;
}

export interface TileConfig {
  readonly urlTemplate: string;
  // Origen (esquema + host + puerto) para `img-src`: nunca la ruta ni la consulta.
  readonly imgSrcOrigin: string;
  readonly attribution: TileAttribution;
}

// Lo que cruza al navegador: solo cadenas serializables (props de un componente de cliente).
export interface MapTiles {
  readonly urlTemplate: string;
  readonly attributionHtml: string;
}

// Solo se leen `TILE_URL_TEMPLATE` y `TILE_ATTRIBUTION`; el tipo admite `process.env` tal cual.
export type TileEnv = Readonly<Record<string, string | undefined>>;

// El mensaje nombra la variable y el motivo, nunca el valor: la plantilla puede llevar una clave.
export class InvalidTileConfigError extends Error {}

const DEFAULT_ATTRIBUTION: TileAttribution = {
  prefix: '© ',
  label: 'OpenStreetMap',
  href: OSM_COPYRIGHT_HREF,
};

function isUnset(value: string | undefined): boolean {
  return value === undefined || value === '';
}

const attributionSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(MAX_ATTRIBUTION_LENGTH))
  // Texto plano: sin marcado ni caracteres de control. Se pinta escapado, nunca como HTML.
  .refine((value) => !/[<>]/.test(value) && !/\p{Cc}/u.test(value));

function placeholdersOf(template: string): string[] {
  return Array.from(template.matchAll(TEMPLATE_PLACEHOLDER), (match) => match[1] ?? '');
}

function parseTemplate(template: string): string | null {
  const placeholders = placeholdersOf(template);
  const known = REQUIRED_PLACEHOLDERS.every((name) => placeholders.includes(name));
  const unknown = placeholders.some((name) => !(REQUIRED_PLACEHOLDERS as readonly string[]).includes(name));
  if (!known || unknown || template.includes('#')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(template);
  } catch {
    return null;
  }
  // Un `{s}` o un comodín en el host no son un host válido; `URL` ya los rechaza. Las comprobaciones
  // restantes cierran lo que `URL` acepta: http, credenciales y un host con marcadores.
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') {
    return null;
  }
  if (url.hostname === '' || /[{}*]/.test(url.hostname)) {
    return null;
  }
  return url.origin;
}

export function parseTileConfig(env: TileEnv): TileConfig {
  const rawTemplate = env.TILE_URL_TEMPLATE;
  const rawAttribution = env.TILE_ATTRIBUTION;

  const template = rawTemplate === undefined || rawTemplate === '' ? DEFAULT_TILE_URL_TEMPLATE : rawTemplate;
  const origin = parseTemplate(template);
  if (origin === null) {
    throw new InvalidTileConfigError(
      'TILE_URL_TEMPLATE no es válida: debe ser https con un único host, sin credenciales, sin fragmento ni ' +
        '{s}, y contener {z}, {x} y {y} (y ningún otro marcador). Puede llevar una cadena de consulta con una ' +
        'clave publicable (docs/DECISIONS.md, decisión 261).'
    );
  }

  const isDefaultProvider = template === DEFAULT_TILE_URL_TEMPLATE;
  if (isUnset(rawAttribution) && isDefaultProvider) {
    return { urlTemplate: template, imgSrcOrigin: origin, attribution: DEFAULT_ATTRIBUTION };
  }
  if (isDefaultProvider) {
    throw new InvalidTileConfigError(
      'TILE_ATTRIBUTION requiere TILE_URL_TEMPLATE: la atribución de OpenStreetMap (ODbL) no se sustituye ' +
        'mientras se usen sus teselas (docs/DECISIONS.md, decisión 261).'
    );
  }

  const attribution = attributionSchema.safeParse(rawAttribution ?? '');
  if (!attribution.success) {
    throw new InvalidTileConfigError(
      'TILE_ATTRIBUTION es obligatoria con un proveedor de teselas propio: texto plano no vacío, sin ' +
        `marcado, de hasta ${String(MAX_ATTRIBUTION_LENGTH)} caracteres (docs/DECISIONS.md, decisión 261).`
    );
  }
  return {
    urlTemplate: template,
    imgSrcOrigin: origin,
    attribution: { prefix: '', label: attribution.data, href: null },
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// HTML que Leaflet inserta en su control de atribución. Todo el texto se escapa; el único enlace es el
// `href` fijado en código (el de OpenStreetMap), nunca un valor de entorno.
export function renderAttributionHtml(attribution: TileAttribution): string {
  const label = escapeHtml(attribution.label);
  const body = attribution.href === null ? label : `<a href="${escapeHtml(attribution.href)}">${label}</a>`;
  return `${escapeHtml(attribution.prefix)}${body}`;
}

export function toMapTiles(config: TileConfig): MapTiles {
  return { urlTemplate: config.urlTemplate, attributionHtml: renderAttributionHtml(config.attribution) };
}
