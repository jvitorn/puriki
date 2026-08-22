import type { MalAuthenticatedClientPort } from '@/infrastructure/api/mal/mal-authenticated-client';
import { MalNotFoundError, MalUnauthorizedError } from '@/infrastructure/api/mal/mal-errors';
import { MalUserAnimeListRepository } from '@/infrastructure/repositories/mal/mal-user-anime-list-repository';

function statusDto(overrides: Record<string, unknown> = {}) {
  return {
    status: 'watching',
    score: 0,
    num_episodes_watched: 0,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function listPage(
  entries: { id: number; list_status: Record<string, unknown> }[],
  nextOffset: number | null = null,
) {
  return {
    data: entries.map(({ id, list_status }) => ({
      node: { id },
      list_status,
    })),
    paging:
      nextOffset === null
        ? {}
        : { next: `https://api.myanimelist.net/v2/users/@me/animelist?offset=${nextOffset}` },
  };
}

function createClient(): jest.Mocked<MalAuthenticatedClientPort> {
  return {
    get: jest.fn(async (_path, _params) => ({ data: listPage([]), status: 200 })),
    patch: jest.fn(async (_path, _formBody) => ({ data: statusDto(), status: 200 })),
    delete: jest.fn(async (_path) => ({ data: null, status: 200 })),
  };
}

describe('MalUserAnimeListRepository', () => {
  it('paginates the full list following paging.next', async () => {
    const client = createClient();
    client.get
      .mockResolvedValueOnce({
        data: listPage([{ id: 1, list_status: statusDto() }], 100),
        status: 200,
      })
      .mockResolvedValueOnce({
        data: listPage([{ id: 2, list_status: statusDto({ status: 'completed' }) }]),
        status: 200,
      });
    const repository = new MalUserAnimeListRepository({ client });

    const page = await repository.getPage({ page: 1, pageSize: 25 });
    expect(page.totalCount).toBe(2);
    expect(page.items.map((item) => item.animeId)).toEqual([1, 2]);
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.get.mock.calls[0]?.[1]).toMatchObject({ offset: 0 });
    expect(client.get.mock.calls[1]?.[1]).toMatchObject({ offset: 100 });
  });

  it('serves subsequent reads from cache within the TTL', async () => {
    const client = createClient();
    client.get.mockResolvedValue({
      data: listPage([{ id: 1, list_status: statusDto() }]),
      status: 200,
    });
    const repository = new MalUserAnimeListRepository({ client });

    await repository.getPage({ page: 1, pageSize: 25 });
    await repository.getPage({ page: 1, pageSize: 25 });
    expect(client.get).toHaveBeenCalledTimes(1);

    repository.invalidateCache();
    await repository.getPage({ page: 1, pageSize: 25 });
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('adds a new anime, updates progress, status, and score', async () => {
    const client = createClient();
    client.get.mockResolvedValue({ data: listPage([]), status: 200 });
    client.patch.mockResolvedValueOnce({
      data: statusDto({ status: 'watching', num_episodes_watched: 3 }),
      status: 200,
    });
    const repository = new MalUserAnimeListRepository({ client });

    const added = await repository.addToList(21, 'watching');
    expect(added).toMatchObject({ animeId: 21, status: 'watching', watchedEpisodes: 3 });
    expect(client.patch).toHaveBeenCalledWith('/anime/21/my_list_status', {
      status: 'watching',
    });

    client.patch.mockResolvedValueOnce({
      data: statusDto({ status: 'watching', num_episodes_watched: 10 }),
      status: 200,
    });
    const progressed = await repository.updateProgress(21, 10);
    expect(progressed.watchedEpisodes).toBe(10);

    client.patch.mockResolvedValueOnce({
      data: statusDto({ status: 'completed', num_episodes_watched: 10 }),
      status: 200,
    });
    const statusUpdated = await repository.updateStatus(21, 'completed');
    expect(statusUpdated.status).toBe('completed');

    client.patch.mockResolvedValueOnce({
      data: statusDto({ status: 'completed', num_episodes_watched: 10, score: 9 }),
      status: 200,
    });
    const scored = await repository.updateScore(21, 9);
    expect(scored.userScore).toBe(9);
    expect(client.patch).toHaveBeenLastCalledWith('/anime/21/my_list_status', {
      score: 9,
    });
  });

  it('rejects mutating an anime that is not in the list', async () => {
    const client = createClient();
    const repository = new MalUserAnimeListRepository({ client });
    await expect(repository.updateProgress(99, 1)).rejects.toMatchObject({
      name: 'DomainError',
    });
  });

  it('removes an entry and treats a 404 as already removed', async () => {
    const client = createClient();
    client.get.mockResolvedValue({
      data: listPage([{ id: 1, list_status: statusDto() }]),
      status: 200,
    });
    const repository = new MalUserAnimeListRepository({ client });
    await repository.getByAnimeId(1);

    await repository.removeFromList(1);
    expect(client.delete).toHaveBeenCalledWith('/anime/1/my_list_status');

    client.delete.mockRejectedValueOnce(new MalNotFoundError());
    await expect(repository.removeFromList(1)).resolves.toBeUndefined();
  });

  it('serializes concurrent mutations on the same anime', async () => {
    const client = createClient();
    client.get.mockResolvedValue({
      data: listPage([{ id: 1, list_status: statusDto() }]),
      status: 200,
    });
    const repository = new MalUserAnimeListRepository({ client });
    let resolveFirst: (() => void) | undefined;
    client.patch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({ data: statusDto({ num_episodes_watched: 1 }), status: 200 });
          }),
      )
      .mockResolvedValueOnce({
        data: statusDto({ num_episodes_watched: 2 }),
        status: 200,
      });

    const first = repository.updateProgress(1, 1);
    const second = repository.updateProgress(1, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.patch).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await first;
    await second;
    expect(client.patch).toHaveBeenCalledTimes(2);
  });

  it('invokes onUnauthorized and invalidates the cache on a 401', async () => {
    const client = createClient();
    client.get.mockRejectedValueOnce(new MalUnauthorizedError(401));
    const onUnauthorized = jest.fn();
    const repository = new MalUserAnimeListRepository({ client, onUnauthorized });

    await expect(repository.getPage({ page: 1, pageSize: 25 })).rejects.toBeInstanceOf(
      MalUnauthorizedError,
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
