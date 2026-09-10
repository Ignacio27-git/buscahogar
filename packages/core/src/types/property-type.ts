// Unión cerrada del tipo de propiedad. Decisión de producto confirmada
// (obs #67); tres miembros verificados contra datos reales de la fuente
// (docs/DECISIONS.md, decisión 027): `flat`, `duplex` y `penthouse`
// aparecen literalmente como valores de respuesta. Los ocho miembros
// restantes no están descartados, solo sin confirmar todavía — `other` es
// la válvula de seguridad mientras tanto.
//
// El tuple, no el `z.enum(...)`, es quien lleva `as const`: zod@4.5.4
// declara `_enum<const T extends readonly string[]>`, así que el
// parámetro de tipo ya infiere los literales sin anotarlo de nuevo.
export const PROPERTY_TYPES = [
  'flat',
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

export type PropertyType = (typeof PROPERTY_TYPES)[number];
