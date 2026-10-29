// D.14 (decisión 187, enmienda la 148) — cargador único de la cabecera de la ficha.
// El layout (comprobación de existencia, antes de cualquier frontera de streaming), la página
// y `generateMetadata` importan ESTA misma función: `cache()` de React solo comparte resultado
// entre llamadas a la misma función memoizada, así que tres `cache()` privados consultarían tres
// veces. Vive aquí y no en `layout.tsx` porque Next restringe los exports de un layout.
// Como `cache()` no guarda nada entre peticiones, no hay riesgo de servir datos de otro usuario.
import 'server-only';

import { cache } from 'react';

import { getPropertyDetailHeader } from '@buscahogar/db';

import { getDb } from '@/server/db';

export const loadPropertyHeader = cache((listingId: string) => getPropertyDetailHeader(getDb(), listingId));
