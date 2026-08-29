import type { AuthSessionController } from '@/application/auth/auth-contracts';
import type { PrimaryListProviderController } from '@/application/user-list/primary-list-provider-contracts';
import { resolveUserListProvider } from '@/application/user-list/resolve-user-list-provider';
import { DataSourceError } from '@/domain/errors/domain-error';
import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import type { AuthProviderId, ConnectedAccount } from '@/domain/models/auth';
import type { PageResult } from '@/domain/models/pagination';
import type {
  UserAnimeListPageRequest,
  UserAnimeListRepository,
} from '@/domain/repositories/user-anime-list-repository';

export interface SessionAwareUserAnimeListRepositoryOptions {
  session: AuthSessionController;
  primaryListProvider: PrimaryListProviderController;
  guestRepository: UserAnimeListRepository;
  createRepository: Record<
    AuthProviderId,
    (account: ConnectedAccount) => UserAnimeListRepository
  >;
}

export class SessionAwareUserAnimeListRepository implements UserAnimeListRepository {
  private readonly session: AuthSessionController;
  private readonly primaryListProvider: PrimaryListProviderController;
  private readonly guestRepository: UserAnimeListRepository;
  private readonly createRepository: Record<
    AuthProviderId,
    (account: ConnectedAccount) => UserAnimeListRepository
  >;
  private readonly remoteRepositories = new Map<
    string,
    UserAnimeListRepository
  >();

  constructor(options: SessionAwareUserAnimeListRepositoryOptions) {
    this.session = options.session;
    this.primaryListProvider = options.primaryListProvider;
    this.guestRepository = options.guestRepository;
    this.createRepository = options.createRepository;
  }

  invalidateCache(): void {
    this.guestRepository.invalidateCache();
    this.remoteRepositories.forEach((repository) =>
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
    const resolution = resolveUserListProvider(
      this.session.getSnapshot().connections,
      this.primaryListProvider.getSnapshot(),
    );
    switch (resolution.kind) {
      case 'guest':
        return this.guestRepository;
      case 'active':
        return this.repositoryFor(resolution.provider, resolution.account);
      case 'reconnect_required':
        throw new DataSourceError(
          'session_expired',
          `The ${resolution.providers.join(', ')} account must be reconnected.`,
        );
      case 'primary_required':
        throw new DataSourceError(
          'primary_provider_required',
          'Choose which account is your primary list before continuing.',
        );
      case 'loading':
        throw new DataSourceError(
          'session_expired',
          'The primary list preference is still loading.',
        );
    }
  }

  private repositoryFor(
    provider: AuthProviderId,
    account: ConnectedAccount,
  ): UserAnimeListRepository {
    const key = `${provider}:${account.userId}`;
    const existing = this.remoteRepositories.get(key);
    if (existing) return existing;
    const repository = this.createRepository[provider](account);
    this.remoteRepositories.set(key, repository);
    return repository;
  }
}
