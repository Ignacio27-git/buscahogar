// ROADMAP 1.11 — searchQuerySchema (diseño D2; docs/DECISIONS.md, decisión
// 057). Frontera externa real: entra desde los search params de la página
// de resultados (`apps/web/src/app/(search)/page.tsx`). Cada valor reconocido llega
// como `string | string[] | undefined` —tal como Next.js resuelve
// `searchParams`—, nunca ya tipado.
//
// z.object() no estricto (a diferencia de areaQuerySchema/
// blockingThresholdsSchema): una URL compartida y decorada por un tercero
// (`?utm_source=…`) debe seguir reproduciendo la búsqueda. Solo las claves
// RECONOCIDAS se validan con rigor: sin coerción, rechazo nombrado en cada
// valor inválido, nunca un valor por defecto silencioso.
//
// El resultado final YA es `PropertySearchCriteria` (D1: "db needs the
// shape, not the validator"): el `.transform()` de cierre aplica los
// valores por defecto de `sort`/`dir`/`page` y renombra los parámetros de
// filtro a los nombres de columna que consume `packages/db/src/search.ts`,
// para que ese paquete —Zod-free, decisión 023— no tenga que volver a tocar
// ninguno de los nombres de search params.
import { z } from 'zod';

import type { PolygonRing } from '../geo/polygon.js';
import { OPERATION_TYPES } from '../types/operation-type.js';
import { PROPERTY_TYPES } from '../types/property-type.js';
import { areaQuerySchema } from './area-query.schema.js';
import { CHOOSE_OPTION, REPEATED_VALUE } from './param-messages.js';
import { polygonParamSchema } from './polygon-param.schema.js';
import { zoneSelectionSchema } from './zone-selection.schema.js';

// Un entero decimal sin signo: la ausencia de `-?` es lo que rechaza un
// umbral negativo (minRooms=-1) sin necesitar una comprobación aparte.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function intParam() {
  return z
    .string({ error: REPEATED_VALUE })
    .trim()
    .regex(/^\d+$/, 'escribe un número entero, sin signo ni decimales.')
    .transform(Number);
}

// Con signo opcional y parte decimal opcional: hace falta para lat/lng
// (pueden ser negativos). El rango no-negativo de precio/superficie se
// acota aparte con `nonNegativeDecimalParam`.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function decimalParam() {
  return z
    .string({ error: REPEATED_VALUE })
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'escribe un número; usa punto para los decimales.')
    .transform(Number);
}

// D.14 (N1): `Number('9'.repeat(400))` es `Infinity` y `z.number()` lo rechaza como error de tipo;
// sin `{ error }` propio saldría el texto inglés por defecto de Zod.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function nonNegativeDecimalParam() {
  return decimalParam().pipe(
    z
      .number({ error: 'escribe un número más pequeño.' })
      .nonnegative('escribe un número igual o mayor que cero.')
  );
}

// ROADMAP 3.1 (decisión 121) — `minPrice`/`maxPrice` llegan en EUROS, con a
// lo sumo dos decimales, y salen en céntimos (`minPriceCents`). Sin signo: el
// negativo se rechaza por la propia expresión. Más de dos decimales es un
// rechazo nombrado, nunca un redondeo: así `Math.round` solo corrige el error
// binario (19.99 * 100 = 1998.9999…) y jamás cambia la intención del usuario.
// La columna es bigint(number), de modo que el resultado debe ser un entero
// seguro.
const PRICE_TOO_LARGE = 'escribe un importe más pequeño.';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function priceEurosParam() {
  return z
    .string({ error: REPEATED_VALUE })
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'escribe un importe en euros, con dos decimales como mucho.')
    .transform((value) => Math.round(Number(value) * 100))
    .pipe(
      z
        .number({ error: PRICE_TOO_LARGE })
        .refine((cents) => Number.isSafeInteger(cents), PRICE_TOO_LARGE)
    );
}

// `page` en un rango fijo (D2): 1..100 — el mismo tope que impone el máximo
// offset (A-4) expresado aquí como límite de página, nunca clamped, siempre
// un rechazo nombrado por encima.
const MAX_PAGE = 100;
const PAGE_RANGE = `elige una página entre 1 y ${String(MAX_PAGE)}.`;

const ONE_WAY_TO_SET_ZONE = 'usa solo una forma de indicar la zona.';

const rawSearchQuerySchema = z
  .object({
    operation: z.enum(OPERATION_TYPES, { error: CHOOSE_OPTION }).optional(),
    propertyType: z.enum(PROPERTY_TYPES, { error: CHOOSE_OPTION }).optional(),
    // Ya en céntimos tras el parseo (decisión 121).
    minPrice: priceEurosParam().optional(),
    maxPrice: priceEurosParam().optional(),
    minSurface: nonNegativeDecimalParam().optional(),
    maxSurface: nonNegativeDecimalParam().optional(),
    minRooms: intParam().optional(),
    minBathrooms: intParam().optional(),
    lat: decimalParam().optional(),
    lng: decimalParam().optional(),
    radius: decimalParam().optional(),
    sort: z.enum(['price', 'surface', 'updated'], { error: CHOOSE_OPTION }).optional(),
    dir: z.enum(['asc', 'desc'], { error: CHOOSE_OPTION }).optional(),
    page: intParam()
      .pipe(z.number({ error: PAGE_RANGE }).min(1, PAGE_RANGE).max(MAX_PAGE, PAGE_RANGE))
      .optional(),
    // Nunca declarado: cualquier `pageSize` en la URL cae en la rama de
    // clave desconocida de `z.object()` (strip por defecto) y se ignora
    // (Uniform Validation Policy — «no MUST NOT trigger a rejection»).
    //
    // ROADMAP 1.13 Unit D (diseño DD-21) — segunda forma de indicar una zona
    // geográfica, además de lat/lng/radius. Reutiliza `zoneSelectionSchema`
    // (decisión 057) en vez de duplicar su regex: una sola definición del
    // patrón de código INE.
    zone: zoneSelectionSchema.optional(),
    // ROADMAP 2.6 (decisión 115) — tercera forma de indicar la zona: un
    // polígono dibujado. Excluyente con zone y con cualquier parte de
    // lat/lng/radius (comprobado primero en el superRefine).
    polygon: polygonParamSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // ROADMAP 2.6 — `polygon` no se combina con ningún otro modo geográfico:
    // rechazo NOMBRADO con los parámetros presentes, sin precedencia. Va
    // antes que el resto, así un geo parcial junto a `polygon` se nombra por
    // este motivo y no por «bloque incompleto».
    if (data.polygon !== undefined) {
      // Sin claves en el mensaje: la persona ve «el municipio» y «el punto con radio», una vez.
      const conflicting = [
        ...(data.zone !== undefined ? ['el municipio'] : []),
        ...([data.lat, data.lng, data.radius].some((value) => value !== undefined) ? ['el punto con radio'] : []),
      ];
      if (conflicting.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: `no puede combinarse con ${conflicting.join(' ni con ')}; ${ONE_WAY_TO_SET_ZONE}`,
          path: ['polygon'],
        });
        return;
      }
    }

    // CR-6 (arbitraje) — `zone` junto con CUALQUIER parte de lat/lng/radius
    // es un rechazo NOMBRADO, nunca una precedencia silenciosa: mismo
    // idioma que este propio fichero ya declara en su cabecera («nunca un
    // valor por defecto silencioso»). Comprobado ANTES del bloque
    // todo-o-nada de abajo, así que un trío incompleto junto a `zone`
    // también se nombra por este motivo, no por el de abajo.
    const geoPresent = [data.lat, data.lng, data.radius].filter((value) => value !== undefined).length;
    if (data.zone !== undefined && geoPresent > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `no puede combinarse con el punto con radio; ${ONE_WAY_TO_SET_ZONE}`,
        path: ['zone'],
      });
      return;
    }

    const present = geoPresent;
    if (present === 0) {
      return;
    }
    if (present < 3) {
      ctx.addIssue({
        code: 'custom',
        message: 'el punto con radio está incompleto; elige un municipio en el buscador.',
        path: ['radius'],
      });
      return;
    }

    // Reutiliza coordinatesSchema/positive() de areaQuerySchema sin editar
    // ese fichero (D2): `operation` se omite porque aquí es opcional, a
    // diferencia del barrido de cobertura donde particiona la petición.
    const geoResult = areaQuerySchema.omit({ operation: true }).safeParse({
      center: { latitude: data.lat, longitude: data.lng },
      radiusMeters: data.radius,
    });
    if (!geoResult.success) {
      ctx.addIssue({ code: 'custom', message: 'escribe un número mayor que cero.', path: ['radius'] });
    }
  })
  .refine(
    (data) => data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    { message: 'no puede ser mayor que el precio máximo.', path: ['minPrice'] }
  )
  .refine(
    (data) =>
      data.minSurface === undefined || data.maxSurface === undefined || data.minSurface <= data.maxSurface,
    { message: 'no puede ser mayor que la superficie máxima.', path: ['minSurface'] }
  );

export const searchQuerySchema = rawSearchQuerySchema.transform(
  (data): PropertySearchCriteria => ({
    ...(data.operation !== undefined ? { operation: data.operation } : {}),
    ...(data.propertyType !== undefined ? { propertyType: data.propertyType } : {}),
    ...(data.minPrice !== undefined ? { minPriceCents: data.minPrice } : {}),
    ...(data.maxPrice !== undefined ? { maxPriceCents: data.maxPrice } : {}),
    ...(data.minSurface !== undefined ? { minSurfaceM2: data.minSurface } : {}),
    ...(data.maxSurface !== undefined ? { maxSurfaceM2: data.maxSurface } : {}),
    ...(data.minRooms !== undefined ? { minRooms: data.minRooms } : {}),
    ...(data.minBathrooms !== undefined ? { minBathrooms: data.minBathrooms } : {}),
    ...(data.lat !== undefined && data.lng !== undefined && data.radius !== undefined
      ? { geo: { lon: data.lng, lat: data.lat, radiusMeters: data.radius } }
      : {}),
    ...(data.zone !== undefined ? { zone: data.zone } : {}),
    ...(data.polygon !== undefined ? { polygon: data.polygon } : {}),
    // D2: absent ≠ malformed — default descendente por fecha de
    // actualización cuando no se pide ningún `sort`.
    sort: data.sort ?? 'updated',
    dir: data.dir ?? 'desc',
    page: data.page ?? 1,
  })
);

// Forma final que consume `buildPropertySearchQuery` (D1, D3): ya no
// necesita Zod ni conoce los nombres de search params — solo columnas.
export interface PropertySearchCriteria {
  readonly operation?: (typeof OPERATION_TYPES)[number];
  readonly propertyType?: (typeof PROPERTY_TYPES)[number];
  readonly minPriceCents?: number;
  readonly maxPriceCents?: number;
  readonly minSurfaceM2?: number;
  readonly maxSurfaceM2?: number;
  readonly minRooms?: number;
  readonly minBathrooms?: number;
  readonly geo?: { readonly lon: number; readonly lat: number; readonly radiusMeters: number };
  // ROADMAP 1.13 Unit D (DD-21) — código INE resuelto, consumido por
  // `apps/web/src/app/(search)/page.tsx` (resolución de zona) para derivar `geo` en
  // un paso posterior; `buildPropertySearchQuery` (packages/db/src/search.ts)
  // ignora este campo — no es una columna de `properties`, no filtra nada
  // por sí solo.
  readonly zone?: string;
  // ROADMAP 2.6 — anillo abierto ya validado (decisión 115). Ausente = sin
  // predicado; activo = excluye las filas con ubicación NULL.
  readonly polygon?: PolygonRing;
  readonly sort: 'price' | 'surface' | 'updated';
  readonly dir: 'asc' | 'desc';
  readonly page: number;
}

// z.infer de un esquema con `.transform()` en la raíz produce el tipo de
// SALIDA (el objeto devuelto por el transform), no el de entrada — por eso
// `SearchQuery` y `PropertySearchCriteria` describen la misma forma: la
// distinción de nombres es de vocabulario (D1), no de estructura.
export type SearchQuery = z.infer<typeof searchQuerySchema>;
