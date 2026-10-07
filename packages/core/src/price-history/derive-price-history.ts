// D.10 (decisión 178) — derivación pura del histórico de precios de una
// vivienda. Recibe las versiones de sus anuncios (estructural, sin depender
// de los tipos de `packages/db`) y devuelve una serie por anuncio con la
// primera observación y cada cambio real de precio. Sin Next ni ORM.

export interface PriceObservation {
  readonly sourceKey: string;
  readonly listingId: string;
  readonly status: string;
  readonly priceCents: number;
  readonly capturedAt: Date;
}

export interface PricePoint {
  readonly priceCents: number;
  readonly capturedAt: Date;
  /** Variación absoluta en céntimos respecto al punto anterior del anuncio; `null` en el primero. */
  readonly deltaCents: number | null;
  /** Variación en décimas de punto porcentual (-56 = -5,6 %); `null` en el primero o si el precio previo es 0. */
  readonly percentTenths: number | null;
}

export interface PriceSeries {
  readonly listingId: string;
  readonly sourceKey: string;
  readonly status: string;
  readonly points: readonly PricePoint[];
}

export interface PriceHistory {
  readonly series: readonly PriceSeries[];
  /** `true` solo si, tras el colapso, TODOS los anuncios tienen un único punto. Vacío -> `false`. */
  readonly unchanged: boolean;
  /** Primera captura más temprana entre los puntos conservados; `null` si no hay ninguno. */
  readonly firstObservedAt: Date | null;
}

// Variación porcentual en décimas de punto, con aritmética entera y un único
// redondeo, la mitad lejos de cero: sign(delta) * round(|delta| * 1000 / prev).
// `null` cuando el precio previo no es positivo (no hay base).
export function priceChangePercentTenths(previousCents: number, currentCents: number): number | null {
  if (previousCents <= 0) {
    return null;
  }
  const delta = currentCents - previousCents;
  if (delta === 0) {
    return 0;
  }
  const scaled = Math.abs(delta) * 1000;
  const quotient = Math.floor(scaled / previousCents);
  const remainder = scaled % previousCents;
  const rounded = quotient + (2 * remainder >= previousCents ? 1 : 0);
  return delta < 0 ? -rounded : rounded;
}

interface MutableSeries {
  readonly listingId: string;
  readonly sourceKey: string;
  readonly status: string;
  readonly points: PricePoint[];
}

export function derivePriceHistory(observations: readonly PriceObservation[]): PriceHistory {
  // `Array.prototype.sort` es estable: los empates de `capturedAt` conservan
  // el orden de entrada (orden de versión).
  const sorted = [...observations].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const byListing = new Map<string, MutableSeries>();
  for (const observation of sorted) {
    let series = byListing.get(observation.listingId);
    if (series === undefined) {
      series = {
        listingId: observation.listingId,
        sourceKey: observation.sourceKey,
        status: observation.status,
        points: [],
      };
      byListing.set(observation.listingId, series);
    }
    const previous = series.points[series.points.length - 1];
    if (previous === undefined) {
      series.points.push({
        priceCents: observation.priceCents,
        capturedAt: observation.capturedAt,
        deltaCents: null,
        percentTenths: null,
      });
    } else if (previous.priceCents !== observation.priceCents) {
      series.points.push({
        priceCents: observation.priceCents,
        capturedAt: observation.capturedAt,
        deltaCents: observation.priceCents - previous.priceCents,
        percentTenths: priceChangePercentTenths(previous.priceCents, observation.priceCents),
      });
    }
  }

  // Mismo orden que la lista de anuncios de origen (decisión 174): activos
  // primero, luego último precio conservado ascendente y por último id.
  const series = [...byListing.values()].sort((a, b) => {
    const activeA = a.status === 'active' ? 0 : 1;
    const activeB = b.status === 'active' ? 0 : 1;
    if (activeA !== activeB) {
      return activeA - activeB;
    }
    const lastA = a.points[a.points.length - 1]?.priceCents ?? 0;
    const lastB = b.points[b.points.length - 1]?.priceCents ?? 0;
    if (lastA !== lastB) {
      return lastA - lastB;
    }
    return a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0;
  });

  let firstObservedAt: Date | null = null;
  for (const s of series) {
    const first = s.points[0];
    if (first !== undefined && (firstObservedAt === null || first.capturedAt < firstObservedAt)) {
      firstObservedAt = first.capturedAt;
    }
  }

  return {
    series,
    unchanged: series.length > 0 && series.every((s) => s.points.length === 1),
    firstObservedAt,
  };
}
