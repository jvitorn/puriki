import animeCollectionFixture from '@/infrastructure/api/jikan/fixtures/anime-collection.json';
import animeFullFixture from '@/infrastructure/api/jikan/fixtures/anime-full.json';
import type { JikanClientPort } from '@/infrastructure/api/jikan/jikan-client';
import { JikanServiceUnavailableError } from '@/infrastructure/api/jikan/jikan-errors';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import { JikanAnimeCatalogRepository } from '@/infrastructure/repositories/jikan/jikan-anime-catalog-repository';

function createRepository() {
  const getTopAnime = jest.fn(async () => animeCollectionFixture);
  const getSeasonNow = jest.fn(async () => animeCollectionFixture);
  const getSeasonUpcoming = jest.fn(async () => animeCollectionFixture);
  const getAnimeSearch = jest.fn(async () => animeCollectionFixture);
  const getAnimeFullById = jest.fn(async (id: number) => ({
    data: {
      ...animeFullFixture.data,
      mal_id: id,
      title: `Detail Anime ${id}`,
    },
  }));
  const client: JikanClientPort = {
    anime: { getAnimeFullById, getAnimeSearch },
    seasons: { getSeasonNow, getSeasonUpcoming },
    top: { getTopAnime },
  };
  const repository = new JikanAnimeCatalogRepository({
    client,
    random: () => 0.25,
    scheduler: new JikanRequestScheduler({ requestIntervalMs: 0 }),
    sleep: async () => undefined,
  });
  return {
    client,
    getAnimeFullById,
    getAnimeSearch,
    getSeasonNow,
    getSeasonUpcoming,
    getTopAnime,
    repository,
  };
}

describe('JikanAnimeCatalogRepository', () => {
  it('uses the client port for popular, seasonal, and upcoming data', async () => {
    const { getSeasonNow, getSeasonUpcoming, getTopAnime, repository } =
      createRepository();
    await expect(repository.getPopular()).resolves.toHaveLength(2);
    await expect(repository.getSeasonal()).resolves.toHaveLength(2);
    await expect(repository.getUpcoming()).resolves.toHaveLength(2);
    expect(getTopAnime).toHaveBeenCalledWith();
    expect(getSeasonNow).toHaveBeenCalledWith();
    expect(getSeasonUpcoming).toHaveBeenCalledWith();
  });

  it('uses the client port with a normalized popularity search', async () => {
    const { getAnimeSearch, repository } = createRepository();
    const result = await repository.search('  Cowboy   BEBOP ');
    expect(result.map((item) => item.id)).toEqual([1, 21]);
    expect(getAnimeSearch).toHaveBeenCalledWith({
      limit: 25,
      order_by: 'popularity',
      q: 'cowboy bebop',
      sfw: true,
      sort: 'asc',
    });
  });

  it('maps and caches full details returned by the client port', async () => {
    const { getAnimeFullById, repository } = createRepository();
    await expect(repository.getDetailsById(1)).resolves.toMatchObject({
      id: 1,
      title: 'Detail Anime 1',
      studios: ['Sunrise'],
    });
    await repository.getDetailsById(1);
    expect(getAnimeFullById).toHaveBeenCalledTimes(1);
    expect(getAnimeFullById).toHaveBeenCalledWith(1);
  });

  it('resolves known summaries without detail requests', async () => {
    const { getAnimeFullById, repository } = createRepository();
    await repository.getPopular();
    await expect(repository.getManyByIds([21, 1, 21])).resolves.toHaveLength(2);
    expect(getAnimeFullById).not.toHaveBeenCalled();
  });

  it('fetches each unique missing ID once through getManyByIds', async () => {
    const { getAnimeFullById, repository } = createRepository();
    const result = await repository.getManyByIds([7, 8, 7]);
    expect(result.map((item) => item.id)).toEqual([7, 8]);
    expect(getAnimeFullById).toHaveBeenCalledTimes(2);
    expect(getAnimeFullById).toHaveBeenNthCalledWith(1, 7);
    expect(getAnimeFullById).toHaveBeenNthCalledWith(2, 8);
  });

  it('coalesces duplicate calls and keeps the session order stable', async () => {
    const { getTopAnime, repository } = createRepository();
    const [first, concurrent] = await Promise.all([
      repository.getPopular(),
      repository.getPopular(),
    ]);
    const second = await repository.getPopular();
    expect(concurrent.map((item) => item.id)).toEqual(
      first.map((item) => item.id),
    );
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect(concurrent).toBe(first);
    expect(second).toBe(first);
    expect(new Set(first.map((item) => item.id)).size).toBe(2);
    expect(getTopAnime).toHaveBeenCalledTimes(1);
  });

  it('chooses one stable featured anime from three client calls', async () => {
    const { getSeasonNow, getSeasonUpcoming, getTopAnime, repository } =
      createRepository();
    const first = await repository.getFeatured();
    const second = await repository.getFeatured();
    expect(second.id).toBe(first.id);
    expect(getTopAnime).toHaveBeenCalledTimes(1);
    expect(getSeasonNow).toHaveBeenCalledTimes(1);
    expect(getSeasonUpcoming).toHaveBeenCalledTimes(1);
  });

  it('keeps successful Jikan collections when one collection fails', async () => {
    const { client, repository } = createRepository();
    jest.mocked(client.seasons.getSeasonUpcoming).mockRejectedValueOnce(
      Object.assign(new Error('HTTP 400'), {
        response: { status: 400, headers: { get: () => null } },
      }),
    );
    await expect(repository.getFeatured()).resolves.toMatchObject({
      id: expect.any(Number),
    });
  });

  it('clears mapped collection, summary, detail, and session caches', async () => {
    const { getAnimeFullById, getTopAnime, repository } = createRepository();
    await repository.getPopular();
    await repository.getDetailsById(99);
    repository.clearCache();
    await repository.getPopular();
    await repository.getDetailsById(99);
    expect(getTopAnime).toHaveBeenCalledTimes(2);
    expect(getAnimeFullById).toHaveBeenCalledTimes(2);
  });

  it('atomically replaces discovery collections after a successful refresh', async () => {
    const { getSeasonNow, getSeasonUpcoming, getTopAnime, repository } =
      createRepository();
    const original = await repository.getPopular();
    const refreshedFixture = {
      ...animeCollectionFixture,
      data: animeCollectionFixture.data.map((anime, index) => ({
        ...anime,
        mal_id: 900 + index,
        title: `Refreshed ${index}`,
      })),
    };
    getTopAnime.mockResolvedValueOnce(refreshedFixture);
    getSeasonNow.mockResolvedValueOnce(refreshedFixture);
    getSeasonUpcoming.mockResolvedValueOnce(refreshedFixture);
    await repository.refresh();
    const refreshed = await repository.getPopular();
    expect(refreshed.map((item) => item.id)).not.toEqual(
      original.map((item) => item.id),
    );
    expect(refreshed.map((item) => item.id).sort()).toEqual([900, 901, 902]);
  });

  it('retains valid cached collections when refresh fails', async () => {
    const { getTopAnime, repository } = createRepository();
    const original = await repository.getPopular();
    getTopAnime.mockRejectedValue(new JikanServiceUnavailableError(504, null));
    await expect(repository.refresh()).rejects.toBeInstanceOf(
      JikanServiceUnavailableError,
    );
    await expect(repository.getPopular()).resolves.toEqual(original);
    expect(getTopAnime).toHaveBeenCalledTimes(4);
  });

  it('coalesces concurrent refresh operations', async () => {
    const { getSeasonNow, getSeasonUpcoming, getTopAnime, repository } =
      createRepository();
    await Promise.all([repository.refresh(), repository.refresh()]);
    expect(getTopAnime).toHaveBeenCalledTimes(1);
    expect(getSeasonNow).toHaveBeenCalledTimes(1);
    expect(getSeasonUpcoming).toHaveBeenCalledTimes(1);
  });

  it('treats a client detail 404 as a cached null', async () => {
    const error = Object.assign(new Error('HTTP 404'), {
      response: { status: 404, headers: { get: () => null } },
    });
    const getAnimeFullById = jest.fn(async () => Promise.reject(error));
    const client: JikanClientPort = {
      anime: {
        getAnimeFullById,
        getAnimeSearch: jest.fn(),
      },
      seasons: {
        getSeasonNow: jest.fn(),
        getSeasonUpcoming: jest.fn(),
      },
      top: { getTopAnime: jest.fn() },
    };
    const repository = new JikanAnimeCatalogRepository({
      client,
      scheduler: new JikanRequestScheduler({ requestIntervalMs: 0 }),
      sleep: async () => undefined,
    });
    await expect(repository.getDetailsById(404)).resolves.toBeNull();
    await expect(repository.getDetailsById(404)).resolves.toBeNull();
    expect(getAnimeFullById).toHaveBeenCalledTimes(1);
  });
});
