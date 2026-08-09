import { DomainError } from '@/domain/errors/domain-error';
import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { ANIME_STATUSES } from '@/shared/constants/anime-status';
import { makeAnime, resetAnimeBuilder } from '@/tests/builders/anime-builder';

async function getSessionEntries(session: GuestUserAnimeListRepository) {
  const page = await session.getPage({ page: 1, pageSize: 100 });
  return page.items;
}

function createCatalog(): {
  catalog: AnimeCatalogItem[];
  repository: jest.Mocked<AnimeCatalogRepository>;
} {
  resetAnimeBuilder();
  const catalog = Array.from({ length: 30 }, (_, index) =>
    makeAnime({
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
    getKnownById: jest.fn(
      (id) => catalog.find((anime) => anime.id === id) ?? null,
    ),
    clearCache: jest.fn(),
  };
  return { catalog, repository };
}

function createSession() {
  const { catalog, repository } = createCatalog();
  let randomValue = 0.17;
  const session = new GuestUserAnimeListRepository(repository, {
    random: () => {
      randomValue = (randomValue + 0.31) % 1;
      return randomValue;
    },
    now: () => new Date('2026-08-05T12:00:00.000Z'),
  });
  return { catalog, repository, session };
}

describe('GuestUserAnimeListRepository', () => {
  it('builds a 20-25 item real-ID sample spanning every status', async () => {
    const { session } = createSession();
    const entries = await getSessionEntries(session);
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
    const entries = await getSessionEntries(session);
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

  it('initializes directly from collection items without detail hydration', async () => {
    const { repository, session } = createSession();
    await Promise.all([getSessionEntries(session), getSessionEntries(session)]);
    expect(repository.getPopular).toHaveBeenCalledTimes(1);
    expect(repository.getSeasonal).toHaveBeenCalledTimes(1);
    expect(repository.getUpcoming).toHaveBeenCalledTimes(1);
    expect(repository.getManyByIds).not.toHaveBeenCalled();
    expect(repository.getDetailsById).not.toHaveBeenCalled();
  });

  it('initializes from successful collections when one Jikan rail fails', async () => {
    const { repository, session } = createSession();
    repository.getUpcoming.mockRejectedValueOnce(new Error('Unavailable'));
    const entries = await getSessionEntries(session);
    expect(entries.length).toBeGreaterThanOrEqual(20);
    expect(repository.getManyByIds).not.toHaveBeenCalled();
  });

  it('updates progress using the real episode total', async () => {
    const { catalog, session } = createSession();
    const entry = (await getSessionEntries(session)).find((item) => {
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
    const entry = (await getSessionEntries(session))[0];
    if (!entry) throw new Error('Expected a sample entry.');
    await session.updateProgress(entry.animeId, 3);
    await expect(
      session.updateStatus(entry.animeId, 'plan_to_watch'),
    ).resolves.toMatchObject({ status: 'plan_to_watch', watchedEpisodes: 0 });
    await expect(session.updateScore(entry.animeId, 9)).resolves.toMatchObject({
      userScore: 9,
    });
  });

  it('adds and removes real membership idempotently', async () => {
    const { catalog, session } = createSession();
    const initial = await getSessionEntries(session);
    const candidate = catalog.find(
      (anime) => !initial.some((entry) => entry.animeId === anime.id),
    );
    if (!candidate) throw new Error('Expected a non-member catalog item.');

    const added = await session.addToList(candidate.id);
    expect(added).toMatchObject({
      animeId: candidate.id,
      status: 'plan_to_watch',
      watchedEpisodes: 0,
      userScore: null,
    });
    await expect(session.addToList(candidate.id)).resolves.toEqual(added);
    expect(
      (await getSessionEntries(session)).filter(
        (entry) => entry.animeId === candidate.id,
      ),
    ).toHaveLength(1);

    await session.removeFromList(candidate.id);
    await expect(session.removeFromList(candidate.id)).resolves.toBeUndefined();
    await expect(session.getByAnimeId(candidate.id)).resolves.toBeNull();
  });

  it('rejects every update for an anime outside My List', async () => {
    const { catalog, repository, session } = createSession();
    const initial = await getSessionEntries(session);
    const candidate = catalog.find(
      (anime) => !initial.some((entry) => entry.animeId === anime.id),
    );
    if (!candidate) throw new Error('Expected a non-member catalog item.');

    await expect(
      session.updateProgress(candidate.id, 1),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      session.updateStatus(candidate.id, 'watching'),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(session.updateScore(candidate.id, 8)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(repository.getManyByIds).not.toHaveBeenCalled();
  });

  it('filters before pagination and returns stable cloned pages', async () => {
    const { session } = createSession();
    const all = await session.getPage({ page: 1, pageSize: 5 });
    const watching = await session.getPage({
      page: 1,
      pageSize: 2,
      status: 'watching',
    });
    expect(all.items).toHaveLength(5);
    expect(all.nextPage).toBe(2);
    expect(watching.items).toHaveLength(2);
    expect(watching.items.every((entry) => entry.status === 'watching')).toBe(
      true,
    );
    const repeated = await session.getPage({ page: 1, pageSize: 5 });
    expect(repeated.items).toEqual(all.items);
    const originalAnimeId = repeated.items[0]?.animeId;
    if (!all.items[0]) throw new Error('Expected a session entry.');
    all.items[0].animeId = -1;
    const isolated = await session.getPage({ page: 1, pageSize: 5 });
    expect(isolated.items[0]?.animeId).toBe(originalAnimeId);
  });

  it('rejects invalid page requests', async () => {
    const { session } = createSession();
    await expect(session.getPage({ page: 0, pageSize: 25 })).rejects.toThrow(
      'Page must',
    );
    await expect(session.getPage({ page: 1, pageSize: 0 })).rejects.toThrow(
      'Page size must',
    );
  });
});
