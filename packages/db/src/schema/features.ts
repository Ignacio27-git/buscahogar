// Catálogo de comodidades (amenities) de una vivienda. Añadir una comodidad
// nueva es insertar una fila, no escribir una migración.
import { pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, id } from './columns';

export const features = pgTable('features', {
  id: id(),
  key: text('key').notNull().unique(),
  labelEs: text('label_es').notNull(),
  createdAt: createdAt(),
});
