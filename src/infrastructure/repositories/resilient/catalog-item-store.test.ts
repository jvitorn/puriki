import type { AnimeCatalogItem } from '@/domain/models/anime';
import {
  CatalogItemStore,
  satisfiesMinimumCompleteness,
} from '@/infrastructure/repositories/resilient/catalog-item-store';

function anime(id: number, title: string): AnimeCatalogItem {
  return {
    id,
    title,
    alternativeTitles: [`${title} alternative`],
    synopsis: `${title} synopsis`,
    genres: ['Action'],
    studios: ['Studio'],
    totalEpisodes: 12,
    score: 8,
    season: 'Summer',
    year: 2026,
    airingStatus: 'Currently Airing',
    posterImageUrl: null,
    largePosterImageUrl: null,
    heroImageUrl: null,
    coverSeed: id,
    bannerSeed: id + 1,
  };
}

describe('CatalogItemStore', () => {
  it.each([
    ['summary', 'summary', true],
    ['summary', 'details', false],
    ['details', 'summary', true],
    ['details', 'details', true],
  ] as const)(
    'reports whether %s satisfies a %s requirement',
    (available, required, expected) => {
      expect(satisfiesMinimumCompleteness(available, required)).toBe(expected);
    },
  );

  it('deduplicates by ID and returns requested first-seen order', () => {
    const store = new CatalogItemStore();
    store.upsertMany([anime(1, 'One'), anime(2, 'Two'), anime(3, 'Three')], {
      source: 'mal',
      completeness: 'summary',
    });
    expect(
      store.getMany([3, -1, 1, 3, 2, 0, 1.5]).map((item) => item.id),
    ).toEqual([3, 1, 2]);
  });

  it('promotes a summary to details even when the detail source has lower priority', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'Jikan summary'), {
      source: 'jikan',
      completeness: 'summary',
    });
    store.upsert(anime(1, 'Cached details'), {
      source: 'cache',
      completeness: 'details',
    });
    expect(store.get(1)).toMatchObject({
      item: { title: 'Cached details' },
      source: 'cache',
      completeness: 'details',
    });
  });

  it.each(['jikan', 'mal', 'cache'] as const)(
    'never downgrades known details with a %s summary',
    (source) => {
      const store = new CatalogItemStore();
      store.upsert(anime(1, 'MAL details'), {
        source: 'mal',
        completeness: 'details',
      });
      store.upsert(anime(1, `${source} summary`), {
        source,
        completeness: 'summary',
      });
      expect(store.get(1)).toMatchObject({
        item: { title: 'MAL details' },
        source: 'mal',
        completeness: 'details',
      });
    },
  );

  it('uses provider priority only when completeness is equal', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'Cached summary'), {
      source: 'cache',
      completeness: 'summary',
    });
    store.upsert(anime(1, 'MAL summary'), {
      source: 'mal',
      completeness: 'summary',
    });
    store.upsert(anime(1, 'Jikan summary'), {
      source: 'jikan',
      completeness: 'summary',
    });
    store.upsert(anime(1, 'Later MAL summary'), {
      source: 'mal',
      completeness: 'summary',
    });
    expect(store.get(1)).toMatchObject({
      item: { title: 'Jikan summary' },
      source: 'jikan',
      completeness: 'summary',
    });
  });

  it('prefers Jikan over MAL when both entries contain details', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'MAL details'), {
      source: 'mal',
      completeness: 'details',
    });
    store.upsert(anime(1, 'Jikan details'), {
      source: 'jikan',
      completeness: 'details',
    });
    expect(store.get(1)).toMatchObject({
      item: { title: 'Jikan details' },
      source: 'jikan',
      completeness: 'details',
    });
  });

  it('returns only items that satisfy the requested minimum completeness', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'Summary'), {
      source: 'jikan',
      completeness: 'summary',
    });
    store.upsert(anime(2, 'Details'), {
      source: 'mal',
      completeness: 'details',
    });
    expect(store.getMany([1, 2], 'summary').map((item) => item.id)).toEqual([
      1, 2,
    ]);
    expect(store.getMany([1, 2], 'details').map((item) => item.id)).toEqual([
      2,
    ]);
  });

  it('returns mutation-safe clones and clears all session items', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'Original'), {
      source: 'jikan',
      completeness: 'details',
    });
    const first = store.get(1);
    if (!first) throw new Error('Expected a stored item.');
    first.item.title = 'Mutated';
    first.item.genres.push('Mutation');
    expect(store.get(1)).toMatchObject({
      item: { title: 'Original', genres: ['Action'] },
      source: 'jikan',
      completeness: 'details',
    });
    store.clear();
    expect(store.get(1)).toBeUndefined();
  });
});
