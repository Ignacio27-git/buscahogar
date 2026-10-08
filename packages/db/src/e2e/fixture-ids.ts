// Paso D.1a (spec e2e-test-database R3, diseño A2; decisión 135) — identificadores
// fijos de la base e2e. Módulo PURO (sin pg ni drizzle): lo importan el seed y,
// a través del subpath `@buscahogar/db/e2e`, las specs de `apps/web`, que así
// comparten una única fuente de verdad sin duplicar UUID.

// UUID con forma v4 (versión 4, variante 8) para que `z.uuid()` los acepte; el
// prefijo `e2e00000` los hace reconocibles a simple vista en cualquier volcado.
export function e2eUuid(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(
      `e2eUuid: el índice debe ser un entero no negativo (recibido ${String(index)}).`
    );
  }
  return `e2e00000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

// Fuentes (rango 1x), localidad/zona (2x), viviendas (3x), anuncios (4x) y
// versiones (5x): los rangos solo sirven para leer los IDs, no son semántica.
export const E2E_SOURCE_IDS = {
  idealista: e2eUuid(0x11),
  kyero: e2eUuid(0x12),
} as const;

export const E2E_GETAFE = {
  locationId: e2eUuid(0x21),
  zoneId: e2eUuid(0x22),
  ineCode: '28065',
} as const;

// D.13 (decisión 181): una zona por estado de aviso de cobertura, en municipios reales de
// Madrid. Localidades 0x23, 0x25... y zonas 0x24, 0x26...; los jobs (0x81-0x84) solo existen en
// los cuatro estados que tienen job. `notSweepable` no tiene centroide y `cap` no tiene job.
export const E2E_COVERAGE_ZONES = {
  pending: {
    ineCode: '28074',
    locationId: e2eUuid(0x23),
    zoneId: e2eUuid(0x24),
    jobId: e2eUuid(0x81),
  },
  running: {
    ineCode: '28058',
    locationId: e2eUuid(0x25),
    zoneId: e2eUuid(0x26),
    jobId: e2eUuid(0x82),
  },
  done: {
    ineCode: '28092',
    locationId: e2eUuid(0x27),
    zoneId: e2eUuid(0x28),
    jobId: e2eUuid(0x83),
  },
  failed: {
    ineCode: '28007',
    locationId: e2eUuid(0x29),
    zoneId: e2eUuid(0x2a),
    jobId: e2eUuid(0x84),
  },
  notSweepable: { ineCode: '28106', locationId: e2eUuid(0x2b), zoneId: e2eUuid(0x2c) },
  cap: { ineCode: '28113', locationId: e2eUuid(0x2d), zoneId: e2eUuid(0x2e) },
} as const;

// P1..P6 (spec R4). P3 solo tiene anuncios retirados; P6 no tiene ubicación.
// P7 (D.9, decisión 175): solo anuncios inactivos SIN redactar, con fotos locales y
// datos clave sin consolidar; no aparece en la búsqueda, solo en su ficha.
export const E2E_PROPERTY_IDS = {
  p1: e2eUuid(0x31),
  p2: e2eUuid(0x32),
  p3: e2eUuid(0x33),
  p4: e2eUuid(0x34),
  p5: e2eUuid(0x35),
  p6: e2eUuid(0x36),
  p7: e2eUuid(0x37),
} as const;

export const E2E_LISTING_IDS = {
  p1Idealista: e2eUuid(0x41),
  p1Kyero: e2eUuid(0x42),
  p2Active: e2eUuid(0x43),
  p2Removed: e2eUuid(0x44),
  p3RemovedA: e2eUuid(0x45),
  p3RemovedB: e2eUuid(0x46),
  p4: e2eUuid(0x47),
  p5: e2eUuid(0x48),
  p6: e2eUuid(0x49),
  p7Idealista: e2eUuid(0x4a),
  p7Kyero: e2eUuid(0x4b),
} as const;

// Rutas de las specs: el detalle con dos anuncios (uno activo, uno retirado) y
// un UUID válido que no existe (segundo 404, S9.3).
export const E2E_DETAIL_LISTING_ID = E2E_LISTING_IDS.p2Active;
export const E2E_REMOVED_ONLY_LISTING_ID = E2E_LISTING_IDS.p3RemovedA;
// D.9 (decisión 175): ficha con galería de dos fotos, «—» y la nota de no consolidado.
export const E2E_GALLERY_LISTING_ID = E2E_LISTING_IDS.p7Idealista;
// D.10 (decisión 178): ficha con histórico de precios (P1: dos anuncios activos con cambios).
export const E2E_HISTORY_LISTING_ID = E2E_LISTING_IDS.p1Idealista;
// D.12 (decisión 180): P4, un único anuncio activo: una sola insignia «Más económico» y la nota.
export const E2E_SINGLE_SOURCE_LISTING_ID = E2E_LISTING_IDS.p4;
// D.11 (decisión 179): P6 no tiene ubicación, solo municipio (Getafe): la sección «Ubicación» sin mapa.
export const E2E_NO_LOCATION_LISTING_ID = E2E_LISTING_IDS.p6;
export const E2E_MISSING_LISTING_ID = e2eUuid(0xffff);
