import { describe, expect, it } from 'vitest';

import type { Listing } from '../src/schemas/listing.schema.js';
import type { SignalBreakdown, SignalScore } from '../src/types/similarity.js';

// Helpers de aserción de tipos, sin dependencias — más precisos que
// `expectTypeOf`, que solo garantiza algo bajo una pasada de typecheck (D9
// del diseño). Se exportan como alias de tipo (no `const`) porque
// noUnusedLocals: true rechazaría un local sin usar; un alias exportado no
// cuenta como "sin usar".
// El parámetro T de cada firma de función anónima es lo que hace funcionar
// la comparación estructural exacta (el truco estándar de "distributive
// conditional" para igualdad de tipos); no es un genérico redundante pese a
// que la regla lo detecte como tal en esta forma concreta.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
export type Expect<T extends true> = T;

// Decisión 021: priceCents es number en el dominio (la cota de entero
// seguro la impone el esquema con z.int(), no el tipo).
export type _PriceCentsIsNumber = Expect<Equal<Listing['priceCents'], number>>;

// noUncheckedIndexedAccess: indexar un SignalBreakdown por una clave de
// señal arbitraria produce SignalScore | undefined, nunca SignalScore a
// secas — ya era así en packages/db antes de este cambio, así que no es
// una regresión, pero un consumidor debe seguir estrechando en vez de
// asumir no-null.
//
// Nota: el tipo indexado `SignalBreakdown[string]` NO basta para probar
// esto — noUncheckedIndexedAccess añade `| undefined` al resolver una
// EXPRESIÓN de indexación sobre un valor, no al tipo indexado en sí mismo
// (verificado: `const x: SignalBreakdown[string] = undefined` no compila).
// Por eso la aserción es esta función: su cuerpo indexa un valor de verdad,
// y solo compila si se anota con `| undefined`. Quitar el `| undefined` de
// la firma reproduce el error que probaría una regresión del flag.
function readSignal(breakdown: SignalBreakdown, key: string): SignalScore | undefined {
  return breakdown[key];
}
export type _SignalBreakdownIndexIsOptional = Expect<
  Equal<ReturnType<typeof readSignal>, SignalScore | undefined>
>;

// features es requerido en la salida (z.infer = z.output), aunque su
// entrada sea opcional por el .default([]) — la comprobación en tiempo de
// ejecución vive en listing.schema.test.ts; esta es la comprobación de
// tipos correspondiente.
export type _FeaturesIsRequiredOnOutput = Expect<
  Equal<Listing['features'] extends undefined ? true : false, false>
>;

// coordinatesObfuscated es un booleano opcional tri-estado (decisión 026):
// su tipo declarado es `boolean | undefined`, nunca `boolean` a secas.
export type _CoordinatesObfuscatedIsOptionalBoolean = Expect<
  Equal<Listing['coordinatesObfuscated'], boolean | undefined>
>;

// rooms es opcional: un local comercial no lo declara (evidencia de la
// sonda, obs #81).
export type _RoomsIsOptionalNumber = Expect<Equal<Listing['rooms'], number | undefined>>;

// sourceId, externalId y url son obligatorios: nunca `| undefined`.
export type _SourceIdIsRequiredString = Expect<Equal<Listing['sourceId'], string>>;
export type _ExternalIdIsRequiredString = Expect<Equal<Listing['externalId'], string>>;
export type _UrlIsRequiredString = Expect<Equal<Listing['url'], string>>;

// Las aserciones anteriores se comprueban con `typecheck`, no aquí: si
// alguna dejara de cumplirse, `tsc --noEmit` fallaría con un error de tipos
// en este fichero. Este único caso en tiempo de ejecución solo evita que
// Vitest reporte "No test suite found" — la garantía real es de tipos.
describe('aserciones de tipo (comprobadas por typecheck, no por este runtime)', () => {
  it('readSignal también demuestra en tiempo de ejecución la ausencia bajo una clave inexistente', () => {
    const breakdown: SignalBreakdown = { address: { value: 1, weight: 1 } };

    expect(readSignal(breakdown, 'address')).toEqual({ value: 1, weight: 1 });
    expect(readSignal(breakdown, 'missing-key')).toBeUndefined();
  });
});
