import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { SessionAwareUserAnimeListRepository } from '@/infrastructure/repositories/session-aware-user-anime-list-repository';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';

function repository(): jest.Mocked<UserAnimeListRepository> {
  return {
    invalidateCache: jest.fn(),
    getPage: jest.fn(async ({ page }) => ({
      items: [],
      page,
      nextPage: null,
      totalCount: 0,
    })),
    getByAnimeId: jest.fn(async (_animeId: number) => null),
    addToList: jest.fn(),
    removeFromList: jest.fn(),
    updateProgress: jest.fn(),
    updateStatus: jest.fn(),
    updateScore: jest.fn(),
  };
}

function connected(userId = '42') {
  return {
    state: 'connected' as const,
    account: {
      provider: 'anilist' as const,
      userId,
      username: `user-${userId}`,
      avatarUrl: null,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    operation: 'idle' as const,
    failure: null,
    canRetry: false,
  };
}

describe('SessionAwareUserAnimeListRepository', () => {
  it('selects guest, AniList, and guest again after logout', async () => {
    const session = new TestAuthSessionController();
    const guest = repository();
    const remote = repository();
    const createRemote = jest.fn(() => remote);
    const subject = new SessionAwareUserAnimeListRepository({
      session,
      guestRepository: guest,
      createAniListRepository: createRemote,
    });

    await subject.getPage({ page: 1, pageSize: 10 });
    expect(guest.getPage).toHaveBeenCalledTimes(1);

    session.updateConnection('anilist', connected());
    await subject.getPage({ page: 1, pageSize: 10 });
    await subject.getByAnimeId(1);
    expect(createRemote).toHaveBeenCalledTimes(1);
    expect(remote.getPage).toHaveBeenCalledTimes(1);
    expect(remote.getByAnimeId).toHaveBeenCalledTimes(1);

    session.updateConnection('anilist', {
      state: 'disconnected',
      account: null,
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    await subject.getPage({ page: 1, pageSize: 10 });
    expect(guest.getPage).toHaveBeenCalledTimes(2);
  });

  it('never falls back to guest when reconnection is required', async () => {
    const session = new TestAuthSessionController();
    const guest = repository();
    session.updateConnection('anilist', {
      state: 'reconnect_required',
      account: null,
      operation: 'idle',
      failure: 'invalid_token',
      canRetry: false,
    });
    const subject = new SessionAwareUserAnimeListRepository({
      session,
      guestRepository: guest,
      createAniListRepository: repository,
    });

    await expect(
      subject.getPage({ page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({ code: 'session_expired' });
    expect(guest.getPage).not.toHaveBeenCalled();
  });

  it('keeps repositories per account and invalidates every snapshot', async () => {
    const session = new TestAuthSessionController();
    const guest = repository();
    const first = repository();
    const second = repository();
    const createRemote = jest
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const subject = new SessionAwareUserAnimeListRepository({
      session,
      guestRepository: guest,
      createAniListRepository: createRemote,
    });

    session.updateConnection('anilist', connected('1'));
    await subject.getByAnimeId(1);
    session.updateConnection('anilist', connected('2'));
    await subject.getByAnimeId(1);
    subject.invalidateCache();

    expect(createRemote).toHaveBeenCalledTimes(2);
    expect(guest.invalidateCache).toHaveBeenCalledTimes(1);
    expect(first.invalidateCache).toHaveBeenCalledTimes(1);
    expect(second.invalidateCache).toHaveBeenCalledTimes(1);
  });
});
