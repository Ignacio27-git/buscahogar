import { describe, expect, it } from 'vitest';

import { countCompleteness, selectWinningListing } from '../src/consolidation/winner.js';
import type { WinnerCandidate } from '../src/consolidation/winner.js';
import type { Listing } from '../src/schemas/listing.schema.js';
import { makeListing } from './test-helpers.js';

// Fábrica mínima de WinnerCandidate: listingId y capturedAt son los dos
// campos que el comparador de D4 interpreta directamente; el resto viene de
// makeListing (test-helpers.ts), que siempre pasa por listingSchema.parse.
function candidate(listingId: string, capturedAt: Date, listingOverrides: Partial<Listing> = {}): WinnerCandidate {
  return { listing: makeListing(listingOverrides), listingId, capturedAt };
}

describe('CONS-2a: la completitud decide el ganador, incluso con un cambio de contenido menos reciente', () => {
  it('el candidato con más campos opcionales poblados gana aunque su capturedAt sea anterior', () => {
    const older = new Date('2024-01-01T00:00:00Z');
    const newer = new Date('2024-06-01T00:00:00Z');

    const moreComplete = candidate('a', older, {
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      floor: '2',
      title: 'Piso luminoso',
      description: 'Reformado hace poco',
      address: 'Calle Mayor 1',
    });
    const lessComplete = candidate('b', newer, { surfaceM2: 90 });

    const winner = selectWinningListing([lessComplete, moreComplete]);

    expect(winner.listingId).toBe('a');
  });
});

describe('CONS-2b: la recencia solo desempata entre candidatos de completitud IGUAL', () => {
  it('con la misma completitud, gana el capturedAt más reciente', () => {
    const older = new Date('2024-01-01T00:00:00Z');
    const newer = new Date('2024-06-01T00:00:00Z');

    // Ambos con completitud 2 (surfaceM2 + un campo más cada uno).
    const a = candidate('a', older, { surfaceM2: 90, rooms: 3 });
    const b = candidate('b', newer, { surfaceM2: 95, floor: '3' });

    const winner = selectWinningListing([a, b]);

    expect(winner.listingId).toBe('b');
  });

  it('una completitud mayor sigue ganando aunque su capturedAt sea el más antiguo del grupo', () => {
    // Triangulación del caso anterior con una tercera entrada: la recencia
    // nunca debe imponerse sobre una completitud estrictamente mayor.
    const oldest = new Date('2023-01-01T00:00:00Z');
    const newest = new Date('2024-06-01T00:00:00Z');

    const mostComplete = candidate('a', oldest, { surfaceM2: 90, rooms: 3, bathrooms: 2 });
    const leastComplete = candidate('b', newest, { surfaceM2: 90 });

    expect(selectWinningListing([mostComplete, leastComplete]).listingId).toBe('a');
  });
});

describe('CONS-3a: la recencia es SIEMPRE de cambio de contenido, nunca de re-observación', () => {
  it('el candidato cuyo contenido cambió de verdad más recientemente gana el desempate', () => {
    // WinnerCandidate.capturedAt debe proceder de listing_versions.capturedAt
    // (recencia de CAMBIO), nunca de listings.lastSeenAt (avanza en cada
    // barrido incluso sin cambio — Q4, D4 rechaza explícitamente esta
    // alternativa). El tipo WinnerCandidate no expone ningún campo
    // "lastSeenAt": solo puede alimentarse con la fecha correcta por
    // construcción, así que este test comprueba que, dado ese campo, el
    // desempate lo decide correctamente.
    const merelyReobservedButUnchanged = new Date('2024-01-01T00:00:00Z');
    const genuinelyChangedLater = new Date('2024-03-01T00:00:00Z');

    const a = candidate('a', merelyReobservedButUnchanged, { surfaceM2: 90 });
    const b = candidate('b', genuinelyChangedLater, { surfaceM2: 90 });

    const winner = selectWinningListing([a, b]);

    expect(winner.listingId).toBe('b');
    // Documentación ejecutable de la exclusión estructural: el objeto
    // devuelto solo puede llevar los campos que WinnerCandidate declara.
    expect(Object.keys(winner)).not.toContain('lastSeenAt');
  });
});

describe('D4 clave 3: completitud Y capturedAt empatados ⇒ gana el listingId más bajo (ASC)', () => {
  it('el caso común de una sola transacción de barrido: capturedAt byte-idéntico, listingId decide', () => {
    // capturedAt es defaultNow() y Postgres now() es hora de INICIO de
    // transacción: toda versión insertada durante un mismo barrido comparte
    // capturedAt exactamente. Sin esta tercera clave el ganador dependería
    // del orden que devolviera el driver — no reproducible (D4).
    const sameInstant = new Date('2024-05-01T10:00:00.000Z');

    const higherId = candidate('zzz-listing', sameInstant, { surfaceM2: 90 });
    const lowerId = candidate('aaa-listing', sameInstant, { surfaceM2: 90 });

    expect(selectWinningListing([higherId, lowerId]).listingId).toBe('aaa-listing');
  });

  it('el orden de entrada no cambia el resultado del triple empate', () => {
    const sameInstant = new Date('2024-05-01T10:00:00.000Z');
    const a = candidate('a', sameInstant, { surfaceM2: 90 });
    const b = candidate('b', sameInstant, { surfaceM2: 90 });

    expect(selectWinningListing([a, b]).listingId).toBe('a');
    expect(selectWinningListing([b, a]).listingId).toBe('a');
  });
});

describe('D4: operation y propertyType NO cuentan en la completitud (enums obligatorios, constantes)', () => {
  it('countCompleteness ignora operation y propertyType aunque difieran entre listings', () => {
    const sale = makeListing({ operation: 'sale', propertyType: 'flat' });
    const rent = makeListing({ operation: 'rent', propertyType: 'house' });

    expect(countCompleteness(sale)).toBe(countCompleteness(rent));
  });

  it('countCompleteness cuenta exactamente los siete campos opcionales de contenido, ni uno más', () => {
    const empty = makeListing({});
    const full = makeListing({
      surfaceM2: 90,
      rooms: 3,
      bathrooms: 2,
      floor: '2',
      title: 'Piso luminoso',
      description: 'Reformado hace poco',
      address: 'Calle Mayor 1',
    });

    expect(countCompleteness(empty)).toBe(0);
    expect(countCompleteness(full)).toBe(7);
  });

  it('un valor falsy real (planta baja, floor "0") cuenta como presente, no como ausente', () => {
    // Guarda contra una implementación que comprobara veracidad (`if
    // (value)`) en vez de ausencia real (`!== undefined`).
    const groundFloor = makeListing({ floor: '0' });

    expect(countCompleteness(groundFloor)).toBe(1);
  });
});
