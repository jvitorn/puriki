import type { AuthSessionController } from '@/application/auth/auth-contracts';
import { DataSourceError } from '@/domain/errors/domain-error';
import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import type { ConnectedAccount } from '@/domain/models/auth';
import type { PageResult } from '@/domain/models/pagination';
import type {
  UserAnimeListPageRequest,
  UserAnimeListRepository,
} from '@/domain/repositories/user-anime-list-repository';

export interface SessionAwareUserAnimeListRepositoryOptions {
  session: AuthSessionController;
  guestRepository: UserAnimeListRepository;
  createAniListRepository(account: ConnectedAccount): UserAnimeListRepository;
}

export class SessionAwareUserAnimeListRepository implements UserAnimeListRepository {
  private readonly session: AuthSessionController;
  private readonly guestRepository: UserAnimeListRepository;
  private readonly createAniListRepository: (
    account: ConnectedAccount,
  ) => UserAnimeListRepository;
  private readonly anilistRepositories = new Map<
    string,
    UserAnimeListRepository
  >();

  constructor(options: SessionAwareUserAnimeListRepositoryOptions) {
    this.session = options.session;
    this.guestRepository = options.guestRepository;
    this.createAniListRepository = options.createAniListRepository;
  }

  invalidateCache(): void {
    this.guestRepository.invalidateCache();
    this.anilistRepositories.forEach((repository) =>
      repository.invalidateCache(),
    );
  }

  async getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>> {
    return await this.activeRepository().getPage(request);
  }

  async getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    return await this.activeRepository().getByAnimeId(animeId);
  }

  async addToList(
    animeId: number,
    status?: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return await this.activeRepository().addToList(animeId, status);
  }

  async removeFromList(animeId: number): Promise<void> {
    await this.activeRepository().removeFromList(animeId);
  }

  async updateProgress(
    animeId: number,
    episodes: number,
  ): Promise<UserAnimeEntry> {
    return await this.activeRepository().updateProgress(animeId, episodes);
  }

  async updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return await this.activeRepository().updateStatus(animeId, status);
  }

  async updateScore(
    animeId: number,
    score: number | null,
  ): Promise<UserAnimeEntry> {
    return await this.activeRepository().updateScore(animeId, score);
  }

  private activeRepository(): UserAnimeListRepository {
    const connection = this.session.getSnapshot().connections.anilist;
    if (connection.state === 'disconnected') return this.guestRepository;
    if (connection.state !== 'connected' || !connection.account) {
      throw new DataSourceError(
        'session_expired',
        'The AniList account must be reconnected.',
      );
    }
    const key = connection.account.userId;
    const existing = this.anilistRepositories.get(key);
    if (existing) return existing;
    const repository = this.createAniListRepository(connection.account);
    this.anilistRepositories.set(key, repository);
    return repository;
  }
}
