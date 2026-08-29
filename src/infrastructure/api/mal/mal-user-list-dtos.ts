function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface MalUserListStatusDto {
  status: string;
  score: number;
  numEpisodesWatched: number;
  updatedAt: string;
}

export interface MalUserListNodeDto {
  animeId: number;
  status: MalUserListStatusDto;
}

export interface MalUserListPageDto {
  entries: MalUserListNodeDto[];
  nextOffset: number | null;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`MyAnimeList returned an invalid ${field}.`);
  }
  return value;
}

function parseStatusDto(value: unknown): MalUserListStatusDto {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new Error('MyAnimeList returned an invalid list status.');
  }
  const score = value.score;
  const numEpisodesWatched = value.num_episodes_watched;
  const updatedAt = value.updated_at;
  if (
    (score !== undefined && typeof score !== 'number') ||
    (numEpisodesWatched !== undefined &&
      typeof numEpisodesWatched !== 'number') ||
    (updatedAt !== undefined && typeof updatedAt !== 'string')
  ) {
    throw new Error('MyAnimeList returned an invalid list status.');
  }
  return {
    status: value.status,
    score: typeof score === 'number' ? score : 0,
    numEpisodesWatched:
      typeof numEpisodesWatched === 'number' ? numEpisodesWatched : 0,
    updatedAt:
      typeof updatedAt === 'string' ? updatedAt : new Date(0).toISOString(),
  };
}

function parseNodeDto(value: unknown): MalUserListNodeDto {
  if (!isRecord(value) || !isRecord(value.node)) {
    throw new Error('MyAnimeList returned an invalid list entry.');
  }
  const animeId = requiredInteger(value.node.id, 'anime ID');
  if (animeId <= 0) {
    throw new Error('MyAnimeList returned an invalid anime ID.');
  }
  return { animeId, status: parseStatusDto(value.list_status) };
}

function nextOffsetFromPaging(value: unknown): number | null {
  if (!isRecord(value) || typeof value.next !== 'string') return null;
  try {
    const nextUrl = new URL(value.next);
    const offset = nextUrl.searchParams.get('offset');
    if (offset === null) return null;
    const parsed = Number(offset);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function parseMalUserListPage(value: unknown): MalUserListPageDto {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error('MyAnimeList returned an invalid list page.');
  }
  return {
    entries: value.data.map(parseNodeDto),
    nextOffset: nextOffsetFromPaging(value.paging),
  };
}

export function parseMalSavedListStatus(value: unknown): MalUserListStatusDto {
  return parseStatusDto(value);
}

const KNOWN_MAL_STATUSES = new Set([
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
]);

export function isKnownMalStatus(value: string): boolean {
  return KNOWN_MAL_STATUSES.has(value);
}
