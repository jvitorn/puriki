import { DomainError, RepositoryError } from '@/domain/errors/domain-error';
import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import { validatePageRequest } from '@/domain/models/pagination';
import type { PageResult } from '@/domain/models/pagination';
import type {
  UserAnimeListPageRequest,
  UserAnimeListRepository,
} from '@/domain/repositories/user-anime-list-repository';
import { applyProgress } from '@/domain/rules/anime-progress';
import { validateUserScore } from '@/domain/rules/anime-score';
import { transitionStatus } from '@/domain/rules/anime-status';
import {
  executeAniListRequest,
  type AniListClientPort,
  type AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  AniListGraphQLExecutionError,
  AniListResponseFormatError,
  AniListUnauthorizedError,
} from '@/infrastructure/api/anilist/anilist-errors';
import {
  AniListMediaIdentityRegistry,
  type AniListMediaIdentityResolver,
} from '@/infrastructure/api/anilist/anilist-media-identity';
import {
  ANILIST_DELETE_USER_LIST_ENTRY_MUTATION,
  ANILIST_SAVE_USER_LIST_ENTRY_MUTATION,
  ANILIST_USER_LIST_QUERY,
} from '@/infrastructure/api/anilist/anilist-queries';
import {
  parseAniListDeletedUserListEntry,
  parseAniListSavedUserListEntry,
  parseAniListUserListChunk,
} from '@/infrastructure/api/anilist/anilist-user-list-dtos';
import {
  mapAniListUserListEntry,
  mapDomainScoreToRaw,
  mapDomainStatus,
  type MappedAniListUserEntry,
} from '@/infrastructure/api/anilist/anilist-user-list-mapper';

const DEFAULT_CACHE_TTL_MS = 30_000;
const ANILIST_LIST_CHUNK_SIZE = 500;
const MAXIMUM_LIST_CHUNKS = 100;

export interface AniListUserAnimeListRepositoryOptions {
  client: AniListClientPort;
  userId: number;
  cacheTtlMs?: number;
  now?: () => number;
  maximumAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onUnauthorized?: () => Promise<void> | void;
  mediaIdentityResolver?: AniListMediaIdentityResolver;
}

function cloneEntry(entry: UserAnimeEntry): UserAnimeEntry {
  return { ...entry };
}

function diagnostic(response: AniListClientResponse) {
  return {
    status: response.status,
    elapsedMs: response.elapsedMs,
    rateLimit: response.rateLimit,
    graphqlErrors: response.errors.map(({ message }) => message),
  };
}

function diagnosticError(response: AniListClientResponse): Error | null {
  const error = response.errors[0];
  return error
    ? new AniListGraphQLExecutionError(error.message, diagnostic(response))
    : null;
}

function newerEntry(
  current: MappedAniListUserEntry | undefined,
  candidate: MappedAniListUserEntry,
): MappedAniListUserEntry {
  if (!current) return candidate;
  return Date.parse(candidate.entry.updatedAt) >
    Date.parse(current.entry.updatedAt)
    ? candidate
    : current;
}

function normalizeEntries(
  entries: readonly MappedAniListUserEntry[],
): MappedAniListUserEntry[] {
  const byMediaId = new Map<number, MappedAniListUserEntry>();
  entries.forEach((candidate) => {
    byMediaId.set(
      candidate.mediaId,
      newerEntry(byMediaId.get(candidate.mediaId), candidate),
    );
  });
  const byMalId = new Map<number, MappedAniListUserEntry>();
  byMediaId.forEach((candidate) => {
    byMalId.set(
      candidate.entry.animeId,
      newerEntry(byMalId.get(candidate.entry.animeId), candidate),
    );
  });
  return [...byMalId.values()].sort(
    (left, right) =>
      Date.parse(right.entry.updatedAt) - Date.parse(left.entry.updatedAt) ||
      left.entry.animeId - right.entry.animeId,
  );
}

export class AniListUserAnimeListRepository implements UserAnimeListRepository {
  private readonly client: AniListClientPort;
  private readonly userId: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly maximumAttempts?: number;
  private readonly sleep?: (milliseconds: number) => Promise<void>;
  private readonly onUnauthorized?: () => Promise<void> | void;
  private readonly mediaIdentityResolver: AniListMediaIdentityResolver;
  private snapshot: MappedAniListUserEntry[] | null = null;
  private snapshotExpiresAt = 0;
  private inFlight: Promise<MappedAniListUserEntry[]> | null = null;
  private generation = 0;
  private mutationSequence = 0;
  private readonly mutationTails = new Map<number, Promise<void>>();

  constructor(options: AniListUserAnimeListRepositoryOptions) {
    if (!Number.isInteger(options.userId) || options.userId <= 0) {
      throw new Error('AniList user ID must be a positive integer.');
    }
    this.client = options.client;
    this.userId = options.userId;
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.now = options.now ?? Date.now;
    this.maximumAttempts = options.maximumAttempts;
    this.sleep = options.sleep;
    this.onUnauthorized = options.onUnauthorized;
    this.mediaIdentityResolver =
      options.mediaIdentityResolver ??
      new AniListMediaIdentityRegistry({
        client: this.client,
        maximumAttempts: this.maximumAttempts,
        sleep: this.sleep,
      });
  }

  invalidateCache(): void {
    this.generation += 1;
    this.snapshot = null;
    this.snapshotExpiresAt = 0;
    this.inFlight = null;
  }

  async getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>> {
    validatePageRequest(request);
    const snapshot = await this.getSnapshot();
    const filtered = request.status
      ? snapshot.filter(({ entry }) => entry.status === request.status)
      : snapshot;
    const start = (request.page - 1) * request.pageSize;
    const end = start + request.pageSize;
    return {
      items: filtered.slice(start, end).map(({ entry }) => cloneEntry(entry)),
      page: request.page,
      nextPage: end < filtered.length ? request.page + 1 : null,
      totalCount: filtered.length,
    };
  }

  async getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    const entry = this.findEntry(await this.getSnapshot(), animeId);
    return entry ? cloneEntry(entry.entry) : null;
  }

  addToList(
    animeId: number,
    status: AnimeListStatus = 'plan_to_watch',
  ): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const existing = this.findEntry(await this.getSnapshot(), animeId);
      if (existing) return cloneEntry(existing.entry);
      const identity = await this.resolveIdentity(animeId);
      if (!identity) throw new DomainError(`Anime ${animeId} was not found.`);
      const desired = transitionStatus(
        {
          animeId,
          status: 'plan_to_watch',
          watchedEpisodes: 0,
          userScore: null,
          updatedAt: new Date(this.now()).toISOString(),
        },
        status,
        identity.totalEpisodes,
      );
      const variables: Record<string, unknown> = {
        mediaId: identity.mediaId,
        status: mapDomainStatus(desired.status),
      };
      if (desired.watchedEpisodes > 0) {
        variables.progress = desired.watchedEpisodes;
      }
      const saved = await this.saveEntry(animeId, 'create', variables);
      this.assertSavedIdentity(saved, {
        animeId,
        mediaId: identity.mediaId,
      });
      this.commitSavedEntry(saved);
      return cloneEntry(saved.entry);
    });
  }

  removeFromList(animeId: number): Promise<void> {
    return this.serializeMutation(animeId, async () => {
      const current = this.findEntry(await this.getSnapshot(), animeId);
      if (!current) return;
      const response = await this.executeMutation(
        animeId,
        'delete',
        ANILIST_DELETE_USER_LIST_ENTRY_MUTATION,
        { listEntryId: current.listEntryId },
      );
      let deleted: boolean;
      try {
        deleted = parseAniListDeletedUserListEntry(response.data);
      } catch (error: unknown) {
        this.invalidateCache();
        throw this.responseFormatError(error, response);
      }
      if (!deleted) {
        this.invalidateCache();
        throw new RepositoryError('AniList did not delete the list entry.');
      }
      if (this.snapshot) {
        this.snapshot = this.snapshot.filter(
          ({ entry }) => entry.animeId !== animeId,
        );
        this.refreshSnapshotTtl();
      }
    });
  }

  updateProgress(animeId: number, episodes: number): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const current = await this.requireEntry(animeId);
      const desired = applyProgress(
        current.entry,
        episodes,
        current.totalEpisodes,
      );
      const variables: Record<string, unknown> = {
        listEntryId: current.listEntryId,
        progress: desired.watchedEpisodes,
      };
      if (desired.status !== current.entry.status) {
        variables.status = mapDomainStatus(desired.status);
      }
      return this.saveUpdatedEntry(animeId, current, 'progress', variables);
    });
  }

  updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const current = await this.requireEntry(animeId);
      const desired = transitionStatus(
        current.entry,
        status,
        current.totalEpisodes,
      );
      const variables: Record<string, unknown> = {
        listEntryId: current.listEntryId,
        status: mapDomainStatus(desired.status),
      };
      if (desired.watchedEpisodes !== current.entry.watchedEpisodes) {
        variables.progress = desired.watchedEpisodes;
      }
      return this.saveUpdatedEntry(animeId, current, 'status', variables);
    });
  }

  updateScore(animeId: number, score: number | null): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const current = await this.requireEntry(animeId);
      const validScore = validateUserScore(score);
      return this.saveUpdatedEntry(animeId, current, 'score', {
        listEntryId: current.listEntryId,
        scoreRaw: mapDomainScoreToRaw(validScore),
      });
    });
  }

  private getSnapshot(): Promise<MappedAniListUserEntry[]> {
    if (this.snapshot && this.now() < this.snapshotExpiresAt) {
      return Promise.resolve(this.snapshot);
    }
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const request = this.fetchSnapshot();
    this.inFlight = request;
    void request.then(
      (entries) => {
        if (generation === this.generation) {
          this.snapshot = entries;
          this.refreshSnapshotTtl();
        }
        if (this.inFlight === request) this.inFlight = null;
      },
      () => {
        if (this.inFlight === request) this.inFlight = null;
      },
    );
    return request;
  }

  private async fetchSnapshot(): Promise<MappedAniListUserEntry[]> {
    try {
      const mapped: MappedAniListUserEntry[] = [];
      for (let chunk = 1; chunk <= MAXIMUM_LIST_CHUNKS; chunk += 1) {
        const response = await executeAniListRequest(
          this.client,
          {
            key: `user-list:${this.userId}:chunk:${chunk}`,
            query: ANILIST_USER_LIST_QUERY,
            variables: {
              userId: this.userId,
              chunk,
              perChunk: ANILIST_LIST_CHUNK_SIZE,
            },
          },
          { maximumAttempts: this.maximumAttempts, sleep: this.sleep },
        );
        const executionError = diagnosticError(response);
        if (executionError) throw executionError;
        const result = parseAniListUserListChunk(response.data);
        result.entries.forEach((dto) => {
          const entry = mapAniListUserListEntry(dto);
          if (!entry) return;
          mapped.push(entry);
          this.rememberIdentity(entry);
        });
        if (!result.hasNextChunk) return normalizeEntries(mapped);
      }
      throw new Error('AniList returned too many media list chunks.');
    } catch (error: unknown) {
      await this.handleUnauthorized(error);
      throw error;
    }
  }

  private async resolveIdentity(animeId: number) {
    try {
      return await this.mediaIdentityResolver.resolve(animeId);
    } catch (error: unknown) {
      await this.handleUnauthorized(error);
      throw error;
    }
  }

  private async requireEntry(animeId: number): Promise<MappedAniListUserEntry> {
    const entry = this.findEntry(await this.getSnapshot(), animeId);
    if (!entry) throw new DomainError(`Anime ${animeId} is not in My List.`);
    return entry;
  }

  private findEntry(
    entries: readonly MappedAniListUserEntry[],
    animeId: number,
  ): MappedAniListUserEntry | undefined {
    return entries.find(({ entry }) => entry.animeId === animeId);
  }

  private async saveUpdatedEntry(
    animeId: number,
    current: MappedAniListUserEntry,
    operation: string,
    variables: Record<string, unknown>,
  ): Promise<UserAnimeEntry> {
    const saved = await this.saveEntry(animeId, operation, variables);
    this.assertSavedIdentity(saved, {
      animeId,
      mediaId: current.mediaId,
      listEntryId: current.listEntryId,
    });
    this.commitSavedEntry(saved);
    return cloneEntry(saved.entry);
  }

  private async saveEntry(
    animeId: number,
    operation: string,
    variables: Record<string, unknown>,
  ): Promise<MappedAniListUserEntry> {
    const response = await this.executeMutation(
      animeId,
      operation,
      ANILIST_SAVE_USER_LIST_ENTRY_MUTATION,
      variables,
    );
    try {
      const mapped = mapAniListUserListEntry(
        parseAniListSavedUserListEntry(response.data),
      );
      if (!mapped) {
        throw new Error('AniList returned a saved entry without a MAL ID.');
      }
      return mapped;
    } catch (error: unknown) {
      this.invalidateCache();
      throw this.responseFormatError(error, response);
    }
  }

  private async executeMutation(
    animeId: number,
    operation: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<AniListClientResponse> {
    const sequence = (this.mutationSequence += 1);
    try {
      const response = await executeAniListRequest(
        this.client,
        {
          key: `user-list-mutation:${this.userId}:${animeId}:${operation}:${sequence}`,
          query,
          variables,
        },
        { maximumAttempts: 1, sleep: this.sleep },
      );
      const executionError = diagnosticError(response);
      if (executionError) throw executionError;
      return response;
    } catch (error: unknown) {
      this.invalidateCache();
      await this.handleUnauthorized(error);
      throw error;
    }
  }

  private responseFormatError(
    error: unknown,
    response: AniListClientResponse,
  ): AniListResponseFormatError {
    return new AniListResponseFormatError(
      error instanceof Error ? error.message : undefined,
      diagnostic(response),
    );
  }

  private assertSavedIdentity(
    saved: MappedAniListUserEntry,
    expected: {
      animeId: number;
      mediaId: number;
      listEntryId?: number;
    },
  ): void {
    if (
      saved.entry.animeId !== expected.animeId ||
      saved.mediaId !== expected.mediaId ||
      (expected.listEntryId !== undefined &&
        saved.listEntryId !== expected.listEntryId)
    ) {
      this.invalidateCache();
      throw new AniListResponseFormatError(
        'AniList returned a saved entry with mismatched identifiers.',
      );
    }
  }

  private commitSavedEntry(saved: MappedAniListUserEntry): void {
    this.rememberIdentity(saved);
    if (!this.snapshot) return;
    this.snapshot = normalizeEntries([...this.snapshot, saved]);
    this.refreshSnapshotTtl();
  }

  private rememberIdentity(entry: MappedAniListUserEntry): void {
    this.mediaIdentityResolver.remember({
      animeId: entry.entry.animeId,
      mediaId: entry.mediaId,
      totalEpisodes: entry.totalEpisodes,
    });
  }

  private refreshSnapshotTtl(): void {
    this.snapshotExpiresAt = this.now() + this.cacheTtlMs;
  }

  private async handleUnauthorized(error: unknown): Promise<void> {
    if (error instanceof AniListUnauthorizedError) {
      await this.onUnauthorized?.();
    }
  }

  private serializeMutation<T>(
    animeId: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutationTails.get(animeId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.mutationTails.set(animeId, tail);
    void tail.then(() => {
      if (this.mutationTails.get(animeId) === tail) {
        this.mutationTails.delete(animeId);
      }
    });
    return result;
  }
}
