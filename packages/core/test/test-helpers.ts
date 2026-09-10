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
