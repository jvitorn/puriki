import type { AnimeAiringStatus } from '@/domain/models/anime';
import {
  executeAniListRequest,
  type AniListClientPort,
  type AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  AniListGraphQLExecutionError,
  AniListResponseFormatError,
} from '@/infrastructure/api/anilist/anilist-errors';
import { mapAniListAiringStatus } from '@/infrastructure/api/anilist/anilist-mapper';
import { ANILIST_MEDIA_IDENTITY_QUERY } from '@/infrastructure/api/anilist/anilist-queries';

export interface AniListMediaIdentity {
  animeId: number;
  mediaId: number;
  totalEpisodes: number | null;
  airingStatus: AnimeAiringStatus;
}

export interface AniListMediaIdentityResolver {
  resolve(animeId: number): Promise<AniListMediaIdentity | null>;
  remember(identity: AniListMediaIdentity): void;
  clear(): void;
}

export interface AniListMediaIdentityRegistryOptions {
  client: AniListClientPort;
  maximumAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`AniList returned an invalid ${field}.`);
  }
  return value;
}

function parseIdentity(value: unknown): AniListMediaIdentity | null {
  if (!isRecord(value) || !('Media' in value)) {
    throw new Error('AniList returned invalid media identity data.');
  }
  if (value.Media === null) return null;
  if (!isRecord(value.Media)) {
    throw new Error('AniList returned invalid media identity data.');
  }
  const episodes = value.Media.episodes;
  if (
    episodes !== null &&
    episodes !== undefined &&
    (typeof episodes !== 'number' ||
      !Number.isInteger(episodes) ||
      episodes < 0)
  ) {
    throw new Error('AniList returned an invalid media episode count.');
  }
  return {
    animeId: positiveInteger(value.Media.idMal, 'media MAL ID'),
    mediaId: positiveInteger(value.Media.id, 'media ID'),
    totalEpisodes:
      typeof episodes === 'number' && episodes > 0 ? episodes : null,
    airingStatus: mapAniListAiringStatus(
      typeof value.Media.status === 'string' ? value.Media.status : null,
    ),
  };
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

export class AniListMediaIdentityRegistry implements AniListMediaIdentityResolver {
  private readonly identities = new Map<number, AniListMediaIdentity>();
  private readonly client: AniListClientPort;
  private readonly maximumAttempts?: number;
  private readonly sleep?: (milliseconds: number) => Promise<void>;

  constructor(options: AniListMediaIdentityRegistryOptions) {
    this.client = options.client;
    this.maximumAttempts = options.maximumAttempts;
    this.sleep = options.sleep;
  }

  remember(identity: AniListMediaIdentity): void {
    if (
      !Number.isInteger(identity.animeId) ||
      identity.animeId <= 0 ||
      !Number.isInteger(identity.mediaId) ||
      identity.mediaId <= 0
    ) {
      return;
    }
    this.identities.set(identity.animeId, { ...identity });
  }

  async resolve(animeId: number): Promise<AniListMediaIdentity | null> {
    const cached = this.identities.get(animeId);
    if (cached) return { ...cached };
    const response = await executeAniListRequest(
      this.client,
      {
        key: `media-identity:${animeId}`,
        query: ANILIST_MEDIA_IDENTITY_QUERY,
        variables: { idMal: animeId },
      },
      { maximumAttempts: this.maximumAttempts, sleep: this.sleep },
    );
    const executionError = diagnosticError(response);
    if (executionError) throw executionError;
    let identity: AniListMediaIdentity | null;
    try {
      identity = parseIdentity(response.data);
    } catch (error: unknown) {
      throw new AniListResponseFormatError(
        error instanceof Error ? error.message : undefined,
        {
          status: response.status,
          elapsedMs: response.elapsedMs,
          rateLimit: response.rateLimit,
          graphqlErrors: response.errors.map(({ message }) => message),
        },
      );
    }
    if (identity) this.remember(identity);
    return identity ? { ...identity } : null;
  }

  clear(): void {
    this.identities.clear();
  }
}
