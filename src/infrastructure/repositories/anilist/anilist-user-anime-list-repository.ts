import { RepositoryError } from '@/domain/errors/domain-error';
import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import { validatePageRequest } from '@/domain/models/pagination';
import type { PageResult } from '@/domain/models/pagination';
import type {
  UserAnimeListPageRequest,
  UserAnimeListRepository,
} from '@/domain/repositories/user-anime-list-repository';
import {
  executeAniListRequest,
  type AniListClientPort,
  type AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  AniListGraphQLExecutionError,
  AniListUnauthorizedError,
} from '@/infrastructure/api/anilist/anilist-errors';
import { ANILIST_USER_LIST_QUERY } from '@/infrastructure/api/anilist/anilist-queries';
import { parseAniListUserListChunk } from '@/infrastructure/api/anilist/anilist-user-list-dtos';
import {
  mapAniListUserListEntry,
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
}

function cloneEntries(entries: readonly UserAnimeEntry[]): UserAnimeEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function diagnosticError(response: AniListClientResponse): Error | null {
  const error = response.errors[0];
  return error
    ? new AniListGraphQLExecutionError(error.message, {
        status: response.status,
        elapsedMs: response.elapsedMs,
        rateLimit: response.rateLimit,
        graphqlErrors: response.errors.map(({ message }) => message),
      })
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
): UserAnimeEntry[] {
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
  return [...byMalId.values()]
    .map(({ entry }) => entry)
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        left.animeId - right.animeId,
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
  private snapshot: UserAnimeEntry[] | null = null;
  private snapshotExpiresAt = 0;
  private inFlight: Promise<UserAnimeEntry[]> | null = null;
  private generation = 0;

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
      ? snapshot.filter((entry) => entry.status === request.status)
      : snapshot;
    const start = (request.page - 1) * request.pageSize;
    const end = start + request.pageSize;
    return {
      items: cloneEntries(filtered.slice(start, end)),
      page: request.page,
      nextPage: end < filtered.length ? request.page + 1 : null,
      totalCount: filtered.length,
    };
  }

  async getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    const snapshot = await this.getSnapshot();
    const entry = snapshot.find((item) => item.animeId === animeId);
    return entry ? { ...entry } : null;
  }

  addToList(
    _animeId: number,
    _status?: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return Promise.reject(this.readOnlyError());
  }

  removeFromList(_animeId: number): Promise<void> {
    return Promise.reject(this.readOnlyError());
  }

  updateProgress(_animeId: number, _episodes: number): Promise<UserAnimeEntry> {
    return Promise.reject(this.readOnlyError());
  }

  updateStatus(
    _animeId: number,
    _status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return Promise.reject(this.readOnlyError());
  }

  updateScore(
    _animeId: number,
    _score: number | null,
  ): Promise<UserAnimeEntry> {
    return Promise.reject(this.readOnlyError());
  }

  private getSnapshot(): Promise<UserAnimeEntry[]> {
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
          this.snapshotExpiresAt = this.now() + this.cacheTtlMs;
        }
        if (this.inFlight === request) this.inFlight = null;
      },
      () => {
        if (this.inFlight === request) this.inFlight = null;
      },
    );
    return request;
  }

  private async fetchSnapshot(): Promise<UserAnimeEntry[]> {
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
          if (entry) mapped.push(entry);
        });
        if (!result.hasNextChunk) return normalizeEntries(mapped);
      }
      throw new Error('AniList returned too many media list chunks.');
    } catch (error: unknown) {
      if (error instanceof AniListUnauthorizedError) {
        await this.onUnauthorized?.();
      }
      throw error;
    }
  }

  private readOnlyError(): RepositoryError {
    return new RepositoryError(
      'The authenticated AniList repository is read-only.',
    );
  }
}
