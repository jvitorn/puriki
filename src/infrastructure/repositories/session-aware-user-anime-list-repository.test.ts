import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { SessionAwareUserAnimeListRepository } from '@/infrastructure/repositories/session-aware-user-anime-list-repository';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';
import { createTestPrimaryListProvider } from '@/tests/user-list/test-primary-list-provider';

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

function connected(provider: 'anilist' | 'mal', userId = '42') {
  return {
    state: 'connected' as const,
    account: {
      provider,
      userId,
      username: `${provider}-${userId}`,
      avatarUrl: null,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    operation: 'idle' as const,
    failure: null,
    canRetry: false,
  };
}

const disconnected = {
  state: 'disconnected' as const,
  account: null,
  operation: 'idle' as const,
  failure: null,
  canRetry: false,
};

function buildSubject(
  overrides: {
    session?: TestAuthSessionController;
    primaryListProvider?: ReturnType<typeof createTestPrimaryListProvider>;
    guest?: jest.Mocked<UserAnimeListRepository>;
    anilist?: jest.Mocked<UserAnimeListRepository>;
    mal?: jest.Mocked<UserAnimeListRepository>;
  } = {},
) {
  const session = overrides.session ?? new TestAuthSessionController();
  const primaryListProvider =
    overrides.primaryListProvider ?? createTestPrimaryListProvider();
  const guest = overrides.guest ?? repository();
  const anilistRepo = overrides.anilist ?? repository();
  const malRepo = overrides.mal ?? repository();
  const createAniList = jest.fn(() => anilistRepo);
  const createMal = jest.fn(() => malRepo);
  const subject = new SessionAwareUserAnimeListRepository({
    session,
    primaryListProvider,
    guestRepository: guest,
    createRepository: { anilist: createAniList, mal: createMal },
  });
  return {
    session,
    primaryListProvider,
    guest,
    anilistRepo,
    malRepo,
    createAniList,
    createMal,
    subject,
  };
}

describe('SessionAwareUserAnimeListRepository', () => {
  it('selects guest, AniList, and guest again after logout', async () => {
    const { session, subject, guest, anilistRepo, createAniList } =
      buildSubject();

    await subject.getPage({ page: 1, pageSize: 10 });
    expect(guest.getPage).toHaveBeenCalledTimes(1);

    session.updateConnection('anilist', connected('anilist'));
    await subject.getPage({ page: 1, pageSize: 10 });
    await subject.getByAnimeId(1);
    expect(createAniList).toHaveBeenCalledTimes(1);
    expect(anilistRepo.getPage).toHaveBeenCalledTimes(1);
    expect(anilistRepo.getByAnimeId).toHaveBeenCalledTimes(1);

    session.updateConnection('anilist', disconnected);
    await subject.getPage({ page: 1, pageSize: 10 });
    expect(guest.getPage).toHaveBeenCalledTimes(2);
  });

  it('routes to MyAnimeList when only MAL is connected', async () => {
    const { session, subject, malRepo, createMal } = buildSubject();
    session.updateConnection('mal', connected('mal'));
    await subject.getPage({ page: 1, pageSize: 10 });
    expect(createMal).toHaveBeenCalledTimes(1);
    expect(malRepo.getPage).toHaveBeenCalledTimes(1);
  });

  it('never falls back to guest when reconnection is required', async () => {
    const session = new TestAuthSessionController();
    session.updateConnection('anilist', {
      state: 'reconnect_required',
      account: null,
      operation: 'idle',
      failure: 'invalid_token',
      canRetry: false,
    });
    const { subject, guest } = buildSubject({ session });

    await expect(
      subject.getPage({ page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({ code: 'session_expired' });
    expect(guest.getPage).not.toHaveBeenCalled();
  });

  it('keeps repositories per (provider, account) and invalidates every snapshot', async () => {
    const session = new TestAuthSessionController();
    const guest = repository();
    const first = repository();
    const second = repository();
    const createAniList = jest
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const subject = new SessionAwareUserAnimeListRepository({
      session,
      primaryListProvider: createTestPrimaryListProvider(),
      guestRepository: guest,
      createRepository: {
        anilist: createAniList,
        mal: jest.fn(() => repository()),
      },
    });

    session.updateConnection('anilist', connected('anilist', '1'));
    await subject.getByAnimeId(1);
    session.updateConnection('anilist', connected('anilist', '2'));
    await subject.getByAnimeId(1);
    subject.invalidateCache();

    expect(createAniList).toHaveBeenCalledTimes(2);
    expect(guest.invalidateCache).toHaveBeenCalledTimes(1);
    expect(first.invalidateCache).toHaveBeenCalledTimes(1);
    expect(second.invalidateCache).toHaveBeenCalledTimes(1);
  });

  describe('when both AniList and MyAnimeList are connected', () => {
    function bothConnected() {
      const session = new TestAuthSessionController();
      session.updateConnection('anilist', connected('anilist'));
      session.updateConnection('mal', connected('mal'));
      return session;
    }

    it('routes to AniList when it is the stored primary', async () => {
      const session = bothConnected();
      const primaryListProvider = createTestPrimaryListProvider({
        phase: 'ready',
        selected: 'anilist',
      });
      const { subject, anilistRepo, malRepo } = buildSubject({
        session,
        primaryListProvider,
      });
      await subject.getPage({ page: 1, pageSize: 10 });
      expect(anilistRepo.getPage).toHaveBeenCalledTimes(1);
      expect(malRepo.getPage).not.toHaveBeenCalled();
    });

    it('routes to MyAnimeList when it is the stored primary', async () => {
      const session = bothConnected();
      const primaryListProvider = createTestPrimaryListProvider({
        phase: 'ready',
        selected: 'mal',
      });
      const { subject, anilistRepo, malRepo } = buildSubject({
        session,
        primaryListProvider,
      });
      await subject.getPage({ page: 1, pageSize: 10 });
      expect(malRepo.getPage).toHaveBeenCalledTimes(1);
      expect(anilistRepo.getPage).not.toHaveBeenCalled();
    });

    it('throws primary_provider_required and never guesses when nothing is stored', async () => {
      const session = bothConnected();
      const { subject, anilistRepo, malRepo, guest } = buildSubject({
        session,
      });
      await expect(
        subject.getPage({ page: 1, pageSize: 10 }),
      ).rejects.toMatchObject({ code: 'primary_provider_required' });
      expect(anilistRepo.getPage).not.toHaveBeenCalled();
      expect(malRepo.getPage).not.toHaveBeenCalled();
      expect(guest.getPage).not.toHaveBeenCalled();
    });

    it('falls back to the sole remaining connected provider once the primary disconnects', async () => {
      const session = bothConnected();
      const primaryListProvider = createTestPrimaryListProvider({
        phase: 'ready',
        selected: 'mal',
      });
      const { subject, anilistRepo, malRepo } = buildSubject({
        session,
        primaryListProvider,
      });
      await subject.getPage({ page: 1, pageSize: 10 });
      expect(malRepo.getPage).toHaveBeenCalledTimes(1);

      session.updateConnection('mal', disconnected);
      await subject.getPage({ page: 1, pageSize: 10 });
      expect(anilistRepo.getPage).toHaveBeenCalledTimes(1);
    });
  });
});
