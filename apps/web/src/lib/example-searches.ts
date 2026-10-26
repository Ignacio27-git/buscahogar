// D.22 (decisión 268, HH-2) — búsquedas de ejemplo de la portada. Son enlaces GET por criterios
// (operación, tipo, importe, habitaciones, superficie), nunca por zona ni por `?q=`: una zona
// puede registrar un `coverage_job` (y gastar cuota si un rastreador siguiera el enlace) y `?q=`
// lleva a la revisión, no a los resultados. Cada una es válida para `searchQuerySchema` (lo fija
// un test) y desemboca directamente en la lista. Módulo puro: sin Next ni ORM.

export interface ExampleSearch {
  readonly label: string;
  readonly params: Readonly<Record<string, string>>;
}

export const EXAMPLE_SEARCHES: readonly ExampleSearch[] = [
  { label: 'Pisos en alquiler hasta 900 €', params: { operation: 'rent', propertyType: 'flat', maxPrice: '900' } },
  { label: 'Áticos en venta', params: { operation: 'sale', propertyType: 'penthouse' } },
  { label: 'Venta con 3 habitaciones o más', params: { operation: 'sale', minRooms: '3' } },
  { label: 'Estudios en alquiler', params: { operation: 'rent', propertyType: 'studio' } },
  { label: 'Casas de más de 120 m²', params: { propertyType: 'house', minSurface: '120' } },
  { label: 'Venta hasta 250.000 €', params: { operation: 'sale', maxPrice: '250000' } },
];

// El `href` es el mismo que escribiría a mano quien filtrara: `/?` más los parámetros.
export function exampleSearchHref(search: ExampleSearch): string {
  return `/?${new URLSearchParams(search.params).toString()}`;
}
