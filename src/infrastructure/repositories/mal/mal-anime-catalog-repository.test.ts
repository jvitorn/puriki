import animeCollectionFixture from '@/infrastructure/api/mal/fixtures/anime-collection.json';
import animeDetailFixture from '@/infrastructure/api/mal/fixtures/anime-detail.json';
import type { MalClientPort } from '@/infrastructure/api/mal/mal-client';
import { MalNotFoundError } from '@/infrastructure/api/mal/mal-errors';
import { MAL_ANIME_FIELDS } from '@/infrastructure/api/mal/mal-fields';
import {
  currentMalSeason,
  MalAnimeCatalogRepository,
} from '@/infrastructure/repositories/mal/mal-anime-catalog-repository';

function detailFor(id: number) {
  return { ...animeDetailFixture, id, title: `Detail Anime ${id}` };
}

function createRepository() {
  const search = jest.fn(async () => animeCollectionFixture);
  const getDetails = jest.fn(async (id: number) => detailFor(id));
  const getRanking = jest.fn(async () => animeCollectionFixture);
  const getSeason = jest.fn(async () => animeCollectionFixture);
  const client: MalClientPort = {
    anime: { search, getDetails, getRanking, getSeason },
  };
  const repository = new MalAnimeCatalogRepository({
    client,
    now: () => new Date(2026, 7, 6),
    random: () => 0.25,
  });
  return { client, getDetails, getRanking, getSeason, repository, search };
}

describe('MAL anime catalog repository', () => {
  it.each([
    [new Date(2026, 0, 1), 'winter'],
    [new Date(2026, 3, 1), 'spring'],
    [new Date(2026, 6, 1), 'summer'],
    [new Date(2026, 9, 1), 'fall'],
  ] as const)('maps %s to the %s season', (date, season) => {
    expect(currentMalSeason(date)).toEqual({ year: 2026, season });
  });

  it('uses the verified ranking and current-season requests with explicit fields', async () => {
    const { getRanking, getSeason, repository } = createRepository();
    await expect(repository.getPopular()).resolves.toHaveLength(2);
    await expect(repository.getSeasonal()).resolves.toHaveLength(2);
    await expect(repository.getUpcoming()).resolves.toHaveLength(2);
    expect(getRanking).toHaveBeenNthCalledWith(1, {
      ranking_type: 'bypopularity',
      limit: 25,
      fields: MAL_ANIME_FIELDS,
    });
    expect(getSeason).toHaveBeenCalledWith(2026, 'summer', {
      limit: 25,
      sort: 'anime_num_list_users',
      fields: MAL_ANIME_FIELDS,
    });
    expect(getRanking).toHaveBeenNthCalledWith(2, {
      ranking_type: 'upcoming',
      limit: 25,
      fields: MAL_ANIME_FIELDS,
    });
  });

  it('normalizes search text and avoids a search request below two characters', async () => {
    const { getRanking, repository, search } = createRepository();
    await repository.search('  FRIEREN   Beyond ');
    expect(search).toHaveBeenCalledWith({
      q: 'frieren beyond',
      limit: 25,
      fields: MAL_ANIME_FIELDS,
    });
    await repository.search(' f ');
    expect(search).toHaveBeenCalledTimes(1);
    expect(getRanking).toHaveBeenCalledWith(
      expect.objectContaining({ ranking_type: 'bypopularity' }),
    );
  });

  it('fetches and caches public anime details', async () => {
    const { getDetails, repository } = createRepository();
    await expect(repository.getDetailsById(42)).resolves.toMatchObject({
      id: 42,
      title: 'Detail Anime 42',
    });
    await repository.getDetailsById(42);
    expect(getDetails).toHaveBeenCalledTimes(1);
    expect(getDetails).toHaveBeenCalledWith(42, MAL_ANIME_FIELDS);
  });

  it('maps and caches a legitimate MAL detail 404 as null', async () => {
    const { getDetails, repository } = createRepository();
    getDetails.mockRejectedValueOnce(new MalNotFoundError());
    await expect(repository.getDetailsById(404)).resolves.toBeNull();
    await expect(repository.getDetailsById(404)).resolves.toBeNull();
    expect(getDetails).toHaveBeenCalledTimes(1);
  });

  it('resolves collection IDs without N+1 detail requests', async () => {
    const { getDetails, repository } = createRepository();
    await repository.getPopular();
    const result = await repository.getManyByIds([1, 52991, 1]);
    expect(result.map((item) => item.id)).toEqual([1, 52991]);
    expect(getDetails).not.toHaveBeenCalled();
  });

  it('fetches only unique IDs missing from the collection cache', async () => {
    const { getDetails, repository } = createRepository();
    await repository.getPopular();
    const result = await repository.getManyByIds([1, 7, 8, 7, -1]);
    expect(result.map((item) => item.id)).toEqual([1, 7, 8]);
    expect(getDetails).toHaveBeenCalledTimes(2);
    expect(getDetails.mock.calls.map(([id]) => id)).toEqual([7, 8]);
  });

  it('coalesces concurrent collection and detail requests', async () => {
    const { getDetails, getRanking, repository } = createRepository();
    const [popular, concurrentPopular] = await Promise.all([
      repository.getPopular(),
      repository.getPopular(),
    ]);
    const [detail, concurrentDetail] = await Promise.all([
      repository.getDetailsById(77),
      repository.getDetailsById(77),
    ]);
    expect(concurrentPopular).toBe(popular);
    expect(concurrentDetail).toBe(detail);
    expect(getRanking).toHaveBeenCalledTimes(1);
    expect(getDetails).toHaveBeenCalledTimes(1);
  });

  it('keeps session order and featured selection stable', async () => {
    const { getRanking, getSeason, repository } = createRepository();
    const first = await repository.getPopular();
    const second = await repository.getPopular();
    const featured = await repository.getFeatured();
    expect(second).toBe(first);
    expect(await repository.getFeatured()).toBe(featured);
    expect(featured).toMatchObject({
      synopsis: expect.stringMatching(/.+/),
      score: expect.any(Number),
      largePosterImageUrl: expect.any(String),
    });
    expect(getRanking).toHaveBeenCalledTimes(2);
    expect(getSeason).toHaveBeenCalledTimes(1);
  });

  it('clears collection, detail, session, featured, and in-flight cache state', async () => {
    const { getDetails, getRanking, repository } = createRepository();
    await repository.getPopular();
    await repository.getDetailsById(77);
    await repository.getFeatured();
    repository.clearCache();
    await repository.getPopular();
    await repository.getDetailsById(77);
    expect(getRanking).toHaveBeenCalledTimes(3);
    expect(getDetails).toHaveBeenCalledTimes(2);
  });

  it('replaces every discovery collection after a successful refresh', async () => {
    const { getRanking, getSeason, repository } = createRepository();
    const original = await repository.getPopular();
    const refreshed = {
      data: [
        {
          node: { ...animeDetailFixture, id: 900, title: 'Refreshed Anime' },
        },
      ],
    };
    getRanking.mockResolvedValue(
      refreshed as unknown as typeof animeCollectionFixture,
    );
    getSeason.mockResolvedValue(
      refreshed as unknown as typeof animeCollectionFixture,
    );
    await repository.refresh();
    expect((await repository.getPopular()).map((item) => item.id)).toEqual([
      900,
    ]);
    expect((await repository.getPopular()).map((item) => item.id)).not.toEqual(
      original.map((item) => item.id),
    );
  });

  it('coalesces refreshes and preserves valid data after a failed refresh', async () => {
    const { getRanking, repository } = createRepository();
    const original = await repository.getPopular();
    getRanking.mockRejectedValue(new Error('temporary failure'));
    const first = repository.refresh();
    const concurrent = repository.refresh();
    expect(concurrent).toBe(first);
    await expect(first).rejects.toThrow('temporary failure');
    await expect(repository.getPopular()).resolves.toBe(original);
  });
});
