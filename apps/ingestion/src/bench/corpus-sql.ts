// ROADMAP 2.4 (search-indexing-performance) — buildCorpusBatch (diseño D5,
// D7, "Load procedure" y "Corpus Shape"). Genera, para UNA tanda del corpus
// sintético, las sentencias SQL parametrizadas que la insertan en
// `buscahogar_bench` (nunca en la base de desarrollo: eso lo impone el guard
// de bench-options.ts, no este módulo). Función PURA: no abre conexión
// alguna, no lee `process.env`, no depende del reloj real salvo por el
// `anchorIso` recibido como parámetro — solo construye texto SQL + valores
// ligados.
//
// Estrategia (D5, "stages rows in a TEMP table"): TODA la aleatoriedad se
// materializa UNA sola vez en una TEMP TABLE (`bench_corpus_stage`, un renglón
// por LISTING, con los atributos de grupo ya compartidos entre sus miembros).
// Las 4 tablas reales se rellenan después leyendo esa tabla puente, sin
// volver a invocar `random()` — así el precio mínimo del grupo
// (`properties.min_price_cents`) es coherente con los precios que
// `listing_versions` realmente inserta, y `properties.surface_m2`/`rooms`/
// `bathrooms`/`location` son IDÉNTICOS entre los miembros de un mismo grupo
// (no tendría sentido que "la misma vivienda" midiera 80 m² en un anuncio y
// 200 m² en otro).
//
// `location_geography` NUNCA aparece en ninguna sentencia: es una columna
// GENERATED ALWAYS (columns.ts / properties.ts / listings.ts) — PostgreSQL
// la calcula sola a partir de `location`, y escribirle a mano sería un error
// en tiempo de ejecución, no solo una violación de diseño.
export interface CorpusBatchInput {
  readonly seed: number;
  readonly batchIndex: number;
  readonly batchSize: number;
  readonly anchorIso: string;
  readonly sourceIds: readonly [string, string];
}

export interface SqlStatement {
  readonly text: string;
  readonly values: readonly unknown[];
}

// Límites de fila de la tanda (D-load): la tanda `batchIndex` (0-based)
// genera los grupos/propiedades `[batchIndex*batchSize + 1, (batchIndex+1)*batchSize]`
// — un rango contiguo y disjunto entre tandas, así que dos tandas nunca
// pueden colisionar en el mismo `group_seq` ni, por tanto, en el mismo
// `external_id` de listing.
function computeBatchBounds(batchIndex: number, batchSize: number): { readonly rowStart: number; readonly rowEnd: number } {
  return { rowStart: batchIndex * batchSize + 1, rowEnd: (batchIndex + 1) * batchSize };
}

// `setseed()` de PostgreSQL exige un argumento en [-1, 1] (documentación de
// PostgreSQL). Se deriva de forma determinista de `seed` y `batchIndex` con
// una función trigonométrica como hash barato: mismo par de entradas siempre
// produce el mismo valor (reproducibilidad, spec "Same seed reproduces the
// same corpus shape"), y `batchIndex` distintos producen, en la práctica,
// valores distintos — cada tanda usa su propia secuencia de `random()`
// (D5, "setseed(f(seed,batch))").
function computeBatchSeed(seed: number, batchIndex: number): number {
  const hashed = Math.abs(Math.sin(seed * 1000.30001 + batchIndex * 7.00013 + 1));
  const fractional = hashed - Math.floor(hashed);
  return fractional * 2 - 1;
}

// Ponderación de tipo de vivienda (diseño, "Corpus Shape"): `flat` ~60%, el
// resto de `PROPERTY_TYPES` (packages/core) repartido uniformemente. No se
// importa `PROPERTY_TYPES` de `@buscahogar/core` para no acoplar esta
// sentencia (un simple array SQL) a un cambio de esa lista en tiempo de
// ejecución: si `@buscahogar/core` añade un tipo nuevo, este generador
// sintético no tiene por qué generarlo automáticamente.
const NON_FLAT_PROPERTY_TYPES = [
  'house',
  'penthouse',
  'duplex',
  'studio',
  'land',
  'commercial',
  'garage',
  'storage_room',
  'building',
  'other',
] as const;

// Sentencia de staging: constante, NUNCA interpolada con los valores de la
// tanda — esos viajan como `$1..$5` (spec "Zero External Calls" no aplica
// aquí, pero la misma disciplina de parametrización sí: CLAUDE.md, "Toda
// entrada externa se valida"; aquí no hay entrada externa, pero el mismo
// hábito de nunca concatenar un valor variable en el texto SQL se mantiene).
const CREATE_STAGE_SQL = `
CREATE TEMP TABLE bench_corpus_stage ON COMMIT DROP AS
WITH draws AS (
  -- Corrección (validador, hallazgo CRÍTICO): tamaño de grupo y ubicación
  -- se materializan aquí como UNA columna por señal, UNA sola vez por
  -- grupo — nunca un random() distinto por cada referencia. Así
  -- group_size es una única tirada (70/25/5%, no dos random() encadenados
  -- que sesgan a 70/28.5/1.5), y base_lon/base_lat comparten EXACTAMENTE
  -- el mismo NULL, la misma rama Madrid/España y el mismo radio/ángulo:
  -- con draws independientes por coordenada, lon podía salir NULL sin que
  -- lat lo hiciera, o lon caer en Madrid mientras lat caía en Galicia.
  SELECT
    g AS group_seq,
    gen_random_uuid() AS property_id,
    random() AS group_size_draw,
    random() AS location_null_draw,
    random() AS location_branch_draw,
    random() AS location_radius_draw,
    random() AS location_angle_draw,
    random() AS location_bbox_lon_draw,
    random() AS location_bbox_lat_draw
  FROM generate_series($1::bigint, $2::bigint) AS series(g)
),
groups AS (
  SELECT
    draws.group_seq,
    draws.property_id,
    CASE WHEN random() < 0.7 THEN 'sale' ELSE 'rent' END AS operation,
    CASE WHEN random() < 0.6 THEN 'flat'
         ELSE (ARRAY['${NON_FLAT_PROPERTY_TYPES.join("','")}'])[1 + floor(random() * ${String(NON_FLAT_PROPERTY_TYPES.length)})::int]
    END AS property_type,
    CASE WHEN draws.group_size_draw < 0.70 THEN 1
         WHEN draws.group_size_draw < 0.95 THEN 2
         ELSE 3
    END AS group_size,
    -- Diseño ("Corpus Shape"): "60% Madrid ...; r = 25 km·random(), denser
    -- at the centre". Un radio LINEAL en el draw uniforme (nunca su raíz
    -- cuadrada) es lo que concentra más puntos cerca del centro: aplicar una
    -- raíz cuadrada al draw reparte por ÁREA (densidad uniforme), justo lo
    -- contrario de lo que pide el diseño. Conversión km→grados: 1° de
    -- latitud ≈ 111.32 km siempre; 1° de longitud ≈ 111.32·cos(lat) km, así
    -- que el término de longitud SÍ divide por cos(lat) y el de latitud NO.
    CASE WHEN draws.location_null_draw < 0.02 THEN NULL
         WHEN draws.location_branch_draw < 0.6 THEN
           -3.7038 + (25.0 * draws.location_radius_draw * cos(2 * pi() * draws.location_angle_draw))
             / (111.32 * cos(radians(40.4168)))
         ELSE -9.5 + draws.location_bbox_lon_draw * 7.0
    END AS base_lon,
    CASE WHEN draws.location_null_draw < 0.02 THEN NULL
         WHEN draws.location_branch_draw < 0.6 THEN
           40.4168 + (25.0 * draws.location_radius_draw * sin(2 * pi() * draws.location_angle_draw)) / 111.32
         ELSE 36.0 + draws.location_bbox_lat_draw * 6.5
    END AS base_lat
  FROM draws
),
priced AS (
  SELECT
    groups.*,
    -- random() devuelve double precision, y numeric + double precision se
    -- resuelve en double precision por el cast implícito numeric a double
    -- (comprobado contra PostgreSQL 17 con pg_typeof). Sin los ::numeric
    -- explícitos, toda la aritmética de precios saldría del tipo numeric sin
    -- avisar, y round(x, n) solo existe para numeric. (Nota de
    -- estilo: NUNCA una comilla invertida literal en este bloque de
    -- comentario SQL — vive dentro de un template literal de TS delimitado
    -- por comillas invertidas, y una comilla invertida aquí lo cerraría a
    -- medias; error ya cometido y corregido una vez en este mismo fichero).
    CASE WHEN groups.operation = 'sale'
      THEN exp(ln(6000000::numeric) + (random()::numeric) * (ln(150000000::numeric) - ln(6000000::numeric)))
      ELSE exp(ln(40000::numeric) + (random()::numeric) * (ln(400000::numeric) - ln(40000::numeric)))
    END AS base_price_cents
  FROM groups
),
sized AS (
  SELECT
    priced.*,
    GREATEST(25, LEAST(400, round(
      25 + (
        CASE WHEN priced.operation = 'sale'
          THEN (priced.base_price_cents - 6000000) / (150000000 - 6000000)
          ELSE (priced.base_price_cents - 40000) / (400000 - 40000)
        END
      ) * (400 - 25) + (random()::numeric - 0.5) * 40
    )))::int AS base_surface_m2
  FROM priced
),
members AS (
  SELECT
    sized.*,
    mm.m AS member_index,
    gen_random_uuid() AS listing_id,
    CASE WHEN mm.m = 0 OR sized.base_lon IS NULL THEN sized.base_lon
         ELSE sized.base_lon + (random() - 0.5) * 0.00054 END AS lon,
    CASE WHEN mm.m = 0 OR sized.base_lat IS NULL THEN sized.base_lat
         ELSE sized.base_lat + (random() - 0.5) * 0.00054 END AS lat,
    round(sized.base_price_cents * (1 + (random()::numeric - 0.5) * 0.04))::bigint AS price_cents
  FROM sized
  CROSS JOIN LATERAL generate_series(0, sized.group_size - 1) AS mm(m)
)
SELECT
  members.group_seq,
  members.property_id,
  members.member_index,
  members.listing_id,
  members.operation,
  members.property_type,
  members.price_cents,
  CASE WHEN random() < 0.05 THEN NULL ELSE members.base_surface_m2 END AS surface_m2,
  CASE WHEN random() < 0.03 THEN NULL
       ELSE GREATEST(0, LEAST(6, round((members.base_surface_m2 / 35.0)::numeric)))::smallint END AS rooms,
  CASE WHEN random() < 0.08 THEN NULL
       ELSE GREATEST(1, LEAST(4, round((members.base_surface_m2 / 70.0)::numeric) + 1))::smallint END AS bathrooms,
  members.lon,
  members.lat,
  CASE WHEN (members.group_seq + members.member_index) % 2 = 0 THEN $4::uuid ELSE $5::uuid END AS source_id,
  ($3::timestamptz - (random() * interval '180 days')) AS updated_at
FROM members
`;

const INSERT_PROPERTIES_SQL = `
INSERT INTO properties (id, location, min_price_cents, surface_m2, rooms, bathrooms, operation, property_type, listing_count, active_listing_count, updated_at)
SELECT DISTINCT ON (property_id)
  property_id,
  CASE WHEN lon IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326) END,
  MIN(price_cents) OVER (PARTITION BY property_id),
  surface_m2,
  rooms,
  bathrooms,
  operation,
  property_type,
  COUNT(*) OVER (PARTITION BY property_id),
  -- ROADMAP 2.5 (decisión 109): todos los anuncios sintéticos están activos, así
  -- que la caché de visibilidad iguala al recuento. Sin esto el banco entero
  -- sería invisible para la búsqueda (active_listing_count > 0).
  COUNT(*) OVER (PARTITION BY property_id),
  updated_at
FROM bench_corpus_stage
ORDER BY property_id, member_index
`;

const INSERT_LISTINGS_SQL = `
INSERT INTO listings (id, source_id, external_id, url, location, updated_at)
SELECT
  listing_id,
  source_id,
  'bench-' || listing_id::text,
  'https://bench.local/listing/' || listing_id::text,
  CASE WHEN lon IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326) END,
  updated_at
FROM bench_corpus_stage
`;

const INSERT_LISTING_VERSIONS_SQL = `
INSERT INTO listing_versions (listing_id, version, is_current, price_cents, surface_m2, rooms, bathrooms, property_type, operation, captured_at)
SELECT listing_id, 1, true, price_cents, surface_m2, rooms, bathrooms, property_type, operation, updated_at
FROM bench_corpus_stage
`;

const INSERT_PROPERTY_LISTINGS_SQL = `
INSERT INTO property_listings (property_id, listing_id, score, strategy_name, strategy_version, signals)
SELECT property_id, listing_id, 0.9, 'synthetic-bench', '1', '{"synthetic":{"value":1,"weight":0}}'::jsonb
FROM bench_corpus_stage
`;

export function buildCorpusBatch(input: CorpusBatchInput): readonly SqlStatement[] {
  const { rowStart, rowEnd } = computeBatchBounds(input.batchIndex, input.batchSize);
  const batchSeed = computeBatchSeed(input.seed, input.batchIndex);

  return [
    { text: 'SELECT setseed($1)', values: [batchSeed] },
    { text: CREATE_STAGE_SQL, values: [rowStart, rowEnd, input.anchorIso, input.sourceIds[0], input.sourceIds[1]] },
    { text: INSERT_PROPERTIES_SQL, values: [] },
    { text: INSERT_LISTINGS_SQL, values: [] },
    { text: INSERT_LISTING_VERSIONS_SQL, values: [] },
    { text: INSERT_PROPERTY_LISTINGS_SQL, values: [] },
  ];
}
