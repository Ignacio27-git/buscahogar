// Paso 1.14 — esquema Zod de la propiedad cruda de Kyero (diseño D4/D5,
// gaps G1-G4). `z.looseObject`, mismo razonamiento que rawElementSchema de
// Idealista (apps/ingestion/src/sources/idealista/raw-element.schema.ts):
// una clave nueva del vendor no debe descartar una propiedad ya "pagada" en
// términos de dump — aquí no hay cuota, pero el mismo argumento de
// tolerancia aplica: el vocabulario del feed no está cerrado. Solo
// id/price/type/url son obligatorios (D5); el resto degrada a `.optional()`.
import { z } from 'zod';

// numericText/signedNumericText/intText: los valores numéricos del feed
// llegan SIEMPRE como texto XML. Nunca z.coerce.number() — mismo argumento
// que searchQuerySchema (packages/core/src/schemas/search-query.schema.ts):
// coerce convertiría '' en 0 y "1,5" en NaN silencioso en vez de un rechazo
// nombrado. El regex exige un patrón exacto antes de transformar.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function numericText(field: string) {
  return z.string().trim().regex(/^\d+(\.\d+)?$/, `${field}: se esperaba un número decimal sin signo`).transform(Number);
}

// Con signo: hace falta para latitude/longitude, que pueden ser negativos.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function signedNumericText(field: string) {
  return z.string().trim().regex(/^-?\d+(\.\d+)?$/, `${field}: se esperaba un número decimal`).transform(Number);
}

// Entero sin signo: beds/baths nunca son fraccionarios (diseño D4).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function intText(field: string) {
  return z.string().trim().regex(/^\d+$/, `${field}: se esperaba un entero sin signo`).transform(Number);
}

const priceSchema = numericText('price').pipe(z.number().positive());

// G1/G1b: desc y url pueden llegar como texto plano o como objeto
// lang->texto (<desc><en>..</en><es>..</es></desc>). Unión tolerante: la
// resolución de idioma (es > en > primero) vive en el normalizador, no
// aquí — este esquema solo valida la FORMA, nunca decide contenido.
const localizedTextSchema = z.union([z.string(), z.looseObject({}).catchall(z.string())]);

// G2 coords: forma anidada <location><latitude/><longitude/></location> —
// la forma plana (latitude/longitude directos en <property>) se modela por
// separado más abajo; el shell/normalizador decide cuál gana (anidada,
// diseño D5 "nested wins").
const kyeroLocationSchema = z.looseObject({
  latitude: signedNumericText('location.latitude').optional(),
  longitude: signedNumericText('location.longitude').optional(),
});

// G2 surface: solo la forma objeto built/plot está soportada (diseño,
// tabla de research gaps) — no hay fixture ni evidencia de una forma plana.
const kyeroSurfaceAreaSchema = z.looseObject({
  built: numericText('surface_area.built').optional(),
  plot: numericText('surface_area.plot').optional(),
});

// G3: cada <image> puede llegar como texto plano o como objeto con <url>
// hija. `isArray` (feed-parser.ts) ya garantiza que `images.image` es
// siempre un array, incluso con una sola imagen.
const kyeroImageSchema = z.union([z.string(), z.looseObject({ url: z.string().optional() })]);

const kyeroImagesSchema = z.looseObject({
  image: z.array(kyeroImageSchema).optional(),
});

export const rawPropertySchema = z.looseObject({
  id: z.string(),
  ref: z.string().optional(),
  price: priceSchema,
  currency: z.string().optional(),
  // price_freq ∈ {sale, month} en S1 V3.9 ('week' se eliminó en V3.3); un
  // valor fuera de ese vocabulario no se rechaza aquí — mapOperation
  // (area-filter.ts, diseño D9) es quien decide 'invalid' y excluye.
  price_freq: z.string().optional(),
  type: z.string(),
  town: z.string().optional(),
  province: z.string().optional(),
  location: kyeroLocationSchema.optional(),
  latitude: signedNumericText('latitude').optional(),
  longitude: signedNumericText('longitude').optional(),
  surface_area: kyeroSurfaceAreaSchema.optional(),
  beds: intText('beds').optional(),
  baths: intText('baths').optional(),
  desc: localizedTextSchema.optional(),
  url: localizedTextSchema,
  images: kyeroImagesSchema.optional(),
});

export type KyeroProperty = z.infer<typeof rawPropertySchema>;
