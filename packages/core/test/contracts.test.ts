import { describe, expect, it } from 'vitest';

import type { AreaQuery } from '../src/schemas/area-query.schema.js';
import { listingSchema, type Listing } from '../src/schemas/listing.schema.js';
import type { DedupStrategy } from '../src/contracts/dedup-strategy.js';
import type { ListingNormalizer } from '../src/contracts/listing-normalizer.js';
import type { PropertySource } from '../src/contracts/property-source.js';
import type { SourcePage } from '../src/types/source-page.js';
import type { SimilarityResult } from '../src/types/similarity.js';

// Backstop ejecutable de D6/ROADMAP 1.4: `acme` es una fuente ficticia cuyo
// payload crudo no comparte NINGÚN nombre de campo con Idealista ni con
// ningún otro portal real. Si una particularidad de fuente concreta se
// hubiera colado en los tipos de dominio, esta fake dejaría de poder
// escribirse. Los nombres siguientes están elegidos deliberadamente para no
// coincidir con priceByArea, topPlus, suggestedTexts, propertyCode,
// newDevelopmentHighlight, hasLift, ubicationInfo, typology, subTypology,
// numPage, maxItems, totalPages, actualPage, homes ni premises.
interface AcmeRaw {
  readonly acmeListingRef: string;
  readonly askingPriceEuroCents: number;
  readonly kind: 'apartment' | 'office';
}

class AcmePropertySource implements PropertySource<AcmeRaw> {
  readonly id = 'acme';

  fetchArea(_area: AreaQuery, _cursor?: string): Promise<SourcePage<AcmeRaw>> {
    return Promise.resolve({
      items: [{ acmeListingRef: 'a-1', askingPriceEuroCents: 250_000_00, kind: 'apartment' }],
      total: 1,
    });
  }
}

class AcmeListingNormalizer implements ListingNormalizer<AcmeRaw> {
  normalize(raw: AcmeRaw): Listing {
    const parsed = listingSchema.parse({
      sourceId: 'acme',
      externalId: raw.acmeListingRef,
      url: `https://acme.example/${raw.acmeListingRef}`,
      operation: 'sale',
      propertyType: raw.kind === 'apartment' ? 'flat' : 'commercial',
      priceCents: raw.askingPriceEuroCents,
    });

    return parsed;
  }
}

class AcmeDedupStrategy implements DedupStrategy {
  readonly name = 'acme-exact-address';
  readonly version = '1.0.0';

  score(a: Listing, b: Listing): SimilarityResult {
    const sameAddress = a.address !== undefined && a.address === b.address;

    return {
      score: sameAddress ? 1 : 0,
      signals: { address: { value: sameAddress ? 1 : 0, weight: 1 } },
    };
  }
}

describe('contratos — anti-fuga de particularidades de fuente (D6)', () => {
  it('una fuente ficticia sin vocabulario compartido con ningún portal real implementa PropertySource', async () => {
    const source: PropertySource<AcmeRaw> = new AcmePropertySource();
    const page = await source.fetchArea({
      center: { latitude: 0, longitude: 0 },
      radiusMeters: 100,
      operation: 'sale',
    });

    expect(page.items[0]?.acmeListingRef).toBe('a-1');
  });

  it('su normalizador produce un valor que pasa listingSchema', () => {
    const normalizer: ListingNormalizer<AcmeRaw> = new AcmeListingNormalizer();
    const listing = normalizer.normalize({
      acmeListingRef: 'a-2',
      askingPriceEuroCents: 100_000_00,
      kind: 'office',
    });

    expect(listingSchema.safeParse(listing).success).toBe(true);
    expect(listing.propertyType).toBe('commercial');
  });

  it('una DedupStrategy ficticia con name, version y score compila e implementa el contrato', () => {
    const strategy: DedupStrategy = new AcmeDedupStrategy();
    const listing = listingSchema.parse({
      sourceId: 'acme',
      externalId: 'a-3',
      url: 'https://acme.example/a-3',
      operation: 'sale',
      propertyType: 'flat',
      priceCents: 100,
      address: 'Calle Falsa 123',
    });

    const result = strategy.score(listing, listing);
    expect(result.score).toBe(1);
    expect(strategy.version).toBe('1.0.0');
  });
});

describe('contratos — DedupStrategy.version es obligatorio (decisión 020)', () => {
  it('un stub sin version no compila como DedupStrategy', () => {
    // @ts-expect-error version es un miembro obligatorio de DedupStrategy
    const incomplete: DedupStrategy = {
      name: 'incompleto',
      score: (): SimilarityResult => ({ score: 0, signals: {} }),
    };

    expect(incomplete).toBeDefined();
  });
});

describe('contratos — el literal Promise<SourcePage> del documento sigue compilando', () => {
  it('una función tipada exactamente como en docs/ARCHITECTURE.md se asigna a PropertySource<T = unknown>', () => {
    // Literal tal cual aparece en el documento, sin argumento de tipo.
    const fetchArea = (_area: AreaQuery, _cursor?: string): Promise<SourcePage> =>
      Promise.resolve({ items: [] });

    const source: PropertySource = { id: 'doc-literal', fetchArea };

    expect(source.id).toBe('doc-literal');
  });
});
