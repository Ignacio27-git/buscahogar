// ROADMAP 1.12 (diseño D9, decisión 061) — construye el href de la página de
// detalle. Función pura, sin Next, para que el escenario "construir el href
// desde el listingId" sea falsificable sin renderizar nada.
export function buildPropertyDetailHref(listingId: string): string {
  return `/properties/${listingId}`;
}
