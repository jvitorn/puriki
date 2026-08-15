import { DomainError } from '@/domain/errors/domain-error';
import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
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
  const session = new GuestUserAnimeListRepository(repository, {
    now: () => new Date('2026-08-05T12:00:00.000Z'),
  });
  return { catalog, repository, session };
}

describe('GuestUserAnimeListRepository', () => {
  it('starts empty without loading discovery collections', async () => {
    const { repository, session } = createSession();

    await expect(session.getPage({ page: 1, pageSize: 25 })).resolves.toEqual({
      items: [],
      page: 1,
      nextPage: null,
      totalCount: 0,
    });
    expect(repository.getPopular).not.toHaveBeenCalled();
    expect(repository.getSeasonal).not.toHaveBeenCalled();
    expect(repository.getUpcoming).not.toHaveBeenCalled();
  });

  it('adds and removes real membership idempotently', async () => {
    const { catalog, session } = createSession();
    const candidate = catalog[0] as AnimeCatalogItem;

    const added = await session.addToList(candidate.id);
    expect(added).toMatchObject({
      animeId: candidate.id,
      status: 'plan_to_watch',
      watchedEpisodes: 0,
      userScore: null,
    });
    await expect(session.addToList(candidate.id)).resolves.toEqual(added);
    expect(await getSessionEntries(session)).toHaveLength(1);

    await session.removeFromList(candidate.id);
    await expect(session.removeFromList(candidate.id)).resolves.toBeUndefined();
    await expect(session.getByAnimeId(candidate.id)).resolves.toBeNull();
  });

  it('updates progress, status and score with existing domain rules', async () => {
    const { catalog, session } = createSession();
    const candidate = catalog[0] as AnimeCatalogItem;
    await session.addToList(candidate.id);

    await expect(
      session.updateProgress(candidate.id, (candidate.totalEpisodes ?? 1) + 10),
    ).resolves.toMatchObject({
      watchedEpisodes: candidate.totalEpisodes,
      status: 'completed',
    });
    await expect(
      session.updateStatus(candidate.id, 'plan_to_watch'),
    ).resolves.toMatchObject({ status: 'plan_to_watch', watchedEpisodes: 0 });
    await expect(session.updateScore(candidate.id, 9)).resolves.toMatchObject({
      userScore: 9,
    });
  });

  it('rejects every update for an anime outside My List', async () => {
    const { catalog, repository, session } = createSession();
    const candidate = catalog[0] as AnimeCatalogItem;

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
    const { catalog, session } = createSession();
    for (const [index, anime] of catalog.slice(0, 7).entries()) {
      await session.addToList(
        anime.id,
        index % 2 === 0 ? 'watching' : 'completed',
      );
    }

    const first = await session.getPage({ page: 1, pageSize: 3 });
    const second = await session.getPage({ page: 2, pageSize: 3 });
    const watching = await session.getPage({
      page: 1,
      pageSize: 2,
      status: 'watching',
    });
    expect(first).toMatchObject({ page: 1, nextPage: 2, totalCount: 7 });
    expect(first.items).toHaveLength(3);
    expect(second).toMatchObject({ page: 2, nextPage: 3, totalCount: 7 });
    expect(watching).toMatchObject({ page: 1, nextPage: 2, totalCount: 4 });
    expect(watching.items.every((entry) => entry.status === 'watching')).toBe(
      true,
    );

    const originalAnimeId = first.items[0]?.animeId;
    if (!first.items[0]) throw new Error('Expected a session entry.');
    first.items[0].animeId = -1;
    const isolated = await session.getPage({ page: 1, pageSize: 3 });
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
