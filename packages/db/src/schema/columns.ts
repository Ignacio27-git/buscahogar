// Columnas y ayudantes compartidos entre las tablas del esquema.
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

// drizzle-orm 0.45.2 no expone un constructor nativo para el tipo `geography`
// de PostGIS (solo para `geometry`), así que se declara aquí como tipo
// personalizado. Se usa en la Fase 2 para la columna generada
// `location_geography` de `listings` y `properties`.
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
});

// Identificador primario común: UUID generado por la propia base de datos.
//
// El tipo real de esta cadena de builders de drizzle-orm es un genérico
// anidado (`PgUUIDBuilder<...>` transformado por `primaryKey()` y
// `defaultRandom()`); anotarlo a mano sería frágil ante cambios de versión y
// no aporta seguridad de tipos sobre lo que el compilador ya infiere
// correctamente. Se deja que `id()` exponga ese tipo inferido vía `ReturnType`.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const buildId = () => uuid('id').primaryKey().defaultRandom();

export function id(): ReturnType<typeof buildId> {
  return buildId();
}

// Marca de tiempo de creación, con zona horaria, con valor por defecto en el
// momento de la inserción. Mismo motivo que `buildId` para el disable.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const buildCreatedAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export function createdAt(): ReturnType<typeof buildCreatedAt> {
  return buildCreatedAt();
}
