// D.17 (B9, decisión 211) — una sola palabra para el estado de un anuncio en toda la ficha: la
// fila de la fuente y la insignia del histórico dicen lo mismo del mismo estado.
import { describe, expect, it } from 'vitest';

import { isListingAvailable, listingStatusLabel } from '../src/lib/listing-status.js';

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

// D.19 (decisión 231) — el verde de «Disponible» y su rótulo salen del mismo predicado, para que un
// estado nunca diga «No disponible» con el verde puesto (ni al revés).
describe('isListingAvailable', () => {
  it('solo el valor exacto «active» es disponible', () => {
    expect(isListingAvailable('active')).toBe(true);
  });

  it.each(['inactive', 'removed', 'pending-review', 'toString', 'Active', ''])(
    'el estado «%s» no es disponible',
    (status) => {
      expect(isListingAvailable(status)).toBe(false);
    }
  );

  it('concuerda con el rótulo en todos los estados', () => {
    for (const status of ['active', 'inactive', 'removed', 'otro']) {
      expect(listingStatusLabel(status) === 'Disponible').toBe(isListingAvailable(status));
    }
  });
});
