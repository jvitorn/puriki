import type { AnimeCatalogItem } from '@/domain/models/anime';
import { CatalogItemStore } from '@/infrastructure/repositories/resilient/catalog-item-store';

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
  it('deduplicates by ID and returns requested first-seen order', () => {
    const store = new CatalogItemStore();
    store.upsertMany(
      [anime(1, 'One'), anime(2, 'Two'), anime(3, 'Three')],
      'mal',
    );
    expect(
      store.getMany([3, -1, 1, 3, 2, 0, 1.5]).map((item) => item.id),
    ).toEqual([3, 1, 2]);
  });

  it('allows Jikan to upgrade MAL and cache data without later degradation', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'Cached'), 'cache');
    store.upsert(anime(1, 'MAL'), 'mal');
    expect(store.getStored(1)).toMatchObject({
      item: { title: 'MAL' },
      source: 'mal',
    });
    store.upsert(anime(1, 'Jikan detail'), 'jikan');
    store.upsert(anime(1, 'Later MAL fallback'), 'mal');
    store.upsert(anime(1, 'Later cache'), 'cache');
    expect(store.getStored(1)).toMatchObject({
      item: { title: 'Jikan detail' },
      source: 'jikan',
    });
  });

  it('returns mutation-safe clones and clears all session items', () => {
    const store = new CatalogItemStore();
    store.upsert(anime(1, 'Original'), 'jikan');
    const first = store.get(1);
    if (!first) throw new Error('Expected a stored item.');
    first.title = 'Mutated';
    first.genres.push('Mutation');
    expect(store.get(1)).toMatchObject({
      title: 'Original',
      genres: ['Action'],
    });
    store.clear();
    expect(store.get(1)).toBeUndefined();
  });
});
