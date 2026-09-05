import type { AniListMediaSummary } from '@/infrastructure/api/anilist/anilist-dtos';

export function anilistSummary(
  overrides: Partial<AniListMediaSummary> = {},
): AniListMediaSummary {
  return {
    id: 30_013,
    idMal: 21,
    title: {
      romaji: 'One Piece',
      english: 'One Piece',
      native: 'ONE PIECE',
    },
    episodes: null,
    status: 'RELEASING',
    nextAiringEpisode: null,
    season: 'FALL',
    seasonYear: 1999,
    averageScore: 88,
    genres: ['Action', 'Adventure'],
    coverImage: {
      extraLarge:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/21.jpg',
      large:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/21.jpg',
      medium:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/21.jpg',
      color: '#e4a15d',
    },
    bannerImage:
      'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21.jpg',
    ...overrides,
  };
}

export function anilistDetailsPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...anilistSummary(),
    synonyms: ['OP'],
    description: 'A pirate adventure.',
    studios: { nodes: [{ id: 18, name: 'Toei Animation' }] },
    relations: {
      edges: [
        {
          relationType: 'SEQUEL',
          node: {
            id: 1_663_708,
            idMal: null,
            type: 'ANIME',
            title: {
              romaji: 'One Piece sequel',
              english: null,
              native: null,
            },
            coverImage: { medium: null },
          },
        },
      ],
    },
    externalLinks: [],
    nextAiringEpisode: { episode: 1_151, airingAt: 1_800_000_000 },
    ...overrides,
  };
}

export function anilistPage(
  media: readonly unknown[] = [anilistSummary()],
  currentPage = 1,
): { Page: { pageInfo: object; media: readonly unknown[] } } {
  return {
    Page: {
      pageInfo: {
        currentPage,
        hasNextPage: true,
        lastPage: 5,
      },
      media,
    },
  };
}

export function anilistResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => normalizedHeaders[name.toLowerCase()] ?? null,
    },
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  } as unknown as Response;
}
