import { describe, expect, it } from 'vitest';

import { searchQuerySchema } from '../src/schemas/search-query.schema.js';
import { interpretSearchText } from '../src/nl-search/interpret.js';
import { NL_PARAM_KEYS } from '../src/nl-search/types.js';

// ROADMAP 3.1 — un caso por escenario de la especificación, más las reglas
// que el diseño fija por encima de ella. Todo importe sale en euros.
describe('interpretSearchText — escenarios de la especificación', () => {
  it('frase completa: operación, tipo, precio máximo, habitaciones y lugar', () => {
    const result = interpretSearchText('piso en alquiler en Getafe hasta 900 € con 2 habitaciones');
    expect(result.params).toEqual({
      operation: 'rent',
      propertyType: 'flat',
      maxPrice: '900',
      minRooms: '2',
    });
    expect(result.placeText).toBe('Getafe');
    expect(result.unrecognised).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('los fragmentos reconocidos llevan su posición en el texto original', () => {
    const text = 'piso en alquiler en Getafe';
    const result = interpretSearchText(text);
    const place = result.recognised.find((fragment) => fragment.field === 'place');
    expect(place?.value).toBe('Getafe');
    expect(text.slice(place?.span.start, place?.span.end)).toBe('en Getafe');
    const operation = result.recognised.find((fragment) => fragment.field === 'operation');
    expect(text.slice(operation?.span.start, operation?.span.end)).toBe('en alquiler');
  });

  it('característica no soportada: se informa entera y no altera ningún criterio', () => {
    const result = interpretSearchText('piso con terraza y ascensor en Getafe');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.placeText).toBe('Getafe');
    expect(result.unrecognised).toEqual(['con terraza', 'ascensor']);
  });

  it('negación: el tipo negado no se aplica y el fragmento queda sin reconocer', () => {
    const result = interpretSearchText('no quiero ático, mejor piso');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.unrecognised).toEqual(['no quiero ático']);
  });

  it('"sin" niega el criterio siguiente pero no el lugar que viene después', () => {
    const result = interpretSearchText('piso sin ascensor en Getafe');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.placeText).toBe('Getafe');
    expect(result.unrecognised).toEqual(['sin ascensor']);
  });

  it('separadores: "hasta 1.200 euros" y "hasta 1,2 mil euros" dan 1200', () => {
    expect(interpretSearchText('hasta 1.200 euros').params).toEqual({ maxPrice: '1200' });
    expect(interpretSearchText('hasta 1,2 mil euros').params).toEqual({ maxPrice: '1200' });
  });

  it('multiplicadores: 200k, 200 mil, 1,1 mil, 2 millones y 1,5M', () => {
    expect(interpretSearchText('casa hasta 200k €').params.maxPrice).toBe('200000');
    expect(interpretSearchText('casa hasta 200 mil euros').params.maxPrice).toBe('200000');
    expect(interpretSearchText('casa hasta 1,1 mil euros').params.maxPrice).toBe('1100');
    expect(interpretSearchText('casa hasta 2 millones de euros').params.maxPrice).toBe('2000000');
    expect(interpretSearchText('casa hasta 1,5M').params.maxPrice).toBe('1500000');
  });

  it('la "m" minúscula sola es ambigua (metros o millones) y no se interpreta', () => {
    const result = interpretSearchText('casa hasta 2 m');
    expect(result.params).toEqual({ propertyType: 'house' });
    expect(result.unrecognised).toEqual(['hasta 2 m']);
  });

  it('un número suelto sin unidad ni contexto no se adivina', () => {
    const result = interpretSearchText('piso en alquiler 500');
    expect(result.params).toEqual({ operation: 'rent', propertyType: 'flat' });
    expect(result.unrecognised).toEqual(['500']);
  });

  it('un comparador con número sin unidad queda sin reconocer', () => {
    const result = interpretSearchText('piso hasta 900');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.unrecognised).toEqual(['hasta 900']);
  });

  it('rango entre X y Y con unidad compartida, más superficie mínima', () => {
    const result = interpretSearchText('entre 600 y 900 euros, más de 70 m2');
    expect(result.params).toEqual({ minPrice: '600', maxPrice: '900', minSurface: '70' });
    expect(result.unrecognised).toEqual([]);
  });

  it('desde / mínimo / a partir de dan cotas inferiores; menos de / máximo, superiores', () => {
    expect(interpretSearchText('desde 500 euros').params).toEqual({ minPrice: '500' });
    expect(interpretSearchText('mínimo 60 metros cuadrados').params).toEqual({ minSurface: '60' });
    expect(interpretSearchText('a partir de 80m2').params).toEqual({ minSurface: '80' });
    expect(interpretSearchText('menos de 300.000 €').params).toEqual({ maxPrice: '300000' });
    expect(interpretSearchText('máximo 120 m²').params).toEqual({ maxSurface: '120' });
  });

  it('rango invertido: se conserva tal cual y es el esquema quien lo rechaza', () => {
    const result = interpretSearchText('entre 900 y 600 euros');
    expect(result.params).toEqual({ minPrice: '900', maxPrice: '600' });
    const parsed = searchQuerySchema.safeParse(result.params);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('minPrice no puede ser mayor que maxPrice.');
  });

  it('venta y alquiler en la misma frase: conflicto y ninguna operación elegida', () => {
    const result = interpretSearchText('piso en venta o alquiler');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.field).toBe('operation');
    expect(result.conflicts[0]?.fragments.map((fragment) => fragment.value)).toEqual(['sale', 'rent']);
    expect(result.unrecognised).toEqual([]);
  });

  it('el mismo campo con valores distintos es conflicto (ático dúplex)', () => {
    const result = interpretSearchText('ático dúplex');
    expect(result.params).toEqual({});
    expect(result.conflicts[0]?.field).toBe('propertyType');
  });

  it('el mismo valor repetido no es conflicto', () => {
    const result = interpretSearchText('piso o apartamento');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.conflicts).toEqual([]);
  });

  it('nunca emite paginación, vista ni geografía; los fragmentos quedan sin reconocer', () => {
    const geo = interpretSearchText('piso a 2 km de Sol');
    expect(geo.params).toEqual({ propertyType: 'flat' });
    expect(geo.unrecognised).toEqual(['a 2 km de Sol']);
    const page = interpretSearchText('piso página 3');
    expect(page.params).toEqual({ propertyType: 'flat' });
    expect(page.unrecognised).toEqual(['página 3']);
    for (const phrase of ['piso a 2 km de Sol', 'piso página 3', 'zona 28001 radio 5 km']) {
      for (const key of Object.keys(interpretSearchText(phrase).params)) {
        expect(NL_PARAM_KEYS).toContain(key);
      }
    }
  });
});

describe('interpretSearchText — reglas del diseño', () => {
  it('un importe con moneda y sin comparador es un presupuesto máximo ("900 €")', () => {
    expect(interpretSearchText('piso en alquiler 900 €').params).toEqual({
      operation: 'rent',
      propertyType: 'flat',
      maxPrice: '900',
    });
    expect(interpretSearchText('piso 900€/mes').params.maxPrice).toBe('900');
    expect(interpretSearchText('piso 900 euros al mes').unrecognised).toEqual([]);
  });

  it('un importe con más de dos decimales no se interpreta ni se redondea', () => {
    const result = interpretSearchText('hasta 19,999 €');
    expect(result.params).toEqual({});
    expect(result.unrecognised).toEqual(['hasta 19,999 €']);
  });

  it('"más de N habitaciones" es N+1; "al menos N" y "N habitaciones" son N', () => {
    expect(interpretSearchText('más de 2 habitaciones').params).toEqual({ minRooms: '3' });
    expect(interpretSearchText('al menos 3 habitaciones').params).toEqual({ minRooms: '3' });
    expect(interpretSearchText('3 dormitorios').params).toEqual({ minRooms: '3' });
    expect(interpretSearchText('dos habitaciones').params).toEqual({ minRooms: '2' });
    expect(interpretSearchText('piso de 3 hab.').params).toEqual({ propertyType: 'flat', minRooms: '3' });
  });

  it('baños: "2 baños" y "más de 1 baño"', () => {
    expect(interpretSearchText('2 baños').params).toEqual({ minBathrooms: '2' });
    expect(interpretSearchText('más de 1 baño').params).toEqual({ minBathrooms: '2' });
  });

  it('un máximo de habitaciones no está soportado y no se convierte en mínimo', () => {
    const result = interpretSearchText('piso hasta 3 hab.');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.unrecognised).toEqual(['hasta 3 hab']);
    expect(interpretSearchText('menos de 3 habitaciones').params).toEqual({});
  });

  it('"entre 2 y 3 habitaciones" no se queda con un mínimo a medias', () => {
    const result = interpretSearchText('entre 2 y 3 habitaciones');
    expect(result.params).toEqual({});
    expect(result.unrecognised).toEqual(['entre 2', '3 habitaciones']);
  });

  it('orden: "más baratos", "de mayor a menor precio", "ordenados por superficie"', () => {
    expect(interpretSearchText('pisos más baratos').params).toEqual({
      propertyType: 'flat',
      sort: 'price',
      dir: 'asc',
    });
    expect(interpretSearchText('de mayor a menor precio').params).toEqual({ sort: 'price', dir: 'desc' });
    expect(interpretSearchText('ordenados por superficie descendente').params).toEqual({
      sort: 'surface',
      dir: 'desc',
    });
    expect(interpretSearchText('ordenado por precio').params).toEqual({ sort: 'price' });
    expect(interpretSearchText('más recientes').params).toEqual({ sort: 'updated', dir: 'desc' });
  });

  it('tipos: cada sinónimo y el más largo gana ("local comercial", "plaza de garaje")', () => {
    const typeOf = (text: string): string | undefined => interpretSearchText(text).params.propertyType;
    expect(typeOf('apartamento')).toBe('flat');
    expect(typeOf('chalet')).toBe('house');
    expect(typeOf('adosado')).toBe('house');
    expect(typeOf('ático')).toBe('penthouse');
    expect(typeOf('dúplex')).toBe('duplex');
    expect(typeOf('loft')).toBe('studio');
    expect(typeOf('estudio')).toBe('studio');
    expect(typeOf('parcela')).toBe('land');
    expect(typeOf('local comercial')).toBe('commercial');
    expect(interpretSearchText('local comercial').unrecognised).toEqual([]);
    expect(typeOf('plaza de garaje')).toBe('garage');
    expect(interpretSearchText('plaza de garaje').unrecognised).toEqual([]);
    expect(typeOf('trastero')).toBe('storage_room');
    expect(typeOf('edificio')).toBe('building');
  });

  it('operación: sinónimos y formas con preposición', () => {
    const operationOf = (text: string): string | undefined => interpretSearchText(text).params.operation;
    expect(operationOf('quiero comprar un piso')).toBe('sale');
    expect(operationOf('piso en venta')).toBe('sale');
    expect(operationOf('piso de alquiler')).toBe('rent');
    expect(operationOf('para alquilar')).toBe('rent');
    expect(operationOf('casa en renta')).toBe('rent');
  });

  it('muletillas al borde no se informan como no reconocidas', () => {
    const result = interpretSearchText('Busco un piso en alquiler en Getafe');
    expect(result.unrecognised).toEqual([]);
    expect(result.params).toEqual({ operation: 'rent', propertyType: 'flat' });
  });

  it('texto vacío: nada reconocido', () => {
    const result = interpretSearchText('   ');
    expect(result.params).toEqual({});
    expect(result.placeText).toBeNull();
    expect(result.unrecognised).toEqual([]);
  });
});

describe('interpretSearchText — guardas', () => {
  it('"con garaje" es una característica, no un tipo', () => {
    const result = interpretSearchText('piso con garaje');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.unrecognised).toEqual(['con garaje']);
  });

  it('un nombre de tipo precedido de número u ordinal no es el tipo buscado', () => {
    const house = interpretSearchText('casa de dos pisos');
    expect(house.params).toEqual({ propertyType: 'house' });
    expect(house.unrecognised).toEqual(['de dos pisos']);
    const second = interpretSearchText('segundo piso');
    expect(second.params).toEqual({});
    expect(second.unrecognised).toEqual(['segundo piso']);
    expect(interpretSearchText('2º piso').params).toEqual({});
    expect(interpretSearchText('un piso').params).toEqual({ propertyType: 'flat' });
  });

  it('"N metros de X" es una distancia, no una superficie', () => {
    const result = interpretSearchText('piso a 300 metros del metro');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.unrecognised).toEqual(['a 300 metros del metro']);
    expect(interpretSearchText('más de 80 metros').params).toEqual({ minSurface: '80' });
  });

  it('un tipo justo después de "en" forma parte del lugar ("en Casa de Campo")', () => {
    const result = interpretSearchText('piso en Casa de Campo');
    expect(result.params).toEqual({ propertyType: 'flat' });
    expect(result.placeText).toBe('Casa de Campo');
  });
});

describe('interpretSearchText — lugar', () => {
  it('"en", "cerca de" y "zona de" son equivalentes', () => {
    for (const phrase of ['piso en Getafe', 'piso cerca de Getafe', 'piso zona de Getafe', 'piso zona Getafe']) {
      expect(interpretSearchText(phrase).placeText).toBe('Getafe');
    }
  });

  it('el lugar es una ristra de varias palabras que corta en una palabra de parada', () => {
    expect(interpretSearchText('piso en San Sebastián de los Reyes con 2 habitaciones').placeText).toBe(
      'San Sebastián de los Reyes'
    );
    expect(interpretSearchText('piso en Getafe, 2 habitaciones').placeText).toBe('Getafe');
    expect(interpretSearchText('piso en Getafe ordenados por precio').placeText).toBe('Getafe');
  });

  it('un lugar de más de 64 caracteres no se acepta y queda sin reconocer', () => {
    const long = 'a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(10);
    const result = interpretSearchText(`piso en ${long}`);
    expect(result.placeText).toBeNull();
    expect(result.unrecognised).toEqual([`en ${long}`]);
  });

  it('dos lugares distintos son conflicto; el mismo lugar repetido, no', () => {
    const conflict = interpretSearchText('piso en Getafe o en Leganés');
    expect(conflict.placeText).toBeNull();
    expect(conflict.conflicts[0]?.field).toBe('place');
    const same = interpretSearchText('piso en Getafe cerca de Getafe');
    expect(same.placeText).toBe('Getafe');
    expect(same.conflicts).toEqual([]);
  });

  it('sin lugar: placeText nulo', () => {
    expect(interpretSearchText('piso en alquiler').placeText).toBeNull();
  });
});
