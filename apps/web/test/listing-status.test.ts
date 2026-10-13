// D.17 (B9, decisión 209) — una sola palabra para el estado de un anuncio en toda la ficha: la
// fila de la fuente y la insignia del histórico dicen lo mismo del mismo estado.
import { describe, expect, it } from 'vitest';

import { listingStatusLabel } from '../src/lib/listing-status.js';

describe('listingStatusLabel', () => {
  it('«active» es «Disponible»', () => {
    expect(listingStatusLabel('active')).toBe('Disponible');
  });

  it.each(['inactive', 'removed', 'pending-review', 'toString', ''])(
    'el estado «%s» (retirado, inactivo o desconocido) es «No disponible»',
    (status) => {
      expect(listingStatusLabel(status)).toBe('No disponible');
    }
  );
});
