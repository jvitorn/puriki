import animeCollectionFixture from '@/infrastructure/api/mal/fixtures/anime-collection.json';
import animeDetailFixture from '@/infrastructure/api/mal/fixtures/anime-detail.json';
import {
  isMalAnimeDto,
  isMalCollectionResponse,
  isMalDetailResponse,
} from '@/infrastructure/api/mal/mal-dtos';

describe('MAL response validators', () => {
  it('accepts the static collection and detail fixtures', () => {
    expect(isMalCollectionResponse(animeCollectionFixture)).toBe(true);
    expect(isMalDetailResponse(animeDetailFixture)).toBe(true);
  });

  it.each([
    null,
    {},
    { id: 0, title: 'Invalid' },
    { id: 1, title: '' },
    { id: 1, title: 'Valid', mean: Number.NaN },
    { id: 1, title: 'Valid', main_picture: { medium: 5 } },
    { id: 1, title: 'Valid', genres: [{ id: 1 }] },
  ])('rejects an invalid anime boundary value', (value) => {
    expect(isMalAnimeDto(value)).toBe(false);
  });

  it('rejects invalid collection edges, ranking, and paging values', () => {
    expect(isMalCollectionResponse({ data: [{ node: { id: 1 } }] })).toBe(
      false,
    );
    expect(
      isMalCollectionResponse({
        data: [{ node: { id: 1, title: 'Valid' }, ranking: { rank: '1' } }],
      }),
    ).toBe(false);
    expect(
      isMalCollectionResponse({
        data: [{ node: { id: 1, title: 'Valid' } }],
        paging: { next: 42 },
      }),
    ).toBe(false);
  });
});
