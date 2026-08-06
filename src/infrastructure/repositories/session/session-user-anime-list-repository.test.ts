import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { SessionUserAnimeListRepository } from '@/infrastructure/repositories/session/session-user-anime-list-repository';
import {
  createAnimeCatalogItem,
  resetAnimeFactory,
} from '@/mocks/factories/anime-factory';
import { ANIME_STATUSES } from '@/shared/constants/anime-status';

function createCatalog(): {
  catalog: AnimeCatalogItem[];
  repository: jest.Mocked<AnimeCatalogRepository>;
} {
  resetAnimeFactory(98);
  const catalog = Array.from({ length: 30 }, (_, index) =>
    createAnimeCatalogItem({
      id: 10_001 + index,
      title: `Real Anime ${index + 1}`,
      totalEpisodes: index === 4 ? null : 12 + (index % 3),
    }),
  );
  const repository: jest.Mocked<AnimeCatalogRepository> = {
    getFeatured: jest.fn(async () => catalog[0] as AnimeCatalogItem),
    getPopular: jest.fn(async () => catalog.slice(0, 20)),
    getSeasonal: jest.fn(async () => catalog.slice(10, 30)),
    getUpcoming: jest.fn(async () => catalog.slice(20, 30)),
    search: jest.fn(async (_query: string): Promise<AnimeCatalogItem[]> => []),
    getManyByIds: jest.fn(async (ids) => {
      const wanted = new Set(ids);
      return catalog.filter((anime) => wanted.has(anime.id));
    }),
    getDetailsById: jest.fn(
      async (id) => catalog.find((anime) => anime.id === id) ?? null,
    ),
    clearCache: jest.fn(),
  };
  return { catalog, repository };
}

function createSession() {
  const { catalog, repository } = createCatalog();
  let randomValue = 0.17;
  const session = new SessionUserAnimeListRepository(repository, {
    random: () => {
      randomValue = (randomValue + 0.31) % 1;
      return randomValue;
    },
    now: () => new Date('2026-08-05T12:00:00.000Z'),
  });
  return { catalog, repository, session };
}

describe('SessionUserAnimeListRepository', () => {
  it('builds a 20-25 item real-ID sample spanning every status', async () => {
    const { session } = createSession();
    const entries = await session.getAll();
    expect(entries.length).toBeGreaterThanOrEqual(20);
    expect(entries.length).toBeLessThanOrEqual(25);
    expect(entries.every((entry) => entry.animeId >= 10_001)).toBe(true);
    ANIME_STATUSES.forEach((status) =>
      expect(entries.some((entry) => entry.status === status)).toBe(true),
    );
    expect(entries.some((entry) => entry.userScore === null)).toBe(true);
    expect(entries.some((entry) => entry.userScore !== null)).toBe(true);
  });

  it('generates valid progress and includes an unknown episode total', async () => {
    const { catalog, session } = createSession();
    const entries = await session.getAll();
    const unknown = catalog.find((anime) => anime.totalEpisodes === null);
    expect(entries.some((entry) => entry.animeId === unknown?.id)).toBe(true);
    entries.forEach((entry) => {
      const anime = catalog.find((item) => item.id === entry.animeId);
      expect(entry.watchedEpisodes).toBeGreaterThanOrEqual(0);
      if (anime?.totalEpisodes !== null) {
        expect(entry.watchedEpisodes).toBeLessThanOrEqual(
          anime?.totalEpisodes ?? 0,
        );
      }
      if (entry.status === 'plan_to_watch') {
        expect(entry.watchedEpisodes).toBe(0);
      }
    });
  });

  it('initializes from collections without N+1 detail requests', async () => {
    const { repository, session } = createSession();
    await Promise.all([session.getAll(), session.getAll()]);
    expect(repository.getPopular).toHaveBeenCalledTimes(1);
    expect(repository.getSeasonal).toHaveBeenCalledTimes(1);
    expect(repository.getUpcoming).toHaveBeenCalledTimes(1);
    expect(repository.getManyByIds).toHaveBeenCalledTimes(1);
    expect(repository.getDetailsById).not.toHaveBeenCalled();
  });

  it('initializes from successful collections when one Jikan rail fails', async () => {
    const { repository, session } = createSession();
    repository.getUpcoming.mockRejectedValueOnce(new Error('Unavailable'));
    const entries = await session.getAll();
    expect(entries.length).toBeGreaterThanOrEqual(20);
    expect(repository.getManyByIds).toHaveBeenCalledTimes(1);
  });

  it('updates progress using the real episode total', async () => {
    const { catalog, session } = createSession();
    const entry = (await session.getAll()).find((item) => {
      const total = catalog.find(
        (anime) => anime.id === item.animeId,
      )?.totalEpisodes;
      return typeof total === 'number' && total > 0;
    });
    if (!entry) throw new Error('Expected a known-length sample entry.');
    const total = catalog.find(
      (anime) => anime.id === entry.animeId,
    )?.totalEpisodes;
    if (total === null || total === undefined)
      throw new Error('Missing total.');
    await expect(
      session.updateProgress(entry.animeId, total + 10),
    ).resolves.toMatchObject({
      watchedEpisodes: total,
      status: 'completed',
    });
  });

  it('updates status and score with existing domain rules', async () => {
    const { session } = createSession();
    const entry = (await session.getAll())[0];
    if (!entry) throw new Error('Expected a sample entry.');
    await session.updateProgress(entry.animeId, 3);
    await expect(
      session.updateStatus(entry.animeId, 'plan_to_watch'),
    ).resolves.toMatchObject({ status: 'plan_to_watch', watchedEpisodes: 0 });
    await expect(session.updateScore(entry.animeId, 9)).resolves.toMatchObject({
      userScore: 9,
    });
  });

  it('resets mutations back to the current session sample', async () => {
    const { session } = createSession();
    const original = await session.getAll();
    const first = original[0];
    if (!first) throw new Error('Expected a sample entry.');
    await session.updateScore(first.animeId, first.userScore === 10 ? 9 : 10);
    await session.reset();
    await expect(session.getAll()).resolves.toEqual(original);
  });

  it('can generate a fresh sample after catalog refresh', async () => {
    const { repository, session } = createSession();
    await session.getAll();
    await session.generateNewSample();
    expect(repository.getPopular).toHaveBeenCalledTimes(2);
    expect(repository.getSeasonal).toHaveBeenCalledTimes(2);
    expect(repository.getUpcoming).toHaveBeenCalledTimes(2);
    expect(repository.getManyByIds).toHaveBeenCalledTimes(2);
  });

  it('retains the current sample when generating a replacement fails', async () => {
    const { repository, session } = createSession();
    const original = await session.getAll();
    repository.getPopular.mockRejectedValueOnce(new Error('Unavailable'));
    repository.getSeasonal.mockRejectedValueOnce(new Error('Unavailable'));
    repository.getUpcoming.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(session.generateNewSample()).rejects.toThrow('Unavailable');
    await expect(session.getAll()).resolves.toEqual(original);
  });
});
