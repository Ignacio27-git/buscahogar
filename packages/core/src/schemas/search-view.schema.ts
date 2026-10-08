// ROADMAP 2.6 (map-view-search, decisión 118) — `?view=list|map`. Esquema
// propio, fuera del criterio de búsqueda: la vista no filtra nada. Ausente
// equivale a `list`; cualquier otro valor (o clave repetida) es un rechazo
// nombrado, nunca un valor por defecto silencioso.
import { z } from 'zod';

export const SEARCH_VIEWS = ['list', 'map'] as const;

export const searchViewSchema = z
  .enum(SEARCH_VIEWS, { error: 'elige lista o mapa.' })
  .default('list');

export type SearchView = z.infer<typeof searchViewSchema>;
