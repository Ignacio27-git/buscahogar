// ROADMAP 2.6 (map-view-search, decisión 115) — códec puro del polígono de
// búsqueda por zona dibujada. Sin Zod, sin PostGIS, sin ORM: la misma
// validación sirve al esquema de search params (frontera del servidor) y al
// control de dibujo del navegador (que la usa para no navegar con un anillo
// inválido).
//
// Formato del parámetro: `lat,lng;lat,lng;...` — anillo ABIERTO (la arista de
// cierre es implícita; repetir el primer vértice al final se rechaza) con a lo
// sumo 5 decimales. El servidor nunca redondea ni corrige: rechaza.
//
// Aritmética: cada coordenada tiene como mucho 5 decimales, así que
// `Math.round(x * 1e5)` es un entero exacto. Las diferencias caben en 3.6e7 y
// los productos cruzados en ~2.6e15 < 2^53, de modo que los tests de
// orientación son exactos (sin épsilon).

export interface PolygonVertex {
  readonly lat: number;
  readonly lon: number;
}

export type PolygonRing = readonly PolygonVertex[];

export type PolygonIssueCode =
  | 'too-long'
  | 'malformed'
  | 'out-of-range'
  | 'too-few'
  | 'too-many'
  | 'duplicate-vertex'
  | 'degenerate'
  | 'self-intersecting'
  | 'too-large';

export type PolygonParseResult =
  | { readonly ok: true; readonly ring: PolygonRing }
  | { readonly ok: false; readonly code: PolygonIssueCode; readonly message: string };

// Valores de diseño (decisión 115). 50 vértices × 21 caracteres máximos
// (`-179.12345,-89.12345;`) = 1.049 < 1.100.
export const POLYGON_MIN_VERTICES = 3;
export const POLYGON_MAX_VERTICES = 50;
export const POLYGON_MAX_PARAM_LENGTH = 1100;
export const POLYGON_MAX_AREA_KM2 = 2500;

const SCALE = 100_000;
const EARTH_RADIUS_KM = 6371;
const COORDINATE_PATTERN = /^-?\d{1,3}(\.\d{1,5})?$/;

const MESSAGES: Readonly<Record<PolygonIssueCode, string>> = {
  'too-long': `polygon: el valor supera los ${String(POLYGON_MAX_PARAM_LENGTH)} caracteres`,
  malformed: 'polygon: formato inválido, se esperaba lat,lng;lat,lng;... con hasta 5 decimales',
  'out-of-range': 'polygon: latitud fuera de [-90, 90] o longitud fuera de [-180, 180]',
  'too-few': `polygon: se necesitan al menos ${String(POLYGON_MIN_VERTICES)} vértices`,
  'too-many': `polygon: se admiten como máximo ${String(POLYGON_MAX_VERTICES)} vértices`,
  'duplicate-vertex': 'polygon: hay un vértice repetido (el anillo es abierto: no repitas el primero al final)',
  degenerate: 'polygon: todos los vértices están alineados, el área es cero',
  'self-intersecting': 'polygon: las aristas se cruzan o se tocan',
  'too-large': `polygon: el área supera el máximo de ${String(POLYGON_MAX_AREA_KM2)} km²`,
};

interface Issue {
  readonly code: PolygonIssueCode;
  readonly message: string;
}

function issue(code: PolygonIssueCode): Issue {
  return { code, message: MESSAGES[code] };
}

interface Point {
  readonly x: number; // longitud escalada
  readonly y: number; // latitud escalada
}

function toPoint(vertex: PolygonVertex): Point {
  return { x: Math.round(vertex.lon * SCALE), y: Math.round(vertex.lat * SCALE) };
}

// Producto cruzado (b − a) × (c − a): >0 giro antihorario, <0 horario, 0 alineados.
function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  );
}

// Los segmentos [a,b] y [c,d] comparten algún punto (incluye el simple roce).
function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = Math.sign(cross(a, b, c));
  const o2 = Math.sign(cross(a, b, d));
  const o3 = Math.sign(cross(c, d, a));
  const o4 = Math.sign(cross(c, d, b));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

// Aristas adyacentes (comparten `shared`): solo fallan si son colineales y
// apuntan al mismo lado, es decir, una vuelve sobre la otra (un «pico»).
function adjacentEdgesOverlap(shared: Point, a: Point, b: Point): boolean {
  if (cross(shared, a, b) !== 0) return false;
  const dot = (a.x - shared.x) * (b.x - shared.x) + (a.y - shared.y) * (b.y - shared.y);
  return dot > 0;
}

function isSelfIntersecting(points: readonly Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i] as Point;
    const b = points[(i + 1) % n] as Point;
    for (let j = i + 1; j < n; j += 1) {
      const c = points[j] as Point;
      const d = points[(j + 1) % n] as Point;
      if (j === i + 1) {
        // Comparten b (= c).
        if (adjacentEdgesOverlap(b, a, d)) return true;
      } else if (i === 0 && j === n - 1) {
        // Comparten a (= d): la última arista cierra sobre el primer vértice.
        if (adjacentEdgesOverlap(a, b, c)) return true;
      } else if (segmentsTouch(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

// Área con proyección equirrectangular a la latitud media (R = 6.371 km):
// error < 1 % por debajo del tope de 2.500 km². Un polígono que cruza el
// antimeridiano sale enorme y lo rechaza el propio tope.
export function polygonAreaKm2(ring: PolygonRing): number {
  if (ring.length < 3) return 0;
  const meanLatRad = (ring.reduce((sum, v) => sum + v.lat, 0) / ring.length) * (Math.PI / 180);
  const kmPerDegLat = (Math.PI / 180) * EARTH_RADIUS_KM;
  const kmPerDegLon = kmPerDegLat * Math.cos(meanLatRad);
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i] as PolygonVertex;
    const q = ring[(i + 1) % ring.length] as PolygonVertex;
    twiceArea += p.lon * kmPerDegLon * (q.lat * kmPerDegLat) - q.lon * kmPerDegLon * (p.lat * kmPerDegLat);
  }
  return Math.abs(twiceArea) / 2;
}

// Comprobaciones (5)–(10) de la decisión 115 sobre un anillo ya construido.
// Devuelve `null` si es válido. Lo usa el parser y el control de dibujo.
export function validatePolygonRing(ring: PolygonRing): Issue | null {
  for (const v of ring) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon) || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) {
      return issue('out-of-range');
    }
  }
  if (ring.length < POLYGON_MIN_VERTICES) return issue('too-few');
  if (ring.length > POLYGON_MAX_VERTICES) return issue('too-many');

  const points = ring.map(toPoint);
  const seen = new Set<string>();
  for (const p of points) {
    const key = `${String(p.x)},${String(p.y)}`;
    if (seen.has(key)) return issue('duplicate-vertex');
    seen.add(key);
  }

  // Todos los vértices son distintos, así que v1 ≠ v0: basta que ninguno se
  // salga de la recta v0→v1 para que todos estén alineados.
  const [v0, v1] = points as [Point, Point, ...Point[]];
  if (points.every((p) => cross(v0, v1, p) === 0)) return issue('degenerate');

  if (isSelfIntersecting(points)) return issue('self-intersecting');
  if (polygonAreaKm2(ring) > POLYGON_MAX_AREA_KM2) return issue('too-large');
  return null;
}

export function parsePolygonParam(raw: string): PolygonParseResult {
  // (2) La longitud se comprueba ANTES de partir la cadena.
  if (raw.length > POLYGON_MAX_PARAM_LENGTH) {
    return { ok: false, ...issue('too-long') };
  }
  // (3) Vacío, separadores erróneos, cantidad impar o texto: `malformed`.
  // Un valor vacío nunca significa «ausente» ni 0.
  const malformed = { ok: false, ...issue('malformed') } as const;
  const ring: PolygonVertex[] = [];
  for (const rawVertex of raw.split(';')) {
    const parts = rawVertex.split(',');
    const [latText, lonText] = parts;
    if (
      parts.length !== 2 ||
      latText === undefined ||
      lonText === undefined ||
      !COORDINATE_PATTERN.test(latText) ||
      !COORDINATE_PATTERN.test(lonText)
    ) {
      return malformed;
    }
    ring.push({ lat: Number(latText), lon: Number(lonText) });
  }
  const problem = validatePolygonRing(ring);
  return problem === null ? { ok: true, ring } : { ok: false, ...problem };
}

// Codificación determinista y sin pérdida: 5 decimales como máximo, sin ceros
// a la derecha ni `-0`. `Number(...)` normaliza `-0.000001` a `0`.
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(5)) + 0);
}

export function formatPolygonParam(ring: PolygonRing): string {
  return ring.map((v) => `${formatCoordinate(v.lat)},${formatCoordinate(v.lon)}`).join(';');
}
