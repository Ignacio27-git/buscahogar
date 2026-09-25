// Utilidad compartida entre suites de test de esquemas. Existe para evitar
// desestructurar-y-descartar una variable (`const { x: _x, ...rest } = obj`),
// que el linter compartido marca como no-unused-vars: `argsIgnorePattern`
// solo perdona parámetros de función, no variables desestructuradas.
export function withoutField<T extends Record<string, unknown>>(
  obj: T,
  field: keyof T
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => key !== field));
}

// `makeListing` vive ahora en `src/evaluation/make-listing.ts` (ROADMAP 2.2,
// decisión 090) — el corpus etiquetado necesita alcanzarla desde fuera de
// `test/`, que no se publica en el paquete. Reexportada aquí sin cambios
// para que ningún test existente (`rule-based-strategy`, `winner`, etc.)
// tenga que cambiar su import.
export { makeListing } from '../src/evaluation/make-listing.js';
